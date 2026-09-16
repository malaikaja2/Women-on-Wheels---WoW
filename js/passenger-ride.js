let rideMap;
let rideMapFull;
let rideBounds;
let ridePath = [];
let rideStep = 0;
let rideMarker;
let rideTotalDistance = 0;
let rideTotalDuration = 0;
let rideTicker;
let pickupMarker = null;
let dropMarker = null;
let passengerLiveTracker = null;
let liveRoutePhase = "";
let liveInitialDistanceKm = 0;
let lastRideRouteKey = "";
let callInterval;
let callSeconds = 0;
let replyTimeout;
let emergencyContactsCache = [];
let sosCountdownTimer = null;
let sosCountdownLeft = 0;
let sosSending = false;
let passengerCallReady = false;
let passengerCallMuted = false;
let chatPollTimer = null;
let chatLastSeen = "";

const driverReplies = [
  "I'm on my way.",
  "I will reach in a few minutes.",
  "Please wait at the pickup point.",
  "Traffic is light, I'll be there soon.",
  "I have arrived near the pickup."
];

const SOS_API = {
  saveContact: "php/save_contact.php",
  getContacts: "php/get_contacts.php",
  deleteContact: "php/delete_contact.php",
  sendSos: "php/send_sos.php"
};
const CHAT_API = "php/chat_api.php";

const RIDE_API = {
  details: "php/get_ride.php",
  update: "php/update_ride_status.php"
};
const REALTIME = window.WowRealtime || null;
const REALTIME_EVENT_KEY = REALTIME && REALTIME.keys ? REALTIME.keys.event : "wow_realtime_event";
const LIVE_REQUESTS_KEY = "wow_live_ride_requests";
let rideStatusTimer = null;
let realtimeUnsubscribe = null;
let selectedRating = 0;
let selectedReviewTags = new Set();
let currentRideReviewed = false;
let reviewPopupOpen = false;
let reviewSubmitting = false;
let reviewCheckPending = false;
let passengerRideDocId = "";
let passengerOfferUnsubscribe = null;
let passengerRideUnsubscribe = null;
let passengerDriverUnsubscribe = null;
let passengerDriverListenerId = "";
let passengerChatUnsubscribe = null;
let activeDriverOffer = null;
let offerCountdownTimer = null;
let rejectedOfferIds = new Set();
const OFFER_RESPONSE_WINDOW_MS = 2 * 60 * 1000;
let currentRideStatus = "";
let currentRideDocument = null;
const passengerStaticMarkersByMap = new WeakMap();

const NEGOTIATION_STATUSES = new Set([
  "searching", "searching_driver", "request_pending", "pending",
  "driver_responded", "offer_received", "counteroffer_received",
  "awaiting_passenger_response"
]);
const ASSIGNED_STATUSES = new Set([
  "driver_assigned", "accepted", "driver_selected", "driver_en_route",
  "driver_arriving", "arriving", "arrived"
]);
const ACTIVE_STATUSES = new Set(["ride_started", "started", "ongoing", "in_progress", "on_trip", "active"]);
const SCHEDULED_STATUSES = new Set(["scheduled", "schedule_pending", "scheduled_confirmed"]);
const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

