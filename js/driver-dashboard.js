const K = {
  history: "wow_driver_history",
  finance: "wow_driver_finance",
  status: "wow_driver_status",
  liveRequests: "wow_live_ride_requests"
};

const FARE_API = {
  saveData: "php/save_fare_data.php"
};

const RIDE_API = {
  updateStatus: "php/update_ride_status.php",
  dashboardData: "php/get_driver_dashboard_data.php",
  updatePresence: "php/update_driver_presence.php",
  earningsData: "php/get_driver_earnings_data.php"
};
const REALTIME = window.WowRealtime || null;
const REALTIME_PRESENCE_KEY = REALTIME && REALTIME.keys ? REALTIME.keys.presence : "wow_realtime_driver_presence";

const SOS_API = {
  send: "php/send_sos.php",
  list: "php/get_sos.php",
  update: "php/update_sos_status.php"
};
const REVIEW_API = "php/ratings_reviews.php";

const app = {
  online: true,
  onTrip: false,
  active: null,
  started: false,
  pending: [],
  scheduledAssigned: [],
  scheduledAvailable: [],
  scheduledListenerReady: false,
  scheduledAvailableReady: false,
  history: [],
  finance: { cashCollected: 0, onlineEarned: 0, walletBalance: 0, totalWithdrawn: 0, todayCash: 0, todayOnline: 0, weekCash: 0, weekOnline: 0, monthCash: 0, monthOnline: 0, withdrawals: [] },
  notices: [],
  map: null,
  mapResizeHandler: null,
  mapUserExploring: false,
  routeLayerId: "driver-dashboard-route",
  markers: {},
  vehicle: null,
  lastRouteKey: "",
  path: [],
  step: 0,
  routeTimer: null,
  callTimer: null,
  callSecs: 0,
  requestTimer: null,
  sequence: 0,
  routeKm: 0,
  routeMin: 0,
  replyTimer: null,
  syncTimer: null,
  pickupTimer: null,
  routeStage: "toPickup",
  driverAnchor: null,
  chatByRide: {},
  sosPollTimer: null,
  location: null,
  locationTimer: null,
  realtimeUnsubscribe: null,
  firestoreRideUnsubscribe: null,
  firestoreRideAttaching: false,
  firestoreScheduledRideUnsubscribe: null,
  firestoreScheduledRideRetryTimer: null,
  firestoreRideRetryTimer: null,
  firestoreAssignedRideUnsubscribe: null,
  firestoreOfferUnsubscribe: null,
  firestoreActiveUnsubscribe: null,
  firestoreChatUnsubscribe: null,
  firestoreReviewUnsubscribe: null,
  firestoreNotificationUnsubscribe: null,
  firestoreNotifications: [],
  firestoreReady: null,
  liveTracker: null,
  callReady: false,
  callMuted: false,
  driverProfile: null,
  listenerVehicleType: "",
  seenRequestIds: new Set(),
  initialRideSnapshotLoaded: false,
  initialScheduledRideSnapshotLoaded: false,
  initialAssignedRideSnapshotLoaded: false,
  assignedRideIds: new Set(),
  // Incoming requests depend on online/availability state, never notification permission.
  alertsEnabled: true,
  alertsMuted: false,
  requestAudio: null,
  newRequestIds: new Set(),
  declinedRequestIds: new Set(),
  offerNotifications: new Set(),
  dashboardRefreshTimer: null,
  dashboardFetchInFlight: false,
  lastDashboardFetchAt: 0,
  earningsSummaryRefreshAt: 0,
  requestExpiryTimer: null,
  reviewSummary: { avg_rating: 0, total_reviews: 0 },
  recentReviews: []
  ,sendingOfferIds: new Set()
  ,isStartingRide: false
  ,isCompletingRide: false
  ,logoutInProgress: false
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cache();
  bind();
  profile();
  earnings();
  setStatus(readStatus());
  seed();
  renderRequests();
  renderHistory();
  renderDriverReviews();
  renderNotices();
  addNotice("System ready", "Driver dashboard loaded successfully.", "Just now");
  app.requestExpiryTimer = setInterval(pruneExpiredRequests, 15000);
  updateRideUi();
  initRealtimeDriverSync();
  initFirestoreRideSync();
  initDriverReviewListener();
  initDriverNotificationListener();
  startLocationTracking();
  fetchDriverDashboardData();
  fetchDriverEarningsSummary();
  initDriverDashboardMap();
  restoreDriverLiveTrackingFromSession();
  // Keep the PHP fallback warm as a safety net. Firestore stays primary, but
  // this prevents delayed requests when the browser wakes or a listener retries.
  initLiveSync();
  // Firestore listeners can pause while a tab sleeps or the network changes.
  // Reattach on wake/reconnect so the driver queue resumes without a reload.
  window.addEventListener("online", recoverFirestoreRideListener);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recoverFirestoreRideListener();
  });
});
window.addEventListener("pagehide", cleanupDriverDashboard);
window.addEventListener("beforeunload", cleanupDriverDashboard);

function recoverFirestoreRideListener() {
  if (document.hidden || !app.online || app.onTrip || app.firestoreRideAttaching) return;
  if (!app.firestoreRideUnsubscribe) {
    app.firestoreRideRetryTimer && clearTimeout(app.firestoreRideRetryTimer);
    app.firestoreRideRetryTimer = null;
    attachFirestoreRideListener();
  }
}

function cache() {
  [
    "body","availabilityToggle","availabilityPill","availabilityTitle","availabilityCopy","availabilityDetail","mapStatus",
    "requestIndicator","requestList","requestsEmpty","activeEmpty","activePanel","rideStatePill","passengerAvatar","passengerName",
    "passengerPhone","rideCode","rideStatus","activePickup","activeDrop","statusBanner","startRideBtn","endRideBtn","chatBtn",
    "callBtn","chatPanel","callPanel","chatThread","chatInput","sendChatBtn","callAvatar","callName","callSubtitle","callTimer",
    "endCallBtn","notificationsBtn","driverLogoutBtn","profileBtn","modalLayer","notificationsPanel","notificationsList","notificationBadge",
    "profilePanel","toastStack","profileName","headerDriverName","profileRole","profileInitial","profileInitialPanel","profileNamePanel",
    "profileEmailPanel","profileStatusPanel","driverVehicle","driverVehiclePanel","driverPlate","driverPlatePanel","profileRating",
    "profileRatingPanel","profileTrips","earnToday","earnWeek","earnTotal","historyList","driverAvgRating","driverTotalReviews","driverReviewsList","routePickup","routeDrop","driverEta",
    "chatPassengerAvatar","chatPassengerName","chatRideCode","chatPickup","chatDrop",
    "driverSosList","sosLiveCount","completeModal","completeDoneBtn",
    "driverDistance","helpNavBtn","sosBtn","sosModal","confirmSosBtn","driverMap","driverType",
    "driverTrackingRecenter","driverTrackingStatus","driverPeerStatus",
    "answerDashboardCallBtn","declineDashboardCallBtn","muteDashboardCallBtn","driverScheduledList",
    "summaryRequestCount","summaryDriverStatus","summaryDriverStatusCopy","summaryScheduledRide",
    "activeDistance","activeEta","activeFare","activePayment","navigateRideBtn",
    "recentNotificationsList","viewAllNotificationsBtn","sosAvailability"
    ,"enableRideAlertsBtn","muteRideAlertsBtn","rideAlertsStatus"
  ].forEach(id => el[id] = document.getElementById(id));
}

function bind() {
  el.availabilityToggle?.addEventListener("click", toggleAvailability);
  el.startRideBtn?.addEventListener("click", startRide);
  el.endRideBtn?.addEventListener("click", endRide);
  el.chatBtn?.addEventListener("click", openChat);
  el.callBtn?.addEventListener("click", openCall);
  el.viewAllNotificationsBtn?.addEventListener("click", () => openPanel(el.notificationsPanel));
  el.sendChatBtn?.addEventListener("click", sendChat);
  el.chatInput?.addEventListener("keydown", e => e.key === "Enter" && sendChat());
  el.endCallBtn?.addEventListener("click", async () => { await window.WowRideCall?.end().catch(() => {}); closeCall(); });
  el.answerDashboardCallBtn?.addEventListener("click", async () => {
    try { await WowRideCall.answer(); } catch (error) { toast("Unable to connect", error?.message || "Unable to connect the call."); }
  });
  el.declineDashboardCallBtn?.addEventListener("click", async () => { await WowRideCall.decline().catch(() => {}); closeCall(); });
  el.muteDashboardCallBtn?.addEventListener("click", () => {
    app.callMuted = !app.callMuted;
    WowRideCall.mute(app.callMuted);
    el.muteDashboardCallBtn.textContent = app.callMuted ? "Unmute" : "Mute";
  });
  el.notificationsBtn?.addEventListener("click", () => openPanel(el.notificationsPanel));
  document.getElementById("homeAlertsBtn")?.addEventListener("click", () => openPanel(el.notificationsPanel));
  el.driverLogoutBtn?.addEventListener("click", doDriverLogout);
  el.sosBtn?.addEventListener("click", () => {
    if (!hasActiveRideContext()) {
      toast("SOS unavailable", "SOS (Active only during ride)");
      return;
    }
    openPanel(el.sosModal);
  });
  el.confirmSosBtn?.addEventListener("click", triggerSos);
  el.requestList?.addEventListener("click", onRequestClick);
  el.requestList?.addEventListener("input", onDriverOfferInput);
  el.driverScheduledList?.addEventListener("click", onScheduledRideClick);
  el.modalLayer?.addEventListener("click", closeAll);
  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeBy(btn.dataset.close)));
  document.querySelectorAll(".bottom-nav .nav-item[data-pane]").forEach(btn => {
    btn.addEventListener("click", () => setActivePane(btn.dataset.pane));
  });
}

function initRealtimeDriverSync() {
  if (REALTIME && typeof REALTIME.subscribe === "function") {
    app.realtimeUnsubscribe = REALTIME.subscribe((message) => {
      const type = String(message?.type || "");
      const payload = message?.payload || {};
      if (!type) return;

      if (type === "ride.requested") {
        if (!app.online || app.onTrip) return;
        const added = addRealtimeRequestToQueue(payload);
        queueDashboardRefresh(added ? 250 : 0);
        return;
      }

      if (type === "ride.status") {
        const rideCode = String(payload.rideCode || "");
        if (!rideCode) return;
        const activeCode = String(app.active?.rideCode || localStorage.getItem("wow_ride_code") || "");
        if (!activeCode || rideCode !== activeCode) return;
        const status = String(payload.status || "").toLowerCase();
        if (isRideStartedStatus(status)) {
          app.started = true;
          app.onTrip = true;
          app.routeStage = "toDrop";
          localStorage.setItem("wow_ride_status", "ride_started");
          localStorage.setItem("wow_ride_started", "1");
          el.rideStatus.textContent = "In progress";
          el.statusBanner.textContent = "Passenger is onboard. Follow the live route to the drop-off point.";
          enableControls(false, true, true);
          if (el.startRideBtn) el.startRideBtn.textContent = "Ride Started";
          updateRouteMap(app.active, true);
          updateRideUi();
          return;
        }
        if (status === "completed") {
          queueDashboardRefresh(0);
          fetchDriverDashboardData();
        }
      }
    });
  }

  window.addEventListener("storage", (event) => {
    if (!event) return;
    if (event.key === K.liveRequests) {
      queueDashboardRefresh(120);
      return;
    }
    if (event.key === REALTIME_PRESENCE_KEY) {
      if (!app.active) renderRequests();
    }
  });

  broadcastDriverPresence();
}

function queueDashboardRefresh(delayMs = 150) {
  if (app.dashboardRefreshTimer) clearTimeout(app.dashboardRefreshTimer);
  app.dashboardRefreshTimer = setTimeout(() => {
    app.dashboardRefreshTimer = null;
    fetchDriverDashboardData();
  }, delayMs);
}

function publishRealtime(type, payload) {
  if (!REALTIME || typeof REALTIME.publish !== "function") return;
  REALTIME.publish(type, payload || {});
}

function addRealtimeRequestToQueue(payload) {
  if (!payload || typeof payload !== "object") return false;
  const id = String(payload.rideId || payload.requestId || "").trim();
  if (!id) return false;
  const requestedVehicleType = window.WowVehicle?.requestedType({
    requestedVehicleType: payload.requestedVehicleType || payload.vehicleType,
    vehicleType: payload.vehicleType,
    rideType: payload.rideType
  }) || normalizeVehicleKey(payload.rideType);
  const driverVehicleType = app.listenerVehicleType
    || window.WowVehicle?.normalize(localStorage.getItem("wow_driver_vehicle_type") || "")
    || normalizeVehicleKey(localStorage.getItem("wow_driver_vehicle_type") || "");
  if (requestedVehicleType && driverVehicleType && requestedVehicleType !== driverVehicleType) return false;

  const requestedAt = payload.requestedAt || new Date().toISOString();
  const row = mapLiveToPending({
    id,
    rideCode: payload.rideCode || "",
    pickup: payload.pickup || payload.pickupAddress || "Pickup",
    drop: payload.drop || payload.dropAddress || "Drop-off",
    pickupAddress: payload.pickupAddress || payload.pickup || "",
    dropAddress: payload.dropAddress || payload.drop || "",
    rideType: payload.rideType || requestedVehicleType || "WOW Car",
    offeredFare: Number(payload.offeredFare || payload.fare || 0),
    fare: Number(payload.offeredFare || payload.fare || 0),
    paymentMethod: payload.paymentMethod || "online",
    paymentLabel: payload.paymentLabel || paymentLabel(payload.paymentMethod || "online"),
    passengerName: payload.passengerName || "Passenger",
    passengerRating: payload.passengerRating || "",
    requestedAt,
    updatedAt: requestedAt,
    status: "pending"
  });
  row.id = id;
  row.dbId = id;
  row.createdMs = firestoreMillis(requestedAt) || Date.now();
  row.firestore = false;
  row.live = true;
  row.raw = {
    id,
    rideId: id,
    rideCode: row.rideCode,
    passengerName: row.passenger,
    pickup: row.pickup,
    pickupAddress: row.pickupAddress,
    dropoff: row.drop,
    dropoffAddress: row.dropAddress,
    passengerOffer: row.offeredFare || row.fare,
    paymentMethod: row.paymentMethod,
    paymentLabel: row.paymentLabel,
    requestedVehicleType,
    vehicleType: requestedVehicleType,
    status: "searching",
    requestStatus: "open",
    assignedDriverId: null,
    createdAt: requestedAt
  };
  if (!liveRequestMatchesCurrentDriver(row) || !isActionableRequest(row)) return false;

  const key = String(row.dbId || row.id);
  const index = app.pending.findIndex((item) => String(item.dbId || item.id) === key);
  if (index >= 0) app.pending[index] = { ...app.pending[index], ...row };
  else app.pending.push(row);
  notifyNewFirestoreRequest(id, row.raw);
  renderRequests();
  return true;
}

function currentDriverPresence() {
  const uid = currentDriverUid();
  const numericId = currentDriverNumericId();
  const fallbackKey = (currentDriverEmail() || "driver").toLowerCase();
  const driverId = numericId > 0 ? `db-driver-${numericId}` : (uid ? `driver-uid-${uid}` : `driver-email-${fallbackKey}`);
  return {
    id: driverId,
    uid,
    firebaseUid: uid,
    dbId: numericId > 0 ? numericId : uid,
    name: localStorage.getItem("wow_user_name") || "Driver",
    phone: localStorage.getItem("wow_user_phone") || "",
    vehicleType: resolveDriverVehicle(app.driverProfile || {}).type,
    rating: localStorage.getItem("wow_driver_rating") || "",
    trips: localStorage.getItem("wow_driver_trips") || "342",
    online: app.online ? 1 : 0,
    available: app.online && !app.onTrip ? 1 : 0,
    lat: app.location && Number.isFinite(app.location.lat) ? app.location.lat : null,
    lng: app.location && Number.isFinite(app.location.lng) ? app.location.lng : null,
    updatedAt: new Date().toISOString()
  };
}

function broadcastDriverPresence() {
  const me = currentDriverPresence();
  let rows = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(REALTIME_PRESENCE_KEY) || "[]");
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    rows = [];
  }
  const idx = rows.findIndex((item) => String(item?.id || "") === String(me.id));
  if (idx >= 0) rows[idx] = { ...rows[idx], ...me };
  else rows.push(me);
  const freshRows = rows
    .filter((item) => {
      const age = Date.now() - new Date(item.updatedAt || 0).getTime();
      return Number.isFinite(age) ? age <= 120000 : false;
    })
    .slice(-200);
  localStorage.setItem(REALTIME_PRESENCE_KEY, JSON.stringify(freshRows));
  publishRealtime("driver.presence", me);
}

function toggleAvailability() {
  if (app.onTrip) return toast("Ride in progress", "Finish the current ride before switching offline.");
  setStatus(!app.online);
}

function setStatus(online) {
  app.online = !!online;
  document.body.classList.toggle("is-offline", !app.online);
  document.body.classList.toggle("is-online", app.online);
  document.body.classList.toggle("is-ontrip", app.onTrip);
  el.availabilityToggle?.setAttribute("aria-pressed", String(app.online));
  el.availabilityPill.textContent = app.onTrip ? "On Trip" : app.online ? "Online" : "Offline";
  el.availabilityDetail.textContent = app.onTrip ? "Currently on an active trip" : app.online ? "Accepting requests" : "Not accepting requests";
  el.availabilityTitle.textContent = app.onTrip ? "Ride in Progress" : app.online ? "You are Online" : "You are Offline";
  el.availabilityCopy.textContent = app.onTrip ? "Complete the ride before changing availability." : app.online ? "Accepting nearby ride requests" : "Go online to receive ride requests";
  el.mapStatus.textContent = app.onTrip ? "On-trip navigation active" : app.online ? "Live requests enabled" : "Offline mode";
  el.requestIndicator.textContent = app.online ? "Live" : "Paused";
  if (el.summaryDriverStatus) el.summaryDriverStatus.textContent = app.onTrip ? "On Trip" : app.online ? "Online" : "Offline";
  if (el.summaryDriverStatusCopy) el.summaryDriverStatusCopy.textContent = app.onTrip ? "Active ride controls open" : app.online ? "Available for rides" : "Not receiving requests";
  localStorage.setItem(K.status, JSON.stringify({ online: app.online, onTrip: app.onTrip }));
  updateRideUi();
  renderRequests();
  syncDriverPresence();
  broadcastDriverPresence();
  attachFirestoreRideListener();
  if (app.online && !app.onTrip) startFeed();
  if (!app.online || app.onTrip) clearInterval(app.requestTimer);
}

function readStatus() {
  try {
    const s = JSON.parse(localStorage.getItem(K.status) || "null");
    return s?.online !== false;
  } catch {
    return true;
  }
}

function profile() {
  if (!el.profileName && !el.profileNamePanel && !el.profileInitial && !el.profileInitialPanel && !el.driverVehicle && !el.driverVehiclePanel) return;
  const name = localStorage.getItem("wow_user_name") || (localStorage.getItem("wow_user_email") || "").split("@")[0] || "Driver";
  const email = localStorage.getItem("wow_user_email") || "";
  const vehicle = localStorage.getItem("wow_driver_vehicle") || "--";
  const type = localStorage.getItem("wow_driver_vehicle_type") || "--";
  const plate = localStorage.getItem("wow_driver_plate") || "--";
  const ratingValue = Number(localStorage.getItem("wow_driver_rating") || app.reviewSummary?.avg_rating || 0);
  const rating = ratingValue > 0 ? ratingValue.toFixed(1) : "Not rated";
  const trips = localStorage.getItem("wow_driver_trips") || "0";
  const initial = (name.trim().charAt(0) || "D").toUpperCase();

  [el.profileName, el.profileNamePanel, el.headerDriverName].forEach(n => n && (n.textContent = name));
  if (el.profileEmailPanel) el.profileEmailPanel.textContent = email;
  [el.profileInitial, el.profileInitialPanel].forEach(n => n && (n.textContent = initial));
  if (el.profileRole) el.profileRole.textContent = "Verified driver";
  if (el.profileStatusPanel) el.profileStatusPanel.textContent = app.onTrip ? "On Trip" : app.online ? "Online" : "Offline";
  [el.driverVehicle, el.driverVehiclePanel].forEach(n => n && (n.textContent = vehicle));
  [el.driverPlate, el.driverPlatePanel].forEach(n => n && (n.textContent = plate));
  [el.profileRating, el.profileRatingPanel].forEach(n => n && (n.textContent = n === el.profileRatingPanel ? `${rating}/5` : rating));
  if (el.profileTrips) el.profileTrips.textContent = `${trips} trips`;
  if (el.driverType) el.driverType.textContent = type;
}

