(function passengerNotifications() {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
  let unsubscribe = null, items = [], started = false;
  const millis = value => value?.toMillis?.() || Number(value?.seconds || 0) * 1000 || Date.parse(String(value || "")) || 0;
  const label = value => String(value || "update").replaceAll("_", " ");
  const unread = item => item.read !== true && item.isRead !== true;
  const dedupeKey = item => {
    const type = String(item.type || item.notificationType || "system").toLowerCase().replace(/[\s-]+/g, "_");
    const entity = item.rideId || item.caseId || item.lostFoundCaseId || item.paymentId || item.supportId || "";
    const event = item.eventId || item.eventIdentifier || item.eventStatus || item.status || "";
    return entity ? `${entity}|${type}|${String(event).toLowerCase()}` : `document|${item.id}`;
  };
  function show(name) {
    $("notificationLoading").hidden = name !== "loading";
    $("notificationEmpty").hidden = name !== "empty";
    $("notificationError").hidden = name !== "error";
    $("notificationList").hidden = name !== "ready";
  }
  function destination(item) {
    const type = String(item.type || item.notificationType || "").toLowerCase();
    const ride = encodeURIComponent(item.rideId || item.chatId || "");
    if (type === "lost_found_chat" && item.caseId) {
      return `lost-found-chat.html?caseId=${encodeURIComponent(item.caseId)}&rideId=${ride}`;
    }
    if (type.includes("lost_found")) return item.caseId || item.lostFoundCaseId
      ? `lost-found.html?caseId=${encodeURIComponent(item.caseId || item.lostFoundCaseId)}${ride ? `&rideId=${ride}` : ""}`
      : "lost-found.html";
    if (!ride) return "";
    if (type.includes("chat")) return `passenger-ride.html?rideId=${ride}&panel=chat`;
    if (type.includes("payment")) return `passenger-ride.html?rideId=${ride}&panel=payment`;
    if (/arriv|on_the_way|en_route|tracking/.test(type)) return `passenger-ride.html?rideId=${ride}&panel=tracking`;
    return `ride-details.html?rideId=${ride}`;
  }
  function render() {
    items.sort((a, b) => millis(b.createdAt || b.created_at || b.sentAt) - millis(a.createdAt || a.created_at || a.sentAt));
    items = items.slice(0, 50);
    const unreadCount = items.filter(unread).length;
    $("markAllNotifications").hidden = unreadCount === 0;
    localStorage.setItem("wow_passenger_unread_notifications", String(unreadCount));
    window.dispatchEvent(new CustomEvent("wow:passenger-unread", { detail: { count: unreadCount } }));
    if (!items.length) return show("empty");
    $("notificationList").innerHTML = items.map(item => {
      const type = label(item.type || item.notificationType);
      const when = millis(item.createdAt || item.created_at || item.sentAt);
      const date = when ? new Date(when).toLocaleString([], { month:"short",day:"numeric",hour:"numeric",minute:"2-digit" }) : "";
      const ride = item.rideId ? `Ride ${esc(item.rideId)}` : "";
      return `<article class="notification-card ${unread(item) ? "unread" : ""}" data-notification="${esc(item.id)}" tabindex="0" role="button"><span class="notification-icon">${type.includes("payment") ? "Rs" : type.includes("chat") ? "..." : type.includes("lost found") ? "?" : "!"}</span><div class="notification-copy"><h2>${esc(item.title || "Ride update")}</h2><p>${esc(item.body || item.message || "")}</p><div class="notification-meta"><span class="notification-pill">${esc(type)}</span>${ride ? `<span>${ride}</span>` : ""}<span>${esc(date)}</span></div></div>${unread(item) ? '<span class="notification-dot"></span>' : '<span>›</span>'}</article>`;
    }).join("");
    show("ready");
  }
  function optimisticRead(id) {
    items = items.map(item => item.id === id ? { ...item, read:true, isRead:true } : item);
    render();
  }
  async function openItem(item) {
    if (!item) return;
    if (unread(item)) {
      optimisticRead(item.id);
      item.ref.set({ read:true, isRead:true, readAt:firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }).catch(() => {});
    }
    const href = destination(item);
    if (href) location.href = href;
  }
  async function start(force = false) {
    if (started && !force) return;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    started = true;
    if (!items.length) show("loading");
    try {
      const { db, uid } = await WowFirestore.ready();
      if (!uid) throw new Error("auth");
      unsubscribe = db.collection("notifications").where("passengerUid", "==", uid).limit(50).onSnapshot(snapshot => {
        const sorted = snapshot.docs.map(doc => ({ id:doc.id, ref:doc.ref, ...doc.data() }))
          .filter(item => item.receiverRole !== "driver" && item.receiverRole !== "admin" && (!item.receiverUid || item.receiverUid === uid))
          .sort((a, b) => millis(b.createdAt || b.created_at || b.sentAt) - millis(a.createdAt || a.created_at || a.sentAt));
        const reconciled = new Map();
        sorted.forEach(item => { const key = dedupeKey(item); if (!reconciled.has(key)) reconciled.set(key, item); });
        items = Array.from(reconciled.values());
        render();
      }, (error) => {
        console.error("[WOW Passenger Notifications] listener failed", error?.code || error?.message);
        show(items.length ? "ready" : "error");
      });
    } catch (error) {
      console.error("[WOW Passenger Notifications] initialization failed", error?.code || error?.message);
      show("error");
    }
  }
  $("notificationList").addEventListener("click", event => {
    const card = event.target.closest("[data-notification]");
    if (card) openItem(items.find(item => item.id === card.dataset.notification));
  });
  $("notificationList").addEventListener("keydown", event => {
    if (event.key === "Enter") event.target.click();
  });
  $("markAllNotifications").addEventListener("click", () => {
    const pending = items.filter(unread);
    items = items.map(item => ({ ...item, read:true, isRead:true }));
    render();
    if (!pending.length) return;
    const db = pending[0].ref.firestore;
    const batch = db.batch();
    pending.forEach(item => batch.set(item.ref, { read:true, isRead:true, readAt:firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }));
    batch.commit().catch(() => {});
  });
  $("notificationRetry").addEventListener("click", () => start(true));
  window.addEventListener("pagehide", () => { if (unsubscribe) unsubscribe(); });
  start();
})();