function normalizeRideStatus(status) {
  return String(status || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function isNegotiationStatus(status = currentRideStatus) {
  return NEGOTIATION_STATUSES.has(normalizeRideStatus(status));
}

function closeNegotiationUi({ unsubscribe = false } = {}) {
  stopOfferCountdown();
  activeDriverOffer = null;
  toggleDriverOfferModal(false);
  setDriverOfferButtonsBusy(true);
  if (unsubscribe && passengerOfferUnsubscribe) {
    try { passengerOfferUnsubscribe(); } catch {}
    passengerOfferUnsubscribe = null;
  }
}

function renderRideState(rideOrStatus, source = "firestore") {
  const ride = typeof rideOrStatus === "object" && rideOrStatus ? rideOrStatus : null;
  const status = normalizeRideStatus(ride ? ride.status : rideOrStatus);
  if (!status) return;
  currentRideStatus = status;
  if (ride) currentRideDocument = ride;
  document.body.dataset.rideState = NEGOTIATION_STATUSES.has(status) ? "negotiation"
    : SCHEDULED_STATUSES.has(status) ? "scheduled"
      : ASSIGNED_STATUSES.has(status) ? "assigned"
        : ACTIVE_STATUSES.has(status) ? "active"
          : TERMINAL_STATUSES.has(status) ? status : "assigned";
  localStorage.setItem("wow_ride_status", status);
  applyRideStatusUi(status);
  if (!NEGOTIATION_STATUSES.has(status)) closeNegotiationUi({ unsubscribe: true });
  if (ACTIVE_STATUSES.has(status)) {
    setText("passengerTrackingStatus", "Live ride in progress");
    if (!passengerLiveTracker && rideMap) initPassengerLiveTracking();
  }
  if (status === "completed") {
    passengerLiveTracker?.stop(true);
    passengerLiveTracker = null;
    showRideCompletedUi();
    showRatingCardIfNeeded();
  }
  if (source === "firestore" && document.readyState !== "loading" && NEGOTIATION_STATUSES.has(status) && !passengerOfferUnsubscribe) {
    initPassengerDriverOfferListener();
  }
}

function readSavedLatLng(prefix) {
  const lat = Number(localStorage.getItem(`wow_ride_${prefix}_lat`));
  const lng = Number(localStorage.getItem(`wow_ride_${prefix}_lng`));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function firstFiniteValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function cacheRideCoordinates(ride) {
  const pickupLat = firstFiniteValue(ride.pickupLatitude, ride.pickupLat, ride.pickup?.latitude, ride.pickup?.lat);
  const pickupLng = firstFiniteValue(ride.pickupLongitude, ride.pickupLng, ride.pickup?.longitude, ride.pickup?.lng);
  const destinationLat = firstFiniteValue(ride.destinationLatitude, ride.dropoffLatitude, ride.dropLat, ride.destination?.latitude, ride.destination?.lat);
  const destinationLng = firstFiniteValue(ride.destinationLongitude, ride.dropoffLongitude, ride.dropLng, ride.destination?.longitude, ride.destination?.lng);
  if (pickupLat !== null && pickupLng !== null) {
    localStorage.setItem("wow_ride_pickup_lat", String(pickupLat));
    localStorage.setItem("wow_ride_pickup_lng", String(pickupLng));
  }
  if (destinationLat !== null && destinationLng !== null) {
    localStorage.setItem("wow_ride_drop_lat", String(destinationLat));
    localStorage.setItem("wow_ride_drop_lng", String(destinationLng));
  }
}

function routeEndpoints() {
  return {
    origin: readSavedLatLng("pickup"),
    destination: readSavedLatLng("drop")
  };
}

function initPassengerRideMap() {
  const mapEl = document.getElementById("passengerRideMap");
  if (!mapEl || !window.WowMapbox || rideMap) return;
  const endpoints = routeEndpoints();
  if (!endpoints.origin || !endpoints.destination) {
    setText("passengerTrackingStatus", "Waiting for live ride coordinates...");
    return;
  }
  rideMap = WowMapbox.createMap(mapEl, { center: [endpoints.origin.lng, endpoints.origin.lat], zoom: 12 });
  calculateRideRoute();
}

document.addEventListener("DOMContentLoaded", () => {
  clearRideUiForLoading();
  renderCachedRidePreview();
  bindPassengerActions();
  bindRatingActions();
  initializeAuthorizedPassengerRide().then(openRequestedLostFoundAction);
});

function openRequestedLostFoundAction() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("lostFound") || !passengerRideDocId) return;
  if (window.location.hash === "#chat") {
    toggleChatPanel(true);
  } else if (window.location.hash === "#call") {
    toggleCallPanel(true);
  }
}

function renderCachedRidePreview() {
  const pickup = String(localStorage.getItem("wow_ride_pickup") || "").trim();
  const drop = String(localStorage.getItem("wow_ride_drop") || "").trim();
  const fare = String(localStorage.getItem("wow_ride_fare") || "").trim();
  const code = String(localStorage.getItem("wow_ride_code") || "").trim();
  const driver = String(localStorage.getItem("wow_ride_driver_name") || "").trim();
  const payment = String(localStorage.getItem("wow_ride_payment_method") || "").trim();
  setPassengerName();
  if (pickup) setText("passengerPickupText", pickup);
  if (drop) setText("passengerDropText", drop);
  if (fare) setText("passengerFareText", `Rs. ${fare}`);
  if (code) setText("passengerWowCode", code);
  if (driver) setText("driverName", driver);
  if (payment) setText("passengerPaymentMethod", payment);
  setText("passengerTrackingStatus", "Connecting to live ride...");
}

async function initializeAuthorizedPassengerRide() {
  // Show the cached ride shell immediately; Firebase authorization and live
  // listeners continue in the background so a slow token request cannot keep
  // the page waiting on remote data before useful ride details appear.
  finishRideLoading();
  if (!await authorizePassengerActiveRide()) return;
  setPassengerName();
  setRideDetails();
  initPassengerRideMap();
  initPassengerRealtimeSync();
  initPassengerRideDocListener();
  attachPassengerChatListener();
  if (isNegotiationStatus()) initPassengerDriverOfferListener();
  if (rideMap && !passengerLiveTracker) initPassengerLiveTracking();
  finishRideLoading();
  applyRequestedRidePanel();
}

function clearRideUiForLoading() {
  setText("passengerTrackingStatus", "Loading your ride...");
  setText("passengerPeerStatus", "Waiting for live ride information.");
  setText("passengerName", "--");
  setText("passengerPickupText", "Loading...");
  setText("passengerDropText", "Loading...");
  setText("passengerFareText", "--");
  setText("passengerPaymentMethod", "--");
  setText("passengerRideStatusText", "Loading");
  setText("passengerWowCode", "--");
  setText("vehicleType", "Loading...");
  setText("vehicleModel", "Loading vehicle details...");
  setText("driverName", "Loading driver...");
  updateActiveFeatureControls(false);
}

function showRideLoadError(message) {
  clearRideUiForLoading();
  setText("passengerTrackingStatus", message);
  setText("passengerPeerStatus", "Return to the passenger dashboard to select an active ride.");
  const backButton = document.querySelector(".ride-topbar .back-btn");
  if (backButton) backButton.onclick = () => window.location.assign("dashboard.html");
  const notFound = document.getElementById("rideNotFound");
  if (notFound) {
    notFound.hidden = false;
    const paragraph = notFound.querySelector("p");
    if (paragraph && /connection/i.test(message)) paragraph.textContent = "We could not load this ride. Please check your connection and try again.";
  }
}

function finishRideLoading() {
  const tabs = document.getElementById("ridePanelTabs");
  if (tabs) tabs.hidden = false;
}

function requestedRidePanel() {
  const requested = String(new URLSearchParams(window.location.search).get("panel") || "overview").toLowerCase();
  return ["overview", "chat", "call", "tracking", "payment"].includes(requested) ? requested : "overview";
}

function hasAssignedDriver() {
  const ride = currentRideDocument || {};
  return Boolean(String(ride.acceptedDriverId || ride.assignedDriverId || ride.driverUid || ride.driverId || "").trim());
}

function applyRequestedRidePanel(panel = requestedRidePanel(), updateUrl = false) {
  if (!currentRideDocument || !passengerRideDocId) return;
  document.querySelectorAll("[data-ride-panel]").forEach(button => {
    const active = button.dataset.ridePanel === panel;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  const payment = document.getElementById("passengerPaymentCard");
  if (payment) payment.hidden = panel !== "payment";
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("rideId", passengerRideDocId);
    url.searchParams.set("panel", panel);
    history.replaceState(null, "", url);
  }
  if (panel === "chat") {
    if (hasAssignedDriver()) toggleChatPanel(true);
    else setText("passengerTrackingStatus", "Chat will be available once a driver accepts your ride.");
  } else if (panel === "call") {
    if (hasAssignedDriver()) toggleCallPanel(true);
    else setText("passengerTrackingStatus", "Calling will be available once a driver accepts your ride.");
  } else if (panel === "tracking") {
    const searching = !hasAssignedDriver();
    if (searching) {
      setText("passengerTrackingStatus", "Waiting for a driver to accept your ride.");
      setText("passengerPeerStatus", "Pickup and drop-off are ready. Live driver tracking will appear after assignment.");
    }
    document.getElementById("rideTrackingPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (panel === "payment") {
    const status = normalizeRideStatus(currentRideStatus);
    if (status !== "completed") {
      setText("paymentCardNote", "Payment will become available after the ride is completed.");
      const button = document.getElementById("openPaymentBtn");
      if (button) button.disabled = true;
    }
  }
}

async function authorizePassengerActiveRide() {
  try {
    if (!window.WowFirestore) throw new Error("A valid active ride is required.");
    const { db, uid } = await window.WowFirestore.ready();
    const fromUrl = String(new URLSearchParams(window.location.search).get("rideId") || "").trim();
    const rideId = fromUrl;
    if (!rideId) throw new Error("Ride information is missing. Please return to the dashboard.");
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) throw new Error("This ride could not be found.");
    const ride = snapshot.data() || {};
    if (String(ride.passengerId || ride.passengerUid || "") !== String(uid || "")) throw new Error("You are not authorized to view this ride.");
    const authorizedStatus = normalizeRideStatus(ride.status);
    if (authorizedStatus === "cancelled") throw new Error("No active ride found.");
    if (![...NEGOTIATION_STATUSES, ...SCHEDULED_STATUSES, ...ASSIGNED_STATUSES, ...ACTIVE_STATUSES, ...TERMINAL_STATUSES].includes(authorizedStatus)) {
      throw new Error("This ride is not ready for the active ride page.");
    }
    passengerRideDocId = rideId;
    initPassengerLiveCall(rideId).catch(() => {});
    currentRideStatus = authorizedStatus;
    currentRideDocument = ride;
    localStorage.setItem("wow_ride_db_id", rideId);
    [
      "wow_ride_pickup", "wow_ride_drop", "wow_ride_fare", "wow_ride_code",
      "wow_ride_driver_name", "wow_ride_driver_phone", "wow_ride_driver_photo",
      "wow_ride_pickup_lat", "wow_ride_pickup_lng", "wow_ride_drop_lat", "wow_ride_drop_lng"
    ].forEach((key) => localStorage.removeItem(key));
    clearActiveVehicleCache();
    if (ride.rideCode) localStorage.setItem("wow_ride_code", String(ride.rideCode));
    const pickupAddress = ride.pickupAddress || ride.pickupName || ride.pickupLocation?.address || ride.pickup;
    const destinationAddress = ride.destinationAddress || ride.destinationName || ride.dropoffAddress || ride.dropoffLocation?.address || ride.dropoff;
    if (pickupAddress) localStorage.setItem("wow_ride_pickup", String(pickupAddress));
    if (destinationAddress) localStorage.setItem("wow_ride_drop", String(destinationAddress));
    if (ride.driverName) localStorage.setItem("wow_ride_driver_name", String(ride.driverName));
    if (ride.driverPhone) localStorage.setItem("wow_ride_driver_phone", String(ride.driverPhone));
    cacheVerifiedVehicleDetails(ride);
    if (ride.acceptedFare || ride.finalFare || ride.passengerOffer) localStorage.setItem("wow_ride_fare", String(ride.acceptedFare || ride.finalFare || ride.passengerOffer));
    cacheRideCoordinates(ride);
    renderRideState(ride, "firestore");
    setText("rideHeaderTitle", `Ride ${ride.rideCode || ride.rideId || rideId}`);
    return true;
  } catch (error) {
    console.error("[WOW Passenger Ride] authorization failed", error);
    const message = String(error?.message || "");
    const allowedMessages = new Set([
      "Ride information is missing. Please return to the dashboard.",
      "This ride could not be found.",
      "You are not authorized to view this ride.",
      "No active ride found."
    ]);
    showRideLoadError(allowedMessages.has(message)
      ? message
      : "Unable to load the ride. Please check your connection and try again.");
    return false;
  }
}

window.addEventListener("pagehide", cleanupPassengerRidePage);
window.addEventListener("beforeunload", cleanupPassengerRidePage);
window.addEventListener("beforeunload", (event) => {
  if (!window.WowRideCall?.hasActiveCall?.()) return;
  event.preventDefault();
  event.returnValue = "";
});

function setPassengerName() {
  const storedName = localStorage.getItem("wow_user_name") || "";
  const storedEmail = localStorage.getItem("wow_user_email") || "";
  const name = storedName || storedEmail.split("@")[0] || "Passenger";
  const nameEl = document.getElementById("passengerName");
  if (nameEl) nameEl.textContent = name;
}

function setRideDetails() {
  if (!currentRideDocument || !passengerRideDocId) return;
  const pickup = localStorage.getItem("wow_ride_pickup") || "Location unavailable";
  const drop = localStorage.getItem("wow_ride_drop") || "Location unavailable";
  const fare = localStorage.getItem("wow_ride_fare") || "";
  const wowCode = localStorage.getItem("wow_ride_code") || passengerRideDocId;
  const requestedVehicle = localStorage.getItem("wow_ride_requested_vehicle") || "";
  const driverVehicleType = localStorage.getItem("wow_ride_driver_vehicle_type") || "";
  const driverVehicleName = localStorage.getItem("wow_ride_driver_vehicle_name") || "";
  const driverVehicleNumber = localStorage.getItem("wow_ride_driver_vehicle_number") || "";
  const storedDriver = localStorage.getItem("wow_ride_driver_name") || "";
  const driverName = storedDriver || "Driver information unavailable";
  const driverPhotoUrl = localStorage.getItem("wow_ride_driver_photo") || "";
  const ride = currentRideDocument || {};

  document.getElementById("passengerPickupText").textContent = pickup;
  document.getElementById("passengerDropText").textContent = drop;
  document.getElementById("passengerFareText").textContent = fare ? `Rs. ${fare}` : "Fare unavailable";
  setText("passengerPaymentMethod", localStorage.getItem("wow_ride_payment_method") || "Not specified");
  const wowCodeEl = document.getElementById("passengerWowCode");
  if (wowCodeEl) wowCodeEl.textContent = wowCode;
  document.getElementById("vehicleType").textContent = `Ride Type: ${window.WowVehicle?.label(requestedVehicle) || "Vehicle information unavailable"}`;
  const realVehicleParts = [window.WowVehicle?.label(driverVehicleType), driverVehicleName, driverVehicleNumber]
    .filter((value) => value && value !== "Vehicle information unavailable");
  document.getElementById("vehicleModel").textContent = `Driver Vehicle: ${realVehicleParts.join(" · ") || "Vehicle information unavailable"}`;
  document.getElementById("driverName").textContent = driverName;
  document.getElementById("chatDriverName").textContent = driverName;
  document.getElementById("callDriverName").textContent = driverName;
  const chatAvatar = document.getElementById("chatAvatar");
  if (chatAvatar) {
    chatAvatar.textContent = driverName.trim().charAt(0).toUpperCase() || "D";
  }
  const driverPhoto = document.getElementById("driverPhoto");
  if (driverPhoto) {
    driverPhoto.textContent = driverName.trim().charAt(0).toUpperCase() || "D";
    if (driverPhotoUrl) {
      driverPhoto.style.backgroundImage = `url("${driverPhotoUrl.replaceAll('"', "%22")}")`;
      driverPhoto.style.backgroundSize = "cover";
      driverPhoto.style.backgroundPosition = "center";
      driverPhoto.textContent = "";
    } else {
      driverPhoto.style.backgroundImage = "";
    }
  }
  document.getElementById("callAvatar").textContent = driverName.trim().charAt(0).toUpperCase() || "D";
  const badge = document.getElementById("vehicleBadge");
  const badgeText = window.WowVehicle?.label(driverVehicleType || requestedVehicle) || "Vehicle";
  if (badge) {
    badge.textContent = badgeText;
    badge.classList.remove("car", "bike", "scooty");
    const badgeKey = badgeText.toLowerCase();
    if (badgeKey.includes("bike")) badge.classList.add("bike");
    else if (badgeKey.includes("scooty")) badge.classList.add("scooty");
    else badge.classList.add("car");
  }
  applyRideStatusUi(currentRideStatus || localStorage.getItem("wow_ride_status") || "pending");
}

function applyRideStatusUi(rawStatus) {
  const status = normalizeRideStatus(rawStatus);
  const heading = document.querySelector(".ride-topbar div span");
  if (!heading) return;
  setText("rideHeaderStatus", status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()));
  setText("passengerRideStatusText", status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  if (["searching", "searching_driver", "request_pending", "pending"].includes(status)) {
    heading.textContent = "Searching for drivers...";
    updateActiveFeatureControls(false);
    return;
  }
  if (SCHEDULED_STATUSES.has(status)) {
    heading.textContent = "Scheduled ride confirmed";
    updateActiveFeatureControls(false);
    return;
  }
  if (["driver_responded", "offer_received", "counteroffer_received", "awaiting_passenger_response"].includes(status)) {
    heading.textContent = "Driver offer received";
    updateActiveFeatureControls(false);
    return;
  }
  if (status === "driver_selected") {
    heading.textContent = "Waiting for driver confirmation";
    updateActiveFeatureControls(false);
    return;
  }
  if (["accepted", "driver_assigned", "driver_en_route"].includes(status)) {
    heading.textContent = "Driver assigned and on the way";
    updateActiveFeatureControls(true);
    return;
  }
  if (["driver_arriving", "arriving", "arrived"].includes(status)) {
    heading.textContent = status === "arrived" ? "Driver Arrived" : "Driver is arriving";
    updateActiveFeatureControls(true);
    return;
  }
  if (ACTIVE_STATUSES.has(status)) {
    heading.textContent = "Your ride has started";
    updateActiveFeatureControls(true);
    return;
  }
  if (status === "completed") {
    heading.textContent = "Ride Completed";
    updateActiveFeatureControls(false);
    showRideCompletedUi();
    showRatingCardIfNeeded();
    return;
  }
  if (status === "cancelled") {
    heading.textContent = "Ride Cancelled";
    updateActiveFeatureControls(false);
    return;
  }
  heading.textContent = "Waiting for a driver to accept your ride...";
  updateActiveFeatureControls(false);
}

function updateActiveFeatureControls(enabled) {
  ["passengerChat", "passengerCall"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = !enabled;
    button.classList.toggle("is-disabled", !enabled);
    button.setAttribute("aria-disabled", String(!enabled));
  });
  const sos = document.getElementById("passengerSosBtn");
  if (sos) {
    const available = ACTIVE_STATUSES.has(normalizeRideStatus(currentRideStatus));
    sos.disabled = !available;
    sos.classList.toggle("is-disabled", !available);
    sos.setAttribute("aria-disabled", String(!available));
  }
}

function bindRatingActions() {
  const stars = Array.from(document.querySelectorAll("#ratingStars .star-btn"));
  const submitBtn = document.getElementById("ratingSubmitBtn");
  stars.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRating = Number(btn.dataset.star || 0);
      renderSelectedStars();
      renderReviewTags();
    });
    btn.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
      selectedRating = Math.max(1, Math.min(5, (selectedRating || 1) + direction));
      renderSelectedStars();
      renderReviewTags();
      stars[selectedRating - 1]?.focus();
    });
  });
  if (submitBtn) submitBtn.addEventListener("click", submitRideReview);
  document.getElementById("openRatingBtn")?.addEventListener("click", () => showRatingCardIfNeeded());
  ["ratingCloseBtn", "ratingSkipBtn", "ratingDoneBtn"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", closeReviewPopup);
  });
}