function syncDriverProfileFromDb(driver) {
  if (!driver || typeof driver !== "object") return;
  app.driverProfile = { ...driver };
  const name = String(driver.name || driver.fullName || driver.displayName || localStorage.getItem("wow_user_name") || "").trim();
  const email = String(driver.email || localStorage.getItem("wow_user_email") || "").trim();
  const phone = String(driver.phone || driver.phoneNumber || "").trim();
  const resolvedVehicle = resolveDriverVehicle(driver);
  const vehicle = String(resolvedVehicle.name || driver.vehicle || driver.vehicleModel || driver.carModel || "").trim();
  const vehicleType = String(resolvedVehicle.type || driver.vehicleType || driver.vehicle_type || "").trim();
  const plate = String(resolvedVehicle.number || driver.vehicleNumber || driver.vehicleNo || driver.plateNumber || driver.registrationNumber || "").trim();
  if (name) localStorage.setItem("wow_user_name", name);
  if (name && el.headerDriverName) el.headerDriverName.textContent = name;
  if (email) localStorage.setItem("wow_user_email", email);
  if (phone) localStorage.setItem("wow_user_phone", phone);
  if (vehicle) localStorage.setItem("wow_driver_vehicle", vehicle);
  if (vehicleType) localStorage.setItem("wow_driver_vehicle_type", vehicleType);
  if (plate) localStorage.setItem("wow_driver_plate", plate);
}

function earnings() {
  if (!el.earnToday || !el.earnWeek || !el.earnTotal) return;
  el.earnToday.textContent = money(app.finance.todayCash + app.finance.todayOnline);
  el.earnWeek.textContent = money(app.finance.weekCash + app.finance.weekOnline);
  el.earnTotal.textContent = money(app.finance.walletBalance);
}

function applyDriverEarningsSummary(summary) {
  if (!summary || typeof summary !== "object") return;
  const today = Number(summary.today || 0);
  const week = Number(summary.week || 0);
  const total = Number(summary.total || 0);
  app.finance = {
    ...app.finance,
    todayCash: 0,
    todayOnline: today,
    weekCash: 0,
    weekOnline: week,
    monthCash: 0,
    monthOnline: Number(summary.month || 0),
    walletBalance: total,
    onlineEarned: total
  };
  earnings();
}

