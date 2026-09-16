(function passengerHelpLostFound() {
  "use strict";
  const card = document.getElementById("helpLostFoundCard");
  const statusNode = document.getElementById("helpLostFoundStatus");
  if (!card || !statusNode) return;
  let unsubscribe = null;
  const terminalStatuses = new Set([
    "returned", "resolved", "rejected", "cancelled", "canceled", "closed"
  ]);

  function normalizedStatus(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function renderCount(cases) {
    const uniqueActiveCases = new Map();
    (Array.isArray(cases) ? cases : []).forEach(item => {
      if (!item?.id || terminalStatuses.has(normalizedStatus(item.status))) return;
      uniqueActiveCases.set(item.id, item);
    });
    const count = uniqueActiveCases.size;
    statusNode.classList.remove("is-loading", "is-error");
    statusNode.classList.toggle("has-active", count > 0);
    statusNode.textContent = count > 0
      ? `Active Cases: ${count}`
      : "No active Lost & Found cases.";
  }

  function renderError() {
    statusNode.classList.remove("is-loading", "has-active");
    statusNode.classList.add("is-error");
    statusNode.textContent = "Case status is temporarily unavailable.";
  }

  async function start() {
    try {
      if (!window.WowFirestore || !window.WowLostFound) throw new Error("firebase_unavailable");
      const { uid } = await WowFirestore.ready();
      if (!uid) throw new Error("auth_required");
      if (unsubscribe) unsubscribe();
      unsubscribe = WowLostFound.watchPassenger(uid, renderCount, renderError);
    } catch {
      renderError();
    }
  }

  function openLostFound(event) {
    if (event.target.closest("a")) return;
    window.location.href = "lost-found.html";
  }

  card.addEventListener("click", openLostFound);
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = "lost-found.html";
    }
  });
  window.addEventListener("pagehide", () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }, { once: true });
  start();
})();
