(function initWowRideChat(global) {
  const OPEN_STATUSES = new Set([
    "driver_assigned", "accepted", "driver_selected", "driver_en_route",
    "driver_arriving", "arriving", "arrived", "driver_reached_pickup", "ride_started", "started",
    "ongoing", "in_progress", "on_trip", "active", "completed"
  ]);
  const listeners = new Map();
  const typingTimers = new Map();
  const contextCache = new Map();
  const readInFlight = new Map();

  function status(value) {
    return String(value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  }

  function id(uid) {
    return uid + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  async function context(rideId) {
    const cacheKey = String(rideId);
    const cached = contextCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 30000) return cached.value;
    const ready = await global.WowFirestore.ready();
    const snapshot = await ready.db.collection("rides").doc(cacheKey).get();
    if (!snapshot.exists) throw new Error("Ride not found.");
    const ride = snapshot.data() || {};
    const passengerId = String(ride.passengerId || "");
    const driverId = String(ride.assignedDriverId || ride.driverId || "");
    const role = ready.uid === passengerId ? "passenger" : ready.uid === driverId ? "driver" : "";
    if (!role) throw new Error("You are not authorized for this ride chat.");
    if (!OPEN_STATUSES.has(status(ride.status))) throw new Error("Chat is unavailable for this ride status.");
    const value = { ...ready, ride, passengerId, driverId, role };
    contextCache.set(cacheKey, { cachedAt: Date.now(), value });
    return value;
  }

  async function send({ rideId, message, clientMessageId }) {
    const text = String(message || "").trim().slice(0, 1000);
    if (!text) throw new Error("Enter a message first.");
    const ctx = await context(rideId);
    const messageId = String(clientMessageId || id(ctx.uid));
    const chatRef = ctx.db.collection("rideChats").doc(String(rideId));
    const messageRef = chatRef.collection("messages").doc(messageId);
    const receiverId = ctx.role === "passenger" ? ctx.driverId : ctx.passengerId;
    const receiverRole = ctx.role === "passenger" ? "driver" : "passenger";
    const now = ctx.FieldValue.serverTimestamp();
    // The message id is client-generated and stable, so a direct idempotent set
    // avoids a full transaction read round-trip before the receiver sees it.
    await messageRef.set({
      messageId,
      rideId: String(rideId),
      senderId: ctx.uid,
      receiverId,
      senderRole: ctx.role,
      messageText: text,
      messageType: "text",
      timestamp: now,
      seen: false,
      delivered: false,
      deliveryStatus: "sent",
    });
    // Message delivery is the critical operation. Auxiliary unread/notification
    // writes are best-effort so they can never roll back a successfully sent chat.
    const chatUpdate = {
        chatId: String(rideId),
        rideId: String(rideId),
        passengerId: ctx.passengerId,
        driverId: ctx.driverId,
        lastMessage: text,
        lastMessageAt: now,
        lastMessageSenderId: ctx.uid,
        passengerUnreadCount: ctx.role === "driver" ? ctx.FieldValue.increment(1) : ctx.FieldValue.increment(0),
        driverUnreadCount: ctx.role === "passenger" ? ctx.FieldValue.increment(1) : ctx.FieldValue.increment(0),
        chatStatus: "active",
        updatedAt: now
      };
    chatRef.set(chatUpdate, { merge: true }).catch((error) =>
      console.warn("[WOW Chat] metadata update failed", error));
      const notificationId = "chat-" + rideId + "-" + messageId;
    ctx.db.collection("notifications").doc(notificationId).set({
        notificationId,
        type: "ride_chat",
        rideId: String(rideId),
        chatId: String(rideId),
        messageId,
        senderId: ctx.uid,
        senderRole: ctx.role,
        receiverUid: receiverId,
        passengerUid: receiverRole === "passenger" ? receiverId : "",
        driverUid: receiverRole === "driver" ? receiverId : "",
        title: (ctx.role === "passenger" ? "Passenger" : "Driver") + " message",
        body: text.length > 80 ? text.slice(0, 77) + "..." : text,
        read: false,
        createdAt: now
      }).catch((error) => console.warn("[WOW Chat] notification update failed", error));
    return messageId;
  }

  async function markRead(rideId) {
    const readKey = String(rideId);
    if (readInFlight.has(readKey)) return readInFlight.get(readKey);
    const operation = markReadNow(readKey).finally(() => readInFlight.delete(readKey));
    readInFlight.set(readKey, operation);
    return operation;
  }

  async function markReadNow(rideId) {
    const ctx = await context(rideId);
    const snapshot = await ctx.db.collection("rideChats").doc(String(rideId)).collection("messages")
      .where("receiverId", "==", ctx.uid).limit(100).get();
    const batch = ctx.db.batch();
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      if (data.seen) return;
      batch.set(doc.ref, {
        seen: true,
        delivered: true,
        seenAt: ctx.FieldValue.serverTimestamp(),
        deliveryStatus: "read"
      }, { merge: true });
    });
    const chatRef = ctx.db.collection("rideChats").doc(String(rideId));
    batch.set(chatRef, {
      [ctx.role === "passenger" ? "passengerUnreadCount" : "driverUnreadCount"]: 0,
      updatedAt: ctx.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
  }

  async function typing(rideId, active) {
    const ctx = await context(rideId);
    const key = ctx.role === "passenger" ? "passenger" : "driver";
    const chatRef = ctx.db.collection("rideChats").doc(String(rideId));
    const chatUpdate = {
      chatId: String(rideId),
      rideId: String(rideId),
      passengerId: ctx.passengerId,
      driverId: ctx.driverId,
      chatStatus: "active",
      [key + "Typing"]: Boolean(active),
      [key + "TypingAt"]: ctx.FieldValue.serverTimestamp(),
      updatedAt: ctx.FieldValue.serverTimestamp()
    };
    await chatRef.set(chatUpdate, { merge: true });
    clearTimeout(typingTimers.get(rideId));
    if (active) {
      typingTimers.set(rideId, setTimeout(() => typing(rideId, false).catch(() => {}), 3500));
    }
  }

  async function listen({ rideId, onMessages, onTyping, onUnread }) {
    stop(rideId);
    const ctx = await context(rideId);
    const seen = new Set();
    const unsubs = [];
    unsubs.push(ctx.db.collection("rideChats").doc(String(rideId)).collection("messages")
      .orderBy("timestamp", "asc").limit(300).onSnapshot((snapshot) => {
        const rows = [];
        snapshot.forEach((doc) => {
          const row = { id: doc.id, ...doc.data() };
          const key = String(row.messageId || row.id);
          if (!seen.has(key)) seen.add(key);
          rows.push(row);
        });
        onMessages?.(rows);
        if (chatIsOpen()) markRead(rideId).catch(() => {});
        const incoming = snapshot.docChanges().filter((change) =>
          change.type === "added" && change.doc.data().receiverId === ctx.uid);
        if (incoming.length && document.visibilityState !== "visible") notify(incoming[incoming.length - 1].doc.data());
      }, (error) => console.error("[WOW Chat] message listener failed", error)));
    unsubs.push(ctx.db.collection("rideChats").doc(String(rideId)).onSnapshot((snapshot) => {
      const data = snapshot.data() || {};
      const peerTyping = ctx.role === "passenger" ? data.driverTyping : data.passengerTyping;
      const peerTypingAt = ctx.role === "passenger" ? data.driverTypingAt : data.passengerTypingAt;
      const recent = peerTypingAt?.toMillis ? Date.now() - peerTypingAt.toMillis() < 6000 : false;
      onTyping?.(Boolean(peerTyping && recent), ctx.role === "passenger" ? "Driver" : "Passenger");
      onUnread?.(Number(ctx.role === "passenger" ? data.passengerUnreadCount : data.driverUnreadCount) || 0);
    }));
    listeners.set(String(rideId), unsubs);
    document.addEventListener("visibilitychange", () => {
      if (chatIsOpen()) markRead(rideId).catch(() => {});
    }, { once: true });
    return () => stop(rideId);
  }

  function chatIsOpen() {
    return document.visibilityState === "visible" &&
      Boolean(document.querySelector("#chatPanel.is-open, [data-chat-panel].is-open"));
  }

  function notify(message) {
    const title = (message.senderRole === "driver" ? "Driver" : "Passenger") + " message";
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAAgICA////gICA////gICA");
      audio.volume = 0.35;
      audio.play().catch(() => {});
    } catch {}
    if ("Notification" in global && Notification.permission === "granted") {
      new Notification(title, { body: String(message.messageText || "").slice(0, 100), tag: String(message.notificationId || message.messageId) });
    }
  }

  function stop(rideId) {
    (listeners.get(String(rideId)) || []).forEach((unsubscribe) => { try { unsubscribe(); } catch {} });
    listeners.delete(String(rideId));
    contextCache.delete(String(rideId));
    clearTimeout(typingTimers.get(String(rideId)));
    typingTimers.delete(String(rideId));
  }

  global.WowRideChat = {
    context, send, listen, markRead, typing, stop,
    requestNotifications: () => ("Notification" in global ? global.Notification.requestPermission() : Promise.resolve("unsupported"))
  };
})(window);
