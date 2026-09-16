(() => {
  const CHANNEL_NAME = "wow-realtime-v1";
  const STORAGE_EVENT_KEY = "wow_realtime_event";
  const STORAGE_PRESENCE_KEY = "wow_realtime_driver_presence";
  const seen = new Set();
  const listeners = new Set();
  const instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let channel = null;

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      const message = event && event.data;
      if (!message || typeof message !== "object") return;
      dispatch(message);
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue);
      dispatch(message);
    } catch {
      // Ignore malformed storage payloads.
    }
  });

  function dispatch(message) {
    if (!message || typeof message !== "object") return;
    const id = String(message.id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (seen.size > 500) {
      const entries = Array.from(seen);
      seen.clear();
      entries.slice(-200).forEach((entry) => seen.add(entry));
    }
    listeners.forEach((listener) => {
      try {
        listener(message);
      } catch {
        // Keep realtime bus resilient to listener errors.
      }
    });
  }

  function publish(type, payload = {}) {
    const message = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      source: instanceId,
      type: String(type || ""),
      ts: new Date().toISOString(),
      payload: payload && typeof payload === "object" ? payload : {}
    };
    dispatch(message);
    if (channel) {
      channel.postMessage(message);
    }
    try {
      localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(message));
    } catch {
      // Ignore storage quota issues.
    }
    return message.id;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function readDriverPresence() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_PRESENCE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function writeDriverPresence(rows) {
    localStorage.setItem(STORAGE_PRESENCE_KEY, JSON.stringify(rows));
  }

  window.WowRealtime = {
    publish,
    subscribe,
    readDriverPresence,
    writeDriverPresence,
    keys: {
      event: STORAGE_EVENT_KEY,
      presence: STORAGE_PRESENCE_KEY
    }
  };
})();
