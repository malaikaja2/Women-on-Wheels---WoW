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
  dashboardData: "php/get_driver_dashboard_data.php"
};

const SOS_API = {
  send: "php/send_sos.php",
  list: "php/get_sos.php",
  update: "php/update_sos_status.php"
};

const LOCS = {
  "Gulshan Block 13, Karachi": { lat: 24.9207, lng: 67.0903 },
  "DHA Phase 6, Karachi": { lat: 24.8146, lng: 67.0438 },
  "Clifton Block 5, Karachi": { lat: 24.8016, lng: 67.0314 },
  "SMCHS, Karachi": { lat: 24.8748, lng: 67.0617 },
  "PECHS, Karachi": { lat: 24.8722, lng: 67.0811 },
  "Bahadurabad, Karachi": { lat: 24.8785, lng: 67.0737 },
  "Defence Phase 2, Karachi": { lat: 24.8269, lng: 67.0539 },
  "University Road, Karachi": { lat: 24.9376, lng: 67.1147 },
  "Jauhar, Karachi": { lat: 24.9108, lng: 67.1267 },
  "North Nazimabad, Karachi": { lat: 24.9267, lng: 67.0327 }
};

const app = {
  online: true,
  onTrip: false,
  active: null,
  started: false,
  pending: [],
  history: [],
  finance: window.DriverWallet ? window.DriverWallet.loadFinance() : load(K.finance, { cashCollected: 0, onlineEarned: 45320, walletBalance: 45320, totalWithdrawn: 0, todayCash: 0, todayOnline: 1840, weekCash: 0, weekOnline: 12490, withdrawals: [] }),
  notices: [],
  map: null,
  service: null,
  renderer: null,
  markers: {},
  vehicle: null,
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
  sosPollTimer: null
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
  renderNotices();
  addNotice("System ready", "Driver dashboard loaded successfully.", "Just now");
  updateRideUi();
  initLiveSync();
  startSosPolling();
  fetchDriverDashboardData();
});

function cache() {
  [
    "body","availabilityToggle","availabilityPill","availabilityTitle","availabilityCopy","availabilityDetail","mapStatus",
    "requestIndicator","requestList","requestsEmpty","activeEmpty","activePanel","rideStatePill","passengerAvatar","passengerName",
    "passengerPhone","rideCode","rideStatus","activePickup","activeDrop","statusBanner","startRideBtn","endRideBtn","chatBtn",
    "callBtn","chatPanel","callPanel","chatThread","chatInput","sendChatBtn","callAvatar","callName","callSubtitle","callTimer",
    "endCallBtn","notificationsBtn","profileBtn","modalLayer","notificationsPanel","notificationsList","notificationBadge",
    "profilePanel","toastStack","profileName","profileRole","profileInitial","profileInitialPanel","profileNamePanel",
    "profileEmailPanel","profileStatusPanel","driverVehicle","driverVehiclePanel","driverPlate","driverPlatePanel","profileRating",
    "profileRatingPanel","profileTrips","earnToday","earnWeek","earnTotal","historyList","routePickup","routeDrop","driverEta",
    "chatPassengerAvatar","chatPassengerName","chatRideCode","chatPickup","chatDrop",
    "driverSosList","sosLiveCount",
    "driverDistance","helpNavBtn","sosBtn","sosModal","confirmSosBtn","driverMap","driverType"
  ].forEach(id => el[id] = document.getElementById(id));
}