async function fetchDriverEarningsSummary(force = false) {
  const now = Date.now();
  if (!force && now - app.earningsSummaryRefreshAt < 15000) return;
  app.earningsSummaryRefreshAt = now;
  try {
    const driverUid = currentDriverUid();
    const driverEmail = currentDriverEmail();
    const query = new URLSearchParams({
      role: "driver",
      email: driverEmail,
      firebase_uid: driverUid,
      uid: driverUid,
      user_id: driverUid
    });
    if (force) query.set("refresh", "1");
    const res = await fetch(`${RIDE_API.earningsData}?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return;
    applyDriverEarningsSummary(data.summary);
    if (data.rating_summary) {
      app.reviewSummary = data.rating_summary;
      localStorage.setItem("wow_driver_rating", Number(app.reviewSummary.avg_rating || 0).toFixed(1));
      profile();
    }
  } catch (error) {
    console.warn("[WOW Driver] earnings summary unavailable", error?.message || error);
  }
}

function seed() {
  syncPendingFromLive();
}



function readLiveRequests() {
  try {
    const rows = JSON.parse(localStorage.getItem(K.liveRequests) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLiveRequests(rows) {
  localStorage.setItem(K.liveRequests, JSON.stringify(rows));
}

function currentFirebaseDriverUser() {
  try {
    return window.firebase && firebase.auth ? firebase.auth().currentUser : null;
  } catch {
    return null;
  }
}

function currentDriverUid() {
  const user = currentFirebaseDriverUser();
  return String(user?.uid || localStorage.getItem("wow_user_id") || "").trim();
}

function currentDriverEmail() {
  const user = currentFirebaseDriverUser();
  return String(user?.email || localStorage.getItem("wow_user_email") || "").trim();
}

function currentDriverNumericId() {
  const value = Number(currentDriverUid() || localStorage.getItem("wow_user_id") || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function currentDriverIdentityKeys() {
  const keys = new Set();
  const uid = currentDriverUid();
  const storedId = String(localStorage.getItem("wow_user_id") || "").trim();
  [uid, storedId].forEach((value) => {
    if (!value) return;
    keys.add(value);
    keys.add(`driver-uid-${value}`);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) keys.add(`db-driver-${numeric}`);
  });
  const email = currentDriverEmail().toLowerCase();
  if (email) keys.add(`driver-email-${email}`);
  return keys;
}

function normalizeVehicleKey(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("scooty") || text.includes("scooter")) return "scooty";
  if (text.includes("bike") || text.includes("motorbike") || text.includes("motorcycle")) return "bike";
  if (text.includes("car") || text.includes("auto")) return "car";
  return "";
}

function resolveDriverVehicle(profile = {}) {
  const resolved = window.WowVehicle?.driverVehicle(profile) || { type: "", name: "", number: "" };
  const storedType = localStorage.getItem("wow_driver_vehicle_type") || localStorage.getItem("wow_driver_vehicle") || "";
  const type = resolved.type
    || window.WowVehicle?.normalize(storedType)
    || normalizeVehicleKey(storedType)
    || "car";
  return {
    type,
    name: resolved.name || localStorage.getItem("wow_driver_vehicle") || "",
    number: resolved.number || localStorage.getItem("wow_driver_plate") || ""
  };
}

function formatRequestTime(iso) {
  if (!iso) return "Just now";
  const deltaSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (deltaSec < 60) return "Just now";
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}

function deriveDistanceEta(pickup, drop) {
  const a = point(pickup);
  const b = point(drop);
  if (!a || !b) return { distance: "-- km", eta: "-- min" };
  const km = Math.max(1.2, dist(a, b));
  const minutes = Math.max(5, Math.round(km * 2.2));
  return {
    distance: `${km.toFixed(1)} km`,
    eta: `${minutes} min`
  };
}

function mapLiveToPending(req) {
  const trip = deriveDistanceEta(req.pickup, req.drop);
  const normalizedStatus = normalizePendingStatus(req.status);
  const paymentMethod = String(req.paymentMethod || "online").toLowerCase();
  return {
    id: req.id,
    rideCode: req.rideCode || "",
    passenger: req.passengerName || "Passenger",
    phone: "",
    pickup: req.pickup || "Pickup",
    drop: req.drop || "Drop-off",
    fare: Number(req.offeredFare || req.fare || 0),
    offeredFare: Number(req.offeredFare || req.fare || 0),
    distance: trip.distance,
    eta: trip.eta,
    time: formatRequestTime(req.requestedAt || req.updatedAt),
    rating: req.passengerRating || "",
    rideType: req.rideType || "WOW Car",
    paymentMethod,
    paymentLabel: req.paymentLabel || paymentLabel(paymentMethod),
    status: normalizedStatus,
    requestedAt: req.requestedAt || req.updatedAt || new Date().toISOString(),
    live: true
  };
}

function syncPendingFromLive() {
  const rows = readLiveRequests();
  const activeRows = rows.filter((row) => {
    const status = String(row?.status || "").toLowerCase();
    return !TERMINAL_REQUEST_STATUSES.has(status) && normalizePendingStatus(status) === "pending";
  });
  // Remove terminal requests from the browser cache so a cancelled ride can
  // never reappear after a refresh or a temporary Firestore reconnect.
  if (activeRows.length !== rows.length) writeLiveRequests(activeRows);
  app.pending = activeRows.map(mapLiveToPending).filter(isActionableRequest);
}

function mapDbRequestToPending(row) {
  const km = Number(row.distance_km || 0);
  const min = Number(row.duration_min || 0);
  const offeredFare = Number(row.offered_fare || 0);
  const fare = offeredFare > 0 ? offeredFare : Number(row.fare || 0);
  const paymentMethod = String(row.payment_method || "online").toLowerCase();
  const scheduledAt = String(row.scheduled_at || "");
  const raw = {
    id: String(row.id || ""),
    rideId: String(row.id || ""),
    scheduledAt,
    rideCode: String(row.ride_code || ""),
    passengerName: row.passenger_name || "Passenger",
    pickup: row.pickup || "",
    pickupAddress: row.pickup || "",
    dropoff: row.dropoff || "",
    dropoffAddress: row.dropoff || "",
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    dropoffLat: row.drop_lat,
    dropoffLng: row.drop_lng,
    distanceKm: Number(row.distance_km || 0),
    durationMinutes: Number(row.duration_min || 0),
    requestedVehicleType: row.vehicle_type || "",
    vehicleType: row.vehicle_type || "",
    passengerOffer: offeredFare > 0 ? offeredFare : fare,
    paymentMethod,
    paymentLabel: row.payment_label || paymentLabel(paymentMethod),
    status: String(row.status || "searching"),
    requestStatus: "open",
    assignedDriverId: row.driver_id ? String(row.driver_id) : null,
    createdAt: row.created_at || "",
    expiresAt: row.expires_at || ""
  };
  return {
    id: "db-" + String(row.id),
    dbId: String(row.id || ""),
    rideCode: String(row.ride_code || ""),
    passenger: row.passenger_name || "Passenger",
    phone: "",
    pickup: row.pickup || "Pickup",
    drop: row.dropoff || "Drop-off",
    fare,
    offeredFare: offeredFare > 0 ? offeredFare : fare,
    distance: `${(Number(row.distance_from_driver_km || 0) > 0 ? Number(row.distance_from_driver_km) : (km > 0 ? km : 1.2)).toFixed(1)} km`,
    eta: `${Math.max(5, Math.round(min > 0 ? min : 8))} min`,
    time: formatRequestTime(row.created_at || ""),
    rating: row.passenger_rating || "",
    rideType: normalizeRideType(row.vehicle_type || "WOW Car"),
    paymentMethod,
    paymentLabel: row.payment_label || paymentLabel(paymentMethod),
    status: String(row.status || "finding_driver"),
    requestedAt: row.created_at || "",
    live: false,
    firestore: false,
    source: "server",
    raw
  };
}

function mapFirestoreRideToPending(id, row) {
  const km = Number(row.distanceKm || row.distance || 0);
  const min = Number(row.durationMinutes || row.durationMin || 0);
  const offeredFare = Number(
    row.passengerOffer || row.userOfferedPrice || row.offeredFare || row.fare || 0
  );
  const createdMs = firestoreMillis(
    row.createdAt || row.requestedAt || row.requestCreatedAt || row.clientCreatedAt || row.createdAtMs || row.requestedAtMs
  );
  const vehicle = normalizeRideType(row.vehicleType || row.rideType || "WOW Car");
  return {
    id: String(id),
    dbId: String(id),
    rideCode: String(row.rideCode || ""),
    passenger: row.passengerName || "Passenger",
    phone: "",
    pickup: row.pickupName || row.pickup || row.pickupAddress || "Pickup",
    pickupAddress: row.pickupAddress || row.pickup || "",
    drop: row.destinationName || row.dropoff || row.dropoffAddress || "Drop-off",
    dropAddress: row.destinationAddress || row.dropoffAddress || row.dropoff || "",
    fare: offeredFare,
    offeredFare,
    distance: `${(km > 0 ? km : 0).toFixed(1)} km`,
    eta: `${Math.max(5, Math.round(min > 0 ? min : 8))} min`,
    time: formatRequestTime(createdMs ? new Date(createdMs).toISOString() : ""),
    rating: row.passengerRating || "",
    rideType: row.rideType || vehicle,
    vehicleType: row.vehicleType || vehicle,
    isCarpool: Boolean(row.isCarpool),
    estimatedFare: Number(row.estimatedFare || 0),
    minimumFare: row.minimumFare ?? row.minFare ?? row.fareMin ?? row.estimatedFareMin ?? null,
    maximumFare: row.maximumFare ?? row.maxFare ?? row.fareMax ?? row.estimatedFareMax ?? null,
    paymentMethod: String(row.paymentMethod || "online").toLowerCase(),
    paymentLabel: row.paymentLabel || paymentLabel(row.paymentMethod || "online"),
    status: String(row.status || "searching"),
    requestedAt: createdMs ? new Date(createdMs).toISOString() : "",
    createdMs,
    expiresMs: firestoreMillis(row.expiresAt),
    live: true,
    firestore: true,
    raw: row
  };
}

function firestoreMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value > 20000000000 ? value : value * 1000;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isApprovedDriverProfile(profile) {
  const row = profile && typeof profile === "object" ? profile : {};
  const role = String(row.role || "").trim().toLowerCase();
  const verificationStatus = String(row.verificationStatus || row.accountStatus || "").trim().toLowerCase();
  return role === "driver"
    && ["approved", "verified", "active"].includes(verificationStatus)
    && row.isApproved !== false;
}

const INSTANT_REQUEST_LIFETIME_MS = 10 * 60 * 1000;
const TERMINAL_REQUEST_STATUSES = new Set(["cancelled", "canceled", "cancelled_by_passenger", "completed", "rejected", "declined", "expired", "failed"]);
const DRIVER_BUSY_STATUSES = new Set([
  "driver_assigned", "accepted", "driver_selected", "driver_en_route",
  "driver_arriving", "arriving", "arrived", "started", "ride_started",
  "ongoing", "in_progress", "on_trip", "active"
]);

function assignedDriverValue(ride) {
  const raw = ride?.raw || ride || {};
  const value = raw.assignedDriverId ?? raw.driverUid ?? raw.driverId ?? raw.acceptedDriverId ?? raw.selectedDriverId ?? "";
  const text = String(value ?? "").trim();
  return /^(null|undefined)$/i.test(text) ? "" : text;
}

function hasAssignedDriver(ride) {
  return Boolean(assignedDriverValue(ride));
}

function requestMergeKey(ride) {
  const raw = ride?.raw || ride || {};
  return String(ride?.dbId || raw.rideId || raw.id || ride?.id || raw.rideCode || ride?.rideCode || "").replace(/^db-/, "");
}

function requestSourcePriority(ride) {
  if (ride?.firestore === true) return 3;
  if (ride?.source === "server" || ride?.live === false) return 2;
  if (ride?.live === true) return 1;
  return 0;
}

function mergePendingRequests(...groups) {
  const merged = new Map();
  groups.flat().forEach((ride) => {
    if (!isActionableRequest(ride)) return;
    const key = requestMergeKey(ride);
    if (!key) return;
    const existing = merged.get(key);
    const nextPriority = requestSourcePriority(ride);
    const existingPriority = requestSourcePriority(existing);
    if (!existing || nextPriority > existingPriority || (nextPriority === existingPriority && requestCreatedMillis(ride) >= requestCreatedMillis(existing))) {
      merged.set(key, ride);
    }
  });
  return [...merged.values()].sort((a, b) => requestCreatedMillis(b) - requestCreatedMillis(a));
}

function rideBlocksDriverAvailability(ride, uid, now = Date.now()) {
  if (!ride) return false;
  const status = String(ride.status || "").trim().toLowerCase();
  if (!DRIVER_BUSY_STATUSES.has(status)) return false;
  const assigned = assignedDriverValue(ride);
  if (assigned && assigned !== String(uid || "")) return false;
  const scheduledMs = scheduledRideMillis(ride);
  if (scheduledMs > now + (30 * 60 * 1000) && ["driver_assigned", "accepted"].includes(status)) return false;
  return true;
}

async function driverHasBlockingRide(db, uid, currentRideId) {
  const rideId = String(currentRideId || "").trim();
  if (!rideId) return false;
  try {
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) return false;
    return rideBlocksDriverAvailability({ id: snapshot.id, ...(snapshot.data() || {}) }, uid);
  } catch (error) {
    console.warn("[WOW Driver] current ride availability check skipped", error?.code || error?.message || error);
    return false;
  }
}

async function findBlockingAssignedRide(db, uid) {
  try {
    const snapshot = await db.collection("rides").where("assignedDriverId", "==", uid).limit(20).get();
    let activeRide = null;
    snapshot.forEach((doc) => {
      const ride = { id: doc.id, ...(doc.data() || {}) };
      if (!rideBlocksDriverAvailability(ride, uid)) return;
      if (!activeRide || requestCreatedMillis(ride) > requestCreatedMillis(activeRide)) activeRide = ride;
    });
    return activeRide;
  } catch (error) {
    console.warn("[WOW Driver] assigned ride availability check skipped", error?.code || error?.message || error);
    return null;
  }
}

function isScheduledRequest(ride) {
  const raw = ride?.raw || ride || {};
  return Boolean(raw.scheduledAt || raw.scheduledDateTime || raw.scheduledDate);
}

function requestCreatedMillis(ride) {
  const raw = ride?.raw || ride || {};
  return Number(ride?.createdMs || firestoreMillis(
    raw.createdAt || raw.requestedAt || raw.requestCreatedAt || raw.clientCreatedAt || raw.createdAtMs || raw.requestedAtMs
  ) || firestoreMillis(ride?.requestedAt) || 0);
}

function isActionableRequest(ride, now = Date.now()) {
  if (!ride) return false;
  const raw = ride.raw || ride;
  const status = String(raw.status || ride.status || "").trim().toLowerCase();
  const requestStatus = String(raw.requestStatus || "open").trim().toLowerCase();
  if (TERMINAL_REQUEST_STATUSES.has(status)) return false;
  if (isScheduledRequest(ride)) {
    if (!["scheduled", "pending_assignment", "open", "pending", ""].includes(requestStatus)) return false;
  } else if (!["open", "pending", ""].includes(requestStatus)) return false;
  if (hasAssignedDriver(ride)) return false;
  if (isScheduledRequest(ride)) {
    const scheduledMs = scheduledRideMillis(raw);
    return scheduledMs > now || (scheduledMs > 0 && scheduledMs + (10 * 60 * 1000) >= now);
  }
  const expiresMs = Number(ride.expiresMs || firestoreMillis(raw.expiresAt) || 0);
  if (expiresMs) return expiresMs > now;
  const createdMs = requestCreatedMillis(ride);
  if (!createdMs) return false;
  return now - createdMs <= INSTANT_REQUEST_LIFETIME_MS;
}

function pruneExpiredRequests() {
  const before = app.pending.length;
  app.pending = app.pending.filter((ride) => isActionableRequest(ride));
  if (app.pending.length !== before) {
    renderRequests();
    toast("Request expired", "An outdated request was removed from the live queue.");
  }
}

async function getFirestoreReady() {
  if (!window.WowFirestore) throw new Error("Firestore helper unavailable");
  if (!app.firestoreReady) app.firestoreReady = window.WowFirestore.ready();
  return app.firestoreReady;
}

function initFirestoreRideSync() {
  attachFirestoreRideListener();
}

async function initDriverReviewListener() {
  if (app.firestoreReviewUnsubscribe) return;
  try {
    const { db, uid } = await getFirestoreReady();
    app.firestoreReviewUnsubscribe = db.collection("rideReviews")
      .where("driverUid", "==", uid)
      .limit(50)
      .onSnapshot((snapshot) => {
        const rows = snapshot.docs.map((doc) => {
          const data = doc.data() || {};
          const createdMs = firestoreMillis(data.createdAt);
          return {
            id: doc.id,
            ref: doc.ref,
            rating: Number(data.rating || 0),
            review_text: String(data.reviewText || data.review || ""),
            feedback_tags: Array.isArray(data.feedbackTags) ? data.feedbackTags : [],
            ride_code: String(data.rideCode || data.rideId || doc.id),
            passenger_name: String(data.passengerDisplayName || data.passengerName || data.reviewerName || "Passenger"),
            created_at: createdMs ? new Date(createdMs).toISOString() : ""
          };
        }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const total = rows.length;
        const sum = rows.reduce((value, row) => value + Number(row.rating || 0), 0);
        app.recentReviews = rows;
        app.reviewSummary = { total_reviews: total, avg_rating: total ? sum / total : 0 };
        localStorage.setItem("wow_driver_rating", Number(app.reviewSummary.avg_rating).toFixed(1));
        renderDriverReviews();
        profile();
        console.info("[WOW Review] driver listener received reviews", { driverId: uid, count: total });
      }, (error) => console.error("[WOW Review] driver listener failed", { code: error?.code || error?.message }));
    console.info("[WOW Review] driver listener attached", { driverId: uid });
  } catch (error) {
    console.error("[WOW Review] unable to attach driver listener", { code: error?.code || error?.message });
  }
}

async function initDriverNotificationListener() {
  if (app.firestoreNotificationUnsubscribe) return;
  try {
    const { db, uid } = await getFirestoreReady();
    app.firestoreNotificationUnsubscribe = db.collection("notifications")
      .where("driverUid", "==", uid)
      .limit(30)
      .onSnapshot((snapshot) => {
        app.firestoreNotifications = snapshot.docs.map((doc) => {
          const data = doc.data() || {};
          const receiverRole = String(data.receiverRole || "").toLowerCase();
          const receiverUid = String(data.receiverUid || "");
          if (receiverRole === "passenger" || (receiverUid && receiverUid !== uid)) return null;
          const createdMs = firestoreMillis(data.createdAt || data.sentAt || data.updatedAt);
          return {
            id: doc.id,
            ref: doc.ref,
            source: "firestore",
            type: String(data.type || "update").toLowerCase(),
            title: String(data.title || "Women on Wheels"),
            message: String(data.body || data.message || "You have a new update."),
            rideId: String(data.rideId || data.ride_id || ""),
            time: createdMs ? new Date(createdMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Just now",
            createdMs,
            unread: data.read !== true && data.isRead !== true
          };
        }).filter(Boolean).sort((a, b) => b.createdMs - a.createdMs);
        const localNotices = app.notices.filter((notice) => notice.source !== "firestore");
        app.notices = [...app.firestoreNotifications, ...localNotices].slice(0, 50);
        renderNotices();
        updateBadge();
      }, (error) => console.warn("[WOW Driver Notifications] listener failed", error?.code || error?.message));
  } catch (error) {
    console.warn("[WOW Driver Notifications] unable to attach listener", error?.code || error?.message);
  }
}

function scheduleFirestoreRideRetry() {
  if (app.firestoreRideRetryTimer) return;
  app.firestoreRideRetryTimer = setTimeout(() => {
    app.firestoreRideRetryTimer = null;
    detachFirestoreRideListener();
    attachFirestoreRideListener();
  }, 5000);
}

async function attachFirestoreRideListener() {
  if (app.firestoreRideUnsubscribe || app.firestoreRideAttaching) return;
  app.firestoreRideAttaching = true;
  try {
    const { db, uid } = await getFirestoreReady();
    // Presence is useful, but it must never delay the ride listener. A slow PHP
    // heartbeat previously made new passenger requests arrive late.
    syncDriverPresence();
    const driverSnapshot = await db.collection("drivers").doc(uid).get();
    if (!driverSnapshot.exists) throw new Error("Your driver profile is unavailable.");
    const driverProfile = driverSnapshot.data() || {};
    const role = String(driverProfile.role || "").toLowerCase();
    const verificationStatus = String(driverProfile.verificationStatus || "").toLowerCase();
    const isApproved = isApprovedDriverProfile(driverProfile);
    const isOnline = app.online;
    if (role !== "driver" || !isApproved) {
      throw new Error("Only approved drivers can view ride requests.");
    }
    if (driverProfile.lostItemRestricted === true) {
      throw new Error("Your account is temporarily restricted from new rides while a Lost and Found case is under review.");
    }
    // Assigned scheduled rides remain visible even when the driver is temporarily offline.
    attachDriverOfferStatusListener(db, uid);
    if (!app.online) {
      app.scheduledAvailable = [];
      app.scheduledAvailableReady = true;
      renderScheduledRides();
      throw new Error("Go online to view ride requests.");
    }
    // The dashboard's online switch is the source of truth for the request queue.
    // isAvailable can be stale after a tab sleep, failed presence write, or a
    // previous ride; treating it as a blocker makes new passenger requests vanish.
    const currentRideId = String(driverProfile.currentRideId || "").trim();
    const currentRideBlocks = currentRideId && await driverHasBlockingRide(db, uid, currentRideId);
    const assignedBlockingRide = await findBlockingAssignedRide(db, uid);
    if (assignedBlockingRide) {
      openNewlyAssignedRide(assignedBlockingRide);
      throw new Error("Complete the current ride before receiving new requests.");
    }
    if (currentRideBlocks) {
      throw new Error("Complete the current ride before receiving new requests.");
    }
    const registeredVehicle = resolveDriverVehicle(driverProfile);
    if (!registeredVehicle.type) throw new Error("Your registered vehicle type is unavailable.");
    app.driverProfile = { ...driverProfile, driverVehicleType: registeredVehicle.type, driverVehicleName: registeredVehicle.name, driverVehicleNumber: registeredVehicle.number };
    app.listenerVehicleType = registeredVehicle.type;
    syncDriverProfileFromDb(driverProfile);
    attachDriverOfferStatusListener(db, uid);
    const projectId = window.WowFirestore?.config?.projectId || "unknown";
    console.info("[WOW Driver] Firebase context", { projectId, uid });
    console.info("[WOW Driver] eligible driver profile", {
      uid,
      role,
      verificationStatus,
      isApproved,
      isOnline,
      isAvailable: driverProfile.isAvailable !== false,
      vehicleType: registeredVehicle.type
    });
    console.info("[WOW Driver] driver listener started", {
      collection: "rides",
      // Keep the server-side listener narrow so matching requests reach the
      // dashboard immediately and unrelated vehicle queues stay out.
      filters: { status: "searching", requestStatus: "open", assignedDriverId: null, requestedVehicleType: registeredVehicle.type }
    });
    app.firestoreRideUnsubscribe = db.collection("rides")
      .where("status", "==", "searching")
      .where("requestStatus", "==", "open")
      .where("assignedDriverId", "==", null)
      .where("requestedVehicleType", "==", registeredVehicle.type)
      .limit(25)
      .onSnapshot((snapshot) => {
        console.info("[WOW Driver] ride documents received", { count: snapshot.size });
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).filter((ride) => String(ride.status || "").toLowerCase() === "searching"
          && String(ride.requestStatus || "").toLowerCase() === "open"
          && !hasAssignedDriver(ride)
          && isActionableRequest(ride))
          .filter((ride) => window.WowVehicle?.requestedType(ride) === registeredVehicle.type);
        if (!app.initialRideSnapshotLoaded) {
          const freshAlertCutoffMs = Date.now() - 15000;
          requests.forEach((ride) => {
            const createdMs = requestCreatedMillis(ride);
            if (createdMs && createdMs >= freshAlertCutoffMs) notifyNewFirestoreRequest(String(ride.id), ride);
            else app.seenRequestIds.add(String(ride.id));
          });
          app.initialRideSnapshotLoaded = true;
        } else {
          snapshot.docChanges().forEach((change) => {
            const ride = { id: change.doc.id, ...(change.doc.data() || {}) };
            if (change.type === "added"
              && ["searching", "searching_driver", "pending"].includes(String(ride.status || "").toLowerCase())
              && ["open", "pending", ""].includes(String(ride.requestStatus || "").toLowerCase())
              && !hasAssignedDriver(ride)
              && isActionableRequest(ride)
              && window.WowVehicle?.requestedType(ride) === registeredVehicle.type) {
              notifyNewFirestoreRequest(ride.id, ride);
            }
          });
        }
        requests.forEach((ride) => console.info("[WOW Driver] ride status", {
          rideId: ride.id,
          status: ride.status || "",
          requestStatus: ride.requestStatus || ""
        }));
        console.info("[WOW Driver] live open rides", { count: requests.length });
        app.scheduledAvailableReady = true;
        renderDriverRequests(requests);
      }, (error) => {
        console.error("[WOW Driver] live request listener error", {
          code: error?.code || "unknown",
          message: error?.message || String(error)
        });
        if (el.requestIndicator) el.requestIndicator.textContent = "Offline";
        app.scheduledAvailableReady = true;
        renderScheduledRides();
        renderRequests();
        scheduleFirestoreRideRetry();
      });
    app.firestoreRideAttaching = false;
    attachAvailableScheduledRideListener(db, uid, registeredVehicle.type);
  } catch (error) {
    app.firestoreRideAttaching = false;
    console.error("[WOW Driver] Listener setup failed", error);
    if (el.requestIndicator) el.requestIndicator.textContent = "Offline";
    fetchDriverDashboardData();
    scheduleFirestoreRideRetry();
  }
}

function attachAvailableScheduledRideListener(db, uid, vehicleType) {
  if (app.firestoreScheduledRideUnsubscribe || !db || !uid || !vehicleType) return;
  console.info("[WOW Driver Scheduled] listener started", {
    driverUid: uid,
    approval: app.driverProfile?.verificationStatus || "approved",
    vehicleType,
    filters: { status: "scheduled", requestStatus: "scheduled", assignedDriverId: null, requestedVehicleType: vehicleType }
  });
  app.firestoreScheduledRideUnsubscribe = db.collection("rides")
    .where("status", "==", "scheduled")
    .where("requestStatus", "==", "scheduled")
    .where("assignedDriverId", "==", null)
    .where("requestedVehicleType", "==", vehicleType)
    .orderBy("scheduledAt", "asc")
    .limit(25)
    .onSnapshot((snapshot) => {
      const now = Date.now();
      const rows = [];
      snapshot.docs.forEach((doc) => {
        const raw = { id: doc.id, ...(doc.data() || {}) };
        let exclusion = "";
        if (!isScheduledRequest(raw)) exclusion = "scheduled timestamp invalid";
        else if (!isActionableRequest(raw, now)) exclusion = scheduledRideMillis(raw) <= now ? "ride in past" : "status mismatch";
        else if (hasAssignedDriver(raw)) exclusion = "assigned to another driver";
        else if (window.WowVehicle?.requestedType(raw) !== vehicleType) exclusion = "vehicle mismatch";
        if (exclusion) {
          console.info("[WOW Driver Scheduled] excluded", { rideId: doc.id, reason: exclusion });
          return;
        }
        rows.push(mapFirestoreRideToPending(doc.id, raw));
      });
      if (!app.initialScheduledRideSnapshotLoaded) {
        rows.forEach((ride) => app.seenRequestIds.add(String(ride.id)));
        app.initialScheduledRideSnapshotLoaded = true;
      } else {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== "added") return;
          const ride = { id: change.doc.id, ...(change.doc.data() || {}) };
          if (isActionableRequest(ride, now) && window.WowVehicle?.requestedType(ride) === vehicleType) {
            notifyNewScheduledRequest(change.doc.id, ride);
          }
        });
      }
      app.scheduledAvailable = rows;
      app.scheduledAvailableReady = true;
      console.info("[WOW Driver Scheduled] records received", { driverUid: uid, count: rows.length });
      renderScheduledRides();
    }, (error) => {
      console.error("[WOW Driver Scheduled] listener failed", { code: error?.code || "unknown", message: error?.message || String(error) });
      try { app.firestoreScheduledRideUnsubscribe?.(); } catch {}
      app.firestoreScheduledRideUnsubscribe = null;
      app.initialScheduledRideSnapshotLoaded = false;
      app.scheduledAvailable = [];
      app.scheduledAvailableReady = true;
      renderScheduledRides();
      if (!app.firestoreScheduledRideRetryTimer) {
        app.firestoreScheduledRideRetryTimer = setTimeout(() => {
          app.firestoreScheduledRideRetryTimer = null;
          if (app.online && !app.onTrip) attachAvailableScheduledRideListener(db, uid, vehicleType);
        }, 5000);
      }
    });
}

function notifyNewScheduledRequest(id, ride) {
  if (!app.online || app.onTrip || app.seenRequestIds.has(String(id))) return;
  app.seenRequestIds.add(String(id));
  addNotice("Scheduled ride available", `${ride.passengerName || "Passenger"} scheduled a matching ride.`, "Just now", "green");
  toast("Scheduled ride available", `${safeScheduledText(ride.pickupAddress || ride.pickup)} to ${safeScheduledText(ride.dropoffAddress || ride.dropoff)}`);
  playRequestSound();
  showRideBrowserNotification(id, ride);
}

function renderDriverRequests(requests) {
  const rows = (Array.isArray(requests) ? requests : [])
    .filter((ride) => String(ride.status || "").toLowerCase() === "searching" && String(ride.requestStatus || "").toLowerCase() === "open" && !hasAssignedDriver(ride))
    .filter((ride) => window.WowVehicle?.requestedType(ride) === app.listenerVehicleType)
    .map((ride) => mapFirestoreRideToPending(ride.id, ride))
    .filter(isActionableRequest);
  // Firestore's current snapshot is authoritative. Preserve only scheduled
  // cards supplied by the separate scheduled listener. If the browser listener
  // returns an empty first snapshot, keep the targeted PHP fallback rows so a
  // valid passenger request does not vanish from the driver's queue.
  const merged = new Map();
  app.pending
    .filter((ride) => isScheduledRequest(ride) && isActionableRequest(ride))
    .forEach((ride) => merged.set(String(ride.dbId || ride.id), ride));
  if (!rows.length) {
    app.pending
      .filter((ride) => !isScheduledRequest(ride) && ride.firestore !== true && isActionableRequest(ride))
      .forEach((ride) => merged.set(String(ride.dbId || ride.id), ride));
  }
  rows.forEach((ride) => merged.set(String(ride.dbId || ride.id), ride));
  app.pending = [...merged.values()]
    .filter(isActionableRequest)
    .sort((a, b) => requestCreatedMillis(b) - requestCreatedMillis(a));
  renderRequests();
  renderScheduledRides();
}

function detachFirestoreRideListener() {
  if (app.firestoreScheduledRideRetryTimer) {
    clearTimeout(app.firestoreScheduledRideRetryTimer);
    app.firestoreScheduledRideRetryTimer = null;
  }
  if (app.firestoreRideUnsubscribe) {
    try { app.firestoreRideUnsubscribe(); } catch {}
    app.firestoreRideUnsubscribe = null;
  }
  app.initialRideSnapshotLoaded = false;
  if (app.firestoreScheduledRideUnsubscribe) {
    try { app.firestoreScheduledRideUnsubscribe(); } catch {}
    app.firestoreScheduledRideUnsubscribe = null;
  }
  app.initialScheduledRideSnapshotLoaded = false;
  app.scheduledAvailable = [];
}

async function attachDriverOfferStatusListener(db, uid) {
  if (app.firestoreAssignedRideUnsubscribe || !db || !uid) return;
  app.firestoreAssignedRideUnsubscribe = db.collection("rides")
    .where("assignedDriverId", "==", uid)
    .limit(30)
    .onSnapshot((snapshot) => {
      const activeStatuses = [...DRIVER_BUSY_STATUSES];
      const assignedRides = snapshot.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
        .filter((ride) => activeStatuses.includes(String(ride.status || "").toLowerCase()));
      const now = Date.now();
      app.scheduledAssigned = assignedRides.filter((ride) => {
        const at = scheduledRideMillis(ride);
        return at > 0 && (at > now || ["driver_arriving", "arrived", "started"].includes(String(ride.status || "").toLowerCase()));
      });
      app.scheduledListenerReady = true;
      renderScheduledRides();
      const activeRides = assignedRides;
      if (!app.initialAssignedRideSnapshotLoaded) {
        activeRides.forEach((ride) => app.assignedRideIds.add(String(ride.id)));
        app.initialAssignedRideSnapshotLoaded = true;
        console.info("[WOW Driver] existing assigned rides restored without redirect", { count: activeRides.length });
        return;
      }
      snapshot.docChanges().forEach((change) => {
        const ride = { id: change.doc.id, ...(change.doc.data() || {}) };
        const rideId = String(ride.id || "").trim();
        const isActive = activeStatuses.includes(String(ride.status || "").toLowerCase());
        if (change.type === "removed" || !isActive) {
          app.assignedRideIds.delete(rideId);
          return;
        }
        if (change.type !== "added" || app.assignedRideIds.has(rideId)) return;
        app.assignedRideIds.add(rideId);
        openNewlyAssignedRide(ride);
      });
    }, (error) => {
      console.error("[WOW Driver] assigned ride listener error", error);
      try { app.firestoreAssignedRideUnsubscribe?.(); } catch {}
      app.firestoreAssignedRideUnsubscribe = null;
      app.initialAssignedRideSnapshotLoaded = false;
      app.assignedRideIds.clear();
      app.scheduledListenerReady = true;
      renderScheduledRides();
      scheduleFirestoreRideRetry();
    });
}

function safeScheduledText(input) {
  if (input == null || typeof input === "boolean") return "";
  if (typeof input === "object") {
    for (const key of ["formattedAddress", "address", "name", "label", "placeName"]) {
      const nested = safeScheduledText(input[key]);
      if (nested) return nested;
    }
    return "";
  }
  const text = String(input).trim();
  return !text || text === "[object Object]" || /^(null|undefined)$/i.test(text) ? "" : text;
}

function scheduledLocation(ride, keys, fallback) {
  for (const key of keys) {
    const text = safeScheduledText(ride[key]);
    if (text && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)) return text;
  }
  return fallback;
}

function scheduledRideMillis(ride) {
  const source = ride?.scheduledAt || ride?.scheduledDateTime || ride?.scheduleAt;
  if (source?.toMillis) return source.toMillis();
  if (source?.seconds) return Number(source.seconds) * 1000;
  if (source) {
    const parsed = new Date(source).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (ride?.scheduledDate) {
    const parsed = new Date(`${ride.scheduledDate}T${safeScheduledText(ride.scheduledTime || ride.pickupTime) || "23:59"}`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function scheduledFare(ride) {
  for (const key of ["finalFare", "acceptedFare", "agreedFare", "totalFare", "fare", "passengerOffer", "estimatedFare"]) {
    const raw = ride[key];
    if (raw == null || typeof raw === "boolean" || typeof raw === "object") continue;
    const cleaned = String(raw).replace(/(?:PKR|Rs\.?)/gi, "").replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) continue;
    const amount = Number(cleaned);
    if (Number.isFinite(amount) && amount >= 0) return money(amount);
  }
  return "Fare unavailable";
}

function scheduledPickupDistance(ride) {
  const stored = Number(ride.distanceToPickupKm || ride.distanceFromDriverKm || ride.driverDistanceKm);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const pickupLat = Number(ride.pickupLat ?? ride.pickupLatitude ?? ride.pickupLocation?.lat ?? ride.pickupLocation?.latitude);
  const pickupLng = Number(ride.pickupLng ?? ride.pickupLongitude ?? ride.pickupLocation?.lng ?? ride.pickupLocation?.longitude);
  const driverLat = Number(app.location?.lat);
  const driverLng = Number(app.location?.lng);
  if (![pickupLat, pickupLng, driverLat, driverLng].every(Number.isFinite)) return 0;
  const radians = value => value * Math.PI / 180;
  const latDelta = radians(pickupLat - driverLat);
  const lngDelta = radians(pickupLng - driverLng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(driverLat)) * Math.cos(radians(pickupLat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scheduledVehicle(ride) {
  const raw = safeScheduledText(ride.requestedVehicleType || ride.vehicleType || ride.vehicleCategory || ride.rideType);
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("scoot")) return "Scooty";
  if (normalized.includes("bike") || normalized.includes("motor")) return "Bike";
  if (normalized.includes("car")) return "Car";
  return raw || "Vehicle unavailable";
}

function scheduledStatus(ride, available) {
  if (available) return ["Available", "available"];
  const status = String(ride.status || "").toLowerCase();
  if (["started", "ride_started", "in_progress", "ongoing"].includes(status)) return ["In Progress", "started"];
  if (["arrived", "driver_reached_pickup"].includes(status)) return ["At Pickup", "arrived"];
  if (["driver_arriving", "driver_on_the_way"].includes(status)) return ["On The Way", "on-way"];
  return ["Assigned", "assigned"];
}

function renderScheduledRides() {
  if (!el.driverScheduledList) return;
  // The available scheduled-rides listener is the source for this section.
  // Do not keep the whole section in a skeleton state while the separate
  // assigned-rides listener is still restoring active trips.
  if (!app.scheduledAvailableReady) return;
  el.driverScheduledList.hidden = false;
  const now = Date.now();
  const available = app.scheduledAvailable
    .filter(item => isScheduledRequest(item) && isActionableRequest(item, now) && !hasAssignedDriver(item))
    .map(item => ({ id: String(item.id), data: item.raw || item, pending: item, available: true }));
  const assigned = app.scheduledAssigned
    .filter(ride => scheduledRideMillis(ride) > 0 && (scheduledRideMillis(ride) > now || ["driver_arriving", "arrived", "started"].includes(String(ride.status || "").toLowerCase())))
    .map(ride => ({ id: String(ride.id), data: ride, pending: null, available: false }));
  const unique = new Map();
  [...assigned, ...available].forEach(item => {
    if (!unique.has(item.id) || !item.available) unique.set(item.id, item);
  });
  const rides = [...unique.values()].sort((a, b) => scheduledRideMillis(a.data) - scheduledRideMillis(b.data));
  if (!rides.length) {
    if (el.summaryScheduledRide) el.summaryScheduledRide.textContent = "None";
    el.driverScheduledList.innerHTML = `<div class="driver-scheduled-empty"><span aria-hidden="true">◷</span><strong>No Scheduled Rides</strong><p>You don't have any upcoming scheduled rides.</p></div>`;
    return;
  }
  if (el.summaryScheduledRide) {
    const nextAt = new Date(scheduledRideMillis(rides[0].data));
    el.summaryScheduledRide.textContent = nextAt.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
  }
  el.driverScheduledList.innerHTML = rides.map(scheduledDriverCard).join("");
}

function scheduledDriverCard(item) {
  const ride = item.data;
  const at = new Date(scheduledRideMillis(ride));
  const [statusLabel, statusClass] = scheduledStatus(ride, item.available);
  const pickup = scheduledLocation(ride, ["pickupAddress", "pickupName", "pickupLocation", "pickup"], "Pickup unavailable");
  const drop = scheduledLocation(ride, ["dropoffAddress", "destinationAddress", "destinationName", "dropoffLocation", "dropoff"], "Drop-off unavailable");
  const passenger = safeScheduledText(ride.passengerName) || "Passenger";
  const rating = Number(ride.passengerRating || ride.passengerAvgRating || 0);
  const distancePickup = scheduledPickupDistance(ride);
  const tripDistance = Number(ride.distanceKm || ride.tripDistanceKm || ride.estimatedDistanceKm);
  const duration = Number(ride.durationMinutes || ride.durationMin || ride.estimatedDurationMinutes);
  const payment = safeScheduledText(ride.paymentLabel || ride.paymentMethod) || "Payment unavailable";
  const rideTypes = ["Scheduled"];
  if (ride.isCarpool === true || String(ride.rideType || "").toLowerCase().includes("carpool")) rideTypes.push("Carpool");
  if (ride.womenOnly === true || ride.isWomenOnly === true || String(ride.rideType || "").toLowerCase().includes("women")) rideTypes.push("Women Only");
  const notes = safeScheduledText(ride.rideNotes || ride.notes || ride.pickupNotes || ride.driverInstructions);
  const emergency = safeScheduledText(ride.driverEmergencyInstructions || ride.emergencyInstructions || ride.safetyInstructions);
  const status = String(ride.status || "").toLowerCase();
  const detailsUrl = `driver-ride.html?rideId=${encodeURIComponent(item.id)}`;
  let actions = item.available
    ? `<button class="driver-scheduled-btn" type="button" data-scheduled-action="view" data-ride-id="${esc(item.id)}">View Details</button>`
    : `<a class="driver-scheduled-btn" href="${detailsUrl}">View Details</a>`;
  if (item.available) {
    actions += `<button class="driver-scheduled-btn primary" type="button" data-scheduled-action="accept" data-ride-id="${esc(item.id)}">Accept Ride</button>`;
  } else if (["started", "ride_started", "in_progress", "ongoing"].includes(status)) {
    actions = `<a class="driver-scheduled-btn primary" href="${detailsUrl}">Open Active Ride</a>`;
  } else {
    actions += `<a class="driver-scheduled-btn" href="${detailsUrl}&navigate=pickup">Navigate to Pickup</a>`;
    if (["arrived", "driver_reached_pickup"].includes(status)) actions += `<a class="driver-scheduled-btn primary" href="${detailsUrl}&action=start">Start Ride</a>`;
    if (["driver_assigned", "accepted"].includes(status)) actions += `<a class="driver-scheduled-btn danger" href="${detailsUrl}&action=cancel">Cancel Ride</a>`;
  }
  return `<article class="driver-scheduled-card" data-scheduled-id="${esc(item.id)}">
    <div class="driver-scheduled-head"><div><span class="driver-scheduled-date">${esc(at.toLocaleDateString("en-PK", { weekday:"short", day:"numeric", month:"short", year:"numeric" }))}</span><strong>${esc(at.toLocaleTimeString("en-PK", { hour:"numeric", minute:"2-digit" }))}</strong></div><span class="driver-scheduled-status ${statusClass}">${statusLabel}</span></div>
    <div class="driver-scheduled-id">Ride ID: ${esc(ride.rideCode || item.id)}</div>
    <div class="driver-scheduled-passenger"><span class="request-avatar">${initial(passenger)}</span><div><strong>${esc(passenger)}</strong><span>${rating > 0 && Number.isFinite(rating) ? `★ ${rating.toFixed(1)} passenger rating` : "Passenger rating unavailable"}</span></div></div>
    <div class="driver-scheduled-route"><div><span>Pickup</span><strong>${esc(pickup)}</strong></div><div><span>Drop-off</span><strong>${esc(drop)}</strong></div></div>
    <div class="driver-scheduled-meta">
      <div><span>To pickup</span><strong>${distancePickup > 0 && Number.isFinite(distancePickup) ? `${distancePickup.toFixed(1)} km` : "Unavailable"}</strong></div>
      <div><span>Trip distance</span><strong>${tripDistance > 0 && Number.isFinite(tripDistance) ? `${tripDistance.toFixed(1)} km` : "Unavailable"}</strong></div>
      <div><span>Trip duration</span><strong>${duration > 0 && Number.isFinite(duration) ? `${Math.round(duration)} min` : "Unavailable"}</strong></div>
      <div><span>Vehicle</span><strong>${esc(scheduledVehicle(ride))}</strong></div>
      <div><span>Estimated fare</span><strong>${esc(scheduledFare(ride))}</strong></div>
      <div><span>Payment</span><strong>${esc(payment)}</strong></div>
    </div>
    <div class="driver-scheduled-types">${rideTypes.map(type => `<span>${esc(type)}</span>`).join("")}</div>
    ${notes ? `<div class="driver-scheduled-note"><span>Ride notes</span><p>${esc(notes)}</p></div>` : ""}
    ${emergency ? `<div class="driver-scheduled-note safety"><span>Safety instructions</span><p>${esc(emergency)}</p></div>` : ""}
    <div class="driver-scheduled-actions">${actions}</div>
  </article>`;
}

function onScheduledRideClick(event) {
  const button = event.target.closest("button[data-scheduled-action]");
  if (!button) return;
  const id = String(button.dataset.rideId || "");
  if (button.dataset.scheduledAction === "accept") acceptRequest(id);
  if (button.dataset.scheduledAction === "view") {
    window.location.assign(`driver-ride.html?rideId=${encodeURIComponent(id)}&mode=preview`);
  }
}

function openNewlyAssignedRide(active) {
      if (!active) return;
      const activeRideId = String(active.id || "").trim();
      if (!activeRideId) return;
      localStorage.setItem("wow_ride_db_id", activeRideId);
      localStorage.setItem("wow_ride_assigned_at", String(Date.now()));
      localStorage.setItem("wow_ride_status", String(active.status || "driver_assigned"));
      if (active.rideCode) localStorage.setItem("wow_ride_code", String(active.rideCode));
      if (scheduledRideMillis(active) > 0) {
        app.scheduledAssigned = [
          active,
          ...app.scheduledAssigned.filter(ride => String(ride.id || "") !== activeRideId)
        ];
        renderScheduledRides();
        toast("Scheduled ride reserved", "The passenger has been notified. Open the ride when it is time to leave.");
        return;
      }
      if (window.location.pathname.endsWith("/driver-dashboard.html")) {
        window.location.assign(`driver-ride.html?rideId=${encodeURIComponent(activeRideId)}`);
      }
}

async function handlePassengerAcceptedOffer(rideRef, offer) {
  if (!rideRef) return;
  try {
    const snap = await rideRef.get();
    if (!snap.exists) return;
    markDriverBusyForRide(snap.id).catch((error) => console.warn("[WOW Driver] busy status sync skipped", error?.code || error?.message || error));
    const ride = mapFirestoreRideToPending(snap.id, snap.data() || {});
    ride.status = "driver_selected";
    ride.fare = Number(offer.offeredFare || ride.fare || 0);
    ride.offeredFare = ride.fare;
    app.active = ride;
    app.onTrip = true;
    app.started = false;
    app.routeStage = "toPickup";
    saveRide(ride);
    populateActive(ride);
    listenToActiveRide(ride);
    el.activeEmpty.classList.add("is-hidden");
    el.activePanel.classList.remove("is-hidden");
    el.rideStatus.textContent = "Passenger selected you";
    el.statusBanner.textContent = "Offer Accepted. Head to the passenger pickup.";
    if (el.startRideBtn) el.startRideBtn.textContent = "Confirm Ride";
    if (el.endRideBtn) el.endRideBtn.textContent = "Cancel";
    enableControls(true, true, false);
    renderRequests();
    addNotice("Offer Accepted", "Head to the passenger pickup.", "Just now", "green");
  } catch {}
}

async function markDriverBusyForRide(rideId) {
  const activeRideId = String(rideId || "").trim();
  if (!activeRideId) return;
  const { db, uid, FieldValue } = await getFirestoreReady();
  await db.collection("drivers").doc(uid).set({
    currentRideId: activeRideId,
    isAvailable: false,
    status: "busy",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

function notifyNewFirestoreRequest(id, ride) {
  if (!app.online || app.onTrip || app.seenRequestIds.has(id)) return;
  app.seenRequestIds.add(id);
  app.newRequestIds.add(id);
  addNotice("New ride request", `${ride.passengerName || "Passenger"} requested a ride.`, "Just now", "green");
  toast("New ride request", `${ride.pickupLocation || ride.pickup || "Pickup"} to ${ride.dropoffLocation || ride.dropoff || "Drop-off"}`);
  playRequestSound();
  showRideBrowserNotification(id, ride);
  window.setTimeout(() => {
    app.newRequestIds.delete(id);
    document.querySelector(`[data-request-id="${CSS.escape(String(id))}"]`)?.classList.remove("is-new-request");
  }, 5000);
}

function playRequestSound() {
  if (!app.alertsEnabled || app.alertsMuted || !app.requestAudio) return;
  app.requestAudio.currentTime = 0;
  app.requestAudio.play().catch(() => setRideAlertsStatus("Click Enable Ride Alerts to allow sound."));
}

async function enableRideAlerts() {
  if (!app.requestAudio) {
    app.requestAudio = new Audio("data:audio/wav;base64,UklGRl9vT19teleVQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUfvT18AgICAgICAgICAgICAf39/f4CAgICAgICAgICAgH9/f39/gICAgICAgICAgICAf39/f4CAgICAgICAgICAgICAgA==");
    app.requestAudio.preload = "auto";
  }
  app.alertsEnabled = true;
  app.requestAudio.muted = true;
  await app.requestAudio.play().catch(() => {});
  app.requestAudio.pause();
  app.requestAudio.currentTime = 0;
  app.requestAudio.muted = false;
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    setRideAlertsStatus(permission === "granted" ? "Sound and browser notifications enabled." : "Sound enabled; browser notifications were not allowed.");
  } else {
    setRideAlertsStatus(typeof Notification !== "undefined" && Notification.permission === "granted" ? "Sound and browser notifications enabled." : "Sound alerts enabled.");
  }
  if (el.enableRideAlertsBtn) el.enableRideAlertsBtn.hidden = true;
  if (el.muteRideAlertsBtn) el.muteRideAlertsBtn.hidden = false;
}

function toggleRideAlertsMute() {
  app.alertsMuted = !app.alertsMuted;
  el.muteRideAlertsBtn.textContent = app.alertsMuted ? "Unmute Alerts" : "Mute Alerts";
  setRideAlertsStatus(app.alertsMuted ? "Ride alert sound muted." : "Ride alert sound enabled.");
}

function setRideAlertsStatus(message) {
  if (el.rideAlertsStatus) el.rideAlertsStatus.textContent = message;
}

function showRideBrowserNotification(id, ride) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notification = new Notification("New Ride Request", {
    body: `Pickup: ${ride.pickupName || "Pickup"}\nDestination: ${ride.destinationName || "Destination"}\nOffer: Rs. ${Number(ride.passengerOffer || 0)}`,
    icon: "images/logo.png",
    tag: `ride-${id}`,
    renotify: false
  });
  notification.onclick = () => {
    window.focus();
    const card = document.querySelector(`[data-request-id="${CSS.escape(String(id))}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.classList.add("is-new-request");
    notification.close();
  };
}

function liveRequestMatchesCurrentDriver(req) {
  const myName = String(localStorage.getItem("wow_user_name") || "").trim().toLowerCase();
  const myIds = currentDriverIdentityKeys();
  const targetName = String(req?.targetDriverName || "").trim().toLowerCase();
  const targetId = String(req?.targetDriverId || "");
  if (targetId && myIds.has(targetId)) return true;
  if (targetName && myName && targetName === myName) return true;
  return !targetId && !targetName;
}

function isApprovedDriverProfile(driver) {
  if (!driver || typeof driver !== "object") return false;
  const role = String(driver.role || "").toLowerCase();
  const verification = String(driver.verificationStatus || driver.status || "").toLowerCase();
  const isApproved = driver.isApproved !== false;
  const gender = String(driver.gender || "").toLowerCase();
  const isSuspended = driver.isSuspended === true || String(driver.accountStatus || "").toLowerCase() === "suspended";
  return role === "driver"
    && ["approved", "verified", "active"].includes(verification)
    && isApproved
    && !isSuspended
    && (!gender || gender === "female");
}

function mapDbHistoryToItem(row) {
  const completedAt = row.completed_at || row.updated_at || row.created_at || new Date().toISOString();
  const dateText = new Date(completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const km = Number(row.distance_km || 0);
  return {
    rideCode: String(row.ride_code || ""),
    passenger: row.passenger_name || "Passenger",
    pickup: row.pickup || "Pickup",
    drop: row.dropoff || "Drop-off",
    dateTime: dateText,
    fare: Number(row.fare || 0),
    distance: `${(km > 0 ? km : 0).toFixed(1)} km`,
    paymentMethod: String(row.payment_method || "online").toLowerCase(),
    vehicleType: normalizeRideType(row.vehicle_type || "WOW Car"),
    status: String(row.status || "completed").toLowerCase()
  };
}

function runWithDashboardTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isFirebaseQuotaOrTimeoutError(error) {
  const text = String(error?.code || error?.message || error || "").toLowerCase();
  return text.includes("quota") || text.includes("resource-exhausted") || text.includes("429") || text.includes("timed out") || text.includes("timeout");
}

function driverAcceptErrorMessage(error) {
  if (isFirebaseQuotaOrTimeoutError(error)) {
    return "Firebase is busy or quota-limited right now. I stopped extra refreshes; please try again in a moment.";
  }
  return error?.message || "Please try again.";
}

async function fetchDriverDashboardData(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  const minInterval = app.firestoreRideUnsubscribe ? 20000 : 8000;
  if (!force && app.dashboardFetchInFlight) return;
  if (!force && app.lastDashboardFetchAt && now - app.lastDashboardFetchAt < minInterval) return;
  app.dashboardFetchInFlight = true;
  app.lastDashboardFetchAt = now;
  try {
    const startedAt = performance.now();
    // Online is the only switch for receiving requests. A stale isAvailable
    // value must not silently hide the driver's queue.
    const available = app.online;
    const driverUid = currentDriverUid();
    const driverEmail = currentDriverEmail();
    const query = new URLSearchParams({
      role: "driver",
      email: driverEmail,
      firebase_uid: driverUid,
      uid: driverUid,
      user_id: driverUid,
      online: app.online ? "1" : "0",
      available: available ? "1" : "0"
    });
    if (app.location && Number.isFinite(app.location.lat) && Number.isFinite(app.location.lng)) {
      query.set("lat", String(app.location.lat));
      query.set("lng", String(app.location.lng));
    }
    const res = await fetch(`${RIDE_API.dashboardData}?${query.toString()}`, {
      method: "GET",
      cache: "no-store"
    });
    const data = await res.json();
    console.info("[WOW Perf] Driver dashboard query timeMs:", perfElapsed(startedAt));
    if (!res.ok || !data || !data.ok) {
      renderRequests();
      return;
    }

    syncDriverProfileFromDb(data.driver);
    const refreshedVehicleType = resolveDriverVehicle(data.driver || {}).type;
    if (app.firestoreRideUnsubscribe && app.listenerVehicleType && refreshedVehicleType && refreshedVehicleType !== app.listenerVehicleType) {
      console.info("[WOW Driver] Driver vehicle changed, restarting listener", {
        previous: app.listenerVehicleType,
        next: refreshedVehicleType
      });
      detachFirestoreRideListener();
      attachFirestoreRideListener();
    }
    const serverRequests = Array.isArray(data.requests) ? data.requests.map(mapDbRequestToPending) : [];
    if (!app.firestoreRideUnsubscribe) {
      app.pending = mergePendingRequests(serverRequests);
    } else {
      // The live Firestore snapshot is authoritative for instant requests.
      // PHP polling fills gaps when the browser listener is delayed or blocked.
      const scheduled = app.pending.filter((item) => isScheduledRequest(item));
      const liveInstant = app.pending.filter((item) => !isScheduledRequest(item) && item.firestore === true);
      const serverInstant = serverRequests.filter((item) => !isScheduledRequest(item));
      app.pending = mergePendingRequests(scheduled, liveInstant, serverInstant);
    }
    const liveRows = readLiveRequests()
      .filter((row) => normalizePendingStatus(row.status) === "pending")
      .filter(liveRequestMatchesCurrentDriver)
      .map(mapLiveToPending);
    if (liveRows.length) {
      app.pending = mergePendingRequests(app.pending, liveRows);
    }
    app.history = Array.isArray(data.history) ? data.history.map(mapDbHistoryToItem) : [];
    const useLegacyActiveRide = data.active_ride && typeof data.active_ride === "object" && !window.WowFirestore;
    if (useLegacyActiveRide) {
      const activeFromDb = mapDbRequestToPending(data.active_ride);
      activeFromDb.status = String(data.active_ride.status || "accepted");
      app.active = activeFromDb;
      saveRide(app.active);
      listenToActiveRide(app.active);
      const dbStatus = String(activeFromDb.status || "").toLowerCase();
      app.started = isRideStartedStatus(dbStatus);
      app.onTrip = true;
      app.routeStage = app.started ? "toDrop" : "toPickup";
      populateActive(app.active);
      el.activeEmpty.classList.add("is-hidden");
      el.activePanel.classList.remove("is-hidden");
      if (dbStatus === "accepted") {
        localStorage.setItem("wow_ride_status", "accepted");
        localStorage.removeItem("wow_ride_started");
        el.rideStatus.textContent = "Accepted";
        el.statusBanner.textContent = "Accepted. Head to pickup and tap Start Ride when the passenger is onboard.";
        enableControls(true, false, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Start Ride";
        updateRouteMap(app.active, false);
      } else if (isDriverArrivingStatus(dbStatus)) {
        localStorage.setItem("wow_ride_status", "driver_arriving");
        localStorage.removeItem("wow_ride_started");
        el.rideStatus.textContent = "Arrived";
        el.statusBanner.textContent = "Driver is at pickup. Tap Start Ride when the passenger is onboard.";
        enableControls(true, false, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Start Ride";
        updateRouteMap(app.active, false);
      } else if (isRideStartedStatus(dbStatus)) {
        localStorage.setItem("wow_ride_status", "ride_started");
        localStorage.setItem("wow_ride_started", "1");
        el.rideStatus.textContent = "In progress";
        el.statusBanner.textContent = "Passenger is onboard. Follow the live route to the drop-off point.";
        enableControls(false, true, true);
        if (el.startRideBtn) el.startRideBtn.textContent = "Ride Started";
        updateRouteMap(app.active, true);
      }
    } else if (!app.active?.firestore) {
      app.active = null;
      app.started = false;
      app.onTrip = false;
    }

    if (data.summary) applyDriverEarningsSummary(data.summary);
    app.reviewSummary = data.rating_summary || { avg_rating: 0, total_reviews: 0 };
    app.recentReviews = Array.isArray(data.recent_reviews) ? data.recent_reviews : [];
    localStorage.setItem("wow_driver_rating", Number(app.reviewSummary.avg_rating || 0).toFixed(1));
    profile();

    updateRideUi();
    renderRequests();
    renderHistory();
    renderDriverReviews();
  } catch {
    // Keep existing local state if API temporarily fails.
    renderRequests();
  } finally {
    app.dashboardFetchInFlight = false;
  }
}

function updateLiveRequest(id, updater) {
  const rows = readLiveRequests();
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const current = rows[idx];
  const next = typeof updater === "function" ? updater({ ...current }) : { ...current, ...updater };
  next.updatedAt = new Date().toISOString();
  rows[idx] = next;
  writeLiveRequests(rows);
  return next;
}

async function acceptRideViaServer(ride, offeredFare) {
  const rideId = String(ride?.dbId || ride?.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
  const rideCode = String(ride?.rideCode || ride?.raw?.rideCode || localStorage.getItem("wow_ride_code") || "").trim();
  if (!rideId && !rideCode) return false;
  const acceptedRide = {
    ...ride,
    dbId: rideId || ride?.dbId || "",
    rideCode,
    fare: Number(offeredFare || ride?.fare || 0),
    offeredFare: Number(offeredFare || ride?.offeredFare || ride?.fare || 0)
  };
  const synced = await syncRideStatusToDb("accepted", acceptedRide);
  if (!synced) return false;
  const driverUid = currentDriverUid();
  const activeRideId = String(rideId || ride?.dbId || ride?.id || "").replace(/^db-/, "");
  if (activeRideId) localStorage.setItem("wow_ride_db_id", activeRideId);
  if (rideCode) localStorage.setItem("wow_ride_code", rideCode);
  localStorage.setItem("wow_ride_status", "driver_assigned");
  updateLiveRequest(ride?.id, { status: "accepted", acceptedAt: new Date().toISOString() });
  app.pending = app.pending.filter((item) => requestMergeKey(item) !== requestMergeKey(ride));
  renderRequests();
  openNewlyAssignedRide({
    id: activeRideId || String(ride?.id || ""),
    ...(ride?.raw || {}),
    status: "driver_assigned",
    requestStatus: "matched",
    assignedDriverId: driverUid,
    driverId: driverUid,
    driverUid,
    rideCode,
    finalFare: Number(offeredFare || ride?.fare || 0),
    acceptedFare: Number(offeredFare || ride?.fare || 0)
  });
  return true;
}

function initLiveSync() {
  fetchDriverDashboardData({ force: true });
  if (app.syncTimer) clearInterval(app.syncTimer);
  app.syncTimer = setInterval(() => {
    if (!document.hidden && app.online && !app.onTrip) {
      recoverFirestoreRideListener();
      fetchDriverDashboardData();
    }
  }, 20000);
}

function renderRequests() {
  if (!el.requestList || !el.requestsEmpty) return;
  el.requestList.innerHTML = "";
  const actionable = app.pending.filter(isActionableRequest);
  const instantRequests = actionable.filter((ride) => !isScheduledRequest(ride));
  if (el.summaryRequestCount) el.summaryRequestCount.textContent = String(instantRequests.length);
  if (!instantRequests.length) {
    el.requestsEmpty.hidden = false;
    el.requestsEmpty.querySelector("strong").textContent = "No incoming ride requests";
    el.requestsEmpty.querySelector("p").textContent = "Stay online to receive new requests instantly.";
    return;
  }
  el.requestsEmpty.hidden = true;
  const orderedRequests = instantRequests.slice().sort((a, b) => requestCreatedMillis(b) - requestCreatedMillis(a));
  orderedRequests.forEach(r => {
    const card = document.createElement("article");
    card.className = "request-card" + (app.newRequestIds.has(String(r.id)) ? " is-new-request" : "");
    card.dataset.requestId = r.id;
    const bounds = getDriverOfferBounds(r);
    card.innerHTML = `
      <div class="request-head">
        <div class="request-meta">
          <div class="request-avatar">${initial(r.passenger)}</div>
          <div><strong>${esc(r.passenger)}</strong><span>${esc(r.time)}${r.rating ? ` · ★ ${esc(r.rating)}` : " · Rating unavailable"}</span></div>
        </div>
        <span class="request-badge">${app.newRequestIds.has(String(r.id)) ? '<b class="new-ride-badge">New</b> ' : ''}${esc(r.distance)} Â· ${esc(r.eta)}</span>
      </div>
      <div class="request-details">
        <div class="detail-row"><div><span>Passenger</span><strong>${esc(r.passenger)} · Private in-app contact</strong></div></div>
        <div class="detail-row"><div><span>Vehicle / ride</span><strong>${esc(rideTypeLabel(r.vehicleType || r.rideType))} · ${esc(r.rideType || "private")}</strong></div></div>
        <div class="detail-row"><div><span>Carpool</span><strong>${r.isCarpool ? "Yes" : "No"}</strong></div></div>
        <div class="detail-row"><div><span>Pickup</span><strong>${esc(r.pickup)}</strong><small>${esc(r.pickupAddress || "")}</small></div></div>
        <div class="detail-row"><div><span>Destination</span><strong>${esc(r.drop)}</strong><small>${esc(r.dropAddress || "")}</small></div></div>
        <div class="detail-row"><div><span>Distance</span><strong>${esc(r.distance)}</strong></div></div>
        <div class="detail-row"><div><span>Payment</span><strong>${esc(r.paymentLabel || paymentLabel(r.paymentMethod))}</strong></div></div>
        <div class="fare-box"><span>Passenger offer</span><strong>${money(r.offeredFare || r.fare)}</strong><small>Estimate ${money(r.estimatedFare || r.fare)}</small></div>
      </div>
      <div class="driver-offer-box" hidden>
        <label for="driver-offer-${esc(r.id)}">Your Offer</label>
        <div class="driver-offer-field"><span aria-hidden="true">Rs.</span><input id="driver-offer-${esc(r.id)}" type="number" min="${bounds.minimum}" max="${bounds.maximum}" step="1" inputmode="numeric" placeholder="Enter amount" aria-describedby="driver-offer-help-${esc(r.id)}"></div>
        <small class="driver-offer-range" id="driver-offer-help-${esc(r.id)}">Allowed offer: ${money(bounds.minimum)} – ${money(bounds.maximum)}</small>
        <small class="driver-offer-validation" data-offer-state aria-live="polite">Enter an amount within the allowed range.</small>
        <button class="primary-btn driver-offer-submit" type="button" data-action="counter" disabled>Send Counter Offer</button>
      </div>
      <div class="request-actions">
        <button class="outline-btn" type="button" data-action="decline">Decline</button>
        <button class="outline-btn" type="button" data-action="toggle-counter">Counter Offer</button>
        <button class="primary-btn" type="button" data-action="accept">Accept</button>
      </div>`;
    el.requestList.appendChild(card);
  });
}

function onRequestClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const card = btn.closest("[data-request-id]");
  const requestId = card?.dataset.requestId;
  if (!requestId) return;
  const request = app.pending.find((item) => String(item.id) === String(requestId));
  if (!request || !isActionableRequest(request)) {
    app.pending = app.pending.filter((item) => String(item.id) !== String(requestId));
    renderRequests();
    return toast("Request expired", "This request is no longer available.");
  }
  if (btn.dataset.action === "toggle-counter") {
    const offerBox = card.querySelector(".driver-offer-box");
    if (offerBox) {
      offerBox.hidden = !offerBox.hidden;
      if (!offerBox.hidden) offerBox.querySelector("input")?.focus();
    }
    return;
  }
  if (btn.dataset.action === "accept") acceptRequest(requestId);
  if (btn.dataset.action === "counter") sendDriverCounterOffer(requestId, card);
  if (btn.dataset.action === "decline") declineRequest(requestId);
}

function roundOfferToTen(value) {
  return Math.max(1, Math.round(Number(value || 0) / 10) * 10);
}

function getDriverOfferBounds(ride) {
  const raw = ride?.raw || ride || {};
  const explicitMinimum = Number(raw.minimumFare ?? raw.minFare ?? raw.fareMin ?? raw.estimatedFareMin ?? ride?.minimumFare);
  const explicitMaximum = Number(raw.maximumFare ?? raw.maxFare ?? raw.fareMax ?? raw.estimatedFareMax ?? ride?.maximumFare);
  if (Number.isFinite(explicitMinimum) && explicitMinimum > 0 && Number.isFinite(explicitMaximum) && explicitMaximum >= explicitMinimum) {
    return { minimum: Math.round(explicitMinimum), maximum: Math.round(explicitMaximum) };
  }
  const estimatedSource = [raw.estimatedFare, ride?.estimatedFare, raw.passengerOffer, ride?.offeredFare, ride?.fare]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  const estimated = Math.max(1, Math.round(estimatedSource || 1));
  const distance = Math.max(0, Number(raw.distanceKm ?? 0));
  const duration = Math.max(0, Number(raw.durationMinutes ?? raw.durationMin ?? 0));
  const lowerFlex = Math.min(55, Math.max(25, 15 + (distance * 2) + (duration * 0.4)));
  const upperFlex = Math.min(60, Math.max(30, 20 + (distance * 2.5) + (duration * 0.5)));
  const minimum = Math.max(1, roundOfferToTen(estimated - lowerFlex));
  const maximum = Math.max(minimum + 10, roundOfferToTen(estimated + upperFlex));
  return { minimum, maximum };
}

function validateDriverOffer(ride, rawValue) {
  const text = String(rawValue ?? "").trim();
  const amount = Number(text);
  const bounds = getDriverOfferBounds(ride);
  if (!text || !Number.isFinite(amount) || amount <= 0) return { valid: false, amount, bounds, message: "Enter a valid numeric offer greater than zero." };
  if (amount < bounds.minimum) return { valid: false, amount, bounds, message: `Your offer cannot be lower than ${money(bounds.minimum)}.` };
  if (amount > bounds.maximum) return { valid: false, amount, bounds, message: `Your offer cannot exceed ${money(bounds.maximum)}.` };
  return { valid: true, amount, bounds, message: "Offer is within the allowed range." };
}

function onDriverOfferInput(event) {
  const input = event.target.closest(".driver-offer-field input");
  if (!input) return;
  const card = input.closest("[data-request-id]");
  const ride = app.pending.find((item) => String(item.id) === String(card?.dataset.requestId || ""));
  if (!ride) return;
  const validation = validateDriverOffer(ride, input.value);
  const state = card.querySelector("[data-offer-state]");
  const send = card.querySelector('[data-action="counter"]');
  if (state) {
    state.textContent = validation.message;
    state.classList.toggle("is-error", !validation.valid && Boolean(String(input.value).trim()));
    state.classList.toggle("is-valid", validation.valid);
  }
  if (send) send.disabled = !validation.valid || app.sendingOfferIds.has(String(ride.id));
}

async function sendDriverCounterOffer(id, card, options = {}) {
  const input = card?.querySelector(".driver-offer-field input");
  const ride = app.pending.find((item) => String(item.id) === String(id));
  if (!ride) return;
  const validation = validateDriverOffer(ride, input?.value);
  if (!validation.valid) {
    const state = card?.querySelector("[data-offer-state]");
    if (state) { state.textContent = validation.message; state.classList.add("is-error"); }
    toast("Invalid offer", validation.message);
    input?.focus();
    return;
  }
  await submitDriverOffer(id, validation.amount, "counter_offer", card, options);
}

function renderHistory() {
  if (!el.historyList) return;
  el.historyList.innerHTML = "";
  const rows = app.history
    .slice()
    .reverse()
    .filter((item) => ["completed", "cancelled"].includes(String(item?.status || "").toLowerCase()));
  if (!rows.length) {
    el.historyList.innerHTML = '<div class="history-empty">No ride history found yet.</div>';
    return;
  }
  rows.forEach(item => {
    const rideCodeText = String(item.rideCode || "").trim();
    const status = String(item.status || "completed").toLowerCase();
    const row = document.createElement("article");
    row.className = "history-item";
    row.innerHTML = `
      <div class="history-head">
        <strong>${esc(item.passenger)}</strong>
        <span>${esc(item.dateTime)}</span>
      </div>
      <div class="history-meta">
        <div><span>Ride ID</span><strong class="history-id">${esc(rideCodeText || "N/A")}</strong></div>
        <div><span>Pickup</span><strong>${esc(item.pickup || "--")}</strong></div>
        <div><span>Drop-off</span><strong>${esc(item.drop || "--")}</strong></div>
        <div><span>Fare</span><strong>${money(item.fare)}</strong></div>
        <div><span>Vehicle</span><strong>${esc(item.vehicleType || "WOW Car")}</strong></div>
        <div><span>Status</span><strong>${esc(status.charAt(0).toUpperCase() + status.slice(1))}</strong></div>
      </div>`;
    el.historyList.appendChild(row);
  });
}

function renderDriverReviews() {
  const avgRating = Number(app.reviewSummary?.avg_rating || 0);
  if (el.driverAvgRating) el.driverAvgRating.textContent = `${avgRating.toFixed(1)} ★`;
  if (el.driverTotalReviews) el.driverTotalReviews.textContent = String(Number(app.reviewSummary?.total_reviews || 0));
  if (!el.driverReviewsList) return;

  const rows = Array.isArray(app.recentReviews) ? app.recentReviews : [];
  if (!rows.length) {
    el.driverReviewsList.innerHTML = '<div class="history-empty">No reviews yet from passengers.</div>';
    return;
  }

  el.driverReviewsList.innerHTML = rows.map((item) => {
    const rt = Math.max(1, Math.min(5, Number(item.rating || 0)));
    const starsFilled = "★".repeat(rt);
    const starsEmpty = "☆".repeat(5 - rt);
    const when = item.created_at
      ? new Date(item.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "Recently";
    const reviewText = String(item.review_text || "No written comment.");
    const tags = Array.isArray(item.feedback_tags) ? item.feedback_tags : [];
    const rideRef = String(item.ride_code || "").trim();
    return (
      '<article class="driver-review-card">' +
      '<div class="driver-review-head">' +
      '<div class="driver-review-passenger"><strong>' + esc(String(item.passenger_name || "Passenger")) + '</strong>' +
      (rideRef ? '<span class="driver-review-ride">' + esc(rideRef) + '</span>' : "") +
      "</div>" +
      '<span class="driver-review-date">' + esc(when) + "</span>" +
      "</div>" +
      '<div class="driver-review-stars" aria-label="Rating ' + String(rt) + ' out of 5">' +
      '<span class="filled">' + starsFilled + '</span><span class="empty">' + starsEmpty + "</span>" +
      "</div>" +
      '<p class="driver-review-text">' + esc(reviewText) + "</p>" +
      (tags.length ? '<div class="driver-review-tags">' + tags.map((tag) => '<span>' + esc(String(tag)) + '</span>').join("") + '</div>' : "") +
      "</article>"
    );
  }).join("");
}

async function acceptRequest(id) {
  const card = Array.from(el.requestList?.querySelectorAll("[data-request-id]") || [])
    .find((node) => String(node.dataset.requestId || "") === String(id)) || null;
  const selected = [...app.pending, ...app.scheduledAvailable].find((x) => String(x.id) === String(id));
  if (!selected) return;
  const driverOfferFare = Math.round(Math.max(1, Number(selected.offeredFare || selected.fare || 0)));
  return submitDriverOffer(id, driverOfferFare, "accepted_passenger_offer", card);
}

async function submitDriverOffer(id, offeredFare, offerType, card) {
  const ride = [...app.pending, ...app.scheduledAvailable].find((item) => String(item.id) === String(id));
  if (!ride) return;
  const sendingKey = String(ride.id);
  if (app.sendingOfferIds.has(sendingKey)) return;
  const bounds = getDriverOfferBounds(ride);
  if (offerType === "counter_offer") {
    const validation = validateDriverOffer(ride, offeredFare);
    if (!validation.valid) return toast("Invalid offer", validation.message);
  }
  app.sendingOfferIds.add(sendingKey);
  const actionButton = card?.querySelector(offerType === "accepted_passenger_offer" ? '[data-action="accept"]' : '[data-action="counter"]');
  const originalActionHtml = actionButton?.innerHTML || "";
  card?.querySelectorAll("button,input").forEach((node) => { node.disabled = true; });
  if (actionButton) actionButton.innerHTML = offerType === "accepted_passenger_offer" ? "Accepting..." : "Sending...";
  try {
    const { db, uid, FieldValue, firebase } = await getFirestoreReady();
    if (!uid) throw new Error("Driver authentication is required.");
    const rideRef = db.collection("rides").doc(String(ride.dbId || ride.id));
    const offerRef = rideRef.collection("offers").doc(uid);
    const driverRef = db.collection("drivers").doc(uid);
    let profile = app.driverProfile && typeof app.driverProfile === "object" ? { ...app.driverProfile } : {};
    const cachedVehicle = resolveDriverVehicle(profile);
    if (!isApprovedDriverProfile(profile) || !cachedVehicle.type) {
      const driverSnap = await db.collection("drivers").doc(uid).get();
      if (!driverSnap.exists) throw new Error("Your driver profile is unavailable.");
      profile = driverSnap.data() || {};
      syncDriverProfileFromDb(profile);
    }
    if (app.onTrip || app.active) {
      throw new Error("Complete the current ride before accepting a new request.");
    }
    let directAssignment = null;
    await runWithDashboardTimeout(db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);
      if (!rideSnap.exists) throw new Error("Ride no longer exists.");
      const liveRide = rideSnap.data() || {};
      const driverVehicle = resolveDriverVehicle(profile);
      const requestedVehicleType = window.WowVehicle.requestedType(liveRide);
      // app.online is the current dashboard state. Firestore isAvailable may
      // lag after a tab wake-up or failed presence write and must not reject a
      // request that is already visible in the driver's live queue.
      if (!isApprovedDriverProfile(profile) || !app.online || profile.lostItemRestricted === true) {
        throw new Error("Your approved online driver profile is not available for this request.");
      }
      const scheduledOpen = Boolean(liveRide.scheduledAt) &&
        liveRide.status === "scheduled" &&
        ["scheduled", "pending_assignment"].includes(String(liveRide.requestStatus || "")) &&
        ["pending", "searching"].includes(String(liveRide.assignmentStatus || "pending"));
      const instantOpen = liveRide.status === "searching" && liveRide.requestStatus === "open";
      if ((!scheduledOpen && !instantOpen) || hasAssignedDriver(liveRide)) {
        throw new Error("This ride is no longer open.");
      }
      if (!requestedVehicleType || driverVehicle.type !== requestedVehicleType) {
        throw new Error(`This ride requires a ${window.WowVehicle.label(requestedVehicleType)} driver.`);
      }
      if (offerType === "accepted_passenger_offer" && scheduledOpen) {
        if (scheduledOpen && scheduledRideMillis(liveRide) <= Date.now()) throw new Error("This scheduled ride is no longer available.");
        const driverName = profile.name || profile.fullName || localStorage.getItem("wow_user_name") || "Driver";
        const assignmentUpdate = {
          status: "driver_assigned",
          requestStatus: "matched",
          driverAssigned: true,
          assignmentStatus: "assigned",
          assignedDriverId: uid,
          driverId: uid,
          driverUid: uid,
          driverName,
          driverPhone: profile.phone || profile.phoneNumber || "",
          driverProfileImage: profile.profileImage || profile.profilePhoto || profile.photoUrl || "",
          driverPhotoURL: profile.profileImage || profile.profilePhoto || profile.photoUrl || "",
          driverRating: Number(profile.rating || profile.avgRating || 0),
          driverVehicleType: driverVehicle.type,
          driverVehicleName: driverVehicle.name,
          driverVehicleNumber: driverVehicle.number,
          vehicleNumber: driverVehicle.number,
          finalFare: Number(offeredFare),
          acceptedFare: Number(offeredFare),
          fareUpdatedFrom: "driver_website",
          lastUpdatedFrom: "driver_website",
          assignedAt: FieldValue.serverTimestamp(),
          acceptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.update(rideRef, assignmentUpdate);
        const startsWithinAssignmentWindow = !scheduledOpen || scheduledRideMillis(liveRide) <= Date.now() + 30 * 60 * 1000;
        transaction.set(driverRef, startsWithinAssignmentWindow ? {
          currentRideId: rideRef.id,
          isAvailable: false,
          status: "busy",
          updatedAt: FieldValue.serverTimestamp()
        } : {
          isAvailable: true,
          status: "online",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        directAssignment = {
          id: rideRef.id,
          ...liveRide,
          ...assignmentUpdate,
          assignedDriverId: uid,
          driverId: uid,
          driverUid: uid,
          driverName,
          driverPhone: profile.phone || profile.phoneNumber || "",
          driverPhotoURL: profile.profileImage || profile.profilePhoto || profile.photoUrl || "",
          driverRating: Number(profile.rating || profile.avgRating || 0),
          driverVehicleType: driverVehicle.type,
          driverVehicleName: driverVehicle.name,
          driverVehicleNumber: driverVehicle.number,
          acceptedFare: Number(offeredFare),
          finalFare: Number(offeredFare)
        };
        return;
      }
      const driverName = profile.name || profile.fullName || localStorage.getItem("wow_user_name") || "Driver";
      const driverPhone = profile.phone || profile.phoneNumber || localStorage.getItem("wow_user_phone") || "";
      const driverProfileImage = profile.profileImage || profile.profilePhoto || profile.photoUrl || localStorage.getItem("wow_user_photo") || "";
      const driverRating = Number(profile.rating || profile.avgRating || localStorage.getItem("wow_driver_rating") || 0);
      const offerExpiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 30000);
      transaction.set(offerRef, {
        offerId: uid,
        rideId: rideRef.id,
        driverId: uid,
        driverName,
        driverPhone,
        driverProfileImage,
        driverRating,
        requestedVehicleType,
        driverVehicleType: driverVehicle.type,
        driverVehicleName: driverVehicle.name,
        driverVehicleNumber: driverVehicle.number,
        vehicleType: driverVehicle.type,
        vehicleName: driverVehicle.name,
        vehicleNumber: driverVehicle.number,
        passengerOffer: Number(liveRide.passengerOffer || ride.offeredFare || ride.fare || 0),
        offeredFare: Number(offeredFare),
        minimumAllowedFare: Number(bounds.minimum),
        maximumAllowedFare: Number(bounds.maximum),
        offerType,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: offerExpiresAt
      }, { merge: true });
      if (instantOpen) {
        transaction.update(rideRef, {
          driverResponseStatus: "pending",
          driverDecision: offerType === "accepted_passenger_offer" ? "accepted" : "countered",
          passengerDecision: "pending",
          respondingDriverId: uid,
          respondingDriverUid: uid,
          respondingDriverName: driverName,
          respondingDriverPhone: driverPhone,
          respondingDriverProfileImage: driverProfileImage,
          respondingDriverVehicleType: driverVehicle.type,
          respondingDriverVehicleName: driverVehicle.name,
          respondingDriverVehicleNumber: driverVehicle.number,
          driverOffer: Number(offeredFare),
          acceptedFare: Number(offeredFare),
          latestOfferId: uid,
          latestOfferType: offerType,
          latestOfferStatus: "pending",
          driverResponseAt: FieldValue.serverTimestamp(),
          driverResponseExpiresAt: offerExpiresAt,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }), 18000, "Accept request timed out.");
    if (directAssignment) {
      app.sendingOfferIds.delete(sendingKey);
      localStorage.setItem("wow_ride_db_id", rideRef.id);
      localStorage.setItem("wow_ride_status", "driver_assigned");
      app.pending = app.pending.filter(item => requestMergeKey(item) !== String(rideRef.id));
      app.scheduledAvailable = app.scheduledAvailable.filter(item => requestMergeKey(item) !== String(rideRef.id));
      renderRequests();
      renderScheduledRides();
      if (scheduledRideMillis(directAssignment) > 0) {
        await db.collection("notifications").add({
          type: "scheduled_driver_assigned",
          rideId: rideRef.id,
          passengerUid: ride.raw?.passengerId || null,
          receiverUid: ride.raw?.passengerId || null,
          receiverRole: "passenger",
          driverUid: uid,
          title: "Driver assigned",
          body: "A driver accepted your scheduled ride. You can view the assigned driver in ride details.",
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
        toast("Scheduled ride assigned", "This upcoming ride is now yours.");
      } else {
        const activeRide = mapFirestoreRideToPending(rideRef.id, directAssignment);
        activeRide.status = "driver_assigned";
        activeRide.fare = Number(offeredFare);
        activeRide.offeredFare = Number(offeredFare);
        app.active = activeRide;
        app.onTrip = true;
        app.started = false;
        app.routeStage = "toPickup";
        saveRide(activeRide);
        populateActive(activeRide);
        listenToActiveRide(activeRide);
        toast("Ride accepted", "Opening live ride details.");
      }
      openNewlyAssignedRide(directAssignment);
      return;
    }
    const waitingForPassenger = offerType === "accepted_passenger_offer";
    const state = card?.querySelector("[data-offer-state]");
    if (state) state.textContent = waitingForPassenger ? "Waiting for passenger response..." : "Offer Sent";
    app.sendingOfferIds.delete(sendingKey);
    if (waitingForPassenger) {
      const acceptButton = card?.querySelector('[data-action="accept"]');
      if (acceptButton) {
        acceptButton.textContent = "Waiting for Passenger";
        acceptButton.disabled = true;
      }
      card?.querySelectorAll('[data-action="decline"], [data-action="toggle-counter"], [data-action="counter"], input')
        .forEach((node) => { node.disabled = true; });
    } else {
      card?.querySelectorAll("button,input").forEach((node) => { node.disabled = false; });
      if (actionButton && originalActionHtml) actionButton.innerHTML = originalActionHtml;
    }
    const input = card?.querySelector(".driver-offer-field input");
    if (input) onDriverOfferInput({ target: input });
    console.info("[WOW Driver] ride offer sent safely", {
      rideId: rideRef.id,
      driverId: uid,
      offerType,
      offeredFare,
      status: "pending_passenger_confirmation"
    });
    listenToSubmittedOffer(rideRef.id, uid, ride, card);
    toast("Offer sent", "Waiting for the passenger's response.");
  } catch (error) {
    console.error("[WOW Driver] offer submission failed", error);
    if (offerType === "accepted_passenger_offer" && isScheduledRequest(ride)) {
      const acceptedByServer = await acceptRideViaServer(ride, offeredFare).catch((fallbackError) => {
        console.error("[WOW Driver] server accept fallback failed", fallbackError);
        return false;
      });
      if (acceptedByServer) {
        app.sendingOfferIds.delete(sendingKey);
        toast("Ride accepted", "Opening live ride details.");
        return;
      }
    }
    app.sendingOfferIds.delete(sendingKey);
    card?.querySelectorAll("button,input").forEach((node) => { node.disabled = false; });
    if (actionButton && originalActionHtml) actionButton.innerHTML = originalActionHtml;
    const input = card?.querySelector(".driver-offer-field input");
    if (input) onDriverOfferInput({ target: input });
    toast("Offer failed", driverAcceptErrorMessage(error));
  }
}

async function listenToSubmittedOffer(rideId, driverId, ride, card = null) {
  if (app.firestoreOfferUnsubscribe) {
    try { app.firestoreOfferUnsubscribe(); } catch {}
  }
  const { db } = await getFirestoreReady();
  const offerRef = db.collection("rides").doc(rideId).collection("offers").doc(driverId);
  app.firestoreOfferUnsubscribe = offerRef.onSnapshot((doc) => {
    if (!doc.exists) return;
    const status = String((doc.data() || {}).status || "pending");
    if (status === "accepted") {
      toast("Offer accepted", "The passenger selected you.");
      const activeRideId = String(rideId || ride?.dbId || ride?.id || "").trim();
      if (!activeRideId) return toast("Ride unavailable", "The accepted ride ID is missing.");
      localStorage.setItem("wow_ride_db_id", activeRideId);
      localStorage.setItem("wow_ride_assigned_at", String(Date.now()));
      localStorage.setItem("wow_ride_status", "driver_assigned");
      markDriverBusyForRide(activeRideId).catch((error) => console.warn("[WOW Driver] busy status sync skipped", error?.code || error?.message || error));
      window.location.assign(`driver-ride.html?rideId=${encodeURIComponent(activeRideId)}`);
      return;
      app.active = { ...ride, status: "driver_assigned", driverId };
      app.onTrip = true;
      app.started = false;
      populateActive(app.active);
      el.activeEmpty.classList.add("is-hidden");
      el.activePanel.classList.remove("is-hidden");
      el.rideStatus.textContent = "Driver assigned";
      el.statusBanner.textContent = "Offer accepted. Go to pickup; do not start until the passenger is onboard.";
      if (el.startRideBtn) el.startRideBtn.textContent = "Start Going to Pickup";
      if (el.endRideBtn) el.endRideBtn.textContent = "Cancel";
      enableControls(true, true, true);
      listenToActiveRide(app.active);
    } else if (["declined", "expired", "rejected"].includes(status)) {
      const label = status === "rejected" ? "Ride assigned to another driver" : `Offer ${status}`;
      card?.querySelectorAll("button,input").forEach((node) => { node.disabled = false; });
      const acceptButton = card?.querySelector('[data-action="accept"]');
      if (acceptButton) acceptButton.textContent = "Accept";
      const state = card?.querySelector("[data-offer-state]");
      if (state) state.textContent = "Passenger did not accept this offer.";
      toast(label, "You can continue viewing other requests.");
    }
  }, (error) => {
    console.error("[WOW Driver] offer listener error", error);
    card?.querySelectorAll("button,input").forEach((node) => { node.disabled = false; });
    const acceptButton = card?.querySelector('[data-action="accept"]');
    if (acceptButton) acceptButton.textContent = "Accept";
    const state = card?.querySelector("[data-offer-state]");
    if (state) state.textContent = "Could not watch passenger response. Please try again.";
    toast("Offer status unavailable", error?.message || "Please try again.");
  });
}

async function declineRequest(id) {
  const idx = app.pending.findIndex(x => x.id === id);
  if (idx < 0) return;
  const r = app.pending.splice(idx, 1)[0];
  app.declinedRequestIds.add(String(r.id));
  updateLiveRequest(id, { status: "declined", declinedAt: new Date().toISOString() });
  try {
    const { db, uid, FieldValue } = await getFirestoreReady();
    await db.collection("rides").doc(String(r.dbId || r.id)).set({
      declinedDriverIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch {
    // Local removal is enough for this dashboard session.
  }
  renderRequests();
  addNotice("Ride declined", r.passenger + "'s request was declined.", "Just now", "pink");
  toast("Request declined", r.passenger + " removed from the queue.");
}

function populateActive(r) {
  el.passengerAvatar.textContent = initial(r.passenger);
  el.passengerName.textContent = r.passenger;
  el.passengerPhone.textContent = "Private in-app contact";
  el.rideCode.textContent = r.rideCode || rideCode(r.id);
  el.activePickup.textContent = r.pickup;
  el.activeDrop.textContent = r.drop;
  el.routePickup.textContent = r.pickup;
  el.routeDrop.textContent = r.drop;
  el.driverEta.textContent = r.eta;
  el.driverDistance.textContent = r.distance;
  if (el.activeEta) el.activeEta.textContent = r.eta || "--";
  if (el.activeDistance) el.activeDistance.textContent = r.distance || "--";
  if (el.activeFare) el.activeFare.textContent = money(r.fare || r.offeredFare || 0);
  if (el.activePayment) el.activePayment.textContent = r.paymentLabel || paymentLabel(r.paymentMethod);
  if (el.navigateRideBtn) {
    const rideId = String(r.dbId || r.id || "").replace(/^db-/, "");
    el.navigateRideBtn.href = `driver-ride.html?rideId=${encodeURIComponent(rideId)}&navigate=pickup`;
  }
}

async function listenToActiveRide(ride) {
  const rideId = String(ride?.dbId || ride?.id || "").replace(/^db-/, "");
  if (!rideId || !window.WowFirestore) return;
  if (app.firestoreActiveUnsubscribe) {
    try { app.firestoreActiveUnsubscribe(); } catch {}
    app.firestoreActiveUnsubscribe = null;
  }
  try {
    const { db } = await getFirestoreReady();
    app.firestoreActiveUnsubscribe = db.collection("rides").doc(rideId).onSnapshot((doc) => {
      if (!doc.exists || !app.active) return;
      const data = doc.data() || {};
      const status = String(data.status || app.active.status || "").toLowerCase();
      app.active.status = status;
      app.active.fare = Number(data.driverOfferFare || data.finalFare || data.fare || app.active.fare || 0);
      if (data.driverName) localStorage.setItem("wow_ride_driver_name", String(data.driverName));
      if (data.driverPhone) localStorage.setItem("wow_ride_driver_phone", String(data.driverPhone));
      if (data.driverProfilePhoto || data.profilePhotoUrl) localStorage.setItem("wow_ride_driver_photo", String(data.driverProfilePhoto || data.profilePhotoUrl));
      localStorage.setItem("wow_ride_status", status);
      if (TERMINAL_REQUEST_STATUSES.has(status)) {
        if (status === "cancelled" || status === "canceled" || status === "cancelled_by_passenger") {
          addNotice("Ride cancelled", "The ride was cancelled and removed from your active rides.", "Just now", "pink");
        }
        app.pending = app.pending.filter((item) => String(item.dbId || item.id || "").replace(/^db-/, "") !== rideId);
        app.scheduledAvailable = app.scheduledAvailable.filter((item) => String(item.id || "") !== rideId);
        app.scheduledAssigned = app.scheduledAssigned.filter((item) => String(item.id || "") !== rideId);
        app.active = null;
        app.onTrip = false;
        app.started = false;
        resetActive();
        renderRequests();
        renderScheduledRides();
        setStatus(app.online);
        return;
      }
      if (isRideStartedStatus(status)) {
        app.started = true;
        app.onTrip = true;
        app.routeStage = "toDrop";
        enableControls(false, true, true);
        if (el.startRideBtn) el.startRideBtn.textContent = "Ride Started";
      } else if (status === "driver_assigned") {
        enableControls(true, true, true);
        if (el.startRideBtn) el.startRideBtn.textContent = "Start Ride";
        if (el.endRideBtn) el.endRideBtn.textContent = "Cancel";
        el.statusBanner.textContent = "Driver assigned. Start only when the passenger is onboard.";
      } else if (status === "driver_selected") {
        enableControls(true, true, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Confirm Ride";
        if (el.endRideBtn) el.endRideBtn.textContent = "Cancel";
        el.statusBanner.textContent = "Passenger accepted your offer. Confirm ride?";
      } else if (status === "accepted") {
        enableControls(true, false, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Start Going to Pickup";
        if (el.endRideBtn) el.endRideBtn.textContent = "Complete Ride";
      } else if (status === "driver_arriving") {
        enableControls(true, false, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Mark Arrived";
        if (el.endRideBtn) el.endRideBtn.textContent = "Complete Ride";
      } else if (status === "arrived") {
        enableControls(true, false, false);
        if (el.startRideBtn) el.startRideBtn.textContent = "Start Ride";
        if (el.endRideBtn) el.endRideBtn.textContent = "Complete Ride";
      }
      if (status === "completed") {
        localStorage.setItem("wow_ride_status", "completed");
      }
      updateRideUi();
    });
    attachDriverChatListener(rideId);
  } catch {
    // Existing PHP sync remains as fallback.
  }
}

async function attachDriverChatListener(rideId) {
  const id = String(rideId || "").trim();
  if (!id || !window.WowRideChat) return;
  if (app.firestoreChatUnsubscribe) {
    try { app.firestoreChatUnsubscribe(); } catch {}
    app.firestoreChatUnsubscribe = null;
  }
  if (app.firestoreReviewUnsubscribe) {
    try { app.firestoreReviewUnsubscribe(); } catch {}
    app.firestoreReviewUnsubscribe = null;
    console.info("[WOW Review] driver listener removed");
  }
  try {
    app.firestoreChatUnsubscribe = await WowRideChat.listen({
      rideId: id,
      onMessages: (rows) => {
        app.chatByRide[id] = rows.map((msg) => ({
          role: String(msg.senderRole || msg.role || "").toLowerCase() === "driver" ? "driver" : "passenger",
          text: String(msg.messageText || ""),
          time: readableChatTime(msg.timestamp)
        }));
        renderChatThread(id);
      },
      onUnread: (count) => {
        if (count > 0) addNotice("Passenger messages", `${count} unread message${count === 1 ? "" : "s"}`, "Now");
      }
    });
  } catch {
    // Keep local chat fallback if Firestore is unavailable.
  }
}

function readableChatTime(value) {
  const ms = firestoreMillis(value);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function enableControls(start, end, comms) {
  if (el.startRideBtn) el.startRideBtn.disabled = !start;
  if (el.endRideBtn) el.endRideBtn.disabled = !end;
  if (el.chatBtn) el.chatBtn.disabled = !comms;
  if (el.callBtn) el.callBtn.disabled = !comms;
}

async function startRide() {
  if (!app.active) return;
  if (app.isStartingRide) return;
  const current = String(app.active.status || "driver_selected").toLowerCase();
  const scheduledAt = scheduledRideMillis(app.active.raw || app.active);
  if (current === "arrived" && scheduledAt > Date.now()) {
    const scheduledText = new Date(scheduledAt).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    if (el.startRideBtn) {
      el.startRideBtn.disabled = true;
      el.startRideBtn.textContent = "Waiting for time";
    }
    toast("Ride cannot start yet", `This scheduled ride can start at ${scheduledText}.`);
    window.setTimeout(() => {
      if (app.active && String(app.active.status || "").toLowerCase() === "arrived") {
        if (el.startRideBtn) {
          el.startRideBtn.disabled = false;
          el.startRideBtn.textContent = "Start Ride";
        }
      }
    }, Math.min(Math.max(scheduledAt - Date.now(), 1000), 2147483647));
    return;
  }
  if (["driver_assigned", "driver_arriving"].includes(current) && window.WowLiveTracking) {
    const rideId = String(app.active.dbId || app.active.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
    if (!rideId) return toast("Start failed", "A valid ride ID is required.");
    app.isStartingRide = true;
    if (el.startRideBtn) { el.startRideBtn.disabled = true; el.startRideBtn.textContent = "Starting..."; }
    try {
      await WowLiveTracking.startRide(rideId);
      app.active.status = "started";
      app.started = true;
      app.routeStage = "toDrop";
      localStorage.setItem("wow_ride_status", "started");
      el.statusBanner.textContent = "Ride started. Live destination tracking is active.";
      if (el.startRideBtn) el.startRideBtn.textContent = "Ride Started";
      enableControls(false, true, true);
      app.isStartingRide = false;
    } catch (error) {
      console.error("[WOW Driver] start ride failed", error);
      if (el.startRideBtn) { el.startRideBtn.disabled = false; el.startRideBtn.textContent = "Start Ride"; }
      app.isStartingRide = false;
      toast("Start failed", error?.message || "Please try again.");
    }
    return;
  }
  const nextStatus = current === "driver_assigned"
    ? "driver_arriving"
    : current === "driver_selected"
      ? "accepted"
    : current === "accepted"
      ? "driver_arriving"
      : current === "driver_arriving"
        ? "arrived"
        : current === "arrived"
          ? "started"
          : "";
  if (nextStatus) {
    app.active.status = nextStatus;
    app.onTrip = true;
    app.started = nextStatus === "started";
    app.routeStage = nextStatus === "started" ? "toDrop" : "toPickup";
    localStorage.setItem("wow_ride_status", nextStatus);
    if (nextStatus === "started") localStorage.setItem("wow_ride_started", "1");
    else localStorage.removeItem("wow_ride_started");
    const labels = {
      accepted: ["Accepted", "Start Going to Pickup", "Ride confirmed. Start going to pickup when ready."],
      driver_arriving: ["Driver Arriving", "Mark Arrived", "You are going to pickup."],
      arrived: ["Arrived", "Start Ride", "You have arrived. Start ride only when passenger is onboard."],
      started: ["In progress", "Ride Started", "Passenger is onboard. Follow the route to the drop-off point."]
    };
    const label = labels[nextStatus] || labels.accepted;
    el.rideStatePill.textContent = label[0];
    el.rideStatus.textContent = label[0];
    el.statusBanner.textContent = label[2];
    el.mapStatus.textContent = nextStatus === "started" ? "On-trip navigation active" : "Pickup navigation active";
    enableControls(nextStatus !== "started", nextStatus === "started", nextStatus === "started");
    if (el.startRideBtn) el.startRideBtn.textContent = label[1];
    if (el.endRideBtn) el.endRideBtn.textContent = "Complete Ride";
    updateRideUi();
    updateRideRequestStatus(nextStatus, app.active);
    updateLiveRequest(app.active.id, { status: nextStatus, updatedAt: new Date().toISOString() });
    publishRealtime("ride.status", {
      requestId: app.active.id,
      rideCode: app.active.rideCode || localStorage.getItem("wow_ride_code") || "",
      rideId: String(app.active.dbId || app.active.id || ""),
      status: nextStatus
    });
    syncRideStatusToDb(nextStatus, app.active);
    updateRouteMap(app.active, nextStatus === "started");
    addNotice("Ride updated", "Passenger has been notified.", "Just now", "green");
    toast("Ride updated", label[0]);
    return;
  }
  if (isRideStartedStatus(current)) {
    window.location.assign("driver-ride.html");
  }
}

async function cancelSelectedRide() {
  if (!app.active) return;
  const rideId = String(app.active.dbId || app.active.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
  if (!rideId || !window.WowFirestore) return;
  const done = app.active;
  let releasedToQueue = false;
  try {
    const { db, uid, FieldValue } = await getFirestoreReady();
    const rideRef = db.collection("rides").doc(rideId);
    const driverRef = db.collection("drivers").doc(String(uid || ""));
    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);
      const driverSnap = await transaction.get(driverRef);
      if (!rideSnap.exists) throw new Error("ride_not_found");
      const ride = rideSnap.data() || {};
      if (String(ride.assignedDriverId || ride.driverId || ride.selectedDriverId || "") !== String(uid)) throw new Error("not_selected_driver");
      if (!["driver_assigned", "driver_selected", "driver_offered"].includes(String(ride.status || "").toLowerCase())) throw new Error("ride_not_waiting_confirmation");
      const driver = driverSnap.exists ? (driverSnap.data() || {}) : {};
      const currentRideId = String(driver.currentRideId || "").trim();
      releasedToQueue = Boolean(ride.scheduledAt || ride.scheduledDateTime || ride.scheduledDate || ride.assignmentStartsAt);
      const rideUpdate = releasedToQueue ? {
        status: "searching",
        requestStatus: "open",
        driverAssigned: false,
        assignmentStatus: "searching",
        assignedDriverId: null,
        driverId: null,
        driverUid: null,
        selectedDriverId: null,
        driverName: null,
        driverPhone: null,
        driverVehicle: null,
        driverVehicleType: null,
        driverVehicleName: null,
        driverVehicleNumber: null,
        driverPhoto: null,
        driverPhotoURL: null,
        driverProfileImage: null,
        driverRating: null,
        vehicleNumber: null,
        assignedAt: null,
        assignmentAttempt: FieldValue.increment(1),
        driverCancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      } : {
        status: "cancelled",
        requestStatus: "closed",
        cancelledBy: "driver",
        cancellationReason: "Driver cancelled before pickup",
        cancelledAt: FieldValue.serverTimestamp(),
        passenger_location: FieldValue.delete(),
        driver_location: FieldValue.delete(),
        last_updated: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(rideRef, rideUpdate, { merge: true });
      if (driverSnap.exists && (!currentRideId || currentRideId === rideRef.id)) {
        const isOnline = driver.isOnline === true || app.online === true;
        transaction.set(driverRef, {
          currentRideId: null,
          isAvailable: isOnline,
          status: isOnline ? "online" : "offline",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });
    publishRealtime("ride.status", {
      requestId: done.id,
      rideCode: done.rideCode || localStorage.getItem("wow_ride_code") || "",
      rideId,
      status: releasedToQueue ? "searching" : "cancelled"
    });
    addNotice(
      releasedToQueue ? "Ride released" : "Ride cancelled",
      releasedToQueue ? "The passenger request is searching again." : "The passenger ride was cancelled.",
      "Just now",
      "pink"
    );
    toast("Ride cancelled", releasedToQueue ? "The request is back in the live queue." : "The passenger has been notified.");
  } catch (error) {
    console.error("WOW driver cancel selected ride failed:", error);
    toast("Unable to cancel", "Please try again.");
    return;
  }
  app.active = null;
  app.started = false;
  app.onTrip = false;
  app.routeStage = "toPickup";
  syncDriverPresence();
  enableControls(false, false, false);
  resetActive();
  setStatus(app.online);
  renderRequests();
}

async function endRide() {
  if (!app.active) return;
  if (["driver_assigned", "driver_selected", "driver_offered"].includes(String(app.active.status || "").toLowerCase())) {
    cancelSelectedRide();
    return;
  }
  if (String(app.active.status || "").toLowerCase() === "started" && window.WowLiveTracking) {
    if (app.isCompletingRide) return;
    app.isCompletingRide = true;
    const rideId = String(app.active.dbId || app.active.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
    try {
      if (el.endRideBtn) { el.endRideBtn.disabled = true; el.endRideBtn.textContent = "Completing..."; }
      await WowLiveTracking.completeRide(rideId);
      app.liveTracker?.stop(true);
      app.liveTracker = null;
    } catch (error) {
      console.error("[WOW Driver] complete ride failed", error);
      app.isCompletingRide = false;
      if (el.endRideBtn) { el.endRideBtn.disabled = false; el.endRideBtn.textContent = "Complete Ride"; }
      toast("Completion failed", error?.message || "Please try again.");
      return;
    }
  }
  stopRoute();
  stopCall();
  const done = app.active;
  const paymentMethod = done.paymentMethod || choosePaymentMethod(done.fare);
  done.paymentMethod = paymentMethod;
  updateLiveRequest(done.id, { status: "completed", completedAt: new Date().toISOString() });
  updateRideRequestStatus("completed", done, { completedAt: true, finalFare: Number(done.fare || 0) });
  publishRealtime("ride.status", {
    requestId: done.id,
    rideCode: done.rideCode || localStorage.getItem("wow_ride_code") || "",
    rideId: String(done.dbId || done.id || ""),
    status: "completed"
  });
  localStorage.removeItem("wow_ride_started");
  localStorage.setItem("wow_ride_status", "completed");
  app.history.push({
    rideCode: done.rideCode || localStorage.getItem("wow_ride_code") || "",
    passenger: done.passenger,
    dateTime: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    fare: done.fare,
    distance: done.distance,
    paymentMethod,
    status: "completed"
  });
  localStorage.setItem(K.history, JSON.stringify(app.history));
  const completionSync = syncRideStatusToDb("completed", done);
  saveCompletedRideForTraining(done);
  earnings();
  renderHistory();
  queueDashboardRefresh(60);
  fetchDriverEarningsSummary(true);
  Promise.resolve(completionSync).then((ok) => {
    if (ok) fetchDriverDashboardData();
    else queueDashboardRefresh(1200);
  });
  addNotice("Ride completed", done.passenger + "'s trip finished successfully.", "Just now", "purple");
  if (el.completeModal) openPanel(el.completeModal);
  app.active = null;
  app.started = false;
  app.onTrip = false;
  app.routeStage = "toPickup";
  app.driverAnchor = null;
  syncDriverPresence();
  enableControls(false, false, false);
  resetActive();
  setStatus(app.online);
  renderRequests();
  closeBy("chat");
  closeBy("call");
  updateRouteMap(null, false);
  app.isCompletingRide = false;
}

async function updateRideRequestStatus(status, ride, extra = {}) {
  const rideId = String(ride?.dbId || ride?.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
  if (!rideId || !window.WowFirestore) return false;
  try {
    const { db, FieldValue } = await getFirestoreReady();
    const payload = { status, lastUpdatedFrom: "driver_website", updatedAt: FieldValue.serverTimestamp() };
    if (status === "accepted") payload.driverConfirmedAt = FieldValue.serverTimestamp();
    if (status === "driver_arriving") payload.driverArrivingAt = FieldValue.serverTimestamp();
    if (status === "arrived") payload.driverArrivedAt = FieldValue.serverTimestamp();
    if (status === "started") payload.startedAt = FieldValue.serverTimestamp();
    if (status === "completed") payload.completedAt = FieldValue.serverTimestamp();
    if (extra.finalFare) payload.finalFare = Number(extra.finalFare || 0);
    await db.collection("rides").doc(rideId).set(payload, { merge: true });
    return true;
  } catch {
    return false;
  }
}

function syncRideStatusToDb(status, ride) {
  const rideCode = String(ride?.rideCode || localStorage.getItem("wow_ride_code") || "");
  const rideId = String(ride?.dbId || ride?.id || localStorage.getItem("wow_ride_db_id") || "").replace(/^db-/, "");
  if (!rideCode && !rideId) return false;
  const explicitDriverId = currentDriverUid();
  const explicitDriverEmail = currentDriverEmail();
  const payload = {
    ride_code: rideCode,
    ride_id: rideId,
    status,
    fare: Number(ride?.fare || localStorage.getItem("wow_ride_fare") || 0),
    offered_fare: Number(ride?.offeredFare || ride?.fare || localStorage.getItem("wow_ride_fare") || 0),
    distance_km: Number.parseFloat(localStorage.getItem("wow_ride_distance_km") || "0") || 0,
    duration_min: Number.parseFloat(localStorage.getItem("wow_ride_duration_min") || "0") || 0,
    vehicle_type: window.WowVehicle?.requestedType(ride?.raw || ride || {}) || localStorage.getItem("wow_ride_requested_vehicle") || "",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    pickup_lat: localStorage.getItem("wow_ride_pickup_lat") || "",
    pickup_lng: localStorage.getItem("wow_ride_pickup_lng") || "",
    drop_lat: localStorage.getItem("wow_ride_drop_lat") || "",
    drop_lng: localStorage.getItem("wow_ride_drop_lng") || "",
    driver_id: explicitDriverId,
    driver_uid: explicitDriverId,
    firebase_uid: explicitDriverId,
    uid: explicitDriverId,
    driver_email: explicitDriverEmail,
    user_id: explicitDriverId,
    email: explicitDriverEmail,
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase()
  };

  return fetch(RIDE_API.updateStatus, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then((res) => res.json().catch(() => ({})).then((data) => ({ okHttp: res.ok, data })))
    .then(({ okHttp, data }) => Boolean(okHttp && data && data.ok))
    .catch(() => false);
}

function normalizePendingStatus(value) {
  const status = String(value || "").toLowerCase();
  if (!status || status === "requested" || status === "searching" || status === "searching_driver" || status === "finding_driver" || status === "pending") return "pending";
  return status;
}

function isDriverArrivingStatus(status) {
  return ["arrived", "driver_arriving", "driver_arrived"].includes(String(status || "").toLowerCase());
}

function isRideStartedStatus(status) {
  return ["in_progress", "ride_started", "started", "on_trip"].includes(String(status || "").toLowerCase());
}

async function syncDriverPresence() {
  const available = app.online;
  const driverUid = currentDriverUid();
  const driverEmail = currentDriverEmail();
  const payload = {
    role: "driver",
    email: driverEmail,
    firebase_uid: driverUid,
    uid: driverUid,
    user_id: driverUid,
    online: app.online ? 1 : 0,
    available: available ? 1 : 0,
    lat: app.location && Number.isFinite(app.location.lat) ? app.location.lat : "",
    lng: app.location && Number.isFinite(app.location.lng) ? app.location.lng : ""
  };
  try {
    const response = await fetch(RIDE_API.updatePresence, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`presence_http_${response.status}`);
  } catch (error) {
    console.error("[WOW Driver] presence sync failed", error);
  } finally {
    broadcastDriverPresence();
  }
}

function startLocationTracking() {
  const defaultLocation = { lat: 24.8607, lng: 67.0011 };
  const readCached = () => {
    const lat = Number(localStorage.getItem("wow_driver_lat") || "");
    const lng = Number(localStorage.getItem("wow_driver_lng") || "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      app.location = { lat, lng };
    }
  };
  readCached();
  if (!app.location) {
    app.location = defaultLocation;
    localStorage.setItem("wow_driver_lat", String(defaultLocation.lat));
    localStorage.setItem("wow_driver_lng", String(defaultLocation.lng));
    syncDriverPresence();
  }
  refreshDriverLocation();
  if (app.locationTimer) clearInterval(app.locationTimer);
  app.locationTimer = setInterval(refreshDriverLocation, 45000);
}

function refreshDriverLocation() {
  if (!navigator.geolocation) {
    if (!app.location) {
      app.location = { lat: 24.8607, lng: 67.0011 };
    }
    syncDriverPresence();
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    app.location = { lat, lng };
    localStorage.setItem("wow_driver_lat", String(lat));
    localStorage.setItem("wow_driver_lng", String(lng));
    syncDriverPresence();
  }, () => {
    if (!app.location) {
      app.location = { lat: 24.8607, lng: 67.0011 };
      localStorage.setItem("wow_driver_lat", String(app.location.lat));
      localStorage.setItem("wow_driver_lng", String(app.location.lng));
    }
    syncDriverPresence();
  }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 20000 });
}

function saveCompletedRideForTraining(done) {
  if (!done) return;
  const rawDistanceKm = localStorage.getItem("wow_ride_distance_km") || "";
  const rawDurationMin = localStorage.getItem("wow_ride_duration_min") || "";
  const parsedDistance = Number.parseFloat(rawDistanceKm);
  const parsedDuration = Number.parseFloat(rawDurationMin);
  const fallbackDistance = Number.parseFloat(String(done.distance || "").replace(/[^\d.]/g, ""));
  const fallbackDuration = Number.parseFloat(String(done.eta || "").replace(/[^\d.]/g, ""));

  const payload = {
    pickup: done.pickup || localStorage.getItem("wow_ride_pickup") || "",
    drop: done.drop || localStorage.getItem("wow_ride_drop") || "",
    pickup_lat: localStorage.getItem("wow_ride_pickup_lat") || "",
    pickup_lng: localStorage.getItem("wow_ride_pickup_lng") || "",
    drop_lat: localStorage.getItem("wow_ride_drop_lat") || "",
    drop_lng: localStorage.getItem("wow_ride_drop_lng") || "",
    distance_km: Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : (Number.isFinite(fallbackDistance) ? fallbackDistance : 0),
    duration_min: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : (Number.isFinite(fallbackDuration) ? fallbackDuration : 0),
    vehicle_type: window.WowVehicle?.requestedType(done.raw || done || {}) || localStorage.getItem("wow_ride_requested_vehicle") || "",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    fare: Number(done.fare || 0),
    firebase_uid: currentDriverUid(),
    uid: currentDriverUid(),
    user_id: currentDriverUid(),
    email: currentDriverEmail(),
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase()
  };

  fetch(FARE_API.saveData, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then((res) => res.json().catch(() => ({})).then((data) => ({ okHttp: res.ok, data })))
    .then(({ okHttp, data }) => {
      if (!okHttp || !data || !data.ok) {
        console.warn("Fare training save failed:", data);
      }
    })
    .catch(() => {
      // Non-blocking telemetry save; dashboard flow should continue even if request fails.
    });
}

function resetActive() {
  el.rideStatePill.textContent = app.online ? "Online" : "Offline";
  el.rideStatus.textContent = "Idle";
  el.statusBanner.textContent = "Ride completed. Go online to accept the next request.";
  el.activePanel.classList.add("is-hidden");
  el.activeEmpty.classList.remove("is-hidden");
  el.routePickup.textContent = "No active ride";
  el.routeDrop.textContent = "No active ride";
  el.driverEta.textContent = "--";
  el.driverDistance.textContent = "--";
  el.mapStatus.textContent = app.online ? "Live requests enabled" : "Offline mode";
}

function updateRideUi() {
  if (app.active) {
    el.activeEmpty.classList.add("is-hidden");
    el.activePanel.classList.remove("is-hidden");
  } else {
    el.activeEmpty.classList.remove("is-hidden");
    el.activePanel.classList.add("is-hidden");
    enableControls(false, false, false);
  }
  el.rideStatePill.textContent = app.onTrip ? "On Trip" : app.online ? "Online" : "Offline";
  if (el.profileStatusPanel) el.profileStatusPanel.textContent = app.onTrip ? "On Trip" : app.online ? "Online" : "Offline";
  refreshSosUi();
}

function setActivePane(name) {
  document.querySelectorAll(".dashboard-pane").forEach(pane => {
    pane.classList.toggle("is-active", pane.dataset.pane === name);
  });
  syncNav(name);
}

function seedChat(r) {
  if (!r || !r.id) return;
  setChatContext(r);
  renderChatThread(r.id);
}

function openChat() {
  if (!app.active) return toast("Chat unavailable", "Accept a ride first to chat with the passenger.");
  seedChat(app.active);
  attachDriverChatListener(String(app.active.dbId || app.active.id || "").replace(/^db-/, ""));
  openPanel(el.chatPanel);
  el.chatInput?.focus();
}

async function openCall() {
  if (!app.active) return toast("Call unavailable", "Accept a ride first to call the passenger.");
  const rideId = String(app.active.dbId || app.active.id || "").replace(/^db-/, "");
  if (!rideId || !window.WowRideCall) return toast("Call unavailable", "Calling is available only during an active ride.");
  el.callName.textContent = app.active.passenger;
  el.callAvatar.textContent = initial(app.active.passenger);
  el.callSubtitle.textContent = "Starting private call...";
  openPanel(el.callPanel);
  try {
    await initDriverDashboardCall(rideId);
    await WowRideCall.start();
  } catch (error) {
    el.callSubtitle.textContent = error?.message || "Unable to connect the call.";
  }
}

async function initDriverDashboardCall(rideId) {
  if (app.callReady) return;
  await WowRideCall.init({
    rideId,
    role: "driver",
    platform: "driver_website",
    onIncoming: () => openPanel(el.callPanel),
    onState: (status, data) => {
      const incoming = status === "ringing" && data?.receiverRole === "driver";
      if (el.callSubtitle) el.callSubtitle.textContent = status === "active" ? "Connected"
        : status === "ringing" ? "Ringing..."
          : status === "missed" ? "No answer"
            : status === "declined" ? "Call declined"
              : status === "reconnecting" ? "Reconnecting..."
                : status.replaceAll("_", " ");
      if (el.answerDashboardCallBtn) el.answerDashboardCallBtn.hidden = !incoming;
      if (el.declineDashboardCallBtn) el.declineDashboardCallBtn.hidden = !incoming;
      if (status === "active") startCall();
      if (["ended", "declined", "missed", "cancelled", "failed"].includes(status)) stopCall();
    }
  });
  app.callReady = true;
}

function closeCall() {
  closeBy("call");
  stopCall();
}

async function sendChat() {
  if (!app.active || !el.chatInput) return;
  const text = el.chatInput.value.trim();
  if (!text) return;
  const rideId = String(app.active.dbId || app.active.id || "").replace(/^db-/, "");
  try {
    await WowRideChat.send({ rideId, message: text });
    el.chatInput.value = "";
  } catch (error) {
    el.chatInput.value = text;
    toast("Message not sent", error?.message || "Tap Send to retry.");
  }
}

function bubble(role, text, rideId) {
  if (!rideId) return;
  if (!Array.isArray(app.chatByRide[rideId])) app.chatByRide[rideId] = [];
  app.chatByRide[rideId].push(chatMessage(role, text));
  renderChatThread(rideId);
}

function chatMessage(role, text) {
  return {
    role,
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
}

function setChatContext(ride) {
  if (!ride) return;
  if (el.chatPassengerAvatar) el.chatPassengerAvatar.textContent = initial(ride.passenger);
  if (el.chatPassengerName) el.chatPassengerName.textContent = ride.passenger || "Passenger";
  if (el.chatRideCode) el.chatRideCode.textContent = "Ride " + (ride.rideCode || rideCode(ride.id));
  const statusEl = document.getElementById("chatRideStatus");
  if (statusEl) statusEl.textContent = "Status: " + String(ride.status || "accepted").replaceAll("_", " ");
  if (el.chatPickup) el.chatPickup.textContent = ride.pickup || "--";
  if (el.chatDrop) el.chatDrop.textContent = ride.drop || "--";
}

function renderChatThread(rideId) {
  if (!el.chatThread || !rideId) return;
  const rows = Array.isArray(app.chatByRide[rideId]) ? app.chatByRide[rideId] : [];
  el.chatThread.innerHTML = "";
  rows.forEach((msg) => {
    const row = document.createElement("div");
    row.className = "chat-row " + msg.role;
    const bubbleEl = document.createElement("div");
    bubbleEl.className = "chat-bubble " + msg.role;
    bubbleEl.textContent = msg.text;
    const timeEl = document.createElement("span");
    timeEl.className = "chat-time";
    timeEl.textContent = msg.time || "";
    row.appendChild(bubbleEl);
    row.appendChild(timeEl);
    el.chatThread.appendChild(row);
  });
  el.chatThread.scrollTop = el.chatThread.scrollHeight;
}

function startCall() {
  stopCall();
  app.callSecs = 0;
  el.callTimer.textContent = "00:00";
  app.callTimer = setInterval(() => {
    app.callSecs += 1;
    el.callTimer.textContent = String(Math.floor(app.callSecs / 60)).padStart(2, "0") + ":" + String(app.callSecs % 60).padStart(2, "0");
  }, 1000);
}

function stopCall() {
  if (app.callTimer) clearInterval(app.callTimer);
  app.callTimer = null;
}

async function triggerSos() {
  if (!hasActiveRideContext()) {
    closeBy("sos");
    toast("SOS unavailable", "SOS can only be triggered during an active ride.");
    return;
  }
  const lastSent = Number(sessionStorage.getItem("wow_driver_dashboard_sos_sent_at") || 0);
  if (Date.now() - lastSent < 10000) return;
  if (!window.confirm("Final confirmation: send this SOS to the admin safety team?")) return;
  const pickup = app.active?.pickup || localStorage.getItem("wow_ride_pickup") || "";
  const drop = app.active?.drop || localStorage.getItem("wow_ride_drop") || "";
  const rideId = localStorage.getItem("wow_ride_code") || rideCode(app.active?.id || Date.now());
  const payload = {
    ...currentUserPayload(),
    role: "driver",
    ride_id: rideId,
    pickup,
    drop,
    location: `Pickup: ${pickup || "Unknown"} | Drop-off: ${drop || "Unknown"}`
  };

  let sent = false;
  for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
    try {
      const response = await fetch(SOS_API.send, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "send_failed");
      sent = true;
    } catch (error) { if (attempt === 1) console.error("[WOW Driver SOS] send failed after retry", error); }
  }
  if (sent) {
    sessionStorage.setItem("wow_driver_dashboard_sos_sent_at", String(Date.now()));
    closeBy("sos");
    addNotice("SOS sent", "Driver safety alert recorded successfully.", "Just now", "pink");
    toast("Alert Sent Successfully", "The admin safety team has received your SOS.");
  } else toast("SOS failed", "Call 15 and try sending the alert again.");
}

function startSosPolling() {
  // SOS records are admin-only and are never read by driver clients.
}

async function fetchSosAlerts() {
  if (!el.driverSosList) return;
  try {
    const query = new URLSearchParams({
      ...currentUserPayload(),
      view: "mine",
      status: "active",
      limit: "20"
    });
    const res = await fetch(`${SOS_API.list}?${query.toString()}`);
    const data = await res.json();
    renderSosAlerts(Array.isArray(data.alerts) ? data.alerts : []);
  } catch {
    renderSosAlerts([]);
  }
}

function renderSosAlerts(alerts) {
  if (!el.driverSosList) return;
  if (el.sosLiveCount) el.sosLiveCount.textContent = `${alerts.length} active`;
  el.driverSosList.innerHTML = "";
  if (!alerts.length) {
    el.driverSosList.innerHTML = '<div class="sos-live-empty">No active SOS alerts.</div>';
    return;
  }

  alerts.forEach((alert) => {
    const item = document.createElement("div");
    item.className = "sos-live-item";
    item.innerHTML = `
      <strong>Driver SOS${alert.ride_id ? " • " + esc(alert.ride_id) : ""}</strong>
      <span>${esc(alert.location || "Location unavailable")}</span>
      <span>${esc(alert.created_at || "")}</span>
      <button type="button">Resolve</button>
    `;
    item.querySelector("button").addEventListener("click", () => resolveSosAlert(Number(alert.id) || 0));
    el.driverSosList.appendChild(item);
  });
}

function resolveSosAlert(id) {
  if (!id) return;
  fetch(SOS_API.update, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...currentUserPayload(), id, status: "resolved" })
  }).finally(fetchSosAlerts);
}

function currentUserPayload() {
  return {
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase(),
    email: localStorage.getItem("wow_user_email") || ""
  };
}

function hasActiveRideContext() {
  const rideId = localStorage.getItem("wow_ride_code") || "";
  return Boolean(app.started && app.active && rideId);
}

function refreshSosUi() {
  if (!el.sosBtn) return;
  const active = hasActiveRideContext();
  const hint = el.sosBtn.querySelector("small");
  if (hint) hint.textContent = active ? "Driver safety alert" : "Active only during ride";
  el.sosBtn.classList.toggle("is-disabled", !active);
  el.sosBtn.disabled = !active;
  if (el.sosAvailability) el.sosAvailability.textContent = active ? "Available during ride" : "Unavailable while idle";
  if (el.confirmSosBtn) el.confirmSosBtn.disabled = !active;
}

function addNotice(title, message, time = "Just now", tone = "purple") {
  app.notices.unshift({ id: "n-" + Date.now(), title, message, time, tone });
  app.notices = app.notices.slice(0, 30);
  renderNotices();
  updateBadge();
}

function renderNotices() {
  if (!el.notificationsList) return;
  el.notificationsList.innerHTML = "";
  if (!app.notices.length) {
    el.notificationsList.innerHTML = '<div class="empty-state"><strong>No notifications yet</strong><p>Incoming requests, ride updates, passenger messages, and SOS alerts will appear here.</p></div>';
    return;
  }
  const unique = [];
  const seen = new Set();
  app.notices.forEach((notice) => {
    const key = String(notice.id || `${notice.title}|${notice.message}|${notice.time}`);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(notice);
    }
  });
  unique.slice(0, 30).forEach(n => {
    const item = document.createElement("div");
    item.className = "history-item";
    if (n.type === "lost_found" || n.type === "lost_found_chat") {
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.addEventListener("click", () => {
        if (n.unread && n.ref) {
          n.unread = false;
          updateBadge();
          n.ref.set({
            read: true,
            isRead: true,
            readAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
        if (n.type === "lost_found_chat" && (n.caseId || n.lostFoundCaseId)) {
          const caseId = encodeURIComponent(n.caseId || n.lostFoundCaseId);
          const rideId = encodeURIComponent(n.rideId || "");
          window.location.assign(`lost-found-chat.html?caseId=${caseId}&rideId=${rideId}`);
        } else {
          window.location.assign("driver-lost-items.html");
        }
      });
      item.addEventListener("keydown", event => {
        if (event.key === "Enter") item.click();
      });
    }
    if (n.type === "scheduled_ride_available" && n.rideId) {
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      const openScheduledRide = () => {
        if (n.unread && n.ref) {
          n.unread = false;
          updateBadge();
          n.ref.set({
            read: true,
            isRead: true,
            readAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
        closePanel(el.notificationsPanel);
        fetchDriverDashboardData();
        document.getElementById("scheduledRidesSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      item.addEventListener("click", openScheduledRide);
      item.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openScheduledRide();
        }
      });
    }
    item.innerHTML = '<div class="history-head"><strong>' + esc(n.title) + '</strong><span>' + esc(n.time) + '</span></div><div class="history-meta"><div><span>Message</span><strong>' + esc(n.message) + '</strong></div></div>';
    el.notificationsList.appendChild(item);
  });
  if (el.recentNotificationsList) {
    const important = unique.filter((notice) => /ride|message|payment|sos|lost|found|cancel|assign/i.test(`${notice.type || ""} ${notice.title || ""} ${notice.message || ""}`)).slice(0, 4);
    el.recentNotificationsList.innerHTML = important.length
      ? important.map((notice) => `<article class="recent-notification"><div><strong>${esc(notice.title)}</strong><p>${esc(notice.message)}</p></div><time>${esc(notice.time)}</time></article>`).join("")
      : '<div class="compact-empty">No important notifications yet.</div>';
  }
}

function updateBadge() {
  const unread = app.notices.filter((notice) => notice.source !== "firestore" || notice.unread).length;
  if (el.notificationBadge) {
    el.notificationBadge.textContent = String(unread);
    el.notificationBadge.hidden = !unread;
  }
  const homeCount = document.getElementById("homeAlertCount");
  if (homeCount) homeCount.textContent = String(unread);
}

function toast(title, message) {
  if (!el.toastStack) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = "<strong>" + esc(title) + "</strong><span>" + esc(message) + "</span>";
  el.toastStack.prepend(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(-8px)";
    setTimeout(() => t.remove(), 220);
  }, 2600);
}

function openPanel(panel) {
  if (!panel) return;
  el.modalLayer?.classList.add("is-open");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function closeBy(name) {
  const panels = {
    notifications: el.notificationsPanel,
    profile: el.profilePanel,
    chat: el.chatPanel,
    call: el.callPanel,
    sos: el.sosModal,
    complete: el.completeModal
  };
  closePanel(panels[name]);
}

function closePanel(panel) {
  if (!panel) return;
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".side-panel.is-open, .modal-card.is-open")) el.modalLayer?.classList.remove("is-open");
}

function closeAll() {
  ["notifications", "profile", "chat", "call", "sos", "complete"].forEach(closeBy);
  el.modalLayer?.classList.remove("is-open");
}

async function doDriverLogout() {
  if (app.logoutInProgress) return;
  app.logoutInProgress = true;
  if (el.driverLogoutBtn) {
    el.driverLogoutBtn.disabled = true;
    el.driverLogoutBtn.classList.add("is-logging-out");
    el.driverLogoutBtn.setAttribute("aria-label", "Logging out");
    el.driverLogoutBtn.setAttribute("aria-busy", "true");
  }
  cleanupDriverDashboard();
  const timeout = new Promise(resolve => setTimeout(resolve, 1400));
  const serverLogout = fetch("php/logout.php", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true
  }).catch(() => null);
  const firebaseLogout = (() => {
    try {
      return window.firebase?.auth?.().signOut?.().catch(() => null) || Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  })();
  await Promise.race([Promise.allSettled([serverLogout, firebaseLogout]), timeout]);
  try {
    localStorage.removeItem("wow_logged_in");
    localStorage.removeItem("wow_user_id");
    localStorage.removeItem("wow_user_email");
    localStorage.removeItem("wow_user_name");
    localStorage.removeItem("wow_user_role");
    localStorage.removeItem("wow_ride_code");
    localStorage.removeItem("wow_ride_status");
    localStorage.removeItem("wow_ride_started");
    localStorage.removeItem("wow_open_profile");
    localStorage.removeItem("wow_open_notifications");
    localStorage.removeItem("wow_post_login_redirect");
    sessionStorage.removeItem("wow_driver_current_page");
    sessionStorage.removeItem("wow_driver_last_page");
  } catch {
    // Ignore storage cleanup errors.
  }
  window.location.replace("login.html");
}

function startFeed() {
  // Disabled: requests are now sourced from DB polling.
  clearInterval(app.requestTimer);
  app.requestTimer = null;
}

function saveRide(r) {
  const requestedVehicleType = window.WowVehicle?.requestedType(r.raw || r) || "";
  const assignedVehicle = window.WowVehicle?.driverVehicle(app.driverProfile || {}) || { type: "", name: "", number: "" };
  const persistedRideCode = r.rideCode || localStorage.getItem("wow_ride_code") || rideCode(r.id);
  localStorage.setItem("wow_ride_pickup", r.pickup);
  localStorage.setItem("wow_ride_drop", r.drop);
  localStorage.setItem("wow_ride_fare", String(r.fare));
  localStorage.setItem("wow_ride_payment_method", r.paymentMethod || "online");
  localStorage.setItem("wow_ride_payment_label", paymentLabel(r.paymentMethod));
  if (requestedVehicleType) localStorage.setItem("wow_ride_requested_vehicle", requestedVehicleType);
  if (assignedVehicle.type) localStorage.setItem("wow_ride_driver_vehicle_type", assignedVehicle.type);
  if (assignedVehicle.name) localStorage.setItem("wow_ride_driver_vehicle_name", assignedVehicle.name);
  if (assignedVehicle.number) localStorage.setItem("wow_ride_driver_vehicle_number", assignedVehicle.number);
  localStorage.setItem("wow_ride_driver_name", localStorage.getItem("wow_user_name") || "Driver");
  localStorage.setItem("wow_ride_driver_phone", localStorage.getItem("wow_user_phone") || "");
  localStorage.setItem("wow_ride_passenger", r.passenger);
  localStorage.setItem("wow_ride_passenger_phone", r.phone);
  localStorage.setItem("wow_ride_code", persistedRideCode);
  if (r.dbId || r.id) localStorage.setItem("wow_ride_db_id", String(r.dbId || r.id).replace(/^db-/, ""));
}

function choosePaymentMethod(fare) {
  return String(localStorage.getItem("wow_ride_payment_method") || "online").toLowerCase();
}

function paymentLabel(method) {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "Cash";
  if (value === "easypaisa") return "Easypaisa";
  if (value === "jazzcash") return "JazzCash";
  if (value === "nayapay") return "NayaPay";
  return "Online";
}

async function updateRouteMap(r, animate = false) {
  void animate;
  if (!window.WowMapbox || !el.driverMap) return;
  if (!app.map) initDriverDashboardMap();
  if (!app.map) return;
  if (!r) return clearRoute();
  const pickup = readSavedLatLng("pickup") || point(r.pickup);
  const drop = readSavedLatLng("drop") || point(r.drop);
  if (!pickup || !drop) {
    el.driverEta.textContent = "--";
    el.driverDistance.textContent = "Waiting for ride coordinates";
    return;
  }
  const origin = app.driverAnchor;
  const destination = app.routeStage === "toDrop" ? drop : pickup;
  markers(pickup, drop);
  if (!origin) {
    if (app.map && window.WowMapbox) WowMapbox.clearRoute(app.map, app.routeLayerId);
    el.driverEta.textContent = "--";
    el.driverDistance.textContent = "Waiting for live location";
    return;
  }
  const routeKey = driverRouteKey(origin, destination, app.routeStage, r.rideCode || r.id || "");
  if (app.lastRouteKey === routeKey && app.path.length) {
    markers(pickup, drop);
    vehicle(app.path[0] || origin, r.rideType);
    stopRoute();
    return;
  }
  app.lastRouteKey = routeKey;

  try {
    const route = await WowMapbox.directions(origin, destination);
    app.path = route.path;
    app.step = 0;
    app.routeKm = (route.distanceMeters || 0) / 1000;
    app.routeMin = Math.max(5, Math.round((route.durationSeconds || 300) / 60));
    el.driverEta.textContent = app.routeMin + " min";
    el.driverDistance.textContent = app.routeKm.toFixed(1) + " km";
    WowMapbox.drawRoute(app.map, app.routeLayerId, route.coordinates, "#1a73e8", 4);
    markers(pickup, drop);
    vehicle(app.path[0] || origin, r.rideType);
    fitRouteBounds(origin, pickup, drop);
    stopRoute();
  } catch {
    app.path = [];
    app.routeKm = 0;
    app.routeMin = 0;
    el.driverEta.textContent = "--";
    el.driverDistance.textContent = "Route unavailable";
    WowMapbox.clearRoute(app.map, app.routeLayerId);
    markers(pickup, drop);
    vehicle(origin, r.rideType);
    fitRouteBounds(origin, pickup, drop);
    stopRoute();
  }
}

function clearRoute() {
  if (app.map && window.WowMapbox) WowMapbox.clearRoute(app.map, app.routeLayerId);
  app.lastRouteKey = "";
  if (app.vehicle) {
    app.vehicle.remove();
    app.vehicle = null;
  }
  clearMarkers();
  stopRoute();
  defaultMap();
}

function markers(pickup, drop) {
  clearMarkers();
  app.markers.pickup = WowMapbox.createLabelMarker(app.map, pickup, "#30cd8b", "P", { size: 22 });
  app.markers.drop = WowMapbox.createLabelMarker(app.map, drop, "#f06aa5", "D", { size: 22 });
}

function vehicle(p, rideType) {
  if (!app.map) return;
  const iconUrl = vehicleIconUrl(rideType || (app.active && app.active.rideType));
  if (!app.vehicle) {
    app.vehicle = WowMapbox.createImageMarker(app.map, p, iconUrl, 28);
  } else {
    app.vehicle.getElement().src = iconUrl;
    WowMapbox.setMarkerPoint(app.vehicle, p);
  }
}

function clearMarkers() {
  Object.values(app.markers).forEach(m => m?.remove());
  app.markers = {};
}

function stopRoute() {
  if (app.routeTimer) clearInterval(app.routeTimer);
  app.routeTimer = null;
}

function driverRouteKey(origin, destination, stage, rideCode) {
  return [
    rideCode || "",
    stage || "",
    Number(origin.lng).toFixed(5),
    Number(origin.lat).toFixed(5),
    Number(destination.lng).toFixed(5),
    Number(destination.lat).toFixed(5)
  ].join("|");
}

async function initDriverDashboardLiveTracking(rideId) {
  if (app.liveTracker || !window.WowLiveTracking || !app.map || !rideId) return;
  try {
    app.liveTracker = await WowLiveTracking.start({
      role: "driver",
      rideId,
      getMap: () => app.map,
      getDestination: (ride) => {
        const started = ["ride_started", "started", "ongoing", "in_progress", "on_trip", "active"]
          .includes(String(ride?.status || "").toLowerCase());
        return {
          latitude: started
            ? (ride?.destinationLatitude ?? ride?.dropoffLatitude ?? ride?.dropLat ?? readSavedLatLng("drop")?.lat)
            : (ride?.pickupLatitude ?? ride?.pickupLat ?? readSavedLatLng("pickup")?.lat),
          longitude: started
            ? (ride?.destinationLongitude ?? ride?.dropoffLongitude ?? ride?.dropLng ?? readSavedLatLng("drop")?.lng)
            : (ride?.pickupLongitude ?? ride?.pickupLng ?? readSavedLatLng("pickup")?.lng)
        };
      },
      onStatus: (message) => { if (el.driverTrackingStatus) el.driverTrackingStatus.textContent = message; },
      onPeerState: (message, stale) => {
        if (el.driverPeerStatus) {
          el.driverPeerStatus.textContent = message;
          el.driverPeerStatus.classList.toggle("error", Boolean(stale));
        }
      },
      onLocation: (role, location) => {
        if (role === "driver") app.driverAnchor = location.point;
      },
      onFollowChange: (enabled) => {
        if (enabled) app.mapUserExploring = false;
        if (el.driverTrackingRecenter) {
          el.driverTrackingRecenter.textContent = enabled ? "Following" : "Follow";
          el.driverTrackingRecenter.setAttribute("aria-pressed", String(Boolean(enabled)));
        }
      },
      onRoute: ({ distanceKm, etaMinutes }) => {
        el.driverDistance.textContent = `${distanceKm.toFixed(1)} km`;
        el.driverEta.textContent = `${etaMinutes} min`;
      },
      onRouteError: () => {
        el.driverDistance.textContent = "Route unavailable";
        el.driverEta.textContent = "--";
      },
      onRideStatus: (status) => {
        if (app.active) app.active.status = status;
        app.started = status === "started";
      }
    });
    if (window.WowRideCall) initDriverDashboardCall(rideId).catch((error) => {
      console.error("[WOW Driver] private call listener failed", error);
    });
    if (el.driverTrackingRecenter && !el.driverTrackingRecenter.dataset.bound) {
      el.driverTrackingRecenter.dataset.bound = "1";
      el.driverTrackingRecenter.addEventListener("click", () => {
        app.mapUserExploring = false;
        app.liveTracker?.setFollow?.(true);
        app.liveTracker?.recenter?.();
        if (app.driverAnchor && app.active) {
          const pickup = readSavedLatLng("pickup") || point(app.active.pickup);
          const drop = readSavedLatLng("drop") || point(app.active.drop);
          fitRouteBounds(app.driverAnchor, pickup, drop, true);
        }
      });
    }
  } catch (error) {
    if (el.driverTrackingStatus) el.driverTrackingStatus.textContent = error?.message || "Live tracking could not start.";
  }
}

async function restoreDriverLiveTrackingFromSession() {
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim().replace(/^db-/, "");
  const assignedAt = Number(localStorage.getItem("wow_ride_assigned_at") || 0);
  if (!rideId || !assignedAt || !window.WowFirestore) {
    if (rideId && !assignedAt) clearStoredDriverRide();
    return;
  }
  try {
    const { db, uid } = await getFirestoreReady();
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) {
      clearStoredDriverRide();
      return;
    }
    const data = snapshot.data() || {};
    if (assignedDriverValue(data) !== String(uid || "") ||
        !DRIVER_BUSY_STATUSES.has(String(data.status || "").toLowerCase())) {
      clearStoredDriverRide();
      return;
    }
    if (!app.active) {
      app.active = mapFirestoreRideToPending(snapshot.id, data);
      app.active.status = String(data.status);
      app.active.driverId = uid;
      app.onTrip = true;
      app.started = data.status === "started";
      app.routeStage = app.started ? "toDrop" : "toPickup";
      populateActive(app.active);
      el.activeEmpty.classList.add("is-hidden");
      el.activePanel.classList.remove("is-hidden");
      listenToActiveRide(app.active);
    }
  } catch (error) {
    console.error("[WOW Driver] active ride recovery failed", error);
  }
}

function clearStoredDriverRide() {
  localStorage.removeItem("wow_ride_db_id");
  localStorage.removeItem("wow_ride_code");
  localStorage.removeItem("wow_ride_status");
  localStorage.removeItem("wow_ride_started");
  localStorage.removeItem("wow_ride_assigned_at");
}

function cleanupDriverDashboard() {
  window.WowRideCall?.stop();
  app.callReady = false;
  clearTimeout(app.dashboardRefreshTimer);
  clearTimeout(app.firestoreRideRetryTimer);
  clearTimeout(app.replyTimer);
  clearTimeout(app.requestTimer);
  if (app.syncTimer) clearInterval(app.syncTimer);
  if (app.locationTimer) clearInterval(app.locationTimer);
  if (app.sosPollTimer) clearInterval(app.sosPollTimer);
  if (app.callTimer) clearInterval(app.callTimer);
  if (app.liveTracker) {
    app.liveTracker.stop();
    app.liveTracker = null;
  }
  if (app.mapResizeHandler) {
    window.removeEventListener("resize", app.mapResizeHandler);
    window.removeEventListener("orientationchange", app.mapResizeHandler);
    app.mapResizeHandler = null;
  }
  if (app.realtimeUnsubscribe) {
    try { app.realtimeUnsubscribe(); } catch {}
    app.realtimeUnsubscribe = null;
  }
  detachFirestoreRideListener();
  if (app.firestoreOfferUnsubscribe) {
    try { app.firestoreOfferUnsubscribe(); } catch {}
    app.firestoreOfferUnsubscribe = null;
  }
  if (app.firestoreActiveUnsubscribe) {
    try { app.firestoreActiveUnsubscribe(); } catch {}
    app.firestoreActiveUnsubscribe = null;
  }
  if (app.firestoreAssignedRideUnsubscribe) {
    try { app.firestoreAssignedRideUnsubscribe(); } catch {}
    app.firestoreAssignedRideUnsubscribe = null;
  }
  app.initialAssignedRideSnapshotLoaded = false;
  app.assignedRideIds.clear();
  if (app.firestoreChatUnsubscribe) {
    try { app.firestoreChatUnsubscribe(); } catch {}
    app.firestoreChatUnsubscribe = null;
  }
  if (app.firestoreNotificationUnsubscribe) {
    try { app.firestoreNotificationUnsubscribe(); } catch {}
    app.firestoreNotificationUnsubscribe = null;
  }
  stopRoute();
}

function perfElapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function initDriverDashboardMap() {
  if (!el.driverMap || !window.WowMapbox || app.map) return;
  app.map = WowMapbox.createMap(el.driverMap, { center: WowMapbox.center, zoom: 11 });
  if (!app.map) return;
  let resizeTimer = 0;
  const resizeMap = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => app.map?.resize?.(), 120);
  };
  app.mapResizeHandler = resizeMap;
  window.addEventListener("resize", resizeMap, { passive: true });
  window.addEventListener("orientationchange", resizeMap, { passive: true });
  const disableAutoCamera = (event) => {
    if (!event?.originalEvent) return;
    app.mapUserExploring = true;
    if (el.driverTrackingRecenter) {
      el.driverTrackingRecenter.textContent = "Follow";
      el.driverTrackingRecenter.setAttribute("aria-pressed", "false");
    }
    app.liveTracker?.setFollow?.(false);
  };
  app.map.on("dragstart", disableAutoCamera);
  app.map.on("zoomstart", disableAutoCamera);
  if (app.active) {
    updateRouteMap(app.active, false);
  } else {
    defaultMap();
  }
}

function vehicleIconUrl(rideType) {
  const type = normalizeRideType(rideType || "WOW Car");
  if (type === "WOW Bike") return "images/bike.png";
  if (type === "WOW Scooty") return "images/scooty.png";
  return "images/car.png";
}

function rideTypeLabel(type) {
  return normalizeRideType(type || "WOW Car");
}

function normalizeRideType(type) {
  const text = String(type || "").toLowerCase();
  if (text.includes("bike")) return "WOW Bike";
  if (text.includes("scooty")) return "WOW Scooty";
  return "WOW Car";
}

function defaultMap() {
  if (!app.map) return;
  clearMarkers();
  const center = { lat: 24.8607, lng: 67.0011 };
  if (window.WowMapbox) WowMapbox.clearRoute(app.map, app.routeLayerId);
  if (!app.mapUserExploring) app.map.easeTo({ center: [center.lng, center.lat], zoom: 12 });
}

function fitRouteBounds(origin, pickup, drop, force = false) {
  if (!app.map || !window.WowMapbox) return;
  if (app.mapUserExploring && !force) return;
  WowMapbox.fitMap(app.map, [origin, pickup, drop], 56);
}

function readSavedLatLng(prefix) {
  const rawLat = localStorage.getItem(`wow_ride_${prefix}_lat`);
  const rawLng = localStorage.getItem(`wow_ride_${prefix}_lng`);
  if (rawLat === null || rawLng === null || rawLat.trim() === "" || rawLng.trim() === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function point(place) {
  if (place && typeof place === "object") {
    const lat = Number(place.latitude ?? place.lat);
    const lng = Number(place.longitude ?? place.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function dist(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function rad(v) {
  return v * Math.PI / 180;
}

function money(n) {
  return "Rs. " + Number(n || 0).toLocaleString("en-PK");
}

function initial(name) {
  return (String(name || "P").trim().charAt(0) || "P").toUpperCase();
}

function rideCode(seed) {
  const h = String(seed || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return "WOW-" + String(100 + (h % 900)).padStart(3, "0");
}

function esc(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || JSON.parse(JSON.stringify(fallback));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function replies() {
  return [
    "Thanks, I'm ready at the pickup point.",
    "Perfect, I'll wait here.",
    "Okay, see you soon.",
    "Understood, drive safely."
  ];
}

function syncNav(target) {
  document.querySelectorAll(".bottom-nav .nav-item[data-page]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === target);
  });
}
