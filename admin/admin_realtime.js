(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
    authDomain: "women-on-wheels-f8970.firebaseapp.com",
    projectId: "women-on-wheels-f8970",
    storageBucket: "women-on-wheels-f8970.firebasestorage.app"
  };
  const refreshSelectors = [
    "#refreshNow", "#ridesRefreshNow", "#driversRefreshNow", "#sosQuickActions",
    "#ptQuickActions", "#nmRefreshNow", "#rrRefresh", "#aiRefreshNow", "#cpQuickActions", "#authRefreshNow",
    "#fiRefreshNow", "#fiRefresh", "#deRefresh", "#amRefresh", "#waRefresh", "#lfRefresh", "#payRefresh"
  ];
  const pageWatchMap = {
    "dashboard.php": ["rides", "drivers", "driverApplications", "sosAlerts", "payments"],
    "ai_analytics.php": ["rides", "drivers", "sosAlerts", "payments"],
    "auth_monitoring.php": ["admins", "passengers", "drivers"],
    "carpooling.php": ["rides"],
    "drivers.php": ["drivers", "driverApplications", "rides", "ratings", "rideReviews", "payments"],
    "fare_insights.php": ["rides", "fareTrainingData"],
    "notifications.php": [],
    "payments.php": ["payments", "rides"],
    "lost_found.php": ["lost_found_cases"],
    "ratings_reviews.php": ["rideReviews", "ratings"],
    "rides.php": ["rides", "driverOffers"],
    "wow_assistant.php": ["wowAssistantInteractions", "chatbotMessages"]
  };
  let refreshTimer = null;
  let unsubscribes = [];
  let adminAuthPromise = null;

  function adminLiveSyncEnabled() {
    try {
      return new URLSearchParams(location.search || "").get("live_admin_sync") === "1"
        || localStorage.getItem("wow_admin_live_sync") === "1";
    } catch {
      return false;
    }
  }

  window.WowAdminFirebase = window.WowAdminFirebase || {};
  window.WowAdminFirebase.config = firebaseConfig;
  window.WowAdminFirebase.ensureAdminAuth = ensureAdminAuth;
  window.WowAdminFirebase.getDb = async function () {
    if (!window.firebase) throw new Error("Firebase SDK unavailable");
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    await ensureAdminAuth();
    return firebase.firestore();
  };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("click", handleActionClick);
  window.addEventListener("pagehide", cleanupRealtime);
  window.addEventListener("beforeunload", cleanupRealtime);

  async function init() {
    bindAdminShell();
    bindAdminModal();
    try {
      if (window.WOW_ADMIN_REALTIME_STARTED) return;
      window.WOW_ADMIN_REALTIME_STARTED = true;
      if (!window.firebase) throw new Error("Firebase SDK unavailable");
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      await ensureAdminAuth();
      const db = firebase.firestore();
      if (!adminLiveSyncEnabled()) {
        showLiveState("Manual");
        return;
      }
      if (String(location.pathname.split("/").pop() || "").toLowerCase() !== "sos_monitoring.php") {
        listenForSosCount(db);
      }
      const watchedCollections = collectionsForCurrentPage();
      watchedCollections.forEach((collection) => {
        if (collection === "driverOffers") {
          listenForChanges(db.collectionGroup("driverOffers").limit(20), () => {});
          return;
        }
        listenForChanges(
          db.collection(collection).limit(10),
          () => showToast("Live admin sync paused. Check Firebase rules/session.", true)
        );
      });
      showLiveState("Live");
    } catch (error) {
      window.WOW_ADMIN_REALTIME_STARTED = false;
      showLiveState("Offline");
      showToast("Admin Firebase realtime could not start. Existing refresh still works.", true);
    }
  }

  function bindAdminShell() {
    const sidebar = document.querySelector(".sidebar");
    const toggle = document.querySelector(".drawer-toggle");
    if (!sidebar || !toggle || toggle.dataset.bound === "true") return;
    sidebar.querySelectorAll(".menu-item").forEach((item) => {
      const text = String(item.textContent || "").replace(/\s+/g, " ").trim();
      if (text && !item.title) item.title = text.replace(/\d+$/, "").trim();
    });
    toggle.dataset.bound = "true";
    const scrollRoot = sidebar.querySelector(".sidebar-scroll");
    try { if (scrollRoot) scrollRoot.scrollTop = Number(sessionStorage.getItem("wow_admin_sidebar_scroll") || 0); } catch {}
    sidebar.addEventListener("click", (event) => {
      if (!event.target.closest("a.menu-item") || !scrollRoot) return;
      try { sessionStorage.setItem("wow_admin_sidebar_scroll", String(scrollRoot.scrollTop)); } catch {}
    });
    const isMobile = () => window.matchMedia("(max-width: 1080px)").matches;
    const setExpanded = (expanded) => {
      if (isMobile()) document.body.classList.toggle("admin-menu-open", expanded);
      else {
        document.body.classList.toggle("admin-sidebar-collapsed", !expanded);
        try { localStorage.setItem("wow_admin_sidebar", expanded ? "expanded" : "collapsed"); } catch {}
      }
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("title", expanded ? "Collapse navigation" : "Expand navigation");
    };
    if (!isMobile()) {
      let collapsed = false;
      try { collapsed = localStorage.getItem("wow_admin_sidebar") === "collapsed"; } catch {}
      setExpanded(!collapsed);
    } else setExpanded(false);
    toggle.addEventListener("click", () => {
      const expanded = isMobile() ? document.body.classList.contains("admin-menu-open") : !document.body.classList.contains("admin-sidebar-collapsed");
      setExpanded(!expanded);
    });
    document.addEventListener("click", (event) => {
      if (isMobile() && document.body.classList.contains("admin-menu-open") && !sidebar.contains(event.target) && !toggle.contains(event.target)) setExpanded(false);
    });
    window.addEventListener("resize", () => { if (!isMobile()) document.body.classList.remove("admin-menu-open"); });
  }

  async function ensureAdminAuth() {
    if (firebase.auth().currentUser) return;
    if (adminAuthPromise) return adminAuthPromise;
    adminAuthPromise = (async () => {
      const res = await fetch("firebase_custom_token.php", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.token) throw new Error(data.error || "admin_token_failed");
      await firebase.auth().signInWithCustomToken(data.token);
    })();
    try {
      await adminAuthPromise;
    } finally {
      adminAuthPromise = null;
    }
  }

  function listenForChanges(query, onError) {
    let initialized = false;
    const unsubscribe = query.onSnapshot(() => {
      if (!initialized) {
        initialized = true;
        return;
      }
      queueRefresh();
    }, onError);
    unsubscribes.push(unsubscribe);
  }

  function listenForSosCount(db) {
    const unsubscribe = db.collection("sosAlerts").orderBy("createdAt", "desc").limit(25).onSnapshot((snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const raw = String(data.status || data.alertStatus || "new").trim().toLowerCase();
        const resolved = data.isResolved === true || data.isResolved === "true" || !!data.resolvedAt || !!data.resolved_at || ["resolved","closed","completed","safe","false_alarm","accidental","dismissed","cancelled","canceled"].includes(raw);
        if (!resolved) count += 1;
      });
      const badge = document.getElementById("sidebarSosCount");
      if (badge) { badge.textContent = String(count); badge.hidden = count === 0; }
    }, (error) => console.error("SOS sidebar count listener failed", error));
    unsubscribes.push(unsubscribe);
  }

  function queueRefresh() {
    window.dispatchEvent(new CustomEvent("wow-admin-realtime"));
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      for (const selector of refreshSelectors) {
        const button = document.querySelector(selector);
        if (button) {
          button.click();
          return;
        }
      }
    }, 350);
  }

  function collectionsForCurrentPage() {
    const page = String(location.pathname.split("/").pop() || "").toLowerCase();
    if (page === "dashboard.php" && new URLSearchParams(location.search).get("view") === "passengers") {
      return ["passengers", "rides"];
    }
    return pageWatchMap[page] || [];
  }

  function cleanupRealtime() {
    if (!window.WOW_ADMIN_REALTIME_STARTED && !unsubscribes.length) return;
    clearTimeout(refreshTimer);
    unsubscribes.splice(0).forEach((unsubscribe) => {
      try { unsubscribe(); } catch {}
    });
    window.WOW_ADMIN_REALTIME_STARTED = false;
  }

  function handleActionClick(event) {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.getAttribute("data-admin-action") || "";
    const id = button.getAttribute("data-id") || "";
    if (action === "view") {
      openAdminModal(button.getAttribute("data-title") || "Details", button.getAttribute("data-details") || "No details available.");
      return;
    }
    const payload = { action, id };
    if (button.dataset.status) payload.status = button.dataset.status;
    if (button.dataset.applicationId) payload.application_id = button.dataset.applicationId;
    if (button.dataset.email) payload.email = button.dataset.email;
    if (action === "driver_status" && payload.status === "approved" && !window.confirm("Approve this driver after reviewing every submitted document?")) return;
    if (action === "driver_status" && payload.status === "rejected") {
      payload.rejection_reason = (window.prompt("Rejection reason (required)") || "").trim();
      if (!payload.rejection_reason) { showToast("A rejection reason is required.", true); return; }
    }
    if (action === "send_notification") {
      payload.title = window.prompt("Notification title") || "";
      payload.message = window.prompt("Notification message") || "";
      payload.target_role = window.prompt("Target role: all, passengers, drivers", "all") || "all";
      if (!payload.title || !payload.message) return;
    }
    runAdminAction(button, payload);
  }

  async function runAdminAction(button, payload) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Working...";
    try {
      const res = await fetch("admin_actions.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message || data.error || "action_failed");
      showToast("Action saved.");
      queueRefresh();
    } catch (error) {
      showToast(error.message || "Unable to complete action.", true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function bindAdminModal() {
    if (document.getElementById("adminRealtimeModal")) return;
    const modal = document.createElement("div");
    modal.id = "adminRealtimeModal";
    modal.className = "admin-live-modal";
    modal.innerHTML = '<div class="admin-live-card"><button type="button" class="admin-live-close" aria-label="Close">x</button><h3></h3><pre></pre></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(".admin-live-close")) modal.classList.remove("is-open");
    });
  }

  function openAdminModal(title, details) {
    const modal = document.getElementById("adminRealtimeModal");
    if (!modal) return;
    modal.querySelector("h3").textContent = title;
    modal.querySelector("pre").textContent = details;
    modal.classList.add("is-open");
  }

  function showLiveState(text) {
    document.querySelectorAll(".status-pill, .request-live-dot").forEach((node) => {
      if (node.id === "adminLiveStatus") return;
      if (String(node.textContent || "").toLowerCase().includes("system") || String(node.textContent || "").toLowerCase().includes("live")) {
        node.textContent = text;
      }
    });
  }

  function showToast(message, isError) {
    let toast = document.getElementById("adminLiveToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "adminLiveToast";
      toast.className = "admin-live-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("is-error", !!isError);
    toast.classList.add("is-open");
    setTimeout(() => toast.classList.remove("is-open"), 2600);
  }
})();