function renderSelectedStars() {
  const labels = ["Select a rating", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  const stars = Array.from(document.querySelectorAll("#ratingStars .star-btn"));
  stars.forEach((btn) => {
    const v = Number(btn.dataset.star || 0);
    const active = v <= selectedRating;
    btn.classList.toggle("active", active);
    btn.innerHTML = active ? "&#9733;" : "&#9734;";
    btn.setAttribute("aria-checked", String(v === selectedRating));
  });
  setText("ratingLabel", labels[selectedRating] || labels[0]);
}

function renderReviewTags() {
  const container = document.getElementById("ratingTags");
  if (!container) return;
  const positive = ["Safe Driver", "Polite", "Clean Vehicle", "Smooth Ride", "On Time", "Good Navigation", "Professional", "Helpful"];
  const improvement = ["Late Arrival", "Navigation Issue", "Vehicle Cleanliness", "Communication Issue", "Driving Concern", "Other"];
  const available = selectedRating > 0 && selectedRating <= 3 ? improvement : positive;
  selectedReviewTags = new Set([...selectedReviewTags].filter((tag) => available.includes(tag)));
  container.replaceChildren(...available.map((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `review-tag${selectedReviewTags.has(tag) ? " active" : ""}`;
    button.textContent = tag;
    button.setAttribute("aria-pressed", String(selectedReviewTags.has(tag)));
    button.addEventListener("click", () => {
      selectedReviewTags.has(tag) ? selectedReviewTags.delete(tag) : selectedReviewTags.add(tag);
      renderReviewTags();
    });
    return button;
  }));
}

function closeReviewPopup() {
  if (reviewSubmitting) return;
  const card = document.getElementById("ratingCard");
  card?.classList.add("is-hidden");
  card?.setAttribute("aria-hidden", "true");
  reviewPopupOpen = false;
  document.body.classList.remove("review-open");
  console.info("[WOW Review] popup closed", { rideId: passengerRideDocId });
}

async function showRatingCardIfNeeded() {
  const card = document.getElementById("ratingCard");
  const status = normalizeRideStatus(currentRideDocument?.status || currentRideDocument?.rideStatus);
  if (!card || currentRideReviewed || reviewPopupOpen || reviewCheckPending ||
      !["completed", "ride_completed"].includes(status)) return;
  const user = window.firebase?.auth?.().currentUser;
  const passengerId = String(currentRideDocument?.passengerId || currentRideDocument?.passengerUid || "");
  const driverId = String(currentRideDocument?.assignedDriverId || currentRideDocument?.acceptedDriverId || currentRideDocument?.driverUid || currentRideDocument?.driverId || "");
  if (!user || passengerId !== user.uid || !driverId) return;
  reviewCheckPending = true;
  const existing = await fetchExistingRideReview();
  reviewCheckPending = false;
  if (existing || currentRideReviewed || reviewPopupOpen) return;
  reviewPopupOpen = true;
  card.classList.remove("is-hidden");
  card.setAttribute("aria-hidden", "false");
  document.body.classList.add("review-open");
  document.getElementById("ratingSuccess")?.classList.add("is-hidden");
  setRatingNote("");
  const driverName = String(currentRideDocument?.driverName || currentRideDocument?.acceptedDriverName || localStorage.getItem("wow_ride_driver_name") || "your driver");
  const vehicle = String(currentRideDocument?.driverVehicleName || currentRideDocument?.vehicleName || currentRideDocument?.driverVehicleType || currentRideDocument?.vehicleType || "Assigned vehicle");
  const photo = String(currentRideDocument?.driverProfileImage || currentRideDocument?.driverPhotoURL || currentRideDocument?.driverPhoto || "");
  setText("ratingDriverName", driverName);
  setText("ratingVehicleName", vehicle);
  const image = document.getElementById("ratingDriverPhoto");
  if (image) image.src = photo || "images/logo.png";
  renderSelectedStars();
  renderReviewTags();
  document.querySelector("#ratingStars .star-btn")?.focus();
  console.info("[WOW Review] popup opened", { rideId: passengerRideDocId, driverId, passengerId });
}

function showRideCompletedUi() {
  closeNegotiationUi({ unsubscribe: true });
  const banner = document.getElementById("rideCompletedBanner");
  if (banner) banner.classList.remove("is-hidden");
  const driverName = String(currentRideDocument?.driverName || currentRideDocument?.acceptedDriverName || localStorage.getItem("wow_ride_driver_name") || "your driver");
  const fare = Number(currentRideDocument?.finalFare || currentRideDocument?.fare || localStorage.getItem("wow_ride_fare") || 0);
  setText("rideCompletedSummary", `Ride with ${driverName} completed${fare > 0 ? ` · Final fare Rs. ${Math.round(fare)}` : ""}. You can now rate your driver.`);
  const reviewButton = document.getElementById("openRatingBtn");
  if (reviewButton) {
    reviewButton.hidden = currentRideReviewed;
    reviewButton.disabled = currentRideReviewed;
    reviewButton.textContent = currentRideReviewed ? "Review Submitted" : "Rate Driver";
  }
  setText("passengerTrackingStatus", "Ride completed successfully");
  setText("passengerPeerStatus", "Live tracking has ended.");
  setText("passengerDistance", "0.0 km");
  setText("passengerEta", "Arrived");
  const progress = document.getElementById("passengerProgress");
  if (progress) progress.style.width = "100%";
  document.getElementById("passengerCancelRide")?.setAttribute("hidden", "hidden");
  document.querySelector(".passenger-emergency-actions")?.setAttribute("hidden", "hidden");
}

function setRatingNote(message, isError = false) {
  const note = document.getElementById("ratingNote");
  if (!note) return;
  note.textContent = message || "";
  note.style.color = isError ? "#cf4b4b" : "#21ad79";
}

async function fetchExistingRideReview() {
  const rideId = String(passengerRideDocId || "").trim();
  if (!rideId || !window.WowFirestore) return false;
  try {
    const { db } = await window.WowFirestore.ready();
    const snapshot = await db.collection("rideReviews").doc(rideId).get();
    if (snapshot.exists) {
      const review = snapshot.data() || {};
      currentRideReviewed = true;
      selectedRating = Number(review.rating || 0);
      renderSelectedStars();
      const textEl = document.getElementById("ratingReviewText");
      if (textEl) textEl.value = String(review.reviewText || review.review || "");
      const reviewButton = document.getElementById("openRatingBtn");
      if (reviewButton) {
        reviewButton.hidden = true;
        reviewButton.disabled = true;
        reviewButton.textContent = "Review Submitted";
      }
      closeReviewPopup();
      console.info("[WOW Review] duplicate review prevented", { rideId });
      return true;
    }
  } catch (error) {
    console.warn("[WOW Review] existing review check failed", { rideId, error: error?.code || error?.message });
  }
  return false;
}

async function submitRideReview() {
  if (currentRideReviewed || reviewSubmitting) return;
  if (selectedRating < 1 || selectedRating > 5) {
    setRatingNote("Please select a rating before submitting.", true);
    return;
  }
  const rideId = String(passengerRideDocId || "").trim();
  if (!rideId || !window.WowFirestore) {
    setRatingNote("Ride info missing. Please refresh and try again.", true);
    return;
  }
  const reviewText = (document.getElementById("ratingReviewText")?.value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
  const submitBtn = document.getElementById("ratingSubmitBtn");
  reviewSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("is-loading");
  }
  setText("ratingSubmitText", "Submitting...");
  setRatingNote("");
  try {
    const { db, auth, FieldValue } = await window.WowFirestore.ready();
    const passengerId = auth.currentUser?.uid || "";
    const rideRef = db.collection("rides").doc(rideId);
    const reviewRef = db.collection("rideReviews").doc(rideId);
    const ratingRef = db.collection("ratings").doc(rideId);
    console.info("[WOW Review] submission started", { rideId, passengerId, rating: selectedRating });
    await db.runTransaction(async (transaction) => {
      const rideSnapshot = await transaction.get(rideRef);
      const reviewSnapshot = await transaction.get(reviewRef);
      if (!rideSnapshot.exists) throw new Error("ride-not-found");
      const ride = rideSnapshot.data() || {};
      const ownerId = String(ride.passengerId || ride.passengerUid || "");
      const driverId = String(ride.assignedDriverId || ride.acceptedDriverId || ride.driverUid || ride.driverId || "");
      const status = normalizeRideStatus(ride.status || ride.rideStatus);
      if (ownerId !== passengerId) throw new Error("not-authorized");
      if (!["completed", "ride_completed"].includes(status)) throw new Error("ride-not-completed");
      if (!driverId) throw new Error("missing-driver");
      if (reviewSnapshot.exists || ride.reviewSubmitted === true || Number(ride.passengerRating || 0) > 0) throw new Error("already-reviewed");
      const passengerName = String(ride.passengerName || ride.userName || localStorage.getItem("wow_user_name") || "Passenger");
      const driverName = String(ride.driverName || ride.acceptedDriverName || localStorage.getItem("wow_ride_driver_name") || "Driver");
      const rideCode = String(ride.rideCode || localStorage.getItem("wow_ride_code") || rideId);
      const tags = [...selectedReviewTags];
      const review = {
        reviewId: rideId, ratingId: rideId, rideId,
        passengerId, passengerUid: passengerId,
        driverId, driverUid: driverId,
        reviewerId: passengerId,
        reviewerRole: "passenger",
        reviewerName: passengerName,
        revieweeId: driverId,
        revieweeRole: "driver",
        revieweeName: driverName,
        passengerName,
        passengerDisplayName: passengerName,
        driverName,
        driverDisplayName: driverName,
        rideCode,
        rating: selectedRating,
        reviewText, review: reviewText, comment: reviewText, feedback: reviewText,
        feedbackTags: tags,
        tags,
        sourcePlatform: "passenger_website", source: "passenger_website", platform: "passenger_website",
        moderationStatus: "visible",
        isVisible: true,
        isDeleted: false,
        rideCompletedAt: ride.completedAt || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(reviewRef, review);
      transaction.set(ratingRef, review);
    });
    await rideRef.set({
      passengerRating: selectedRating,
      passengerFeedback: reviewText,
      reviewSubmitted: true,
      reviewId: rideId,
      reviewSubmittedAt: FieldValue.serverTimestamp(),
      ratedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }).catch((error) => {
      console.warn("[WOW Review] ride summary update skipped", error?.code || error?.message);
    });
    currentRideReviewed = true;
    const reviewButton = document.getElementById("openRatingBtn");
    if (reviewButton) {
      reviewButton.hidden = true;
      reviewButton.disabled = true;
      reviewButton.textContent = "Review Submitted";
    }
    if (currentRideDocument) {
      currentRideDocument.reviewSubmitted = true;
      currentRideDocument.passengerRating = selectedRating;
      currentRideDocument.passengerFeedback = reviewText;
    }
    document.getElementById("ratingSuccess")?.classList.remove("is-hidden");
    console.info("[WOW Review] review document created", { rideId, passengerId, rating: selectedRating });
  } catch (error) {
    console.error("[WOW Review] submission failed", { rideId, code: error?.code || error?.message });
    const duplicate = String(error?.message || "").includes("already-reviewed");
    if (duplicate) {
      currentRideReviewed = true;
      reviewSubmitting = false;
      closeReviewPopup();
      return;
    }
    const code = String(error?.code || error?.message || "");
    setRatingNote(
      code.includes("permission-denied")
        ? "Your session could not verify this ride. Please refresh once and submit again."
        : "Unable to submit your review. Please check your connection and try again.",
      true
    );
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
    }
    setText("ratingSubmitText", "Submit Review");
  } finally {
    reviewSubmitting = false;
  }
}

function currentRideCode() {
  return String(localStorage.getItem("wow_ride_code") || "");
}

function applyRealtimeRidePayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const rideCode = String(payload.rideCode || "");
  const activeRideCode = currentRideCode();
  if (!rideCode || !activeRideCode || rideCode !== activeRideCode) return;
  if (payload.driverName) localStorage.setItem("wow_ride_driver_name", String(payload.driverName));
  if (payload.driverPhone) localStorage.setItem("wow_ride_driver_phone", String(payload.driverPhone));
  if (payload.driverProfilePhoto || payload.profilePhotoUrl) localStorage.setItem("wow_ride_driver_photo", String(payload.driverProfilePhoto || payload.profilePhotoUrl));
  if (payload.requestedVehicleType) localStorage.setItem("wow_ride_requested_vehicle", window.WowVehicle.normalize(payload.requestedVehicleType));
  if (payload.driverVehicleType) localStorage.setItem("wow_ride_driver_vehicle_type", window.WowVehicle.normalize(payload.driverVehicleType));
  if (payload.driverVehicleName) localStorage.setItem("wow_ride_driver_vehicle_name", String(payload.driverVehicleName));
  if (payload.driverVehicleNumber) localStorage.setItem("wow_ride_driver_vehicle_number", String(payload.driverVehicleNumber));
  if (payload.fare !== undefined) {
    const nextFare = Number(payload.fare || 0);
    if (nextFare > 0) localStorage.setItem("wow_ride_fare", String(nextFare));
  }
  if (payload.status && !currentRideDocument) renderRideState(payload.status, "realtime-fallback");
  setRideDetails();
}

function initPassengerRealtimeSync() {
  if (REALTIME && typeof REALTIME.subscribe === "function") {
    realtimeUnsubscribe = REALTIME.subscribe((message) => {
      const type = String(message?.type || "");
      const payload = message?.payload || {};
      if (type === "ride.accepted" || type === "ride.status") {
        applyRealtimeRidePayload(payload);
      }
    });
  }

  window.addEventListener("storage", (event) => {
    if (!event) return;
    if (event.key === "wow_ride_status" || event.key === "wow_ride_driver_name" || event.key === "wow_ride_fare") {
      setRideDetails();
      return;
    }
    if (event.key === LIVE_REQUESTS_KEY || event.key === REALTIME_EVENT_KEY) {
      const rideCode = currentRideCode();
      if (!rideCode) return;
      try {
        const rows = JSON.parse(localStorage.getItem(LIVE_REQUESTS_KEY) || "[]");
        if (!Array.isArray(rows)) return;
        const match = rows.find((row) => String(row?.rideCode || "") === rideCode);
        if (!match) return;
        applyRealtimeRidePayload({
          rideCode,
          status: String(match.status || ""),
          fare: Number(match.offeredFare || match.fare || 0),
          driverName: match.driverName || "",
          driverPhone: match.driverPhone || ""
        });
      } catch {
        // Ignore parse errors for stale storage entries.
      }
    }
  });
}