function bind() {
  el.availabilityToggle?.addEventListener("click", toggleAvailability);
  el.startRideBtn?.addEventListener("click", startRide);
  el.endRideBtn?.addEventListener("click", endRide);
  el.chatBtn?.addEventListener("click", openChat);
  el.callBtn?.addEventListener("click", openCall);
  el.sendChatBtn?.addEventListener("click", sendChat);
  el.chatInput?.addEventListener("keydown", e => e.key === "Enter" && sendChat());
  el.endCallBtn?.addEventListener("click", closeCall);
  el.notificationsBtn?.addEventListener("click", () => openPanel(el.notificationsPanel));
  el.sosBtn?.addEventListener("click", () => {
    if (!hasActiveRideContext()) {
      toast("SOS unavailable", "SOS (Active only during ride)");
      return;
    }
    openPanel(el.sosModal);
  });
  el.confirmSosBtn?.addEventListener("click", triggerSos);
  el.requestList?.addEventListener("click", onRequestClick);
  el.modalLayer?.addEventListener("click", closeAll);
  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeBy(btn.dataset.close)));
  document.querySelectorAll(".bottom-nav .nav-item[data-pane]").forEach(btn => {
    btn.addEventListener("click", () => setActivePane(btn.dataset.pane));
  });
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
  el.availabilityTitle.textContent = app.online ? "Go Offline" : "Go Online";
  el.availabilityCopy.textContent = app.online ? "You are visible to nearby passengers." : "Passengers will not see your driver status.";
  el.mapStatus.textContent = app.onTrip ? "On-trip navigation active" : app.online ? "Live requests enabled" : "Offline mode";
  el.requestIndicator.textContent = app.online ? "Live" : "Paused";
  localStorage.setItem(K.status, JSON.stringify({ online: app.online, onTrip: app.onTrip }));
  updateRideUi();
  renderRequests();
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
  const email = localStorage.getItem("wow_user_email") || "driver@wow.com";
  const vehicle = localStorage.getItem("wow_driver_vehicle") || "Suzuki Alto";
  const type = localStorage.getItem("wow_driver_vehicle_type") || "Car";
  const plate = localStorage.getItem("wow_driver_plate") || "ABC-1234";
  const rating = localStorage.getItem("wow_driver_rating") || "4.9";
  const trips = localStorage.getItem("wow_driver_trips") || "342";
  const initial = (name.trim().charAt(0) || "D").toUpperCase();

  [el.profileName, el.profileNamePanel].forEach(n => n && (n.textContent = name));
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

function earnings() {
  if (!el.earnToday || !el.earnWeek || !el.earnTotal) return;
  el.earnToday.textContent = money(app.finance.todayCash + app.finance.todayOnline);
  el.earnWeek.textContent = money(app.finance.weekCash + app.finance.weekOnline);
  el.earnTotal.textContent = money(app.finance.walletBalance);
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
  const a = point(pickup || "Karachi");
  const b = point(drop || "Karachi");
  const km = Math.max(1.2, dist(a, b));
  const minutes = Math.max(5, Math.round(km * 2.2));
  return {
    distance: `${km.toFixed(1)} km`,
    eta: `${minutes} min`
  };
}

function mapLiveToPending(req) {
  const trip = deriveDistanceEta(req.pickup, req.drop);
  return {
    id: req.id,
    rideCode: req.rideCode || "",
    passenger: req.passengerName || "Passenger",
    phone: req.passengerPhone || "+92 300 0000000",
    pickup: req.pickup || "Pickup",
    drop: req.drop || "Drop-off",
    fare: Number(req.fare || 0),
    distance: trip.distance,
    eta: trip.eta,
    time: formatRequestTime(req.requestedAt || req.updatedAt),
    rating: req.passengerRating || "4.9",
    rideType: req.rideType || "WOW Car",
    status: req.status || "requested",
    requestedAt: req.requestedAt || req.updatedAt || new Date().toISOString(),
    live: true
  };
}

function syncPendingFromLive() {
  const rows = readLiveRequests();
  app.pending = rows
    .filter(r => (r.status || "requested") === "requested")
    .map(mapLiveToPending);
}

function mapDbRequestToPending(row) {
  const km = Number(row.distance_km || 0);
  const min = Number(row.duration_min || 0);
  return {
    id: "db-" + String(row.id),
    dbId: Number(row.id || 0),
    rideCode: String(row.ride_code || ""),
    passenger: row.passenger_name || "Passenger",
    phone: row.passenger_phone || "+92 300 0000000",
    pickup: row.pickup || "Pickup",
    drop: row.dropoff || "Drop-off",
    fare: Number(row.fare || 0),
    distance: `${(km > 0 ? km : 1.2).toFixed(1)} km`,
    eta: `${Math.max(5, Math.round(min > 0 ? min : 8))} min`,
    time: formatRequestTime(row.created_at || ""),
    rating: "4.9",
    rideType: row.vehicle_type || "WOW Car",
    status: row.status || "requested",
    requestedAt: row.created_at || new Date().toISOString(),
    live: false
  };
}

