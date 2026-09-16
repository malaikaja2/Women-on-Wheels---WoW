(async function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const caseId = String(params.get("caseId") || "").trim();
  const requestedRideId = String(params.get("rideId") || "").trim();
  const closedStatuses = new Set(["returned", "resolved", "rejected", "cancelled", "canceled", "closed"]);
  let unsubscribeMessages = null;
  let unsubscribeCase = null;
  let typingTimer = null;
  let role = "";
  let peerId = "";
  let caseData = null;

  if (!caseId) throw new Error("Lost & Found case is unavailable.");
  const { db, uid, FieldValue } = await WowFirestore.ready();
  const caseRef = db.collection("lost_found_cases").doc(caseId);
  const caseSnapshot = await caseRef.get();
  if (!caseSnapshot.exists) throw new Error("Lost & Found case was not found.");
  caseData = caseSnapshot.data() || {};
  const rideId = String(caseData.rideId || "");
  if (requestedRideId && requestedRideId !== rideId) throw new Error("Invalid Lost & Found conversation.");
  role = uid === String(caseData.driverId || "") ? "driver" : uid === String(caseData.passengerId || "") ? "passenger" : "";
  if (!role) throw new Error("You are not authorized for this Lost & Found conversation.");
  peerId = role === "driver" ? String(caseData.passengerId || "") : String(caseData.driverId || "");
  if (!peerId || !rideId) throw new Error("Case participants are unavailable.");
  const rideSnapshot = await db.collection("rides").doc(rideId).get();
  if (!rideSnapshot.exists || !["completed", "ride_completed"].includes(String(rideSnapshot.data()?.status || "").toLowerCase())) {
    throw new Error("Lost & Found chat requires a completed ride.");
  }

  document.body.dataset.callRole = role;
  $("lfChatBack").onclick = () => {
    location.href = role === "driver" ? "driver-lost-items.html" : "lost-found.html";
  };
  $("lfChatSummary").href = `ride-details.html?rideId=${encodeURIComponent(rideId)}`;
  fillContext(caseData);

  unsubscribeCase = caseRef.onSnapshot(snapshot => {
    if (!snapshot.exists) return;
    caseData = snapshot.data() || {};
    fillContext(caseData);
    const disabled = closedStatuses.has(normalize(caseData.status));
    $("lfChatInput").disabled = disabled;
    $("lfChatSend").disabled = disabled;
    $("lfChatInput").placeholder = disabled ? "This case conversation is closed." : "Write a Lost & Found message…";
    const peerTyping = role === "driver" ? caseData.passengerTyping : caseData.driverTyping;
    const peerTypingAt = role === "driver" ? caseData.passengerTypingAt : caseData.driverTypingAt;
    const recent = peerTypingAt?.toMillis ? Date.now() - peerTypingAt.toMillis() < 6000 : false;
    $("lfChatTyping").hidden = !(peerTyping && recent);
  }, error => showError(error));

  unsubscribeMessages = caseRef.collection("messages").orderBy("createdAt", "asc").limit(300).onSnapshot(snapshot => {
    const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMessages(rows);
    markRead(rows).catch(() => {});
  }, error => showError(error));

  $("lfChatForm").addEventListener("submit", async event => {
    event.preventDefault();
    const text = $("lfChatInput").value.trim().slice(0, 1000);
    if (!text || $("lfChatSend").disabled) return;
    const button = $("lfChatSend");
    button.disabled = true;
    $("lfChatError").textContent = "";
    try {
      const messageRef = caseRef.collection("messages").doc();
      const now = FieldValue.serverTimestamp();
      await messageRef.set({
        messageId: messageRef.id,
        conversationType: "lost_found",
        lostFoundCaseId: caseId,
        rideId,
        senderId: uid,
        receiverId: peerId,
        senderRole: role,
        receiverRole: role === "driver" ? "passenger" : "driver",
        messageText: text,
        messageType: "text",
        isRead: false,
        deliveryStatus: "sent",
        createdAt: now
      });
      $("lfChatInput").value = "";
      await setTyping(false);
      caseRef.set({
        conversationType: "lost_found",
        lastMessage: text,
        lastMessageAt: now,
        lastMessageSenderId: uid,
        passengerContactedAt: role === "driver" ? now : caseData.passengerContactedAt || now,
        driverContactedAt: role === "passenger" ? now : caseData.driverContactedAt || now,
        updatedAt: now
      }, { merge: true }).catch(error => console.warn("[WOW Lost & Found Chat] Metadata update skipped", error?.code || error?.message));
      const notificationId = `lost-found-chat-${caseId}-${messageRef.id}`;
      db.collection("notifications").doc(notificationId).set({
        notificationId,
        type: "lost_found_chat",
        conversationType: "lost_found",
        lostFoundCaseId: caseId,
        caseId,
        rideId,
        senderId: uid,
        senderRole: role,
        receiverUid: peerId,
        receiverRole: role === "driver" ? "passenger" : "driver",
        passengerUid: String(caseData.passengerId || ""),
        driverUid: String(caseData.driverId || ""),
        title: "Lost & Found message",
        body: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        read: false,
        createdAt: now
      }).catch(error => console.warn("[WOW Lost & Found Chat] Notification skipped", error?.code || error?.message));
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = closedStatuses.has(normalize(caseData?.status));
      $("lfChatInput").focus();
    }
  });

  $("lfChatInput").addEventListener("input", () => {
    setTyping(true).catch(() => {});
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => setTyping(false).catch(() => {}), 2500);
  });
  $("lfChatInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("lfChatForm").requestSubmit();
    }
  });
  window.addEventListener("pagehide", () => {
    unsubscribeMessages?.();
    unsubscribeCase?.();
    clearTimeout(typingTimer);
    setTyping(false).catch(() => {});
  }, { once: true });

  function normalize(value) { return String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_"); }
  function safe(value, fallback = "Not available") {
    const text = String(value ?? "").trim();
    return !text || /^(null|undefined|\[object object\])$/i.test(text) ? fallback : text;
  }
  function fillContext(data) {
    $("lfChatCase").textContent = safe(data.caseId || caseId);
    $("lfChatItem").textContent = `${safe(data.itemName, "Lost item")} · ${safe(data.category, "Uncategorized")}`;
    $("lfChatPassenger").textContent = safe(data.passengerName, "Passenger");
    $("lfChatDriver").textContent = safe(data.driverName, "Driver");
    $("lfChatStatus").textContent = safe(data.status, "Open");
    $("lfChatPeer").textContent = role === "driver" ? safe(data.passengerName, "Passenger") : safe(data.driverName, "Driver");
    $("lfChatRide").textContent = `Ride ${safe(data.rideId)} · Lost & Found only`;
  }
  function asDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function renderMessages(rows) {
    const thread = $("lfChatThread");
    if (!rows.length) {
      thread.innerHTML = '<div class="lf-chat-empty">No messages yet. Start a conversation about the reported item and safe return.</div>';
      return;
    }
    thread.innerHTML = "";
    rows.forEach(message => {
      const wrapper = document.createElement("article");
      wrapper.className = `lf-message${message.senderId === uid ? " mine" : ""}`;
      const bubble = document.createElement("div");
      bubble.className = "lf-message-bubble";
      bubble.textContent = safe(message.messageText, "");
      const meta = document.createElement("div");
      meta.className = "lf-message-meta";
      const date = asDate(message.createdAt);
      meta.textContent = `${message.senderId === uid ? "You" : message.senderRole === "driver" ? "Driver" : "Passenger"} · ${date ? date.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" }) : "Sending"}${message.senderId === uid && message.isRead ? " · Read" : ""}`;
      wrapper.append(bubble, meta);
      thread.appendChild(wrapper);
    });
    thread.scrollTop = thread.scrollHeight;
  }
  async function markRead(rows) {
    const unread = rows.filter(message => message.receiverId === uid && !message.isRead);
    if (!unread.length) return;
    const batch = db.batch();
    unread.forEach(message => batch.set(caseRef.collection("messages").doc(message.id), {
      isRead: true, readAt: FieldValue.serverTimestamp(), deliveryStatus: "read"
    }, { merge: true }));
    await batch.commit();
  }
  async function setTyping(active) {
    const field = role === "driver" ? "driver" : "passenger";
    await caseRef.set({
      [`${field}Typing`]: Boolean(active),
      [`${field}TypingAt`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  function showError(error) {
    console.error("[WOW Lost & Found Chat]", error);
    const denied = String(error?.code || "").includes("permission-denied");
    $("lfChatError").textContent = denied ? "This conversation could not be opened with your current account." : (error?.message || "The conversation is temporarily unavailable.");
  }
})().catch(error => {
  console.error("[WOW Lost & Found Chat] Initialization failed", error);
  const message = document.getElementById("lfChatError");
  if (message) message.textContent = error?.message || "The Lost & Found conversation could not be opened.";
  const input = document.getElementById("lfChatInput");
  const button = document.getElementById("lfChatSend");
  if (input) input.disabled = true;
  if (button) button.disabled = true;
});