async function initPassengerRideDocListener() {
  try {
    if (!window.WowFirestore) return;
    if (passengerRideUnsubscribe) {
      passengerRideUnsubscribe();
      passengerRideUnsubscribe = null;
    }
    const { db } = await window.WowFirestore.ready();
    const rideId = await resolvePassengerRideDocId(db);
    if (!rideId) return;
    passengerRideDocId = rideId;
    passengerRideUnsubscribe = db.collection("rides").doc(rideId).onSnapshot((doc) => {
      if (!doc.exists) {
        showRideLoadError("This ride could not be found.");
        return;
      }
      const ride = doc.data() || {};
      currentRideDocument = ride;
      updatePassengerDemoPayment(rideId, ride);
      syncPassengerPaymentGate(ride);
      currentRideReviewed = ride.reviewSubmitted === true || Number(ride.passengerRating || 0) > 0;
      const reviewButton = document.getElementById("openRatingBtn");
      if (reviewButton) {
        reviewButton.hidden = currentRideReviewed;
        reviewButton.disabled = currentRideReviewed;
        reviewButton.textContent = currentRideReviewed ? "Review Submitted" : "Rate Driver";
      }
      if (currentRideReviewed) closeReviewPopup();
      const acceptedDriverId = String(ride.acceptedDriverId || ride.assignedDriverId || ride.driverUid || ride.driverId || "").trim();
      if (acceptedDriverId) listenToAcceptedDriver(db, acceptedDriverId);
      const pickupAddress = ride.pickupAddress || ride.pickupName || ride.pickupLocation?.address || ride.pickup;
      const destinationAddress = ride.destinationAddress || ride.destinationName || ride.dropoffAddress || ride.dropoffLocation?.address || ride.dropoff;
      if (pickupAddress) localStorage.setItem("wow_ride_pickup", String(pickupAddress));
      if (destinationAddress) localStorage.setItem("wow_ride_drop", String(destinationAddress));
      cacheRideCoordinates(ride);
      renderRideState(ride, "firestore");
      const vehicleInfo = ride.vehicleInfo || {};
      cacheVerifiedVehicleDetails(ride);
      const paymentMethod = ride.paymentMethod || ride.payment_method;
      if (paymentMethod) localStorage.setItem("wow_ride_payment_method", String(paymentMethod));
      applyRealtimeRidePayload({
        rideCode: ride.rideCode || currentRideCode(),
        status: ride.status || "",
        fare: ride.acceptedFare || ride.finalFare || ride.passengerOfferFare || ride.fare || ride.offeredFare || ride.estimatedFare || 0,
        driverName: ride.driverName || ride.acceptedDriverName || ride.targetDriverName || "",
        driverPhone: ride.driverPhone || ride.acceptedDriverPhone || "",
        driverProfilePhoto: ride.driverProfileImage || ride.driverPhotoURL || ride.driverPhoto || ride.driverProfilePhoto || ride.profilePhotoUrl || "",
        requestedVehicleType: ride.requestedVehicleType || ride.vehicleType || "",
        driverVehicleType: ride.driverVehicleType || ride.acceptedDriverVehicle || vehicleInfo.type || "",
        driverVehicleNumber: ride.driverVehicleNumber || ride.vehicleNumber || vehicleInfo.number || "",
        driverVehicleName: ride.driverVehicleName || ride.vehicleName || vehicleInfo.model || ""
      });
      setRideDetails();
      if (!rideMap) {
        initPassengerRideMap();
        if (rideMap) initPassengerLiveTracking();
      }
      const parentOffer = driverOfferFromRide(ride);
      if (isNegotiationStatus(ride.status) && parentOffer && !activeDriverOffer && !rejectedOfferIds.has(parentOffer.id)) {
        showDriverOfferPopup(parentOffer);
      }
      if (String(ride.status || "").toLowerCase() === "completed") showRatingCardIfNeeded();
    }, (error) => {
      console.error("[WOW Passenger Ride] ride listener failed", error);
      showRideLoadError("Unable to load the ride. Please check your connection and try again.");
    });
  } catch (error) {
    console.error("[WOW Passenger Ride] listener setup failed", error);
    showRideLoadError("Unable to load the ride. Please check your connection and try again.");
  }
}

let passengerPaymentUnsubscribe = null;
let passengerPaymentRideId = "";
let passengerPaymentRecord = null;
let selectedDemoPaymentMethod = "";
let passengerPaymentSubmitting = false;
let paymentResultVisible = false;

function isPaymentPaid(status) {
  return ["paid", "completed", "success", "successful", "confirmed", "cash_collected", "collected", "received"].includes(String(status || "").toLowerCase());
}

function paymentStatusLabel(status) {
  return ({
    unpaid: "Unpaid", pending: "Payment Pending", paid: "Paid",
    processing: "Payment Pending", demo_paid: "Paid",
    demo_failed: "Payment Pending", cancelled: "Payment Pending",
    cash_pending: "Payment Pending", cash_collected: "Paid"
  })[String(status || "unpaid")] || "Unpaid";
}

function paymentMethodLabel(method) {
  return ({ cash: "Cash", easypaisa: "Easypaisa", jazzcash: "JazzCash", nayapay: "NayaPay" })[
    window.WowDemoPayment?.normalizeMethod(method)
  ] || "Not selected";
}

function updatePassengerDemoPayment(rideId, ride) {
  if (!window.WowDemoPayment || !rideId) return;
  passengerPaymentRideId = rideId;
  const fare = window.WowDemoPayment.fareOf(ride);
  const completed = ["completed", "ride_completed"].includes(String(ride.status || "").toLowerCase());
  document.getElementById("paymentCardRide").textContent = rideId;
  document.getElementById("paymentCardFare").textContent = fare ? `PKR ${fare.toFixed(0)}` : "PKR --";
  document.getElementById("demoRideId").textContent = rideId;
  document.getElementById("demoFare").textContent = fare ? `PKR ${fare.toFixed(0)}` : "PKR --";
  document.getElementById("demoPassengerName").textContent = ride.passengerName || ride.userName || "Passenger";
  const action = document.getElementById("openPaymentBtn");
  action.disabled = !completed;
  if (!completed) action.textContent = "Available after ride completion";
  if (passengerPaymentUnsubscribe) return;
  passengerPaymentUnsubscribe = window.WowDemoPayment.watch(rideId, (payment) => {
    passengerPaymentRecord = payment;
    const rideCompleted = ["completed", "ride_completed"].includes(String(currentRideDocument?.status || ride.status || "").toLowerCase());
    const status = payment?.paymentStatus || ride.paymentStatus || "unpaid";
    const method = payment?.paymentMethod || ride.paymentMethod;
    const paid = isPaymentPaid(status);
    if (currentRideDocument) currentRideDocument.paymentStatus = paid ? "paid" : "pending";
    document.getElementById("passengerPaymentBadge").textContent = paymentStatusLabel(status);
    document.getElementById("paymentCardMethod").textContent = paymentMethodLabel(method);
    document.getElementById("paymentCardNote").textContent =
      paid ? "Payment received successfully." :
      method === "cash" ? "Pay the final fare to your driver. You can still rate the ride after completion." :
      rideCompleted ? `Complete your ${paymentMethodLabel(method)} payment from this tab. You can still rate your driver now.` :
      "Payment will be available after the ride is complete.";
    action.disabled = paid || !rideCompleted || method === "cash";
    action.textContent = paid ? "Payment complete" : method === "cash" ? "Awaiting driver confirmation" : "Pay now";
    // A Firestore listener also receives the successful payment update. Keep
    // the receipt on screen instead of letting that listener close it again.
    if (paid && !paymentResultVisible) {
      document.getElementById("paymentOverlay").hidden = true;
      showRatingCardIfNeeded();
    }
  }, (error) => {
    console.error("[WOW Payment] listener failed", error);
    document.getElementById("paymentCardNote").textContent = "Unable to load payment status.";
  });
}

function setPaymentView(view) {
  document.getElementById("paymentEntryView").hidden = view !== "entry";
  document.getElementById("paymentProcessingView").hidden = view !== "processing";
  document.getElementById("paymentResultView").hidden = view !== "result";
}

function selectDemoMethod(method) {
  selectedDemoPaymentMethod = method;
  document.querySelectorAll("[data-payment-method]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.paymentMethod === method);
  });
  const cash = method === "cash";
  document.getElementById("onlinePaymentFields").hidden = cash;
  document.getElementById("payNowBtn").textContent = cash ? "Confirm Cash" : "Pay Now";
  document.getElementById("demoPaymentError").textContent = cash
    ? "Pay cash to the driver after completing the ride." : "";
}

function lockPaymentMethod(method) {
  document.querySelectorAll("[data-payment-method]").forEach((button) => {
    const selected = button.dataset.paymentMethod === method;
    button.hidden = !selected;
    button.disabled = !selected;
    button.classList.toggle("is-selected", selected);
  });
}

function syncPassengerPaymentGate(ride = currentRideDocument) {
  if (!ride || !["completed", "ride_completed"].includes(String(ride.status || "").toLowerCase())) return;
  const paid = isPaymentPaid(passengerPaymentRecord?.paymentStatus || ride.paymentStatus);
  if (paid && !paymentResultVisible) {
    if (currentRideDocument) currentRideDocument.paymentStatus = "paid";
    document.getElementById("paymentOverlay").hidden = true;
    showRatingCardIfNeeded();
    return;
  }
}

function showPaymentResult(payment) {
  paymentResultVisible = true;
  const failed = payment.attemptStatus === "failed";
  const icon = document.getElementById("paymentResultIcon");
  icon.textContent = failed ? "!" : "✓";
  icon.classList.toggle("failed", failed);
  document.getElementById("paymentResultTitle").textContent = failed ? "Payment Failed" : "Payment Successful";
  document.getElementById("paymentResultText").textContent = failed
    ? (payment.failureReason || "The payment was declined. Please retry or choose another method.")
    : "Payment completed successfully.";
  document.getElementById("paymentResultSummary").innerHTML = [
    ["Passenger", document.getElementById("demoPassengerName").textContent],
    ["Ride ID", passengerPaymentRideId],
    ["Fare", document.getElementById("demoFare").textContent],
    ["Method", paymentMethodLabel(payment.paymentMethod)],
    ["Transaction", payment.transactionId || "Not created"],
    ["Status", paymentStatusLabel(payment.paymentStatus)],
    ["Date & time", new Date().toLocaleString()]
  ].map(([key, value]) => `<div><span>${key}</span><strong>${String(value)}</strong></div>`).join("");
  document.getElementById("retryPaymentBtn").hidden = !failed;
  setPaymentView("result");
}

async function submitPassengerDemoPayment() {
  if (passengerPaymentSubmitting || !selectedDemoPaymentMethod) {
    document.getElementById("demoPaymentError").textContent = selectedDemoPaymentMethod ? "" : "Choose a payment method.";
    return;
  }
  const mobile = document.getElementById("demoMobile").value.trim();
  const pinInput = document.getElementById("demoPin");
  const pin = pinInput.value;
  document.getElementById("demoMobileError").textContent = "";
  document.getElementById("demoPinError").textContent = "";
  document.getElementById("demoPaymentError").textContent = "";
  if (selectedDemoPaymentMethod !== "cash") {
    if (!/^(?:\+92|92|0)3\d{9}$/.test(mobile)) {
      document.getElementById("demoMobileError").textContent = "Enter a valid Pakistani mobile number.";
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      document.getElementById("demoPinError").textContent = "Enter exactly 4 payment PIN digits.";
      return;
    }
  }
  passengerPaymentSubmitting = true;
  document.getElementById("payNowBtn").disabled = true;
  try {
    if (selectedDemoPaymentMethod === "cash") {
      await window.WowDemoPayment.selectCash(passengerPaymentRideId);
      document.getElementById("paymentOverlay").hidden = true;
      return;
    }
    setPaymentView("processing");
    const payment = await window.WowDemoPayment.payOnline(passengerPaymentRideId, selectedDemoPaymentMethod, pin);
    pinInput.value = "";
    showPaymentResult(payment);
  } catch (error) {
    pinInput.value = "";
    setPaymentView("entry");
    document.getElementById("demoPaymentError").textContent = error?.message || "Payment could not be processed.";
  } finally {
    passengerPaymentSubmitting = false;
    document.getElementById("payNowBtn").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openPaymentBtn")?.addEventListener("click", () => {
    paymentResultVisible = false;
    if (passengerPaymentRecord && isPaymentPaid(passengerPaymentRecord.paymentStatus)) return;
    selectedDemoPaymentMethod = window.WowDemoPayment?.normalizeMethod(passengerPaymentRecord?.paymentMethod || currentRideDocument?.paymentMethod);
    if (!["cash", "easypaisa", "jazzcash", "nayapay"].includes(selectedDemoPaymentMethod)) selectedDemoPaymentMethod = "";
    if (selectedDemoPaymentMethod === "cash") return;
    selectDemoMethod(selectedDemoPaymentMethod);
    if (selectedDemoPaymentMethod) lockPaymentMethod(selectedDemoPaymentMethod);
    setPaymentView("entry");
    document.getElementById("paymentOverlay").hidden = false;
  });
  document.querySelectorAll("[data-payment-method]").forEach((button) => button.addEventListener("click", () => selectDemoMethod(button.dataset.paymentMethod)));
  document.getElementById("payNowBtn")?.addEventListener("click", submitPassengerDemoPayment);
  document.getElementById("cancelPaymentBtn")?.addEventListener("click", () => { paymentResultVisible = false; document.getElementById("demoPin").value = ""; document.getElementById("paymentOverlay").hidden = true; });
  document.getElementById("backToRideBtn")?.addEventListener("click", () => { paymentResultVisible = false; document.getElementById("paymentOverlay").hidden = true; showRatingCardIfNeeded(); });
  document.getElementById("retryPaymentBtn")?.addEventListener("click", () => setPaymentView("entry"));
});

function listenToAcceptedDriver(db, driverId) {
  if (!db || !driverId || passengerDriverListenerId === driverId) return;
  if (passengerDriverUnsubscribe) {
    try { passengerDriverUnsubscribe(); } catch {}
  }
  passengerDriverListenerId = driverId;
  passengerDriverUnsubscribe = db.collection("drivers").doc(driverId).onSnapshot((doc) => {
    if (!doc.exists || passengerDriverListenerId !== driverId) return;
    const driver = doc.data() || {};
    const name = driver.name || driver.fullName;
    const phone = driver.phone || driver.phoneNumber;
    const photo = driver.profileImage || driver.profilePhoto || driver.photoUrl;
    if (name) localStorage.setItem("wow_ride_driver_name", String(name));
    if (phone) localStorage.setItem("wow_ride_driver_phone", String(phone));
    if (photo) localStorage.setItem("wow_ride_driver_photo", String(photo));
    cacheVerifiedVehicleDetails({
      driverVehicleType: driver.vehicleType,
      driverVehicleName: driver.vehicleName || driver.vehicleModel || driver.vehicle,
      driverVehicleNumber: driver.vehicleNumber || driver.numberPlate
    });
    setRideDetails();
  }, (error) => console.error("[WOW Passenger Ride] driver listener failed", error));
}