function mapDbHistoryToItem(row) {
  const completedAt = row.completed_at || row.created_at || new Date().toISOString();
  const dateText = new Date(completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const km = Number(row.distance_km || 0);
  return {
    passenger: row.passenger_name || "Passenger",
    dateTime: dateText,
    fare: Number(row.fare || 0),
    distance: `${(km > 0 ? km : 0).toFixed(1)} km`,
    paymentMethod: "online"
  };
}

async function fetchDriverDashboardData() {
  try {
    const query = new URLSearchParams({
      role: "driver",
      email: localStorage.getItem("wow_user_email") || "",
      user_id: localStorage.getItem("wow_user_id") || ""
    });
    const res = await fetch(`${RIDE_API.dashboardData}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok) return;

    app.pending = Array.isArray(data.requests) ? data.requests.map(mapDbRequestToPending) : [];
    app.history = Array.isArray(data.history) ? data.history.map(mapDbHistoryToItem) : [];

    if (data.summary) {
      const today = Number(data.summary.today || 0);
      const week = Number(data.summary.week || 0);
      const total = Number(data.summary.total || 0);
      app.finance = {
        ...app.finance,
        todayCash: 0,
        todayOnline: today,
        weekCash: 0,
        weekOnline: week,
        walletBalance: total
      };
      earnings();
    }

    renderRequests();
    renderHistory();
  } catch {
    // Keep existing local state if API temporarily fails.
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

function initLiveSync() {
  fetchDriverDashboardData();
  if (app.syncTimer) clearInterval(app.syncTimer);
  app.syncTimer = setInterval(() => {
    fetchDriverDashboardData();
  }, 5000);
}

function renderRequests() {
  if (!el.requestList || !el.requestsEmpty) return;
  el.requestList.innerHTML = "";
  if (app.onTrip) {
    el.requestsEmpty.hidden = false;
    el.requestsEmpty.querySelector("strong").textContent = "On trip";
    el.requestsEmpty.querySelector("p").textContent = "Incoming requests are paused while you are on a live ride.";
    return;
  }
  if (!app.online) {
    el.requestsEmpty.hidden = false;
    el.requestsEmpty.querySelector("strong").textContent = "Offline mode";
    el.requestsEmpty.querySelector("p").textContent = "Go online to receive new requests.";
    return;
  }
  if (!app.pending.length) {
    el.requestsEmpty.hidden = false;
    el.requestsEmpty.querySelector("strong").textContent = "No incoming ride requests";
    el.requestsEmpty.querySelector("p").textContent = "Stay online to receive new requests instantly.";
    return;
  }
  el.requestsEmpty.hidden = true;
  app.pending.slice().reverse().forEach(r => {
    const card = document.createElement("article");
    card.className = "request-card";
    card.dataset.requestId = r.id;
    card.innerHTML = `
      <div class="request-head">
        <div class="request-meta">
          <div class="request-avatar">${initial(r.passenger)}</div>
          <div><strong>${esc(r.passenger)}</strong><span>${esc(r.time)} Â· ${esc(r.rating)} rating</span></div>
        </div>
        <span class="request-badge">${esc(r.distance)} Â· ${esc(r.eta)}</span>
      </div>
      <div class="request-details">
        <div class="detail-row"><div><span>Pickup</span><strong>${esc(r.pickup)}</strong></div></div>
        <div class="detail-row"><div><span>Drop-off</span><strong>${esc(r.drop)}</strong></div></div>
        <div class="fare-box"><span>Fare estimate</span><strong>${money(r.fare)}</strong></div>
      </div>
      <div class="request-actions">
        <button class="outline-btn" type="button" data-action="decline">Decline</button>
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
  if (btn.dataset.action === "accept") acceptRequest(requestId);
  if (btn.dataset.action === "decline") declineRequest(requestId);
}

function renderHistory() {
  if (!el.historyList) return;
  el.historyList.innerHTML = "";
  app.history.slice().reverse().forEach(item => {
    const row = document.createElement("article");
    row.className = "history-item";
    row.innerHTML = `
      <div class="history-head">
        <strong>${esc(item.passenger)}</strong>
        <span>${esc(item.dateTime)}</span>
      </div>
      <div class="history-meta">
        <div><span>Fare</span><strong>${money(item.fare)}</strong></div>
        <div><span>Distance</span><strong>${esc(item.distance)}</strong></div>
        <div><span>Payment</span><strong>${esc(paymentLabel(item.paymentMethod))}</strong></div>
      </div>`;
    el.historyList.appendChild(row);
  });
}

function acceptRequest(id) {
  if (app.onTrip) return toast("Ride already active", "Finish the current ride before accepting another one.");
  const idx = app.pending.findIndex(x => x.id === id);
  if (idx < 0) return;
  app.active = app.pending.splice(idx, 1)[0];
  app.started = false;
  app.routeStage = "toPickup";
  app.driverAnchor = null;
  localStorage.removeItem("wow_ride_started");
  localStorage.setItem("wow_ride_status", "accepted");

  const driverName = localStorage.getItem("wow_user_name") || "Driver";
  const driverPhone = localStorage.getItem("wow_user_phone") || "+92 300 0000000";
  const driverRating = localStorage.getItem("wow_driver_rating") || "4.9";
  const driverTrips = localStorage.getItem("wow_driver_trips") || "342";

  updateLiveRequest(id, current => ({
    ...current,
    status: "accepted",
    driverName,
    driverPhone,
    driverRating,
    driverTrips,
    driverEta: app.active.eta,
    rideCode: app.active.rideCode || rideCode(id),
    acceptedAt: new Date().toISOString()
  }));

  if (app.pickupTimer) clearTimeout(app.pickupTimer);
  app.pickupTimer = setTimeout(() => {
    if (app.active && app.active.id === id && !app.started) {
      updateLiveRequest(id, { status: "on_the_way" });
    }
  }, 2500);

  populateActive(app.active);
  app.active.paymentMethod = choosePaymentMethod(app.active.fare);
  app.active.paymentLabel = paymentLabel(app.active.paymentMethod);
  updateRouteMap(app.active, false);
  el.activeEmpty.classList.add("is-hidden");
  el.activePanel.classList.remove("is-hidden");
  el.rideStatus.textContent = "Accepted";
  el.statusBanner.textContent = "Accepted. Head to the pickup point and tap Start Ride when the passenger is onboard.";
  el.mapStatus.textContent = "Route ready for pickup";
  enableControls(true, false, true);
  renderRequests();
  addNotice("Ride accepted", app.active.passenger + " assigned for pickup.");
  toast("Ride accepted", app.active.passenger + " is now assigned to you.");
  seedChat(app.active);
  saveRide(app.active);
  syncRideStatusToDb("accepted", app.active);
}

function declineRequest(id) {
  const idx = app.pending.findIndex(x => x.id === id);
  if (idx < 0) return;
  const r = app.pending.splice(idx, 1)[0];
  updateLiveRequest(id, { status: "declined", declinedAt: new Date().toISOString() });
  renderRequests();
  addNotice("Ride declined", r.passenger + "'s request was declined.", "Just now", "pink");
  toast("Request declined", r.passenger + " removed from the queue.");
}

function populateActive(r) {
  el.passengerAvatar.textContent = initial(r.passenger);
  el.passengerName.textContent = r.passenger;
  el.passengerPhone.textContent = r.phone;
  el.rideCode.textContent = r.rideCode || rideCode(r.id);
  el.activePickup.textContent = r.pickup;
  el.activeDrop.textContent = r.drop;
  el.routePickup.textContent = r.pickup;
  el.routeDrop.textContent = r.drop;
  el.driverEta.textContent = r.eta;
  el.driverDistance.textContent = r.distance;
}

function enableControls(start, end, comms) {
  if (el.startRideBtn) el.startRideBtn.disabled = !start;
  if (el.endRideBtn) el.endRideBtn.disabled = !end;
  if (el.chatBtn) el.chatBtn.disabled = !comms;
  if (el.callBtn) el.callBtn.disabled = !comms;
}

function startRide() {
  if (!app.active) return;
  app.onTrip = true;
  app.started = true;
  app.routeStage = "toDrop";
  localStorage.setItem("wow_ride_started", "1");
  localStorage.setItem("wow_ride_status", "in_progress");
  clearInterval(app.requestTimer);
  document.body.classList.add("is-ontrip");
  el.rideStatePill.textContent = "On Trip";
  el.rideStatus.textContent = "In progress";
  el.statusBanner.textContent = "Passenger is onboard. Follow the live route to the drop-off point.";
  el.mapStatus.textContent = "Trip in progress";
  enableControls(false, true, true);
  updateRideUi();
  updateLiveRequest(app.active.id, { status: "started", startedAt: new Date().toISOString() });
  syncRideStatusToDb("in_progress", app.active);
  addNotice("Trip started", "Passenger has been picked up and the live trip has begun.", "Just now", "green");
  toast("Ride started", "Live trip navigation is now active.");
  updateRouteMap(app.active, true);
}

function endRide() {
  if (!app.active) return;
  stopRoute();
  stopCall();
  const done = app.active;
  const paymentMethod = done.paymentMethod || choosePaymentMethod(done.fare);
  done.paymentMethod = paymentMethod;
  updateLiveRequest(done.id, { status: "completed", completedAt: new Date().toISOString() });
  localStorage.removeItem("wow_ride_started");
  localStorage.setItem("wow_ride_status", "completed");
  app.history.push({ passenger: done.passenger, dateTime: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), fare: done.fare, distance: done.distance });
  app.history[app.history.length - 1].paymentMethod = paymentMethod;
  localStorage.setItem(K.history, JSON.stringify(app.history));
  if (window.DriverWallet) {
    window.DriverWallet.recordRidePayment(done.fare, paymentMethod);
  }
  syncRideStatusToDb("completed", done);
  saveCompletedRideForTraining(done);
  earnings();
  renderHistory();
  addNotice("Ride completed", done.passenger + "'s trip finished successfully.", "Just now", "purple");
  toast("Ride completed", paymentMethod === "cash" ? "Cash collected: " + money(done.fare) : money(done.fare) + " added to wallet.");
  app.active = null;
  app.started = false;
  app.onTrip = false;
  app.routeStage = "toPickup";
  app.driverAnchor = null;
  enableControls(false, false, false);
  resetActive();
  setStatus(app.online);
  renderRequests();
  closeBy("chat");
  closeBy("call");
  updateRouteMap(null, false);
}

function syncRideStatusToDb(status, ride) {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const payload = {
    ride_code: rideCode,
    status,
    fare: Number(ride?.fare || localStorage.getItem("wow_ride_fare") || 0),
    distance_km: Number.parseFloat(localStorage.getItem("wow_ride_distance_km") || "0") || 0,
    duration_min: Number.parseFloat(localStorage.getItem("wow_ride_duration_min") || "0") || 0,
    vehicle_type: ride?.rideType || localStorage.getItem("wow_ride_vehicle") || "WOW Car",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    pickup_lat: localStorage.getItem("wow_ride_pickup_lat") || "",
    pickup_lng: localStorage.getItem("wow_ride_pickup_lng") || "",
    drop_lat: localStorage.getItem("wow_ride_drop_lat") || "",
    drop_lng: localStorage.getItem("wow_ride_drop_lng") || "",
    user_id: Number(localStorage.getItem("wow_user_id") || 0),
    email: localStorage.getItem("wow_user_email") || "",
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase()
  };

  fetch(RIDE_API.updateStatus, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Keep driver flow non-blocking if sync fails.
  });
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
    vehicle_type: done.rideType || localStorage.getItem("wow_ride_vehicle") || "WOW Car",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    fare: Number(done.fare || 0),
    user_id: Number(localStorage.getItem("wow_user_id") || 0),
    email: localStorage.getItem("wow_user_email") || "",
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
  if (!Array.isArray(app.chatByRide[r.id])) {
    app.chatByRide[r.id] = [
      chatMessage("passenger", "Hi, I'm " + r.passenger + ". I'm waiting at the pickup point."),
      chatMessage("driver", "Thanks. I'm coming now."),
      chatMessage("passenger", "Please message me when you arrive.")
    ];
  }
  setChatContext(r);
  renderChatThread(r.id);
}

function openChat() {
  if (!app.active) return toast("Chat unavailable", "Accept a ride first to chat with the passenger.");
  seedChat(app.active);
  openPanel(el.chatPanel);
  el.chatInput?.focus();
}

function openCall() {
  if (!app.active) return toast("Call unavailable", "Accept a ride first to call the passenger.");
  el.callName.textContent = app.active.passenger;
  el.callAvatar.textContent = initial(app.active.passenger);
  el.callSubtitle.textContent = "Calling passenger...";
  openPanel(el.callPanel);
  startCall();
}

function closeCall() {
  closeBy("call");
  stopCall();
}

function sendChat() {
  if (!app.active || !el.chatInput) return;
  const text = el.chatInput.value.trim();
  if (!text) return;
  const rideId = app.active.id;
  bubble("driver", text, rideId);
  el.chatInput.value = "";
  addNotice("Passenger message", text);
  clearTimeout(app.replyTimer);
  app.replyTimer = setTimeout(() => {
    if (!app.active || app.active.id !== rideId) return;
    const list = replies();
    const reply = list[Math.floor(Math.random() * list.length)];
    bubble("passenger", reply, rideId);
    addNotice("Passenger message", reply);
  }, 900);
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

function triggerSos() {
  if (!hasActiveRideContext()) {
    closeBy("sos");
    toast("SOS unavailable", "SOS can only be triggered during an active ride.");
    return;
  }
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

  fetch(SOS_API.send, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).finally(() => {
    closeBy("sos");
    addNotice("SOS sent", "Driver safety alert recorded successfully.", "Just now", "pink");
    toast("Alert Sent Successfully", "Driver safety system has received your SOS.");
    fetchSosAlerts();
  });
}

function startSosPolling() {
  fetchSosAlerts();
  if (app.sosPollTimer) clearInterval(app.sosPollTimer);
  app.sosPollTimer = setInterval(fetchSosAlerts, 8000);
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
  return Boolean(app.onTrip && app.active && rideId);
}

function refreshSosUi() {
  if (!el.sosBtn) return;
  const active = hasActiveRideContext();
  const hint = el.sosBtn.querySelector("small");
  if (hint) hint.textContent = active ? "Driver safety alert" : "Active only during ride";
  el.sosBtn.classList.toggle("is-disabled", !active);
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
  app.notices.forEach(n => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = '<div class="history-head"><strong>' + esc(n.title) + '</strong><span>' + esc(n.time) + '</span></div><div class="history-meta"><div><span>Message</span><strong>' + esc(n.message) + '</strong></div></div>';
    el.notificationsList.appendChild(item);
  });
}

function updateBadge() {
  if (!el.notificationBadge) return;
  el.notificationBadge.textContent = String(app.notices.length);
  el.notificationBadge.hidden = !app.notices.length;
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
    sos: el.sosModal
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
  ["notifications", "profile", "chat", "call", "sos"].forEach(closeBy);
  el.modalLayer?.classList.remove("is-open");
}

function startFeed() {
  // Disabled: requests are now sourced from DB polling.
  clearInterval(app.requestTimer);
  app.requestTimer = null;
}

function saveRide(r) {
  const rideType = normalizeRideType(r.rideType || localStorage.getItem("wow_driver_vehicle_type") || "WOW Car");
  const persistedRideCode = r.rideCode || localStorage.getItem("wow_ride_code") || rideCode(r.id);
  localStorage.setItem("wow_ride_pickup", r.pickup);
  localStorage.setItem("wow_ride_drop", r.drop);
  localStorage.setItem("wow_ride_fare", String(r.fare));
  localStorage.setItem("wow_ride_payment_method", r.paymentMethod || "online");
  localStorage.setItem("wow_ride_payment_label", paymentLabel(r.paymentMethod));
  localStorage.setItem("wow_ride_vehicle", rideType);
  localStorage.setItem("wow_ride_vehicle_model", localStorage.getItem("wow_driver_vehicle") || "Suzuki Alto");
  localStorage.setItem("wow_ride_vehicle_color", "White");
  localStorage.setItem("wow_ride_driver_name", localStorage.getItem("wow_user_name") || "Driver");
  localStorage.setItem("wow_ride_driver_phone", localStorage.getItem("wow_user_phone") || "+92 300 0000000");
  localStorage.setItem("wow_ride_passenger", r.passenger);
  localStorage.setItem("wow_ride_passenger_phone", r.phone);
  localStorage.setItem("wow_ride_code", persistedRideCode);
}

function choosePaymentMethod(fare) {
  return window.DriverWallet ? window.DriverWallet.choosePaymentMethod(fare) : (Math.random() < 0.45 ? "cash" : "online");
}

function paymentLabel(method) {
  return method === "cash" ? "Cash" : "Online";
}

function updateRouteMap(r, animate = false) {
  if (!window.google || !el.driverMap) return;
  if (!app.map) initDriverDashboardMap();
  if (!r) return clearRoute();
  if (!app.service) app.service = new google.maps.DirectionsService();
  if (!app.renderer) {
    app.renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: "#1a73e8", strokeWeight: 4, strokeOpacity: 0.95 }
    });
    app.renderer.setMap(app.map);
  }

  const pickup = readSavedLatLng("pickup") || point(r.pickup);
  const drop = readSavedLatLng("drop") || point(r.drop);
  const origin = app.routeStage === "toDrop" ? pickup : (app.driverAnchor || driverAnchorForRide(r, pickup));
  const destination = app.routeStage === "toDrop" ? drop : pickup;
  app.driverAnchor = origin;

  app.service.route(
    {
      origin,
      destination,
      travelMode: "DRIVING"
    },
    (result, status) => {
      if (status === "OK" && result && result.routes && result.routes[0] && result.routes[0].legs && result.routes[0].legs[0]) {
        app.polyline?.setMap(null);
        app.renderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        app.path = (result.routes[0].overview_path || []).map((p) => ({ lat: p.lat(), lng: p.lng() }));
        app.step = 0;
        app.routeKm = (leg.distance.value || 0) / 1000;
        app.routeMin = Math.max(5, Math.round((leg.duration.value || 300) / 60));
        el.driverEta.textContent = app.routeMin + " min";
        el.driverDistance.textContent = app.routeKm.toFixed(1) + " km";
        markers(pickup, drop);
        vehicle(app.path[0] || origin, r.rideType);
        fitRouteBounds(origin, pickup, drop);
        animate ? animateRoute() : stopRoute();
        return;
      }

      app.path = path(origin, destination, 42);
      app.step = 0;
      app.routeKm = dist(origin, destination);
      app.routeMin = Math.max(5, Math.round(app.routeKm * 2));
      el.driverEta.textContent = Math.max(4, app.routeMin) + " min";
      el.driverDistance.textContent = app.routeKm.toFixed(1) + " km";
      drawFallback(app.path);
      markers(pickup, drop);
      vehicle(app.path[0] || origin, r.rideType);
      fitRouteBounds(origin, pickup, drop);
      animate ? animateRoute() : stopRoute();
    }
  );
}