function driverOfferFromRide(ride) {
  if (!isNegotiationStatus(ride?.status)) return null;
  if (String(ride.latestOfferStatus || "").toLowerCase() !== "pending") return null;
  const driverId = String(ride.latestOfferId || ride.respondingDriverId || "").trim();
  const offeredFare = Number(ride.driverOffer || ride.acceptedFare || 0);
  if (!driverId || !Number.isFinite(offeredFare) || offeredFare <= 0) return null;
  return {
    id: driverId,
    rideId: passengerRideDocId,
    driverId,
    driverName: ride.respondingDriverName || "Driver",
    driverPhone: ride.respondingDriverPhone || "",
    driverProfileImage: ride.respondingDriverProfileImage || "",
    driverVehicleType: ride.respondingDriverVehicleType || "",
    driverVehicleName: ride.respondingDriverVehicleName || "",
    driverVehicleNumber: ride.respondingDriverVehicleNumber || "",
    vehicleType: ride.respondingDriverVehicleType || "",
    vehicleName: ride.respondingDriverVehicleName || "",
    vehicleNumber: ride.respondingDriverVehicleNumber || "",
    passengerOffer: Number(ride.passengerOffer || 0),
    passengerOfferFare: Number(ride.passengerOffer || 0),
    offeredFare,
    offerType: ride.latestOfferType || "counter_offer",
    status: "pending",
    createdAt: ride.driverResponseAt,
    expiresAt: ride.driverResponseExpiresAt
  };
}

function startRideStatusRefresh() {
  if (rideStatusTimer) clearInterval(rideStatusTimer);
  rideStatusTimer = setInterval(() => {
    refreshRideDetailsFromDb();
  }, 6000);
}