function clearRoute() {
  app.renderer?.set("directions", null);
  app.polyline?.setMap(null);
  if (app.vehicle) {
    app.vehicle.setMap(null);
    app.vehicle = null;
  }
  clearMarkers();
  stopRoute();
  defaultMap();
}

function drawFallback(route) {
  if (!app.map) return;
  app.renderer?.set("directions", null);
  app.polyline?.setMap(null);
  app.polyline = new google.maps.Polyline({
    path: route,
    strokeColor: "#1a73e8",
    strokeOpacity: 0.95,
    strokeWeight: 4,
    map: app.map
  });
}

function markers(pickup, drop) {
  clearMarkers();
  app.markers.pickup = new google.maps.Marker({
    position: pickup,
    map: app.map,
    label: { text: "P", color: "#fff", fontWeight: "700", fontSize: "11px" },
    zIndex: 3,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#30cd8b", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }
  });
  app.markers.drop = new google.maps.Marker({
    position: drop,
    map: app.map,
    label: { text: "D", color: "#fff", fontWeight: "700", fontSize: "11px" },
    zIndex: 3,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#f06aa5", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }
  });
}

function vehicle(p, rideType) {
  if (!app.map) return;
  const iconUrl = vehicleIconUrl(rideType || (app.active && app.active.rideType));
  if (!app.vehicle) {
    app.vehicle = new google.maps.Marker({
      position: p,
      map: app.map,
      zIndex: 5,
      icon: { url: iconUrl, scaledSize: new google.maps.Size(28, 28) }
    });
  } else {
    app.vehicle.setIcon({ url: iconUrl, scaledSize: new google.maps.Size(28, 28) });
    app.vehicle.setPosition(p);
  }
}