async function refreshRideDetailsFromDb() {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const query = new URLSearchParams({
    ride_code: rideCode,
    role: "passenger",
    email: localStorage.getItem("wow_user_email") || "",
    user_id: localStorage.getItem("wow_user_id") || ""
  });
  try {
    const res = await fetch(`${RIDE_API.details}?${query.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !data.ride) return;
    const ride = data.ride;
    const fare = Number(ride.fare || 0);
    if (fare > 0) localStorage.setItem("wow_ride_fare", String(fare));
    if (ride.pickup) localStorage.setItem("wow_ride_pickup", String(ride.pickup));
    if (ride.dropoff) localStorage.setItem("wow_ride_drop", String(ride.dropoff));
    if (ride.ride_code) localStorage.setItem("wow_ride_code", String(ride.ride_code));
    if (ride.id && !passengerRideDocId) {
      passengerRideDocId = String(ride.id || "");
      localStorage.setItem("wow_ride_db_id", passengerRideDocId);
    }
    if (ride.driver_name) localStorage.setItem("wow_ride_driver_name", String(ride.driver_name));
    if (ride.driver_phone) localStorage.setItem("wow_ride_driver_phone", String(ride.driver_phone));
    if (ride.vehicle_type) localStorage.setItem("wow_ride_vehicle", normalizeRideType(ride.vehicle_type));
    else if (ride.driver_vehicle_type) localStorage.setItem("wow_ride_vehicle", normalizeRideType(ride.driver_vehicle_type));
    if (ride.driver_vehicle_number) localStorage.setItem("wow_ride_vehicle_model", String(ride.driver_vehicle_number));
    if (ride.status && !currentRideDocument) renderRideState(ride.status, "php-fallback");
    setRideDetails();
    if (String(ride.status || "").toLowerCase() === "completed") {
      showRatingCardIfNeeded();
    }
  } catch {
    // Keep fallback local ride context if refresh fails.
  }
}

async function initPassengerDriverOfferListener() {
  try {
    if (!isNegotiationStatus()) {
      closeNegotiationUi({ unsubscribe: true });
      return;
    }
    if (!window.WowFirestore) return;
    if (passengerOfferUnsubscribe) {
      passengerOfferUnsubscribe();
      passengerOfferUnsubscribe = null;
    }
    const { db } = await window.WowFirestore.ready();
    const rideId = await resolvePassengerRideDocId(db);
    if (!rideId) return;
    passengerRideDocId = rideId;
    passengerOfferUnsubscribe = db.collection("rides").doc(rideId).collection("offers")
      .where("status", "==", "pending")
      .limit(30)
      .onSnapshot((snapshot) => {
        if (!isNegotiationStatus() || rideId !== passengerRideDocId) {
          closeNegotiationUi({ unsubscribe: true });
          return;
        }
        const offers = [];
        snapshot.forEach((doc) => {
          if (!rejectedOfferIds.has(doc.id)) offers.push({ id: doc.id, ...doc.data() });
        });
        offers.sort((a, b) => firestoreMillis(b.createdAt) - firestoreMillis(a.createdAt));
        if (offers.length && (!activeDriverOffer || activeDriverOffer.id === offers[0].id)) {
          showDriverOfferPopup(offers[0]);
        }
      });
  } catch (error) {
    console.error("[WOW Passenger] driver offer listener failed", error);
  }
}

async function resolvePassengerRideDocId(db) {
  const fromUrl = String(new URLSearchParams(window.location.search).get("rideId") || "").trim();
  return fromUrl;
}

function showDriverOfferPopup(offer) {
  if (!isNegotiationStatus() || (offer?.rideId && String(offer.rideId) !== String(passengerRideDocId))) return;
  activeDriverOffer = offer;
  const passengerOffer = Number(offer.passengerOfferFare || offer.passengerOfferPrice || localStorage.getItem("wow_ride_fare") || 0);
  const driverOffer = Number(offer.offeredFare || offer.driverOfferPrice || offer.offerPrice || passengerOffer || 0);
  setText("offerDriverName", offer.driverName || "Driver");
  const driverPhoto = document.getElementById("offerDriverPhoto");
  if (driverPhoto) {
    const photoUrl = String(offer.driverProfileImage || offer.driverPhotoURL || "").trim();
    driverPhoto.src = photoUrl || "images/logo.png";
    driverPhoto.alt = `${offer.driverName || "Driver"} profile photo`;
  }
  setText("offerDriverPhone", "Private in-app calling");
  setText("offerVehicleType", offer.driverVehicleType || offer.vehicleType || offer.driverVehicle || localStorage.getItem("wow_ride_vehicle") || "--");
  setText("offerVehicleNumber", offer.driverVehicleNumber || offer.vehicleNumber || "--");
  setText("offerDriverRating", offer.rating || offer.driverRating || "--");
  setText("offerPickupText", localStorage.getItem("wow_ride_pickup") || document.getElementById("passengerPickupText")?.textContent || "Pickup");
  setText("offerDropText", localStorage.getItem("wow_ride_drop") || document.getElementById("passengerDropText")?.textContent || "Drop-off");
  setText("offerPassengerPrice", `Rs. ${Math.round(passengerOffer).toLocaleString("en-PK")}`);
  const isCounter = offer.offerType === "counter_offer";
  const driverRow = document.getElementById("offerDriverPriceRow");
  if (driverRow) driverRow.style.display = isCounter ? "flex" : "none";
  setText("offerDriverPrice", `Rs. ${Math.round(driverOffer).toLocaleString("en-PK")}`);
  setText("driverOfferNote", "");
  toggleDriverOfferModal(true);
  const explicitExpiryMs = firestoreMillis(offer.expiresAt);
  const createdMs = firestoreMillis(offer.createdAt);
  const expiresMs = explicitExpiryMs || (createdMs
    ? createdMs + OFFER_RESPONSE_WINDOW_MS
    : (Date.now() + OFFER_RESPONSE_WINDOW_MS));
  startOfferCountdown(Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)));
}

function startOfferCountdown(seconds) {
  stopOfferCountdown();
  let remaining = seconds;
  setText("offerCountdown", String(remaining));
  offerCountdownTimer = setInterval(() => {
    remaining -= 1;
    setText("offerCountdown", String(Math.max(0, remaining)));
    if (remaining <= 0) expireActiveDriverOffer();
  }, 1000);
}

function stopOfferCountdown() {
  if (offerCountdownTimer) {
    clearInterval(offerCountdownTimer);
    offerCountdownTimer = null;
  }
}

async function expireActiveDriverOffer() {
  const offer = activeDriverOffer;
  if (!offer) return;
  stopOfferCountdown();
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    const offerRef = db.collection("rides").doc(passengerRideDocId).collection("offers").doc(offer.id);
    let expired = false;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(offerRef);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      const explicitExpiryMs = firestoreMillis(current.expiresAt);
      const createdMs = firestoreMillis(current.createdAt);
      const expiresMs = explicitExpiryMs || (createdMs
        ? createdMs + OFFER_RESPONSE_WINDOW_MS
        : (Date.now() + OFFER_RESPONSE_WINDOW_MS));
      if (current.status !== "pending" || expiresMs > Date.now()) return;
      transaction.set(offerRef, {
        status: "expired",
        expiredAt: FieldValue.serverTimestamp()
      }, { merge: true });
      expired = true;
    });
    if (!expired) return;
  } catch (error) {
    console.error("[WOW Passenger] offer expiry update failed", error);
    setText("driverOfferNote", "The offer expired, but its server status could not be updated.");
  }
  rejectedOfferIds.add(offer.id);
  activeDriverOffer = null;
  toggleDriverOfferModal(false);
}

async function acceptActiveDriverOffer() {
  const offer = activeDriverOffer;
  if (!offer || !passengerRideDocId) return;
  if (acceptActiveDriverOffer.inProgress) return;
  acceptActiveDriverOffer.inProgress = true;
  setDriverOfferButtonsBusy(true);
  console.info("[WOW Passenger] offer accept started", { rideId: passengerRideDocId, offerId: offer.id, driverId: offer.driverId });
  try {
    const { db, uid, FieldValue } = await window.WowFirestore.ready();
    const finalFare = Number(offer.offeredFare || offer.driverOfferPrice || offer.offerPrice || offer.passengerOfferFare || localStorage.getItem("wow_ride_fare") || 0);
    const rideRef = db.collection("rides").doc(passengerRideDocId);
    const offerRef = rideRef.collection("offers").doc(offer.id);
    const driverId = String(offer.driverId || offer.id || "");
    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);
      const offerSnap = await transaction.get(offerRef);
      if (!rideSnap.exists || !offerSnap.exists) throw new Error("missing");
      const ride = rideSnap.data() || {};
      const selected = offerSnap.data() || {};
      const requestStatus = normalizeRideStatus(ride.requestStatus);
      if (String(ride.passengerId || ride.passengerUid || "") !== String(uid || "")) throw new Error("not_owner");
      if (ride.assignedDriverId || ride.acceptedDriverId) throw new Error("already_selected");
      if (!isNegotiationStatus(ride.status)
        || (requestStatus && !["open", "pending", "awaiting_passenger_response"].includes(requestStatus))) throw new Error("not_searching");
      if (selected.status !== "pending") throw new Error("offer_closed");
      if (String(selected.driverId || "") !== driverId) throw new Error("offer_driver_mismatch");
      const explicitExpiryMs = firestoreMillis(selected.expiresAt);
      const createdMs = firestoreMillis(selected.createdAt);
      const expiresMs = explicitExpiryMs || (createdMs
        ? createdMs + OFFER_RESPONSE_WINDOW_MS
        : (Date.now() + OFFER_RESPONSE_WINDOW_MS));
      if (expiresMs <= Date.now()) throw new Error("offer_expired");
      transaction.set(rideRef, {
        status: "driver_assigned",
        requestStatus: "matched",
        assignedDriverId: driverId,
        driverId,
        driverUid: driverId,
        driverName: offer.driverName || "Driver",
        driverPhone: offer.driverPhone || "",
        driverProfileImage: offer.driverProfileImage || "",
        driverRating: Number(offer.driverRating || 0),
        vehicleType: offer.vehicleType || ride.vehicleType || "",
        vehicleName: offer.vehicleName || "",
        vehicleNumber: offer.vehicleNumber || "",
        finalFare,
        acceptedFare: finalFare,
        fareUpdatedFrom: "passenger_website",
        lastUpdatedFrom: "passenger_website",
        acceptedOfferId: offer.id,
        passengerDecision: "accepted",
        driverDecision: "accepted",
        matchedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(offerRef, {
        status: "accepted",
        passengerAccepted: true,
        driverAccepted: true,
        passengerRespondedAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
    console.info("[WOW Passenger] offer accept committed", { rideId: passengerRideDocId, offerId: offer.id, driverId });
    stopOfferCountdown();
    localStorage.setItem("wow_ride_status", "driver_assigned");
    renderRideState("driver_assigned", "local-accept");
    localStorage.setItem("wow_ride_driver_name", offer.driverName || "Driver");
    localStorage.setItem("wow_ride_driver_phone", offer.driverPhone || "");
    localStorage.setItem("wow_ride_fare", String(finalFare));
    const offeredDriverVehicle = window.WowVehicle?.driverVehicle(offer) || { type: "", name: "", number: "" };
    if (offeredDriverVehicle.type) localStorage.setItem("wow_ride_driver_vehicle_type", offeredDriverVehicle.type);
    if (offeredDriverVehicle.name) localStorage.setItem("wow_ride_driver_vehicle_name", offeredDriverVehicle.name);
    if (offeredDriverVehicle.number) localStorage.setItem("wow_ride_driver_vehicle_number", offeredDriverVehicle.number);
    closeNegotiationUi({ unsubscribe: true });
    syncAcceptedRideToPhp(offer, finalFare, "driver_assigned");
    window.location.assign(`passenger-ride.html?rideId=${encodeURIComponent(passengerRideDocId)}`);
  } catch (error) {
    console.error("[WOW Passenger] offer acceptance failed", error);
    const code = String(error?.message || "");
    const message = ["offer_expired", "offer_closed", "driver_unavailable"].includes(code)
      ? "This offer is no longer available."
      : ["already_selected", "not_searching"].includes(code)
        ? "A driver has already been selected for this ride."
        : code === "not_owner"
          ? "You are not authorized to accept this ride."
          : "Unable to accept this driver. Please try again.";
    setText("driverOfferNote", message);
    setDriverOfferButtonsBusy(false);
  } finally {
    acceptActiveDriverOffer.inProgress = false;
  }
}

async function rejectActiveDriverOffer() {
  const offer = activeDriverOffer;
  if (!offer || !passengerRideDocId) return;
  stopOfferCountdown();
  setDriverOfferButtonsBusy(true);
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    await db.collection("rides").doc(passengerRideDocId).collection("offers").doc(offer.id).set({
      status: "declined",
      passengerRespondedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("[WOW Passenger] offer decline failed", error);
    setText("driverOfferNote", "Unable to decline this offer. Please try again.");
    setDriverOfferButtonsBusy(false);
    return;
  }
  rejectedOfferIds.add(offer.id);
  activeDriverOffer = null;
  toggleDriverOfferModal(false);
  setDriverOfferButtonsBusy(false);
}

async function cancelActiveRideRequest() {
  stopOfferCountdown();
  setDriverOfferButtonsBusy(true);
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    if (passengerRideDocId) {
      await db.collection("rides").doc(passengerRideDocId).set({
        status: "cancelled",
        requestStatus: "closed",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    console.error("[WOW Passenger] ride cancellation update failed", error);
    setText("driverOfferNote", "Unable to cancel this request. Please try again.");
    setDriverOfferButtonsBusy(false);
    return;
  }
  await cancelPassengerRide();
}

async function syncAcceptedRideToPhp(offer, fare, status = "driver_selected") {
  const rideCode = currentRideCode();
  if (!rideCode) return;
  try {
    await fetch(RIDE_API.update, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_code: rideCode,
        ride_id: passengerRideDocId,
        status,
        fare,
        offered_fare: fare,
        driver_id: offer.driverId || "",
        driver_uid: offer.driverId || "",
        driver_name: offer.driverName || "",
        driver_phone: offer.driverPhone || "",
        role: "driver"
      })
    });
  } catch {}
}

function toggleDriverOfferModal(open) {
  const overlay = document.getElementById("driverOfferOverlay");
  const modal = document.getElementById("driverOfferModal");
  if (!overlay || !modal) return;
  overlay.classList.toggle("is-open", open);
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  setDriverOfferButtonsBusy(false);
}

function setDriverOfferButtonsBusy(busy) {
  ["acceptDriverOfferBtn", "rejectDriverOfferBtn", "cancelDriverRequestBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = busy;
  });
  const accept = document.getElementById("acceptDriverOfferBtn");
  if (accept) accept.innerHTML = busy
    ? '<span class="accept-spinner" aria-hidden="true"></span>Accepting...'
    : "Accept Driver";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function firestoreMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRideType(type) {
  return window.WowVehicle?.label(type) || "Vehicle information unavailable";
}

function cacheVerifiedVehicleDetails(ride) {
  if (!ride || typeof ride !== "object" || !window.WowVehicle) return;
  const requested = window.WowVehicle.requestedType(ride);
  const assigned = window.WowVehicle.driverVehicle({
    driverVehicleType: ride.driverVehicleType || ride.acceptedDriverVehicle,
    driverVehicleName: ride.driverVehicleName || ride.vehicleName,
    driverVehicleNumber: ride.driverVehicleNumber || ride.vehicleNumber,
    vehicleInfo: ride.vehicleInfo
  });
  if (requested) localStorage.setItem("wow_ride_requested_vehicle", requested);
  if (assigned.type) localStorage.setItem("wow_ride_driver_vehicle_type", assigned.type);
  if (assigned.name) localStorage.setItem("wow_ride_driver_vehicle_name", assigned.name);
  if (assigned.number) localStorage.setItem("wow_ride_driver_vehicle_number", assigned.number);
}

function clearActiveVehicleCache() {
  ["wow_ride_requested_vehicle", "wow_ride_driver_vehicle_type", "wow_ride_driver_vehicle_name", "wow_ride_driver_vehicle_number"]
    .forEach((key) => localStorage.removeItem(key));
}

async function calculateRideRoute() {
  if (!rideMap || !window.WowMapbox) return;
  const endpoints = routeEndpoints();
  const origin = await resolveRidePoint(endpoints.origin);
  const destination = await resolveRidePoint(endpoints.destination);
  ridePath = [];
  rideBounds = [origin, destination];
  WowMapbox.clearRoute(rideMap, "passenger-ride-route");
  createStaticMarkers(rideMap, origin, destination);
  WowMapbox.fitMap(rideMap, [origin, destination], 48);
  if (rideMapFull) {
    WowMapbox.clearRoute(rideMapFull, "passenger-ride-route-full");
    createStaticMarkers(rideMapFull, origin, destination);
    WowMapbox.fitMap(rideMapFull, [origin, destination], 56);
  }
  startRideTracking();
}

function createStaticMarkers(map, pickup, drop) {
  if (!map || !window.WowMapbox) return;
  const markers = passengerStaticMarkersByMap.get(map) || { pickup: null, drop: null };
  if (pickup) {
    if (!markers.pickup) {
      markers.pickup = WowMapbox.createLabelMarker(map, pickup, "#25c38b", "P", {
        size: 24,
        title: "Pickup location",
        popupText: localStorage.getItem("wow_ride_pickup") || "Pickup location"
      });
    } else WowMapbox.setMarkerPoint(markers.pickup, pickup);
  }
  if (drop) {
    if (!markers.drop) {
      markers.drop = WowMapbox.createLabelMarker(map, drop, "#ff4d4d", "D", {
        size: 24,
        title: "Destination",
        popupText: localStorage.getItem("wow_ride_drop") || "Destination"
      });
    } else WowMapbox.setMarkerPoint(markers.drop, drop);
  }
  passengerStaticMarkersByMap.set(map, markers);
  if (map === rideMap) {
    pickupMarker = markers.pickup;
    dropMarker = markers.drop;
  }
}

function cleanupPassengerRidePage() {
  window.WowRideCall?.stop();
  passengerCallReady = false;
  if (rideStatusTimer) clearInterval(rideStatusTimer);
  if (rideTicker) clearInterval(rideTicker);
  if (offerCountdownTimer) clearInterval(offerCountdownTimer);
  if (chatPollTimer) clearInterval(chatPollTimer);
  if (callInterval) clearInterval(callInterval);
  if (passengerOfferUnsubscribe) {
    try { passengerOfferUnsubscribe(); } catch {}
    passengerOfferUnsubscribe = null;
  }
  if (passengerRideUnsubscribe) {
    try { passengerRideUnsubscribe(); } catch {}
    passengerRideUnsubscribe = null;
  }
  if (passengerDriverUnsubscribe) {
    try { passengerDriverUnsubscribe(); } catch {}
    passengerDriverUnsubscribe = null;
    passengerDriverListenerId = "";
  }
  if (passengerChatUnsubscribe) {
    try { passengerChatUnsubscribe(); } catch {}
    passengerChatUnsubscribe = null;
  }
  if (realtimeUnsubscribe) {
    try { realtimeUnsubscribe(); } catch {}
    realtimeUnsubscribe = null;
  }
  if (passengerLiveTracker) {
    passengerLiveTracker.detachMap?.("passenger-full");
    passengerLiveTracker.stop();
    passengerLiveTracker = null;
  }
}

function startRideTracking() {
  initPassengerLiveTracking();
}

async function initPassengerLiveTracking() {
  if (passengerLiveTracker || !window.WowLiveTracking || !window.WowFirestore || !rideMap) return;
  try {
    const { db } = await window.WowFirestore.ready();
    const rideId = passengerRideDocId;
    if (!rideId) {
      setText("passengerTrackingStatus", "Waiting for a valid ride to start live tracking.");
      return;
    }
    passengerRideDocId = rideId;
    localStorage.setItem("wow_ride_db_id", rideId);
    passengerLiveTracker = await WowLiveTracking.start({
      role: "passenger",
      rideId,
      getMap: () => rideMap,
      getDestination: (ride) => ({
        latitude: ACTIVE_STATUSES.has(normalizeRideStatus(ride?.status))
          ? (ride?.destinationLatitude ?? ride?.dropoffLatitude ?? ride?.dropLat ?? readSavedLatLng("drop")?.lat)
          : (ride?.pickupLatitude ?? ride?.pickupLat ?? readSavedLatLng("pickup")?.lat),
        longitude: ACTIVE_STATUSES.has(normalizeRideStatus(ride?.status))
          ? (ride?.destinationLongitude ?? ride?.dropoffLongitude ?? ride?.dropLng ?? readSavedLatLng("drop")?.lng)
          : (ride?.pickupLongitude ?? ride?.pickupLng ?? readSavedLatLng("pickup")?.lng)
      }),
      onStatus: (message) => setText("passengerTrackingStatus", message),
      onPeerState: (message, stale) => {
        const node = document.getElementById("passengerPeerStatus");
        if (node) { node.textContent = message; node.classList.toggle("error", Boolean(stale)); }
      },
      onLocation: (role) => {
        if (role !== "driver") return;
        setText("passengerPeerStatus", "Driver and your live location are visible on the map.");
      },
      onFollowChange: (enabled) => syncPassengerFollowButtons(enabled),
      onRoute: ({ distanceKm, etaMinutes }) => {
        setText("passengerDistance", `${distanceKm.toFixed(1)} km`);
        setText("passengerEta", `${etaMinutes} min`);
        liveInitialDistanceKm = Math.max(liveInitialDistanceKm, distanceKm);
        const progress = liveInitialDistanceKm > 0
          ? Math.max(0, Math.min(100, Math.round((1 - (distanceKm / liveInitialDistanceKm)) * 100)))
          : 0;
        const progressBar = document.getElementById("passengerProgress");
        if (progressBar) progressBar.style.width = `${progress}%`;
      },
      onRouteError: () => {
        setText("passengerDistance", "Route unavailable");
        setText("passengerEta", "--");
      },
      onRideStatus: (status) => {
        renderRideState(status, "live-tracking");
        const nextPhase = ACTIVE_STATUSES.has(normalizeRideStatus(status)) ? "trip" : "pickup";
        if (nextPhase !== liveRoutePhase) {
          liveRoutePhase = nextPhase;
          liveInitialDistanceKm = 0;
          const progressBar = document.getElementById("passengerProgress");
          if (progressBar) progressBar.style.width = "0%";
        }
        if (status === "completed") showRatingCardIfNeeded();
        if (status === "cancelled") {
          setText("passengerTrackingStatus", "This ride was cancelled.");
        }
      }
    });
    const recenter = document.getElementById("passengerTrackingRecenter");
    if (recenter && !recenter.dataset.bound) {
      recenter.dataset.bound = "1";
      recenter.addEventListener("click", () => {
        passengerLiveTracker?.setFollow?.(true);
        passengerLiveTracker?.recenter();
      });
    }
    const follow = document.getElementById("passengerTrackingFollow");
    if (follow && !follow.dataset.bound) {
      follow.dataset.bound = "1";
      follow.addEventListener("click", () => {
        passengerLiveTracker?.setFollow?.(true);
        passengerLiveTracker?.recenter();
      });
    }
    if (rideMapFull) passengerLiveTracker.attachMap?.("passenger-full", rideMapFull, { routeLayerId: "passenger-ride-route-full" });
  } catch (error) {
    setText("passengerTrackingStatus", error?.message || "Live tracking could not start.");
  }
}

function syncPassengerFollowButtons(enabled) {
  ["passengerTrackingFollow", "passengerMapFollow"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.classList.toggle("is-active", Boolean(enabled));
    button.setAttribute("aria-pressed", String(Boolean(enabled)));
    button.textContent = enabled ? "Following" : "Follow";
  });
}

async function openPassengerExpandedMap() {
  const overlay = document.getElementById("passengerMapOverlay");
  const modal = document.getElementById("passengerMapModal");
  const mapEl = document.getElementById("passengerRideMapFull");
  if (!overlay || !modal || !mapEl || !window.WowMapbox) return;
  overlay.classList.add("is-open");
  modal.classList.add("is-open");
  overlay.removeAttribute("hidden");
  modal.removeAttribute("hidden");
  if (!rideMapFull) {
    const endpoints = routeEndpoints();
    const center = endpoints.origin || endpoints.destination || WowMapbox.center;
    rideMapFull = WowMapbox.createMap(mapEl, { center, zoom: 13 });
  }
  window.setTimeout(() => rideMapFull?.resize?.(), 80);
  const endpoints = routeEndpoints();
  const origin = endpoints.origin ? await resolveRidePoint(endpoints.origin) : null;
  const destination = endpoints.destination ? await resolveRidePoint(endpoints.destination) : null;
  if (origin && destination) {
    createStaticMarkers(rideMapFull, origin, destination);
    WowMapbox.fitMap(rideMapFull, [origin, destination], 64);
  }
  if (!passengerLiveTracker) await initPassengerLiveTracking();
  passengerLiveTracker?.attachMap?.("passenger-full", rideMapFull, { routeLayerId: "passenger-ride-route-full" });
  passengerLiveTracker?.setFollow?.(true, "passenger-full");
}

function closePassengerExpandedMap() {
  const overlay = document.getElementById("passengerMapOverlay");
  const modal = document.getElementById("passengerMapModal");
  passengerLiveTracker?.detachMap?.("passenger-full");
  overlay?.classList.remove("is-open");
  modal?.classList.remove("is-open");
  if (overlay) overlay.hidden = true;
  if (modal) modal.hidden = true;
}

async function resolveRidePoint(value) {
  const direct = WowMapbox.normalizePoint(value);
  if (direct) return direct;
  const places = await WowMapbox.geocode(String(value || "Karachi"), 1);
  return places[0] ? { lat: places[0].lat, lng: places[0].lng } : WowMapbox.pointFromText(String(value || "Karachi"));
}

function updateRideStats() {
  if (!rideTotalDistance || !ridePath.length) return;
  const progress = Math.min(1, rideStep / (ridePath.length - 1));
  const remainingDistance = Math.max(0, rideTotalDistance * (1 - progress));
  const remainingMinutes = Math.max(1, Math.round((rideTotalDuration * (1 - progress)) / 60));

  document.getElementById("passengerDistance").textContent = `${(remainingDistance / 1000).toFixed(1)} km`;
  document.getElementById("passengerEta").textContent = `${remainingMinutes} min`;
  document.getElementById("passengerProgress").style.width = `${Math.round(progress * 100)}%`;
}

function bindPassengerActions() {
  const chatBtn = document.getElementById("passengerChat");
  const callBtn = document.getElementById("passengerCall");
  const helpBtn = document.getElementById("passengerHelp");
  const cancelBtn = document.getElementById("passengerCancelRide");
  const keepRideBtn = document.getElementById("keepRideBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const sosBtn = document.getElementById("passengerSosBtn");
  const closeSosBtn = document.getElementById("closeSos");
  const activateSosBtn = document.getElementById("activateSosBtn");
  const saveContactBtn = document.getElementById("saveContactBtn");
  const acceptOfferBtn = document.getElementById("acceptDriverOfferBtn");
  const rejectOfferBtn = document.getElementById("rejectDriverOfferBtn");
  const cancelRequestBtn = document.getElementById("cancelDriverRequestBtn");
  const mapExpandBtn = document.getElementById("passengerMapExpand");
  const mapCloseBtn = document.getElementById("passengerMapClose");
  const mapOverlay = document.getElementById("passengerMapOverlay");
  const mapRecenterBtn = document.getElementById("passengerMapRecenter");
  const mapFollowBtn = document.getElementById("passengerMapFollow");

  document.getElementById("ridePanelTabs")?.addEventListener("click", event => {
    const button = event.target.closest("[data-ride-panel]");
    if (button) applyRequestedRidePanel(button.dataset.ridePanel, true);
  });

  if (chatBtn) chatBtn.addEventListener("click", () => {
    if (!hasAssignedDriver()) {
      setText("passengerTrackingStatus", "Chat will be available once a driver accepts your ride.");
      return;
    }
    toggleChatPanel(true);
  });
  if (callBtn) callBtn.addEventListener("click", () => {
    if (!hasAssignedDriver()) {
      setText("passengerTrackingStatus", "Calling will be available once a driver accepts your ride.");
      return;
    }
    toggleCallPanel(true);
  });
  if (helpBtn) helpBtn.addEventListener("click", () => location.href = "help.html");
  if (cancelBtn) cancelBtn.addEventListener("click", () => toggleCancelModal(true));
  if (keepRideBtn) keepRideBtn.addEventListener("click", () => toggleCancelModal(false));
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", cancelPassengerRide);
  }

  if (sosBtn) sosBtn.addEventListener("click", () => {
    if (!hasActiveRideContext()) return alert("SOS becomes active after your ride has started.");
    toggleSosPanel(true);
  });
  if (closeSosBtn) closeSosBtn.addEventListener("click", () => toggleSosPanel(false));
  if (activateSosBtn) activateSosBtn.addEventListener("click", activateSos);
  if (saveContactBtn) saveContactBtn.addEventListener("click", saveEmergencyContact);
  if (acceptOfferBtn) acceptOfferBtn.addEventListener("click", acceptActiveDriverOffer);
  if (rejectOfferBtn) rejectOfferBtn.addEventListener("click", rejectActiveDriverOffer);
  if (cancelRequestBtn) cancelRequestBtn.addEventListener("click", cancelActiveRideRequest);
  if (mapExpandBtn) mapExpandBtn.addEventListener("click", openPassengerExpandedMap);
  if (mapCloseBtn) mapCloseBtn.addEventListener("click", closePassengerExpandedMap);
  if (mapOverlay) mapOverlay.addEventListener("click", closePassengerExpandedMap);
  if (mapRecenterBtn) mapRecenterBtn.addEventListener("click", () => {
    passengerLiveTracker?.setFollow?.(true, "passenger-full");
    passengerLiveTracker?.recenter?.("passenger-full");
  });
  if (mapFollowBtn) mapFollowBtn.addEventListener("click", () => {
    passengerLiveTracker?.setFollow?.(true, "passenger-full");
    passengerLiveTracker?.recenter?.("passenger-full");
  });

  document.getElementById("cancelOverlay").addEventListener("click", () => toggleCancelModal(false));
  document.getElementById("sosOverlay").addEventListener("click", () => toggleSosPanel(false));
  document.getElementById("closeChat").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("chatOverlay").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("closeCall").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("callOverlay").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("endCallBtn").addEventListener("click", () => { window.WowRideCall?.end().catch(() => {}); toggleCallPanel(false); });
  document.getElementById("answerCallBtn")?.addEventListener("click", async () => { try { showPassengerCallState("connecting"); await WowRideCall.answer(); } catch (e) { alert(e.message); } });
  document.getElementById("declineCallBtn")?.addEventListener("click", () => { WowRideCall.decline().catch(() => {}); toggleCallPanel(false); });
  document.getElementById("muteCallBtn")?.addEventListener("click", () => { passengerCallMuted=!passengerCallMuted;WowRideCall.mute(passengerCallMuted);const button=document.getElementById("muteCallBtn");button?.setAttribute("aria-pressed",String(passengerCallMuted));const label=button?.querySelector("span:last-child");if(label)label.textContent=passengerCallMuted?"Unmute":"Mute"; });
  document.getElementById("speakerCallBtn")?.addEventListener("click", () => { const button=document.getElementById("speakerCallBtn");const enabled=button?.getAttribute("aria-pressed")!=="true";WowRideCall.speaker(enabled);button?.setAttribute("aria-pressed",String(enabled)); });

  document.getElementById("sendChat").addEventListener("click", sendChatMessage);
  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
  });
  document.getElementById("chatInput").addEventListener("input", () => {
    if (passengerRideDocId && window.WowRideChat) {
      WowRideChat.typing(passengerRideDocId, Boolean(document.getElementById("chatInput").value.trim())).catch(() => {});
    }
  });

  const emojiBtn = document.getElementById("emojiBtn");
  if (emojiBtn) {
    emojiBtn.addEventListener("click", () => {
      const input = document.getElementById("chatInput");
      input.value = `${input.value} 😊`.trim();
      input.focus();
    });
  }

  document.querySelectorAll(".quick-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("chatInput");
      input.value = btn.textContent;
      sendChatMessage();
    });
  });
}

async function cancelPassengerRide() {
  const btn = document.getElementById("confirmCancelBtn");
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) {
    toggleCancelModal(false);
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Cancelling...";
  }
  try {
    const res = await fetch(RIDE_API.update, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_code: rideCode,
        status: "cancelled",
        role: "passenger",
        email: localStorage.getItem("wow_user_email") || "",
        user_id: Number(localStorage.getItem("wow_user_id") || 0)
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.ok) {
      throw new Error("cancel_failed");
    }
    localStorage.setItem("wow_ride_status", "cancelled");
    if (window.WowRealtime && typeof window.WowRealtime.publish === "function") {
      window.WowRealtime.publish("ride.status", {
        rideCode,
        status: "cancelled"
      });
    }
    toggleCancelModal(false);
    window.location.href = "dashboard.html";
    return;
  } catch {
    alert("Unable to cancel ride right now. Please try again.");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Yes, Cancel";
  }
}

function toggleCancelModal(open) {
  const overlay = document.getElementById("cancelOverlay");
  const modal = document.getElementById("cancelModal");
  if (open) {
    overlay.classList.add("is-open");
    modal.classList.add("is-open");
  } else {
    overlay.classList.remove("is-open");
    modal.classList.remove("is-open");
  }
}

function toggleSosPanel(open) {
  const overlay = document.getElementById("sosOverlay");
  const panel = document.getElementById("sosPanel");
  if (open) {
    cancelSosCountdown(false);
    const headline = document.getElementById("sosHeadline");
    const subtext = document.getElementById("sosSubtext");
    const button = document.getElementById("activateSosBtn");
    headline.textContent = "Emergency SOS";
    subtext.textContent = "Press the SOS button to alert authorities and emergency contacts.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    button.dataset.pending = "0";
    button.disabled = false;
    ensureSosCancelButton();
    loadEmergencyContacts();
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
  } else {
    cancelSosCountdown(false);
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }
}

async function activateSos() {
  const button = document.getElementById("activateSosBtn");
  const headline = document.getElementById("sosHeadline");
  const subtext = document.getElementById("sosSubtext");
  if (sosSending) return;
  if (button.dataset.pending === "1" && sosCountdownLeft === 0) {
    sendPassengerSosAlert();
    return;
  }
  if (button.dataset.pending === "1") return;
  if (!hasActiveRideContext()) {
    headline.textContent = "SOS unavailable";
    subtext.textContent = "SOS is available during active ride only.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    return;
  }
  startSosCountdown();
}

function ensureSosCancelButton() {
  if (document.getElementById("cancelSosCountdownBtn")) return;
  const button = document.getElementById("activateSosBtn");
  if (!button || !button.parentElement) return;
  const cancel = document.createElement("button");
  cancel.id = "cancelSosCountdownBtn";
  cancel.type = "button";
  cancel.className = "activate-sos-btn sos-cancel-countdown";
  cancel.textContent = "Cancel SOS";
  cancel.hidden = true;
  cancel.addEventListener("click", () => cancelSosCountdown(true));
  button.insertAdjacentElement("afterend", cancel);
}

function startSosCountdown() {
  const button = document.getElementById("activateSosBtn");
  const cancel = document.getElementById("cancelSosCountdownBtn");
  const headline = document.getElementById("sosHeadline");
  const subtext = document.getElementById("sosSubtext");
  button.dataset.pending = "1";
  button.classList.remove("blink");
  button.disabled = true;
  if (cancel) cancel.hidden = false;
  sosCountdownLeft = 3;
  headline.textContent = "Confirm SOS in 3 seconds";
  subtext.textContent = "After the countdown, press Confirm SOS to send the alert to the admin safety team.";
  button.textContent = "Wait 3...";
  sosCountdownTimer = setInterval(() => {
    sosCountdownLeft -= 1;
    if (sosCountdownLeft <= 0) {
      clearInterval(sosCountdownTimer);
      sosCountdownTimer = null;
      button.disabled = false;
      button.textContent = "Confirm SOS";
      headline.textContent = "Final confirmation required";
      return;
    }
    headline.textContent = "Confirm SOS in " + sosCountdownLeft + " seconds";
    button.textContent = "Wait " + sosCountdownLeft + "...";
  }, 1000);
}

function cancelSosCountdown(showMessage) {
  if (sosCountdownTimer) clearInterval(sosCountdownTimer);
  sosCountdownTimer = null;
  sosCountdownLeft = 0;
  const button = document.getElementById("activateSosBtn");
  const cancel = document.getElementById("cancelSosCountdownBtn");
  const headline = document.getElementById("sosHeadline");
  const subtext = document.getElementById("sosSubtext");
  if (button) {
    button.dataset.pending = "0";
    button.disabled = false;
    button.textContent = "Activate SOS";
    button.classList.add("blink");
  }
  if (cancel) cancel.hidden = true;
  if (showMessage && headline && subtext) {
    headline.textContent = "SOS cancelled";
    subtext.textContent = "No emergency alert was sent.";
  }
}

async function sendPassengerSosAlert() {
  const button = document.getElementById("activateSosBtn");
  const cancel = document.getElementById("cancelSosCountdownBtn");
  const headline = document.getElementById("sosHeadline");
  const subtext = document.getElementById("sosSubtext");
  sosSending = true;
  button.dataset.pending = "1";
  headline.textContent = "Sending alert...";
  subtext.textContent = "Getting live location and sending to Firebase...";
  if (cancel) cancel.hidden = true;
  // An SOS must never wait several seconds for a new GPS fix. Use the latest
  // ride/live-tracking position immediately and let fresh browser GPS win when
  // it is available quickly. The server also resolves the liveLocations record.
  const location = await Promise.race([
    currentLocationPayload(),
    new Promise((resolve) => setTimeout(() => resolve(cachedSosLocationPayload()), 700))
  ]);
  const payload = {
    ...currentUserPayload(),
    ride_id: passengerRideDocId || localStorage.getItem("wow_ride_db_id") || localStorage.getItem("wow_ride_code") || "",
    ride_code: localStorage.getItem("wow_ride_code") || "",
    driver_id: localStorage.getItem("wow_ride_driver_id") || "",
    driver_name: localStorage.getItem("wow_ride_driver_name") || "",
    passenger_name: localStorage.getItem("wow_user_name") || "",
    passenger_phone: localStorage.getItem("wow_user_phone") || "",
    location: location.text,
    current_location_text: location.text,
    lat: location.lat,
    lng: location.lng,
    pickup: localStorage.getItem("wow_ride_pickup") || "",
    drop: localStorage.getItem("wow_ride_drop") || ""
  };

  let sentOk = false;
  for (let attempt = 0; attempt < 2 && !sentOk; attempt += 1) try {
    const res = await fetch(SOS_API.sendSos, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error("send_failed");
    sentOk = true;
  } catch (error) {
    console.warn("[WOW Passenger SOS] send attempt failed", { attempt: attempt + 1, message: error?.message || "request_failed" });
  }

  if (!sentOk) {
    headline.textContent = "Unable to send SOS";
    subtext.textContent = "Please try again in a moment.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    button.dataset.pending = "0";
    button.disabled = false;
    sosSending = false;
    return;
  }

  headline.textContent = "Alert Sent Successfully";
  subtext.textContent = location.denied
    ? "Location permission denied. The admin received the alert with the ride's last known location."
    : "Emergency alert shared with the Women on Wheels admin safety team.";
  button.textContent = "Alert Sent Successfully";
  button.classList.remove("blink");
  button.dataset.pending = "0";
  button.disabled = true;
  sosSending = false;
}

async function loadEmergencyContacts() {
  const list = document.getElementById("sosContactList");
  if (!list) return;
  list.innerHTML = '<div class="sos-contact-empty">Loading contacts...</div>';
  try {
    const query = new URLSearchParams(currentUserPayload()).toString();
    const res = await fetch(`${SOS_API.getContacts}?${query}`);
    const data = await res.json();
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    emergencyContactsCache = contacts;
    if (!contacts.length) {
      list.innerHTML = '<div class="sos-contact-empty">No emergency contacts added yet.</div>';
      return;
    }
    list.innerHTML = "";
    contacts.forEach((c) => {
      const row = document.createElement("div");
      row.className = "sos-contact-item";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(c.name || "Contact")}</strong>
          <span>${escapeHtml(c.phone_number || "")}</span>
        </div>
        <button type="button" data-id="${Number(c.id) || 0}">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => deleteEmergencyContact(Number(c.id) || 0));
      list.appendChild(row);
    });
  } catch {
    emergencyContactsCache = [];
    list.innerHTML = '<div class="sos-contact-empty">Unable to load contacts right now.</div>';
  }
}

async function saveEmergencyContact() {
  const nameEl = document.getElementById("contactNameInput");
  const phoneEl = document.getElementById("contactPhoneInput");
  const name = (nameEl?.value || "").trim();
  const phone = (phoneEl?.value || "").trim();
  if (!name || !phone) return;
  try {
    await fetch(SOS_API.saveContact, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentUserPayload(), name, phone_number: phone })
    });
    if (nameEl) nameEl.value = "";
    if (phoneEl) phoneEl.value = "";
    loadEmergencyContacts();
  } catch {}
}

async function deleteEmergencyContact(id) {
  if (!id) return;
  try {
    await fetch(SOS_API.deleteContact, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentUserPayload(), id })
    });
    loadEmergencyContacts();
  } catch {}
}

function currentUserPayload() {
  return {
    role: "passenger",
    email: localStorage.getItem("wow_user_email") || ""
  };
}

function currentLocationPayload() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ text: buildFallbackLocation(), lat: null, lng: null, denied: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        resolve({ text: `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`, lat: latitude, lng: longitude, denied: false });
      },
      () => resolve({ text: buildFallbackLocation(), lat: null, lng: null, denied: true }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 20000 }
    );
  });
}

function cachedSosLocationPayload() {
  const ride = currentRideDocument || {};
  const point = ride.passenger_location || ride.passengerLocation || ride.currentLocation || {};
  const lat = firstFiniteValue(
    point.latitude, point.lat, ride.passengerLatitude, ride.currentLatitude,
    localStorage.getItem("wow_passenger_live_lat")
  );
  const lng = firstFiniteValue(
    point.longitude, point.lng, ride.passengerLongitude, ride.currentLongitude,
    localStorage.getItem("wow_passenger_live_lng")
  );
  if (lat !== null && lng !== null) {
    return { text: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`, lat, lng, denied: false, cached: true };
  }
  return { text: buildFallbackLocation(), lat: null, lng: null, denied: true, cached: true };
}