function clearMarkers() {
  Object.values(app.markers).forEach(m => m?.setMap(null));
  app.markers = {};
}

function animateRoute() {
  stopRoute();
  if (!app.path.length || !app.vehicle) return;
  app.step = 0;
  app.vehicle.setPosition(app.path[0]);
  app.routeTimer = setInterval(() => {
    if (!app.active || !app.started) return stopRoute();
    app.step += 1;
    if (app.step >= app.path.length) app.step = app.path.length - 1;
    app.vehicle.setPosition(app.path[app.step]);
    const progress = app.path.length > 1 ? app.step / (app.path.length - 1) : 1;
    const remainKm = Math.max(0, app.routeKm * (1 - progress));
    const remainMin = Math.max(1, Math.round(app.routeMin * (1 - progress)));
    el.driverDistance.textContent = remainKm.toFixed(1) + " km";
    el.driverEta.textContent = remainMin + " min";
    el.statusBanner.textContent = progress >= 1 ? "Arrived near the destination." : "Passenger is onboard. Driving toward the drop-off point.";
    if (progress >= 1) stopRoute();
  }, 1800);
}

function stopRoute() {
  if (app.routeTimer) clearInterval(app.routeTimer);
  app.routeTimer = null;
}

function initDriverDashboardMap() {
  if (!el.driverMap || !window.google || app.map) return;
  app.map = new google.maps.Map(el.driverMap, {
    center: { lat: 24.8607, lng: 67.0011 },
    zoom: 12,
    disableDefaultUI: true
  });
  if (app.active) {
    updateRouteMap(app.active, false);
    if (app.started) animateRoute();
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
  app.markers.center = new google.maps.Marker({
    position: center,
    map: app.map,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#9a48ff", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }
  });
  app.map.setCenter(center);
  app.map.setZoom(12);
}

function fitRouteBounds(origin, pickup, drop) {
  if (!app.map || !window.google) return;
  const bounds = new google.maps.LatLngBounds();
  [origin, pickup, drop].forEach((p) => p && bounds.extend(p));
  if (!bounds.isEmpty()) {
    app.map.fitBounds(bounds, 56);
  }
}

function driverAnchorForRide(ride, pickup) {
  const saved = readSavedLatLng("driver");
  if (saved) return saved;
  const base = pickup || point(ride?.pickup || "Karachi");
  return {
    lat: base.lat + 0.012,
    lng: base.lng - 0.01
  };
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
  if (LOCS[place]) return LOCS[place];
  const c = { lat: 24.8607, lng: 67.0011 };
  const h = String(place).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return {
    lat: c.lat + (((h % 13) - 6) * 0.006),
    lng: c.lng + ((((h >> 2) % 13) - 6) * 0.006)
  };
}

function path(start, end, pts = 32) {
  const out = [];
  for (let i = 0; i <= pts; i += 1) {
    const t = i / pts;
    const bend = Math.sin(t * Math.PI) * 0.0025;
    out.push({
      lat: start.lat + (end.lat - start.lat) * t + bend,
      lng: start.lng + (end.lng - start.lng) * t + bend
    });
  }
  return out;
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

window.initDriverDashboardMap = initDriverDashboardMap;