function buildFallbackLocation() {
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  return `Pickup: ${pickup || "Unknown"} | Drop-off: ${drop || "Unknown"}`;
}

function hasActiveRideContext() {
  const rideId = localStorage.getItem("wow_ride_code") || "";
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  const status = normalizeRideStatus(currentRideStatus || localStorage.getItem("wow_ride_status") || "");
  return Boolean(rideId && pickup && drop && (ASSIGNED_STATUSES.has(status) || ACTIVE_STATUSES.has(status)));
}

function isPassengerRideStarted(status) {
  return ACTIVE_STATUSES.has(normalizeRideStatus(status));
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toggleChatPanel(open) {
  const overlay = document.getElementById("chatOverlay");
  const panel = document.getElementById("chatPanel");
  if (open) {
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    window.WowRideChat?.requestNotifications?.();
    attachPassengerChatListener();
    updatePassengerChatUnread(0);
    if (passengerRideDocId) window.WowRideChat?.markRead(passengerRideDocId).catch(() => {});
    document.getElementById("chatInput").focus();
  } else {
    if (passengerRideDocId) window.WowRideChat?.typing(passengerRideDocId, false).catch(() => {});
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    stopChatPolling();
  }
}

async function toggleCallPanel(open, incoming = false) {
  const overlay = document.getElementById("callOverlay");
  const panel = document.getElementById("callPanel");
  if (open) {
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    if (!incoming) {
      try { await initPassengerLiveCall(passengerRideDocId);showPassengerCallState("calling");await WowRideCall.start(); }
      catch(error){showPassengerCallState("failed");setText("passengerTrackingStatus", error?.message || "Unable to start the in-app call.");}
    }
  } else {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    stopCallTimer();
  }
}

async function initPassengerLiveCall(rideId){if(!rideId||!window.WowRideCall||passengerCallReady)return;await WowRideCall.init({rideId:String(rideId),role:"passenger",platform:"passenger_website",onIncoming:()=>{toggleCallPanel(true,true);showPassengerCallState("ringing",true);},onState:(status,data)=>showPassengerCallState(status,status==="ringing"&&data?.receiverRole==="passenger")});passengerCallReady=true;}
function showPassengerCallState(status,incoming=false){const node=document.getElementById("callStatus"),answer=document.getElementById("answerCallBtn"),decline=document.getElementById("declineCallBtn"),mute=document.getElementById("muteCallBtn"),speaker=document.getElementById("speakerCallBtn"),end=document.getElementById("endCallBtn"),active=status==="active",terminal=["ended","declined","missed","cancelled","failed"].includes(status);if(node)node.textContent=incoming?"Incoming call":status==="ringing"?"Ringing...":status==="accepted"||status==="connecting"?"Connecting...":active?"Connected":status==="reconnecting"?"Reconnecting...":terminal?"Call Ended":"Calling...";if(answer)answer.hidden=!incoming;if(decline)decline.hidden=!incoming;if(mute)mute.hidden=!active;if(speaker)speaker.hidden=terminal;if(end)end.hidden=incoming||terminal;if(active)startCallTimer();if(terminal){stopCallTimer();setTimeout(()=>toggleCallPanel(false),450);}}

async function attachPassengerChatListener() {
  try {
    if (!window.WowRideChat) return;
    if (passengerChatUnsubscribe) {
      try { passengerChatUnsubscribe(); } catch {}
      passengerChatUnsubscribe = null;
    }
    const { db } = await window.WowFirestore.ready();
    const rideId = passengerRideDocId;
    if (!rideId) return;
    passengerChatUnsubscribe = await WowRideChat.listen({
      rideId,
      onMessages: (messages) => renderPassengerRideMessages(messages),
      onTyping: (typing, role) => {
        const node = document.querySelector("#chatPanel .chat-status");
        if (node) node.textContent = typing ? `${role} is typing…` : "Driver Online";
      },
      onUnread: updatePassengerChatUnread
    });
  } catch {
    fetchChatMessages(false);
    startChatPolling();
  }
}

function updatePassengerChatUnread(count) {
  const button = document.getElementById("passengerChat");
  if (!button) return;
  const unread = document.getElementById("chatPanel")?.classList.contains("is-open") ? 0 : Math.max(0, Number(count) || 0);
  button.classList.toggle("has-unread", unread > 0);
  button.dataset.unread = unread > 9 ? "9+" : String(unread);
  button.setAttribute("aria-label", unread ? `Chat, ${unread} unread messages` : "Chat");
}

function renderPassengerRideMessages(messages) {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  chatBody.innerHTML = "";
  let day = "";
  (messages || []).forEach((msg) => {
    const text = String(msg.messageText || msg.message || msg.text || "").trim();
    if (!text) return;
    const timestamp = msg.timestamp || msg.sentAt || msg.createdAt;
    const ms = firestoreMillis(timestamp);
    const nextDay = ms ? new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
    if (nextDay && nextDay !== day) {
      day = nextDay;
      const separator = document.createElement("div");
      separator.className = "chat-date-separator";
      separator.textContent = day;
      chatBody.appendChild(separator);
    }
    const role = String(msg.senderRole || "").toLowerCase() === "driver" ? "driver" : "passenger";
    const state = role === "passenger" ? String(msg.deliveryStatus || "sent") : "";
    appendChatBubble(role, text, readableChatTime(timestamp), state);
  });
}

function readableChatTime(value) {
  const ms = firestoreMillis(value);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function startCallTimer() {
  stopCallTimer();
  callSeconds = 0;
  updateCallTimer();
  callInterval = setInterval(() => {
    callSeconds += 1;
    updateCallTimer();
  }, 1000);
}

function stopCallTimer() {
  if (callInterval) {
    clearInterval(callInterval);
    callInterval = null;
  }
}

function updateCallTimer() {
  const minutes = String(Math.floor(callSeconds / 60)).padStart(2, "0");
  const seconds = String(callSeconds % 60).padStart(2, "0");
  const timerEl = document.getElementById("callTimer");
  if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
}

function seedChat() {
  fetchChatMessages(false);
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const sendButton = document.getElementById("sendChat");
  if (sendButton?.disabled) return;
  if (sendButton) sendButton.disabled = true;
  input.value = "";
  const pendingRow = appendChatBubble("passenger", text, "", "sending");
  try {
    const { db } = await window.WowFirestore.ready();
    const rideId = passengerRideDocId;
    if (!rideId) return;
    await WowRideChat.send({ rideId, message: text });
    input.dataset.failedMessage = "";
    input.title = "";
  } catch (error) {
    pendingRow?.remove();
    input.value = text;
    input.dataset.failedMessage = text;
    input.title = "Message could not be sent. Press Send to retry.";
    setText("passengerTrackingStatus", error?.message || "Message could not be sent. Tap Send to retry.");
  } finally {
    if (sendButton) window.setTimeout(() => { sendButton.disabled = false; }, 500);
  }
}

function appendChatBubble(type, text, at = "", state = "") {
  const chatBody = document.getElementById("chatBody");
  const safeText = String(text || "").trim();
  if (!chatBody || !safeText) return;
  const row = document.createElement("div");
  row.className = `chat-row ${type}`;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = safeText;
  const time = document.createElement("span");
  time.className = "chat-time";
  const receipt = state === "read" ? "✓✓ Seen" : state === "sending" ? "Sending…" : state ? "✓ Sent" : "";
  time.classList.toggle("is-read", state === "read");
  time.textContent = [at || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), receipt].filter(Boolean).join(" · ");
  row.appendChild(bubble);
  row.appendChild(time);
  chatBody.appendChild(row);
  scrollChatToBottom();
  return row;
}

function scrollChatToBottom() {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  requestAnimationFrame(() => {
    chatBody.scrollTop = chatBody.scrollHeight;
  });
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(() => fetchChatMessages(true), 2000);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

async function fetchChatMessages(incremental = true) {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const query = new URLSearchParams({
    action: "list",
    ride_code: rideCode
  });
  if (incremental && chatLastSeen) query.set("since", chatLastSeen);
  try {
    const res = await fetch(`${CHAT_API}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !Array.isArray(data.messages)) return;
    const chatBody = document.getElementById("chatBody");
    if (!chatBody) return;
    if (!incremental) chatBody.innerHTML = "";
    data.messages.forEach((msg) => {
      const role = String(msg.role || "").toLowerCase() === "driver" ? "driver" : "passenger";
      const at = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      appendChatBubble(role, String(msg.message || ""), at);
    });
    if (data.messages.length) {
      chatLastSeen = String(data.messages[data.messages.length - 1].created_at || chatLastSeen);
    }
  } catch {}
}
