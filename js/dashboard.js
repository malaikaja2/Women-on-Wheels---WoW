const STORAGE = {
  liveRequests: "wow_live_ride_requests",
  rideHistory: "wow_upcoming_rides"
};

const FARE_API = {
  estimate: "php/get_fare_estimate.php"
};
const CHAT_API = "php/chat_api.php";

const RIDE_API = {
  create: "php/create_ride.php",
  update: "php/update_ride_status.php",
  details: "php/get_ride.php"
};
const DRIVER_API = {
  available: "php/get_available_drivers.php"
};
const REALTIME = window.WowRealtime || null;
const REALTIME_PRESENCE_KEY = REALTIME && REALTIME.keys ? REALTIME.keys.presence : "wow_realtime_driver_presence";
const DEMO_FALLBACK_ENABLED = (() => {
  try {
    return new URLSearchParams(window.location.search || "").get("demo") === "1"
      || localStorage.getItem("wow_demo_mode") === "1";
  } catch {
    return false;
  }
})();

const OFFER_POLICY = {
  minFactor: 0.9,
  maxFactor: 1.1
};
const OFFER_RESPONSE_WINDOW_MS = 2 * 60 * 1000;

const FARE_CONFIG = {
  car: { baseFare: 140, perKmRate: 38, perMinRate: 5 },
  bike: { baseFare: 80, perKmRate: 24, perMinRate: 3 },
  scooty: { baseFare: 90, perKmRate: 28, perMinRate: 3.5 }
};

const MAPS_CONFIG = {
  defaultCenter: { lat: 24.8607, lng: 67.0011 },
  country: "pk",
  bounds: {
    north: 25.25,
    south: 24.65,
    east: 67.45,
    west: 66.65
  }
};

const RIDE_TYPES = {
  "WOW Car": { fare: 380, seats: 3, img: "images/car.png", model: "Suzuki Alto", color: "White" },
  "WOW Bike": { fare: 150, seats: 1, img: "images/bike.png", model: "Yamaha YBR", color: "Blue" },
  "WOW Scooty": { fare: 200, seats: 1, img: "images/scooty.png", model: "Honda Scooty", color: "Pink" }
};

const DRIVER_POOL = [
  { id: "drv-1", name: "Amna Shahid", rating: "4.9", trips: "342", phone: "+92 312 *** 56", plate: "ABC-1234", vehicleType: "car", lat: 24.8843, lng: 67.0712, online: true, etaMin: 6 },
  { id: "drv-2", name: "Hira Noor", rating: "4.8", trips: "295", phone: "+92 321 *** 18", plate: "KHI-9821", vehicleType: "bike", lat: 24.9011, lng: 67.1192, online: true, etaMin: 8 },
  { id: "drv-3", name: "Samia Ali", rating: "5.0", trips: "410", phone: "+92 300 *** 09", plate: "WOW-7721", vehicleType: "scooty", lat: 24.8519, lng: 67.0355, online: true, etaMin: 5 },
  { id: "drv-4", name: "Noor Fatima", rating: "4.7", trips: "228", phone: "+92 315 *** 31", plate: "NFR-202", vehicleType: "car", lat: 24.9132, lng: 67.1024, online: true, etaMin: 9 },
  { id: "drv-5", name: "Areeba Khan", rating: "4.9", trips: "351", phone: "+92 333 *** 40", plate: "ARB-401", vehicleType: "bike", lat: 24.8722, lng: 67.0669, online: true, etaMin: 7 },
  { id: "drv-6", name: "Mariam Saeed", rating: "4.8", trips: "287", phone: "+92 319 *** 55", plate: "MRS-555", vehicleType: "scooty", lat: 24.8378, lng: 67.0808, online: true, etaMin: 6 }
];

const STATE = {
  pickup: "",
  drop: "",
  pickupAddress: "",
  dropAddress: "",
  pickupPlace: null,
  dropPlace: null,
  rideType: "WOW Car",
  baseFare: 380,
  seatsLeft: 3,
  passengers: 1,
  carpoolOn: false,
  discountPercent: 30,
  scheduledAt: null,
  scheduledSubmissionRideId: "",
  scheduledSubmissionRideCode: "",
  scheduleFlowPending: false,
  selectedDriver: DRIVER_POOL[0],
  requestId: null,
  matchingTimer: null,
  arrivalTimer: null,
  arrivalSeconds: 5 * 60,
  callTimer: null,
  callSeconds: 0,
  chatReplyTimer: null,
  chatPollTimer: null,
  chatLastSeen: "",
  map: null,
  mapUserExploring: false,
  mainRouteLayerId: "dashboard-route",
  confirmMap: null,
  confirmRouteLayerId: "dashboard-confirm-route",
  mapPickupMarker: null,
  mapDropMarker: null,
  mapCurrentMarker: null,
  confirmPickupMarker: null,
  confirmDropMarker: null,
  lastMainRouteKey: "",
  lastConfirmRouteKey: "",
  activeLocationTarget: "pickup",
  locationSearchTimer: null,
  locationSearchTimers: { pickup: null, drop: null },
  locationSearchSeq: { pickup: 0, drop: 0 },
  locationSuggestions: { pickup: [], drop: [] },
  locationSuggestionIndex: { pickup: -1, drop: -1 },
  searchProximity: null,
  autoOpenRideTimer: null,
  routeDistanceKm: 0,
  routeDurationMin: 0,
  routeAvailable: false,
  routeLoading: false,
  routeRequestSeq: 0,
  resolvingTypedLocationForButton: false,
  authUnsubscribe: null,
  passengerAuthenticated: false,
  fareEstimateTimer: null,
  fareEstimateAbortController: null,
  fareEstimateSeq: 0,
  offerValidationTimer: null,
  offerTouched: false,
  matchingPollTimer: null,
  driverAcceptanceTimer: null,
  driverAcceptanceStartedAt: 0,
  lastDriverCandidates: [],
  activeRideCode: "",
  activeRideDbId: "",
  requestedRideSyncPromise: null,
  acceptanceHandled: false,
  realtimeUnsubscribe: null,
  passengerRideUnsubscribe: null,
  passengerOffersUnsubscribe: null,
  offerExpiryTimers: new Map(),
  activeDriverOffers: new Map(),
  declinedDriverOfferIds: new Set(),
  selectedOffer: null,
  demoDriverCardsRendered: false,
  creatingRideRequest: false,
  isSearchingForDriver: false,
  demoFallbackTimer: null,
  fareMeta: {
    distance_km: 0,
    duration_min: 0,
    traffic_level: "medium",
    time_of_day: "day",
    distance_source: "fallback"
  },
  offerValidationShown: ""
};

const E = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  initLocalLocationSuggestions();
  seedUser();
  ensureDefaultPaymentMethod();
  bindEvents();
  initializeBookingAuthState();
  initRealtimePassengerSync();
  restoreSearchingRideFromFirestore();
  selectRide(STATE.rideType, STATE.baseFare, document.querySelector(".ride-card.active"));
  updateInputSummary();
  updateBookButton();
  renderCalendar();
  renderTimeSlots();
  if (new URLSearchParams(location.search).get("schedule") === "1") beginScheduleFlow();
  renderMatchOffer(STATE.selectedDriver);
  disableDashboardSos();
  initMap();
  window.setTimeout(initMapFallbackNotice, 3500);
});
window.addEventListener("pagehide", cleanupPassengerDashboard);
window.addEventListener("beforeunload", cleanupPassengerDashboard);

const LOCAL_LOCATION_SUGGESTIONS = [
  "Gulshan-e-Iqbal, Karachi",
  "Gulshan Block 13, Karachi",
  "Gulistan-e-Johar, Karachi",
  "Garden East, Karachi",
  "Garden West, Karachi",
  "DHA Phase 6, Karachi",
  "DHA Phase 5, Karachi",
  "DHA Phase 8, Karachi",
  "Clifton, Karachi",
  "Clifton Block 2, Karachi",
  "Clifton Block 7, Karachi",
  "Bahadurabad, Karachi",
  "Tariq Road, Karachi",
  "Saddar, Karachi",
  "North Nazimabad, Karachi",
  "Nazimabad, Karachi",
  "Federal B Area, Karachi",
  "North Karachi, Karachi",
  "PECHS, Karachi",
  "Korangi, Karachi",
  "Korangi Industrial Area, Karachi",
  "Malir Cantt, Karachi",
  "Malir, Karachi",
  "Model Colony, Karachi",
  "NIPA, Karachi",
  "Naya Nazimabad, Karachi",
  "University Road, Karachi",
  "Shahrah-e-Faisal, Karachi",
  "Jinnah International Airport, Karachi",
  "Jinnah University for Women, Karachi",
  "Mohammad Ali Jinnah University, Karachi",
  "Karachi University, Karachi",
  "NED University, Karachi",
  "Iqra University, Karachi",
  "Habib University, Karachi",
  "Dolmen Mall Clifton, Karachi",
  "LuckyOne Mall, Karachi",
  "Expo Centre Karachi",
  "National Stadium Karachi",
  "Liaquatabad, Karachi",
  "Landhi, Karachi",
  "Defence View, Karachi",
  "Karsaz, Karachi",
  "Shershah, Karachi",
  "SITE Area, Karachi",
  "M.A. Jinnah Road, Karachi",
  "I.I. Chundrigar Road, Karachi"
];

function initLocalLocationSuggestions() {
  if (document.getElementById("karachiLocationSuggestions")) return;
  const list = document.createElement("datalist");
  list.id = "karachiLocationSuggestions";
  LOCAL_LOCATION_SUGGESTIONS.forEach((location) => {
    const option = document.createElement("option");
    option.value = location;
    list.appendChild(option);
  });
  document.body.appendChild(list);
}

function initMapFallbackNotice(message, force = false) {
  if (!force && window.WowMapbox && WowMapbox.ready() && STATE.map) return;
  if (!E.map) E.map = document.getElementById("map");
  if (!E.map || E.map.dataset.fallbackReady === "1") return;
  E.map.dataset.fallbackReady = "1";
  if (E.pickup) E.pickup.removeAttribute("list");
  if (E.drop) E.drop.removeAttribute("list");
  E.map.innerHTML = '<div style="height:100%;display:grid;place-items:center;padding:18px;text-align:center;color:#5f4a6f;background:#f8f4fb;">' + esc(message || "Mapbox is unavailable right now. You can still type a Karachi pickup and drop-off location.") + '</div>';
}

function cacheEls() {
  [
  "pickup", "drop", "useCurrentLocation", "pickupSuggestions", "dropSuggestions", "pickupConfirm", "dropConfirm", "inputError", "bookBtn", "offerInput",
  "offerRangeHint", "paymentHint", "cancelMatchingBtn",
    "carpool", "carpoolCard", "carpoolDetails", "carpoolRideType", "carpoolSeats", "carpoolPassengerCount",
    "originalFare", "individualFare", "discountFare", "saveNote", "carpoolPickupNotes", "carpoolExtraTime",
    "scheduleBtn", "scheduleOverlay", "scheduleSidebar", "closeSchedule", "calendarTitle", "calendarGrid",
    "prevMonth", "nextMonth", "timeGrid", "customScheduleTime", "scheduleText", "scheduleSummary", "confirmSchedule",
    "matchOverlay", "matchPanel", "driverGrid", "matchOffer", "offerDriverName", "offerDriverMeta",
    "offerFare", "offerNote", "matchOfferInput", "sendOffer", "declineOffer", "acceptOffer",
    "confirmationPanel", "confirmPickup", "confirmDrop", "confirmFare", "confirmWowCode", "confirmRideCode", "confirmDriverName", "confirmDriverVehicle",
    "confirmDriverRating", "etaText", "rideStatusPill", "rideStatusTitle", "rideStatusSub", "arrivalCountdown",
    "arrivalMessage", "confirmMap", "driverDot", "cancelRideBtn", "cancelOverlay", "cancelModal",
    "keepRideBtn", "confirmCancelBtn", "sosBtn", "sosOverlay", "sosPanel", "closeSos", "activateSosBtn",
    "chatBtn", "chatOverlay", "chatPanel", "closeChat", "chatDriverName", "chatAvatar", "chatBody", "chatInput",
    "sendChat", "emojiBtn", "callBtn", "callOverlay", "callPanel", "closeCall", "callDriverName", "callTimer",
    "endCallBtn", "startPassengerRide", "greetingText", "userName", "map", "mapRecenterBtn", "mapFitRouteBtn", "inputConfirmation",
    "offerError", "offerValidationOverlay", "offerValidationModal", "offerValidationTitle", "offerValidationMessage", "offerValidationOkBtn",
    "scheduleResultBackdrop", "scheduleResultDialog", "scheduleResultClose", "scheduleResultIcon", "scheduleResultTitle",
    "scheduleResultMessage", "scheduleResultSummary", "scheduleSuccessActions", "scheduleErrorActions", "scheduleTryAgainBtn",
    "successRideId", "successPickup", "successDropoff", "successDate", "successTime", "successVehicle",
    "successFare", "successPayment", "successStatus", "viewScheduledRideBtn"
  ].forEach((id) => {
    E[id] = document.getElementById(id);
  });
  E.rideCards = Array.from(document.querySelectorAll(".ride-card"));
  E.rideFareHint = E.offerRangeHint || document.querySelector(".offer-box p");
  E.paymentMethodInputs = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));
}

function seedUser() {
  const storedName = localStorage.getItem("wow_user_name") || "";
  const email = localStorage.getItem("wow_user_email") || "";
  const name = storedName || email.split("@")[0] || "Guest";
  E.userName.textContent = name;
  E.greetingText.textContent = getGreeting() + ",";

  E.pickup.value = "";
  E.drop.value = "";
  E.carpool.checked = false;
  STATE.carpoolOn = false;
  STATE.pickup = E.pickup.value.trim();
  STATE.drop = E.drop.value.trim();
  syncPaymentHint();
}

function bindEvents() {
  E.pickup.addEventListener("input", () => onLocationInput("pickup"));
  E.drop.addEventListener("input", () => onLocationInput("drop"));
  E.pickup.addEventListener("focus", () => onLocationFocus("pickup"));
  E.drop.addEventListener("focus", () => onLocationFocus("drop"));
  E.pickup.addEventListener("keydown", (event) => handleLocationKeydown(event, "pickup"));
  E.drop.addEventListener("keydown", (event) => handleLocationKeydown(event, "drop"));
  E.pickup.addEventListener("blur", () => window.setTimeout(() => {
    resolveTypedLocation("pickup", true);
    hideLocationSuggestions("pickup");
  }, 140));
  E.drop.addEventListener("blur", () => window.setTimeout(() => {
    resolveTypedLocation("drop", true);
    hideLocationSuggestions("drop");
  }, 140));
  if (E.useCurrentLocation) E.useCurrentLocation.addEventListener("click", usePassengerCurrentLocation);
  if (E.mapRecenterBtn) E.mapRecenterBtn.addEventListener("click", () => {
    STATE.mapUserExploring = false;
    const point = STATE.searchProximity || STATE.pickupPlace || MAPS_CONFIG.defaultCenter;
    if (STATE.map && point) STATE.map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(STATE.map.getZoom(), 14), duration: 650 });
  });
  if (E.mapFitRouteBtn) E.mapFitRouteBtn.addEventListener("click", () => {
    STATE.mapUserExploring = false;
    const points = [STATE.searchProximity, STATE.pickupPlace, STATE.dropPlace].filter(Boolean);
    if (STATE.map && points.length && window.WowMapbox) WowMapbox.fitMap(STATE.map, points, 56);
  });

  E.carpool.addEventListener("change", () => {
    STATE.carpoolOn = E.carpool.checked;
    updateFareUi();
  });

  document.querySelectorAll(".passenger-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = Number(btn.dataset.dir || 0);
      const next = STATE.passengers + dir;
      const maxSeats = Math.max(1, STATE.seatsLeft);
      STATE.passengers = Math.min(maxSeats, Math.max(1, next));
      updateFareUi();
    });
  });

  E.offerInput.addEventListener("input", handleOfferTyping);
  E.offerInput.addEventListener("blur", () => validateOfferInput({ showFeedback: true, normalize: true }));
  E.offerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      validateOfferInput({ showFeedback: true, normalize: true });
      E.bookBtn.focus();
    }
  });
  E.bookBtn.addEventListener("click", onBookRide);
  E.paymentMethodInputs.forEach((input) => {
    input.addEventListener("change", () => {
      syncPaymentHint();
      updateBookButton();
    });
  });
  if (E.cancelMatchingBtn) E.cancelMatchingBtn.addEventListener("click", cancelPendingRideRequest);

  E.scheduleBtn.addEventListener("click", beginScheduleFlow);
  E.closeSchedule.addEventListener("click", closeSchedule);
  E.scheduleOverlay.addEventListener("click", closeSchedule);
  E.prevMonth.addEventListener("click", () => shiftMonth(-1));
  E.nextMonth.addEventListener("click", () => shiftMonth(1));
  E.customScheduleTime.addEventListener("input", onCustomScheduleTime);
  E.confirmSchedule.addEventListener("click", confirmSchedule);
  E.scheduleResultClose?.addEventListener("click", closeScheduleResult);
  E.scheduleResultBackdrop?.addEventListener("click", event => event.preventDefault());
  E.scheduleTryAgainBtn?.addEventListener("click", closeScheduleResult);
  document.addEventListener("keydown", handleScheduleResultKeydown);

  E.sendOffer.addEventListener("click", sendCustomOffer);
  E.declineOffer.addEventListener("click", declineOffer);
  E.acceptOffer.addEventListener("click", acceptOffer);

  E.cancelRideBtn.addEventListener("click", () => openModal(E.cancelOverlay, E.cancelModal));
  E.keepRideBtn.addEventListener("click", () => closeModal(E.cancelOverlay, E.cancelModal));
  E.confirmCancelBtn.addEventListener("click", cancelRide);
  E.cancelOverlay.addEventListener("click", () => closeModal(E.cancelOverlay, E.cancelModal));

  if (E.sosBtn) E.sosBtn.addEventListener("click", disableDashboardSosNotice);
  if (E.closeSos) E.closeSos.addEventListener("click", () => closePanel(E.sosOverlay, E.sosPanel));
  if (E.sosOverlay) E.sosOverlay.addEventListener("click", () => closePanel(E.sosOverlay, E.sosPanel));
  if (E.activateSosBtn) E.activateSosBtn.addEventListener("click", disableDashboardSosNotice);

  E.chatBtn.addEventListener("click", openChat);
  E.closeChat.addEventListener("click", () => closePanel(E.chatOverlay, E.chatPanel));
  E.chatOverlay.addEventListener("click", () => closePanel(E.chatOverlay, E.chatPanel));
  E.sendChat.addEventListener("click", sendChat);
  E.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChat();
  });
  E.emojiBtn.addEventListener("click", () => {
    E.chatInput.value = (E.chatInput.value + " :)").trim();
    E.chatInput.focus();
  });
  document.querySelectorAll(".quick-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      E.chatInput.value = btn.textContent;
      sendChat();
    });
  });

  E.callBtn.addEventListener("click", openCall);
  E.closeCall.addEventListener("click", closeCall);
  E.callOverlay.addEventListener("click", closeCall);
  E.endCallBtn.addEventListener("click", closeCall);
  if (E.offerValidationOkBtn) {
    E.offerValidationOkBtn.addEventListener("click", () => {
      closeModal(E.offerValidationOverlay, E.offerValidationModal);
      E.offerInput.focus();
      E.offerInput.select();
    });
  }

  E.startPassengerRide.addEventListener("click", onPassengerStartRide);
}

function initRealtimePassengerSync() {
  if (REALTIME && typeof REALTIME.subscribe === "function") {
    STATE.realtimeUnsubscribe = REALTIME.subscribe((message) => {
      const type = String(message?.type || "");
      const payload = message?.payload || {};
      if (!type) return;

      if (type === "ride.accepted") {
        const rideCode = String(payload.rideCode || "");
        const stateCode = String(STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "");
        if (!rideCode || !stateCode || rideCode !== stateCode) return;
        if (payload.driverName) localStorage.setItem("wow_ride_driver_name", String(payload.driverName));
        if (payload.driverPhone) localStorage.setItem("wow_ride_driver_phone", String(payload.driverPhone));
        const fare = Number(payload.fare || E.matchOfferInput?.value || getActiveFare() || 0);
        finalizeAcceptedRideFlow(fare, rideCode, String(payload.rideId || STATE.activeRideDbId || ""), "accepted");
        return;
      }

      if (type === "ride.status") {
        const rideCode = String(payload.rideCode || "");
        const stateCode = String(STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "");
        if (!rideCode || !stateCode || rideCode !== stateCode) return;
        const status = String(payload.status || "").toLowerCase();
        if (isRideStartedStatus(status)) {
          localStorage.setItem("wow_ride_status", "ride_started");
          E.rideStatusTitle.textContent = "Ride Started";
          E.rideStatusPill.textContent = "Started";
          E.rideStatusSub.textContent = "Driver has started your ride.";
        }
      }

      if (type === "driver.presence" && E.matchOverlay?.classList.contains("is-open")) {
        renderDriverGrid(Math.max(0, Number(E.offerInput?.value || getActiveFare())));
      }
    });
  }

  window.addEventListener("storage", (event) => {
    if (!event) return;
    if (event.key === REALTIME_PRESENCE_KEY && E.matchOverlay?.classList.contains("is-open")) {
      renderDriverGrid(Math.max(0, Number(E.offerInput?.value || getActiveFare())));
      return;
    }
    if (event.key === STORAGE.liveRequests) {
      const rideCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "";
      if (!rideCode || STATE.acceptanceHandled) return;
      const rows = loadJson(STORAGE.liveRequests, []);
      const match = rows.find((r) => String(r.rideCode || "") === String(rideCode));
      if (!match) return;
      const status = String(match.status || "").toLowerCase();
      if (["accepted", "arrived", "driver_arriving", "in_progress", "ride_started", "completed"].includes(status)) {
        finalizeAcceptedRideFlow(
          Number(match.offeredFare || match.fare || E.matchOfferInput?.value || getActiveFare() || 0),
          String(match.rideCode || rideCode),
          String(STATE.activeRideDbId || localStorage.getItem("wow_ride_db_id") || ""),
          status
        );
      }
    }
  });
}

function publishRealtime(type, payload) {
  if (!REALTIME || typeof REALTIME.publish !== "function") return;
  REALTIME.publish(type, payload || {});
}

function disableDashboardSos() {
  if (E.sosBtn) {
    E.sosBtn.disabled = true;
    E.sosBtn.style.display = "none";
  }
  if (E.sosPanel && E.sosOverlay) {
    closePanel(E.sosOverlay, E.sosPanel);
  }
}

function disableDashboardSosNotice() {
  if (E.sosPanel && E.sosOverlay) {
    closePanel(E.sosOverlay, E.sosPanel);
  }
}

async function usePassengerCurrentLocation() {
  if (!navigator.geolocation) {
    setInputError("Current location is unavailable in this browser. Select the pickup directly from the map.");
    return;
  }
  if (E.useCurrentLocation) E.useCurrentLocation.disabled = true;
  navigator.geolocation.getCurrentPosition(async (position) => {
    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    STATE.searchProximity = point;
    updatePassengerCurrentMarker(point);
    try {
      const address = window.WowMapbox ? await WowMapbox.reverseGeocode(point) : "";
      applyLocationSelection("pickup", address || "Current location", { ...point, title: "Current location", address: address || "Current location" });
    } catch (error) {
      applyLocationSelection("pickup", "Current location", { ...point, title: "Current location", address: "Current location" });
      setInputError("Your GPS point was selected, but its street address could not be loaded.");
    } finally {
      if (E.useCurrentLocation) E.useCurrentLocation.disabled = false;
    }
  }, (error) => {
    if (E.useCurrentLocation) E.useCurrentLocation.disabled = false;
    const denied = error && error.code === 1;
    setInputError(denied ? "Location permission was denied. Allow location access or select pickup from the map." : "Your GPS location could not be detected. Select pickup from the map.");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

function updatePassengerCurrentMarker(point) {
  if (!STATE.map || !window.WowMapbox || !point) return;
  if (!STATE.mapCurrentMarker) {
    STATE.mapCurrentMarker = WowMapbox.createLabelMarker(STATE.map, point, "#8e44ad", "You", {
      size: 28,
      title: "Your current location",
      popupText: "Your current location"
    });
  } else {
    WowMapbox.setMarkerPoint(STATE.mapCurrentMarker, point);
  }
}

function onLocationInput(target) {
  STATE.activeLocationTarget = target;
  if (target === "pickup") STATE.pickupPlace = null;
  if (target === "drop") STATE.dropPlace = null;
  STATE.routeAvailable = false;
  STATE.lastMainRouteKey = "";
  STATE.pickup = E.pickup.value.trim();
  STATE.drop = E.drop.value.trim();
  const text = target === "pickup" ? STATE.pickup : STATE.drop;
  const suggestion = getMapboxSuggestionPlace(target, text);
  if (suggestion && Number.isFinite(Number(suggestion.lat)) && Number.isFinite(Number(suggestion.lng))) {
    applyLocationSelection(target, suggestion.label || text, suggestion);
    return;
  }
  const localPlace = resolveTypedLocationPlace(target, text, !window.WowMapbox);
  if (localPlace && Number.isFinite(Number(localPlace.lat)) && Number.isFinite(Number(localPlace.lng))) {
    applyLocationSelection(target, localPlace.label || text, localPlace);
    return;
  }
  if (!STATE.pickupPlace || !STATE.dropPlace) {
    STATE.routeDistanceKm = 0;
    STATE.routeDurationMin = 0;
  }
  updateInputSummary();
  updateBookButton();
  maybeDrawRoute();
  queueFareEstimate();
  queueMapboxSuggestions(target, text);
}

function onLocationFocus(target) {
  STATE.activeLocationTarget = target;
  const input = target === "pickup" ? E.pickup : E.drop;
  const text = input ? input.value.trim() : "";
  if (text.length >= 2) {
    const cached = STATE.locationSuggestions[target] || [];
    if (cached.length) renderLocationSuggestions(target, cached);
    else queueMapboxSuggestions(target, text);
  }
}

function getMapboxSuggestionPlace(target, text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return null;
  return (STATE.locationSuggestions[target] || []).find((place) => String(place.label || "").trim().toLowerCase() === value) || null;
}

function getLocalSuggestionPlace(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return null;
  const match = LOCAL_LOCATION_SUGGESTIONS.find((location) => location.toLowerCase() === value);
  return match ? { ...resolvePoint(match), label: match, address: match, title: match.replace(", Karachi", ""), subtitle: "Karachi" } : null;
}

function manualLocationLabel(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /karachi|pakistan/i.test(value) ? value : `${value}, Karachi`;
}

function canUseApproximateTypedLocation(text) {
  const value = String(text || "").trim();
  if (value.length < 3) return false;
  if (/^(lahore|islamabad|rawalpindi|peshawar|quetta|multan|faisalabad|sukkur|india|dubai|uae|usa|uk)\b/i.test(value) && !/\bkarachi\b/i.test(value)) {
    return false;
  }
  return true;
}

function approximateTypedLocationPlace(text) {
  if (!canUseApproximateTypedLocation(text)) return null;
  const label = manualLocationLabel(text);
  return {
    ...resolvePoint(label),
    label,
    address: label,
    title: label.replace(/,\s*karachi.*$/i, ""),
    subtitle: "Estimated Karachi location",
    source: "typed_fallback"
  };
}

function resolveTypedLocationPlace(target, text, allowApproximate = false) {
  return getMapboxSuggestionPlace(target, text)
    || getLocalSuggestionPlace(text)
    || verifiedLocationMatches(text)[0]
    || (allowApproximate ? approximateTypedLocationPlace(text) : null);
}

function resolveTypedLocation(target, allowApproximate = false) {
  const input = target === "pickup" ? E.pickup : E.drop;
  const typed = input ? input.value.trim() : "";
  const current = target === "pickup" ? STATE.pickupPlace : STATE.dropPlace;
  if (typed && validRoutePoint(current)) return true;
  const place = resolveTypedLocationPlace(target, typed, allowApproximate);
  return place ? applyLocationSelection(target, place.label || typed, place) : false;
}

function resolveTypedLocationsForBooking(allowApproximate = true) {
  const hadBookableRoute = hasBookableRoute();
  const previousRouteKey = hasValidBookingLocations()
    ? routeCacheKey(STATE.pickupPlace, STATE.dropPlace, STATE.rideType)
    : "";
  resolveTypedLocation("pickup", allowApproximate);
  resolveTypedLocation("drop", allowApproximate);
  if (hasValidBookingLocations()) {
    const currentRouteKey = routeCacheKey(STATE.pickupPlace, STATE.dropPlace, STATE.rideType);
    if (hadBookableRoute && previousRouteKey === currentRouteKey) {
      setRouteMarkers("main", STATE.pickupPlace, STATE.dropPlace);
    } else if (!STATE.routeLoading && !hasBookableRoute()) {
      maybeDrawRoute();
    }
  }
  return hasValidBookingLocations();
}

function localSuggestionMatches(query, limit = 6) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return [];
  return LOCAL_LOCATION_SUGGESTIONS
    .filter((label) => label.toLowerCase().includes(value))
    .slice(0, limit)
    .map((label) => ({ ...resolvePoint(label), label, address: label, title: label.replace(", Karachi", ""), subtitle: "Karachi" }));
}

function verifiedLocationMatches(query) {
  const value = String(query || "").trim().toLowerCase();
  const places = [
    { title: "Jinnah University for Women", address: "5-C Nazimabad, Karachi, Sindh, Pakistan", lat: 24.925011, lng: 67.030278, type: "university" },
    { title: "Dolmen Mall Clifton", address: "Sea View Road, Clifton, Karachi, Sindh, Pakistan", lat: 24.8025, lng: 67.0281, type: "shopping mall" },
    { title: "LuckyOne Mall", address: "Rashid Minhas Road, Karachi, Sindh, Pakistan", lat: 24.9324, lng: 67.0871, type: "shopping mall" }
  ];
  const terms = value.split(/\s+/).filter(Boolean);
  return places.filter((place) => terms.every((term) => `${place.title} ${place.address}`.toLowerCase().includes(term)))
    .map((place) => ({ ...place, label: `${place.title}, ${place.address}`, subtitle: place.address, source: "verified" }));
}

function mergeLocationSuggestions(primary, fallback, limit = 8) {
  const seen = new Set();
  return [...(primary || []), ...(fallback || [])].filter((place) => {
    const key = String(place.label || place.title || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function queueMapboxSuggestions(target, text) {
  clearTimeout(STATE.locationSearchTimers[target] || STATE.locationSearchTimer);
  const query = String(text || "").trim();
  const requestSeq = ++STATE.locationSearchSeq[target];
  STATE.locationSuggestionIndex[target] = -1;
  if (query.length < 2) {
    hideLocationSuggestions(target);
    return;
  }
  if (!window.WowMapbox) {
    const localSuggestions = localSuggestionMatches(query, 6);
    STATE.locationSuggestions[target] = localSuggestions;
    updateSuggestionList(localSuggestions);
    renderLocationSuggestions(target, localSuggestions, localSuggestions.length ? "fallback" : "empty");
    return;
  }
  renderLocationSuggestions(target, [], "loading");
  STATE.locationSearchTimers[target] = setTimeout(async () => {
    try {
      const mapboxSuggestions = await fetchLiveMapboxSuggestions(query, target, 8);
      const activeInput = target === "pickup" ? E.pickup : E.drop;
      if (requestSeq !== STATE.locationSearchSeq[target] || !activeInput || activeInput.value.trim() !== query) return;
      const suggestions = mergeLocationSuggestions(mergeLocationSuggestions(mapboxSuggestions, verifiedLocationMatches(query), 8), localSuggestionMatches(query, 6), 8);
      STATE.locationSuggestions[target] = suggestions;
      updateSuggestionList(suggestions);
      renderLocationSuggestions(target, suggestions, suggestions.length ? (mapboxSuggestions.length ? "" : "fallback") : "empty");
    } catch (error) {
      console.error("WomenOnWheels location autocomplete failed:", error);
      const activeInput = target === "pickup" ? E.pickup : E.drop;
      if (requestSeq !== STATE.locationSearchSeq[target] || !activeInput || activeInput.value.trim() !== query) return;
      const localSuggestions = localSuggestionMatches(query, 6);
      STATE.locationSuggestions[target] = localSuggestions;
      updateSuggestionList(localSuggestions);
      renderLocationSuggestions(target, localSuggestions, localSuggestions.length ? "fallback" : "error");
      const message = error?.status === 401 || error?.status === 403
        ? "Mapbox access token is invalid or unauthorized."
        : "Live location search failed. Check your network and try again.";
      setInputError(localSuggestions.length ? "" : message);
    }
  }, 400);
}

async function fetchLiveMapboxSuggestions(query, target, limit = 8) {
  let searchBoxSuggestions = [];
  let geocodingSuggestions = [];
  let poiFallbackSuggestions = [];
  let searchBoxError = null;
  if (typeof WowMapbox.searchBoxSuggest === "function") {
    try {
      const suggestions = await WowMapbox.searchBoxSuggest(query, { limit, sessionKey: target, proximity: STATE.searchProximity });
      if (Array.isArray(suggestions)) searchBoxSuggestions = suggestions;
    } catch (error) {
      searchBoxError = error;
    }
  }

  try {
    const suggestions = await WowMapbox.geocode(query, limit, {
      types: "poi,address,place,locality,neighborhood,district",
      proximity: STATE.searchProximity
    });
    if (Array.isArray(suggestions)) geocodingSuggestions = suggestions;
  } catch (error) {
    if (!searchBoxSuggestions.length) throw searchBoxError || error;
  }

  let combined = rankLocationSuggestions(
    mergeLocationSuggestions(searchBoxSuggestions, geocodingSuggestions, limit * 2),
    query
  );
  if (combined.length < 6 && typeof WowMapbox.photonSearch === "function") {
    try {
      poiFallbackSuggestions = await WowMapbox.photonSearch(query, { limit, proximity: STATE.searchProximity });
      combined = rankLocationSuggestions(
        mergeLocationSuggestions(combined, poiFallbackSuggestions, limit * 2),
        query
      );
    } catch (error) {
      console.warn("WomenOnWheels POI fallback unavailable:", error?.message || error);
    }
  }
  if (combined.length < 4 && !/karachi|pakistan/i.test(query)) {
    try {
      const broader = await WowMapbox.geocode(`${query}, Karachi, Pakistan`, limit, {
        types: "poi,address,place,locality,neighborhood,district",
        proximity: STATE.searchProximity
      });
      combined = rankLocationSuggestions(
        mergeLocationSuggestions(combined, broader, limit * 2),
        query
      );
    } catch (error) {
      if (!combined.length) throw searchBoxError || error;
    }
  }
  return combined.slice(0, limit);
}

function rankLocationSuggestions(suggestions, query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return (suggestions || []).map((place, index) => {
    const searchable = [place.title, place.address, place.label, place.subtitle, place.type]
      .filter(Boolean).join(" ").toLowerCase();
    const relevance = terms.reduce((score, term) => score + (searchable.includes(term) ? 2 : 0), 0);
    const karachiBoost = /karachi|gulshan|clifton|nazimabad|korangi|malir|keamari|saddar|dha/i.test(searchable) ? 5 : 0;
    const poiBoost = /poi|address/.test(String(place.type || "").toLowerCase()) ? 1 : 0;
    return { place, score: relevance + karachiBoost + poiBoost, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map((row) => row.place);
}

function updateSuggestionList(suggestions) {
  const list = document.getElementById("karachiLocationSuggestions");
  if (!list) return;
  list.innerHTML = "";
  (suggestions || []).forEach((place) => {
    const option = document.createElement("option");
    option.value = place.label || "";
    list.appendChild(option);
  });
}

function renderLocationSuggestions(target, suggestions, status = "") {
  const box = target === "pickup" ? E.pickupSuggestions : E.dropSuggestions;
  if (!box) return;
  box.innerHTML = "";
  box.dataset.target = target;

  if (status === "loading") {
    box.innerHTML = '<div class="location-suggestion-note">Searching locations...</div>';
    showLocationSuggestions(target);
    return;
  }
  if (status === "error") {
    box.innerHTML = '<div class="location-suggestion-note error">Live location search is unavailable. Try a nearby landmark or road name.</div>';
    showLocationSuggestions(target);
    return;
  }
  if (status === "empty") {
    box.innerHTML = '<div class="location-suggestion-note">No matching location was found. Try entering the building name with the area, for example: &ldquo;ABC Hospital, Gulshan Karachi&rdquo;.</div>';
    showLocationSuggestions(target);
    return;
  }
  if (status === "fallback") {
    const note = document.createElement("div");
    note.className = "location-suggestion-note";
    note.textContent = "Showing saved Karachi suggestions.";
    box.appendChild(note);
  }

  (suggestions || []).slice(0, 6).forEach((place, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "location-suggestion";
    btn.setAttribute("role", "option");
    btn.dataset.index = String(index);
    const title = place.title || place.label || "Location";
    const subtitle = place.subtitle || compactLocationSubtitle(place.label, title);
    const category = String(place.type || "").replaceAll("_", " ").trim();
    const distance = locationDistanceLabel(STATE.searchProximity, place);
    btn.innerHTML = `
      <span class="suggestion-pin" aria-hidden="true"></span>
      <span class="suggestion-copy">
        <strong>${esc(title)}</strong>
        <small>${esc(place.address || place.label || "")}</small>
        ${subtitle && subtitle !== place.address ? `<small>${esc(subtitle)}</small>` : ""}
        ${(category || distance) ? `<small class="suggestion-category">${esc([category, distance].filter(Boolean).join(" · "))}</small>` : ""}
      </span>
    `;
    btn.addEventListener("mouseenter", () => setActiveLocationSuggestion(target, index));
    btn.addEventListener("mousedown", (event) => event.preventDefault());
    btn.addEventListener("click", () => chooseLocationSuggestion(target, place));
    box.appendChild(btn);
  });

  if (box.children.length) showLocationSuggestions(target);
  else hideLocationSuggestions(target);
}

function locationDistanceLabel(origin, place) {
  if (!origin || !Number.isFinite(Number(place?.lat)) || !Number.isFinite(Number(place?.lng))) return "";
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(Number(place.lat) - Number(origin.lat));
  const dLng = radians(Number(place.lng) - Number(origin.lng));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(origin.lat))) * Math.cos(radians(Number(place.lat))) * Math.sin(dLng / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

function compactLocationSubtitle(label, title) {
  const value = String(label || "");
  const head = String(title || "");
  if (!value || value === head) return "";
  return value.replace(head, "").replace(/^,\s*/, "").trim();
}

function showLocationSuggestions(target) {
  const box = target === "pickup" ? E.pickupSuggestions : E.dropSuggestions;
  if (box) box.classList.add("is-open");
}

function hideLocationSuggestions(target) {
  const box = target === "pickup" ? E.pickupSuggestions : E.dropSuggestions;
  if (box) box.classList.remove("is-open");
  STATE.locationSuggestionIndex[target] = -1;
}

function setActiveLocationSuggestion(target, index) {
  const box = target === "pickup" ? E.pickupSuggestions : E.dropSuggestions;
  if (!box) return;
  STATE.locationSuggestionIndex[target] = index;
  Array.from(box.querySelectorAll(".location-suggestion")).forEach((item, itemIndex) => {
    item.classList.toggle("is-active", itemIndex === index);
  });
}

function handleLocationKeydown(event, target) {
  const suggestions = STATE.locationSuggestions[target] || [];
  const box = target === "pickup" ? E.pickupSuggestions : E.dropSuggestions;
  const isOpen = Boolean(box && box.classList.contains("is-open"));
  if (!isOpen || !suggestions.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const next = (STATE.locationSuggestionIndex[target] + 1) % suggestions.length;
    setActiveLocationSuggestion(target, next);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const next = STATE.locationSuggestionIndex[target] <= 0 ? suggestions.length - 1 : STATE.locationSuggestionIndex[target] - 1;
    setActiveLocationSuggestion(target, next);
    return;
  }
  if (event.key === "Enter") {
    const index = STATE.locationSuggestionIndex[target];
    if (index >= 0 && suggestions[index]) {
      event.preventDefault();
      chooseLocationSuggestion(target, suggestions[index]);
    }
    return;
  }
  if (event.key === "Escape") {
    hideLocationSuggestions(target);
  }
}

async function chooseLocationSuggestion(target, suggestion) {
  let place = suggestion || {};
  try {
    const hasPoint = Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
    if (!hasPoint && place.mapboxId && window.WowMapbox && typeof WowMapbox.searchBoxRetrieve === "function") {
      renderLocationSuggestions(target, [], "loading");
      const retrieved = await WowMapbox.searchBoxRetrieve(place.mapboxId, { sessionKey: target });
      if (retrieved) place = { ...place, ...retrieved };
    }
    if ((!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) && window.WowMapbox) {
      const fallbackPlaces = await WowMapbox.geocode(place.label || place.title, 1);
      const resolvedPlace = (fallbackPlaces || []).find((candidate) => WowMapbox.isInsidePakistan(candidate));
      if (resolvedPlace) place = { ...place, ...resolvedPlace };
    }
    const selected = applyLocationSelection(target, place.label || place.title, place);
    if (!selected) throw new Error("Selected location has no valid coordinates.");
    if (window.WowMapbox && typeof WowMapbox.clearSearchSession === "function") {
      WowMapbox.clearSearchSession(target);
    }
  } catch {
    setInputError("Unable to select that location. Please try another suggestion.");
    renderLocationSuggestions(target, STATE.locationSuggestions[target] || [], "");
  }
}

function applyLocationSelection(target, label, point) {
  const place = {
    lat: Number(point.lat),
    lng: Number(point.lng),
    label: String(label || point.label || point.title || ""),
    address: String(point.address || point.label || label || ""),
    title: String(point.title || label || ""),
    type: String(point.type || ""),
    mapboxId: String(point.mapboxId || "")
  };
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    setInputError("Please select a valid location from the suggestions.");
    return false;
  }
  if (place.lng < -180 || place.lng > 180 || place.lat < -90 || place.lat > 90) {
    setInputError("The selected location has invalid coordinates.");
    return false;
  }
  if (window.WowMapbox && !WowMapbox.isInsidePakistan(place)) {
    console.error("[WOW Passenger] rejected location outside Pakistan", {
      target,
      longitude: place.lng,
      latitude: place.lat,
      mapboxId: place.mapboxId
    });
    setInputError("Please select a location within Pakistan.");
    return false;
  }
  STATE.routeAvailable = false;
  STATE.lastMainRouteKey = "";
  if (target === "pickup") {
    E.pickup.value = place.label;
    STATE.pickup = place.label;
    STATE.pickupAddress = place.address;
    STATE.pickupPlace = place;
  } else {
    E.drop.value = place.label;
    STATE.drop = place.label;
    STATE.dropAddress = place.address;
    STATE.dropPlace = place;
  }
  hideLocationSuggestions(target);
  updateInputSummary();
  updateBookButton();
  panMapToSelectedPlace(place);
  setRouteMarkers("main", STATE.pickupPlace, STATE.dropPlace);
  maybeDrawRoute();
  queueFareEstimate(120);
  continueScheduleFlowWhenReady();
  return true;
}

function hasValidScheduledLocations() {
  return Boolean(
    STATE.pickupPlace && STATE.dropPlace &&
    Number.isFinite(Number(STATE.pickupPlace.lat)) &&
    Number.isFinite(Number(STATE.pickupPlace.lng)) &&
    Number.isFinite(Number(STATE.dropPlace.lat)) &&
    Number.isFinite(Number(STATE.dropPlace.lng))
  );
}

function beginScheduleFlow() {
  resolveTypedLocationsForBooking(true);
  if (hasValidScheduledLocations()) {
    STATE.scheduleFlowPending = false;
    setInputError("");
    openSchedule();
    return;
  }
  STATE.scheduleFlowPending = true;
  setInputError("Scheduled ride ke liye pehle pickup aur drop-off location select karein.");
  const target = STATE.pickupPlace ? E.drop : E.pickup;
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target?.focus(), 250);
}

function continueScheduleFlowWhenReady() {
  if (!STATE.scheduleFlowPending || !hasValidScheduledLocations()) return;
  STATE.scheduleFlowPending = false;
  setInputError("");
  openSchedule();
}

function updateInputSummary() {
  E.pickupConfirm.textContent = STATE.pickup || "--";
  E.dropConfirm.textContent = STATE.drop || "--";
}

function updateBookButton() {
  ensureDefaultPaymentMethod();
  if (!STATE.resolvingTypedLocationForButton
      && !hasValidBookingLocations()
      && String(E.pickup?.value || "").trim().length >= 3
      && String(E.drop?.value || "").trim().length >= 3) {
    STATE.resolvingTypedLocationForButton = true;
    try {
      resolveTypedLocationsForBooking(true);
    } finally {
      STATE.resolvingTypedLocationForButton = false;
    }
  }
  const validLocations = hasValidBookingLocations();
  const validOffer = isOfferValid(Math.max(0, Number(E.offerInput.value || getActiveFare())));
  const validVehicle = Boolean(RIDE_TYPES[STATE.rideType]);
  const validPayment = Boolean(getSelectedPaymentMethod());
  const validRoute = hasBookableRoute();
  const blockedReason = bookButtonBlockedReason({
    validLocations,
    validOffer,
    validVehicle,
    validPayment,
    validRoute
  });
  E.bookBtn.disabled = Boolean(blockedReason);
  if (STATE.passengerAuthenticated && validLocations && validRoute && validOffer && validVehicle && validPayment) setInputError("");
  if (blockedReason) {
    E.bookBtn.title = blockedReason;
    E.bookBtn.dataset.disabledReason = blockedReason;
  } else {
    E.bookBtn.removeAttribute("title");
    delete E.bookBtn.dataset.disabledReason;
  }
  E.bookBtn.setAttribute("aria-disabled", String(E.bookBtn.disabled));
  E.bookBtn.textContent = STATE.creatingRideRequest ? "Creating request..." : (STATE.isSearchingForDriver ? "Searching for driver..." : rideActionLabel(STATE.rideType));
}

function hasValidBookingLocations() {
  return Boolean(STATE.pickupPlace && STATE.dropPlace
    && Number.isFinite(Number(STATE.pickupPlace.lat)) && Number.isFinite(Number(STATE.pickupPlace.lng))
    && Number.isFinite(Number(STATE.dropPlace.lat)) && Number.isFinite(Number(STATE.dropPlace.lng)));
}

function hasBookableRoute() {
  if (STATE.routeAvailable && Number(STATE.routeDistanceKm) > 0) return true;
  return false;
}

function waitForRouteCompletion(timeoutMs = 9000) {
  if (!STATE.routeLoading) return Promise.resolve(hasBookableRoute());
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (hasBookableRoute()) {
        resolve(true);
        return;
      }
      if (!STATE.routeLoading || Date.now() - startedAt >= timeoutMs) {
        resolve(hasBookableRoute());
        return;
      }
      window.setTimeout(check, 180);
    };
    check();
  });
}

async function ensureBookableRouteForBooking() {
  if (hasBookableRoute()) return true;
  if (!hasValidBookingLocations()) return false;

  if (STATE.routeLoading) {
    const completed = await waitForRouteCompletion();
    if (completed) return true;
  }

  const routePromise = maybeDrawRoute();
  if (routePromise && typeof routePromise.then === "function") {
    await routePromise;
  }
  return hasBookableRoute();
}

function bookButtonBlockedReason({ validLocations, validOffer, validVehicle, validPayment, validRoute }) {
  if (STATE.creatingRideRequest) return "Creating your ride request.";
  if (STATE.isSearchingForDriver) return "You already have an active ride request.";
  if (!hasUsablePassengerSession()) return "Please log in again before booking.";
  if (!validLocations) return "Select pickup and destination from the suggestions or map.";
  if (!validRoute) return STATE.routeLoading ? "Calculating route between pickup and destination." : "Waiting for a route between pickup and destination.";
  if (!validOffer) return "Enter a fare offer within the allowed range.";
  if (!validVehicle) return "Choose a vehicle type.";
  if (!validPayment) return "Select a payment method.";
  return "";
}

function hasUsablePassengerSession() {
  return Boolean(
    STATE.passengerAuthenticated ||
    currentPassengerUid() ||
    currentPassengerEmail()
  );
}

function currentFirebaseUser() {
  try {
    return window.firebase && firebase.auth ? firebase.auth().currentUser : null;
  } catch {
    return null;
  }
}

function currentPassengerUid() {
  const user = currentFirebaseUser();
  return String(user?.uid || localStorage.getItem("wow_user_id") || "").trim();
}

function currentPassengerEmail() {
  const user = currentFirebaseUser();
  return String(user?.email || localStorage.getItem("wow_user_email") || "").trim();
}

function currentPassengerName() {
  const user = currentFirebaseUser();
  return String(localStorage.getItem("wow_user_name") || user?.displayName || "Passenger").trim() || "Passenger";
}

function currentPassengerPhone() {
  const user = currentFirebaseUser();
  return String(localStorage.getItem("wow_user_phone") || user?.phoneNumber || "").trim();
}

function setPassengerAuthState(user) {
  STATE.passengerAuthenticated = Boolean(user && user.uid);
  if (STATE.passengerAuthenticated) {
    if (user.displayName && !localStorage.getItem("wow_user_name")) localStorage.setItem("wow_user_name", user.displayName);
    if (user.email && !localStorage.getItem("wow_user_email")) localStorage.setItem("wow_user_email", user.email);
    localStorage.setItem("wow_logged_in", "true");
  } else if (!hasUsablePassengerSession()) {
    setInputError("Please log in again.");
  }
  updateBookButton();
}

function isAuthUnavailableError(error) {
  const message = String(error?.message || error?.code || error || "").toLowerCase();
  return /not_authenticated|firebase_auth_unavailable|auth\/|unauthenticated|permission-denied|permission_denied|must be signed in|sign in|log in|session/.test(message);
}

async function createRideRequestWithFallback(requestedFare) {
  let authError = null;
  if (window.WowFirestore) {
    try {
      return await createRideRequestDocument(requestedFare);
    } catch (error) {
      authError = error;
      if (!isAuthUnavailableError(error)) throw error;
      console.warn("[WOW Passenger] Firestore booking auth unavailable; using PHP ride fallback", error?.message || error);
    }
  }

  if (!hasUsablePassengerSession()) {
    throw authError || new Error("Please log in again.");
  }

  const fallbackCode = STATE.scheduledSubmissionRideCode || generateRideCode();
  const rideMeta = await createRideRecord(requestedFare, fallbackCode, { throwOnError: true });
  if (rideMeta?.rideId) return rideMeta;
  throw authError || new Error(rideMeta?.error || "ride_request_failed");
}

async function initializeBookingAuthState() {
  try {
    if (!window.WowFirestore) throw new Error("Firebase is unavailable.");
    const { auth, firebase } = await window.WowFirestore.ready();
    const firebaseAuth = auth || (firebase?.auth ? firebase.auth() : null);
    setPassengerAuthState(firebaseAuth?.currentUser || null);
    if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === "function") {
      if (STATE.authUnsubscribe) {
        try { STATE.authUnsubscribe(); } catch {}
      }
      STATE.authUnsubscribe = firebaseAuth.onAuthStateChanged(setPassengerAuthState);
    }
  } catch (error) {
    STATE.passengerAuthenticated = false;
    console.error("[WOW Passenger] booking authentication failed", error);
    if (!hasUsablePassengerSession()) setInputError(error?.message || "Please log in again.");
  }
  updateBookButton();
}

function updateFareUi() {
  const carpoolAllowed = isCarpoolAllowed();
  if (!carpoolAllowed) {
    STATE.carpoolOn = false;
    E.carpool.checked = false;
    E.carpool.disabled = true;
  } else {
    E.carpool.disabled = false;
    E.carpool.checked = STATE.carpoolOn;
  }

  const maxSeats = Math.max(1, STATE.seatsLeft);
  if (STATE.passengers > maxSeats) STATE.passengers = maxSeats;
  const openSeats = carpoolAllowed && STATE.carpoolOn ? Math.max(0, maxSeats - STATE.passengers) : maxSeats;
  E.carpoolSeats.textContent = openSeats + (openSeats === 1 ? " seat" : " seats");
  E.carpoolPassengerCount.textContent = String(STATE.passengers);
  document.querySelectorAll(".passenger-btn").forEach((btn) => {
    const dir = Number(btn.dataset.dir || 0);
    const disableMinus = dir < 0 && STATE.passengers <= 1;
    const disablePlus = dir > 0 && STATE.passengers >= maxSeats;
    btn.disabled = disableMinus || disablePlus;
  });

  if (carpoolAllowed && STATE.carpoolOn) {
    E.carpoolDetails.classList.remove("is-hidden");
    E.carpoolCard.classList.remove("is-disabled");
  } else {
    E.carpoolDetails.classList.add("is-hidden");
    E.carpoolCard.classList.add("is-disabled");
  }

  const breakdown = getFareBreakdown();
  const activeFare = breakdown.individualFare;
  E.originalFare.textContent = money(breakdown.totalFare);
  if (E.individualFare) E.individualFare.textContent = money(breakdown.individualFare);
  if (E.discountFare) E.discountFare.textContent = money(breakdown.discountAmount);
  E.saveNote.textContent = breakdown.discountAmount > 0
    ? "You save " + money(breakdown.discountAmount) + " on this ride!"
    : "No carpool discount applied on this ride.";
  const savePill = document.querySelector(".save-pill");
  if (savePill) savePill.textContent = `Save ${breakdown.discountPercent}%`;
  updateOfferRangeHint();

  if (!E.offerInput.value || Number(E.offerInput.value) <= 0 || !isOfferValid(Number(E.offerInput.value || 0))) {
    E.offerInput.value = String(activeFare);
    if (E.offerError) E.offerError.classList.remove("is-visible");
  }
  const bounds = getOfferBounds();
  E.offerInput.min = String(bounds.minOffer);
  E.offerInput.max = String(bounds.maxOffer);
  E.offerInput.title = "Your Offer";
  updateBookButton();
  validateOfferInput({ showFeedback: false, normalize: true });
}

function handleOfferTyping() {
  STATE.offerTouched = true;
  clearTimeout(STATE.offerValidationTimer);
  clearOfferFeedback();
  updateOfferRangeHint();
  updateBookButton();
}

function validateOfferInput(options = {}) {
  const showFeedback = options.showFeedback === true;
  const normalize = options.normalize === true;
  const raw = String(E.offerInput.value || "").trim();
  if (raw === "") {
    if (showFeedback) showOfferValidation(getOfferValidation(0), true);
    updateBookButton();
    return false;
  }

  const value = Math.max(0, Number(raw));
  if (!Number.isFinite(value)) {
    if (showFeedback) showOfferValidation(getOfferValidation(0), true);
    updateBookButton();
    return false;
  }

  const rounded = Math.round(value);
  if (normalize) E.offerInput.value = String(rounded);
  const validation = getOfferValidation(rounded);
  if (!validation.valid) {
    if (showFeedback) showOfferValidation(validation, true);
    updateBookButton();
    return false;
  } else {
    updateOfferRangeHint();
    clearOfferFeedback();
    STATE.offerValidationShown = "";
  }
  updateBookButton();
  return true;
}

function clearOfferFeedback() {
  if (E.offerError) E.offerError.classList.remove("is-visible");
}

function showOfferValidation(validation, modal = false) {
  updateOfferRangeHint("Offer out of range. ");
  if (E.offerError) {
    E.offerError.textContent = validation.message;
    E.offerError.classList.add("is-visible");
  }
  if (modal) maybeShowOfferValidationModal(validation);
}

function updateOfferRangeHint(prefix = "") {
  if (!E.rideFareHint) return;
  const bounds = getOfferBounds();
  E.rideFareHint.textContent = `${prefix}Min ${money(bounds.minOffer)} · Recommended ${money(bounds.estimated)} · Max ${money(bounds.maxOffer)}`;
}

function getActiveFare() {
  return getFareBreakdown().individualFare;
}

function getFareBreakdown() {
  const totalFare = Math.max(1, Math.round(Number(STATE.baseFare || 0)));
  if (!STATE.carpoolOn) {
    return {
      totalFare,
      individualFare: totalFare,
      discountAmount: 0,
      discountPercent: 0
    };
  }
  const passengerCount = Math.max(1, Number(STATE.passengers || 1));
  const shareBeforeDiscount = totalFare / passengerCount;
  const perPassengerDiscount = Math.min(0.45, 0.1 * Math.max(0, passengerCount - 1));
  const individualFare = Math.max(50, Math.round(shareBeforeDiscount * (1 - perPassengerDiscount)));
  const discountAmount = Math.max(0, Math.round(shareBeforeDiscount - individualFare));
  return {
    totalFare,
    individualFare,
    discountAmount,
    discountPercent: Math.round(perPassengerDiscount * 100)
  };
}

function getOfferBounds() {
  const estimated = Math.max(1, Math.round(getActiveFare()));
  const distance = Math.max(0, Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0));
  const duration = Math.max(0, Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0));
  const lowerFlex = Math.min(55, Math.max(25, 15 + (distance * 2) + (duration * 0.4)));
  const upperFlex = Math.min(60, Math.max(30, 20 + (distance * 2.5) + (duration * 0.5)));
  const minOffer = Math.max(1, roundFareToNearest10(estimated - lowerFlex));
  const maxOffer = Math.max(minOffer + 10, roundFareToNearest10(estimated + upperFlex));
  return { estimated, minOffer, maxOffer };
}

function roundFareToNearest10(value) {
  return Math.max(1, Math.round(Number(value || 0) / 10) * 10);
}

function vehicleFareRates() {
  const type = String(STATE.rideType || "").toLowerCase();
  if (type.includes("bike")) return FARE_CONFIG.bike;
  if (type.includes("scooty")) return FARE_CONFIG.scooty;
  return FARE_CONFIG.car;
}

function calculateFareFromRoute(distanceKm, durationMin = 0) {
  const distance = Math.max(0, Number(distanceKm || 0));
  const duration = Math.max(0, Number(durationMin || 0));
  const rates = vehicleFareRates();
  return Math.max(
    rates.baseFare,
    roundFareToNearest10(rates.baseFare + (distance * rates.perKmRate) + (duration * rates.perMinRate))
  );
}

function validRoutePoint(point) {
  return Boolean(point
    && Number.isFinite(Number(point.lat))
    && Number.isFinite(Number(point.lng))
    && Number(point.lat) >= -90
    && Number(point.lat) <= 90
    && Number(point.lng) >= -180
    && Number(point.lng) <= 180
    && (!window.WowMapbox || WowMapbox.isInsidePakistan({ lat: Number(point.lat), lng: Number(point.lng) })));
}

function applyFallbackRouteFromLocations(origin = STATE.pickupPlace, destination = STATE.dropPlace) {
  if (!validRoutePoint(origin) || !validRoutePoint(destination)) return false;
  const start = { ...STATE.pickupPlace, ...origin, lat: Number(origin.lat), lng: Number(origin.lng) };
  const end = { ...STATE.dropPlace, ...destination, lat: Number(destination.lat), lng: Number(destination.lng) };
  if (Math.abs(start.lng - end.lng) < 0.000001 && Math.abs(start.lat - end.lat) < 0.000001) return false;
  STATE.pickupPlace = start;
  STATE.dropPlace = end;
  STATE.routeDistanceKm = 0;
  STATE.routeDurationMin = 0;
  STATE.routeAvailable = false;
  STATE.routeLoading = false;
  STATE.lastMainRouteKey = "";
  if (STATE.map && window.WowMapbox) {
    setRouteMarkers("main", start, end);
    WowMapbox.clearRoute(STATE.map, STATE.mainRouteLayerId);
    if (!STATE.mapUserExploring) {
      try { WowMapbox.fitMap(STATE.map, [start, end], 52); } catch {}
    }
  }
  setBookingMapRouteVisible(false);
  updateFareUi();
  return false;
}

function getSelectedPaymentMethod() {
  const selected = (E.paymentMethodInputs || []).find((input) => input.checked);
  return selected ? String(selected.value || "").toLowerCase() : "";
}

function ensureDefaultPaymentMethod() {
  const inputs = E.paymentMethodInputs || [];
  if (!inputs.length || inputs.some((input) => input.checked)) return;
  const cash = inputs.find((input) => String(input.value || "").toLowerCase() === "cash");
  if (cash) cash.checked = true;
  syncPaymentHint();
}

function paymentMethodLabel(method) {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "Cash";
  if (value === "easypaisa") return "Easypaisa";
  if (value === "jazzcash") return "JazzCash";
  if (value === "nayapay") return "NayaPay";
  return "Online";
}

function getSelectedDriverDbId() {
  const rawId = String(STATE.selectedDriver?.id || "");
  const match = rawId.match(/db-driver-(\d+)/i);
  if (match) return Number(match[1] || 0);
  const dbId = Number(STATE.selectedDriver?.db_id || 0);
  return dbId > 0 ? dbId : 0;
}

function syncPaymentHint() {
  if (!E.paymentHint) return;
  const method = getSelectedPaymentMethod();
  if (!method) {
    E.paymentHint.textContent = "Select payment method before booking";
    return;
  }
  E.paymentHint.textContent = `Selected: ${paymentMethodLabel(method)}`;
}

function setInputError(message) {
  if (!E.inputError) return;
  if (!message) {
    E.inputError.classList.remove("is-visible");
    return;
  }
  E.inputError.textContent = message;
  E.inputError.classList.add("is-visible");
}

function isOfferValid(offer) {
  const { minOffer, maxOffer } = getOfferBounds();
  return offer >= minOffer && offer <= maxOffer;
}

function getOfferValidation(offer) {
  const value = Math.max(0, Number(offer || 0));
  const bounds = getOfferBounds();
  if (value < bounds.minOffer) {
    return { valid: false, kind: "low", message: "Your offer is too low. Please enter a fair amount." };
  }
  if (value > bounds.maxOffer) {
    return { valid: false, kind: "high", message: "Your offer is too high. Please enter a valid range." };
  }
  return { valid: true, kind: "", message: "" };
}

function maybeShowOfferValidationModal(validation) {
  if (!validation || validation.valid) return;
  if (!E.offerValidationOverlay || !E.offerValidationModal) return;
  const signature = `${validation.kind}:${E.offerInput.value}`;
  if (STATE.offerValidationShown === signature) return;
  STATE.offerValidationShown = signature;
  E.offerValidationTitle.textContent = validation.kind === "low" ? "Offer Too Low" : "Offer Too High";
  E.offerValidationMessage.textContent = validation.message;
  openModal(E.offerValidationOverlay, E.offerValidationModal);
}

function inferTrafficLevel() {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20)) return "high";
  if (hour >= 11 && hour <= 16) return "medium";
  return "low";
}

function inferTimeOfDay() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 22 ? "day" : "night";
}

function queueFareEstimate(delayMs = 320) {
  clearTimeout(STATE.fareEstimateTimer);
  STATE.fareEstimateTimer = setTimeout(() => {
    requestFareEstimate();
  }, delayMs);
}

function buildFarePayload() {
  const payload = {
    pickup: STATE.pickup,
    drop: STATE.drop,
    vehicle_type: STATE.rideType,
    traffic_level: inferTrafficLevel(),
    time_of_day: inferTimeOfDay()
  };

  if (STATE.pickupPlace) {
    payload.pickup_lat = STATE.pickupPlace.lat;
    payload.pickup_lng = STATE.pickupPlace.lng;
    payload.pickup_address = STATE.pickupAddress || STATE.pickupPlace.address || STATE.pickup;
  }
  if (STATE.dropPlace) {
    payload.drop_lat = STATE.dropPlace.lat;
    payload.drop_lng = STATE.dropPlace.lng;
    payload.drop_address = STATE.dropAddress || STATE.dropPlace.address || STATE.drop;
  }

  if (STATE.routeDistanceKm > 0 && STATE.routeDurationMin > 0) {
    payload.distance_km = STATE.routeDistanceKm;
    payload.duration_min = STATE.routeDurationMin;
  }

  return payload;
}

async function requestFareEstimate() {
  if (!STATE.pickup || !STATE.drop) return;

  // Do not send an expensive server-side geocoding request while the passenger
  // is still typing. A real fare is calculated as soon as both locations have
  // been selected and Mapbox has supplied their coordinates (or a route).
  const hasSelectedLocations = Boolean(
    (STATE.pickupPlace && STATE.dropPlace) ||
    (STATE.routeDistanceKm > 0 && STATE.routeDurationMin > 0)
  );
  if (!hasSelectedLocations) return;

  const requestSeq = ++STATE.fareEstimateSeq;
  const payload = buildFarePayload();
  if (STATE.fareEstimateAbortController) {
    STATE.fareEstimateAbortController.abort();
  }
  const abortController = new AbortController();
  STATE.fareEstimateAbortController = abortController;

  try {
    const res = await fetch(FARE_API.estimate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });
    const data = await res.json();
    if (requestSeq !== STATE.fareEstimateSeq) return;
    if (!res.ok || !data || !data.ok) return;

    STATE.fareMeta = {
      distance_km: Number(data.distance_km || payload.distance_km || 0),
      duration_min: Number(data.duration_min || payload.duration_min || 0),
      traffic_level: String(data.traffic_level || payload.traffic_level || "medium"),
      time_of_day: String(data.time_of_day || payload.time_of_day || "day"),
      distance_source: String(data.distance_source || "fallback")
    };

    if (STATE.fareMeta.distance_km > 0) STATE.routeDistanceKm = STATE.fareMeta.distance_km;
    if (STATE.fareMeta.duration_min > 0) STATE.routeDurationMin = STATE.fareMeta.duration_min;
    if (STATE.routeDistanceKm > 0) STATE.baseFare = calculateFareFromRoute(STATE.routeDistanceKm, STATE.routeDurationMin);
    updateFareUi();
  } catch {
    // Keep existing static fare if API fails.
  } finally {
    if (STATE.fareEstimateAbortController === abortController) {
      STATE.fareEstimateAbortController = null;
    }
  }
}

let scheduleResultReturnFocus = null;

function safeScheduleLocation(value, fallback) {
  if (value == null || typeof value === "boolean") return fallback;
  if (typeof value === "object") {
    const nested = value.formattedAddress || value.address || value.name || value.label || "";
    return safeScheduleLocation(nested, fallback);
  }
  const text = String(value).trim();
  if (!text || text === "[object Object]" || /^(null|undefined)$/i.test(text) || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)) return fallback;
  return text;
}

function scheduleDateValue(value) {
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(Number(value.seconds) * 1000);
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value < 100000000000 ? value * 1000 : value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scheduleVehicleLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("scoot")) return "Scooty";
  if (normalized.includes("bike") || normalized.includes("motor")) return "Bike";
  if (normalized.includes("car")) return "Car";
  return "Vehicle";
}

function schedulePaymentLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ({ cash: "Cash", easypaisa: "Easypaisa", jazzcash: "JazzCash", nayapay: "NayaPay" })[normalized] || "Payment unavailable";
}

function openScheduleResult(details) {
  if (!E.scheduleResultDialog || !E.scheduleResultBackdrop) return;
  const when = scheduleDateValue(details.scheduledAt);
  E.scheduleResultDialog.classList.remove("is-error");
  E.scheduleResultTitle.textContent = "Ride Scheduled Successfully";
  E.scheduleResultMessage.textContent = "Your ride has been scheduled. You can view or manage it from your dashboard.";
  E.scheduleResultIcon.textContent = "✓";
  E.scheduleResultSummary.hidden = false;
  E.scheduleSuccessActions.hidden = false;
  E.scheduleErrorActions.hidden = true;
  E.successRideId.textContent = details.rideCode || details.rideId || "Ride created";
  E.successPickup.textContent = safeScheduleLocation(details.pickup, "Pickup unavailable");
  E.successDropoff.textContent = safeScheduleLocation(details.dropoff, "Drop-off unavailable");
  E.successDate.textContent = when ? when.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" }) : "Date unavailable";
  E.successTime.textContent = when ? when.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" }) : "Time unavailable";
  E.successVehicle.textContent = scheduleVehicleLabel(details.vehicle);
  E.successFare.textContent = money(details.fare);
  E.successPayment.textContent = schedulePaymentLabel(details.payment);
  E.successStatus.textContent = "Scheduled";
  E.viewScheduledRideBtn.href = `ride-details.html?rideId=${encodeURIComponent(details.rideId)}`;
  scheduleResultReturnFocus = E.bookBtn;
  E.scheduleResultBackdrop.hidden = false;
  E.scheduleResultDialog.hidden = false;
  document.body.classList.add("schedule-result-open");
  requestAnimationFrame(() => E.viewScheduledRideBtn.focus());
}

function openScheduleError(message = "") {
  if (!E.scheduleResultDialog || !E.scheduleResultBackdrop) return;
  E.scheduleResultDialog.classList.add("is-error");
  E.scheduleResultTitle.textContent = "Unable to Schedule Ride";
  E.scheduleResultMessage.textContent = message || "We couldn’t schedule your ride. Please check your connection and try again.";
  E.scheduleResultIcon.textContent = "!";
  E.scheduleResultSummary.hidden = true;
  E.scheduleSuccessActions.hidden = true;
  E.scheduleErrorActions.hidden = false;
  scheduleResultReturnFocus = E.bookBtn;
  E.scheduleResultBackdrop.hidden = false;
  E.scheduleResultDialog.hidden = false;
  document.body.classList.add("schedule-result-open");
  requestAnimationFrame(() => E.scheduleTryAgainBtn.focus());
}

function closeScheduleResult() {
  if (!E.scheduleResultDialog || E.scheduleResultDialog.hidden) return;
  E.scheduleResultDialog.hidden = true;
  E.scheduleResultBackdrop.hidden = true;
  document.body.classList.remove("schedule-result-open");
  const target = scheduleResultReturnFocus;
  scheduleResultReturnFocus = null;
  if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
}

function handleScheduleResultKeydown(event) {
  if (!E.scheduleResultDialog || E.scheduleResultDialog.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeScheduleResult();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(E.scheduleResultDialog.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(node => !node.hidden && node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function onBookRide(event) {
  if (event) event.preventDefault();
  clearTimeout(STATE.offerValidationTimer);
  resolveTypedLocationsForBooking(true);
  if (STATE.creatingRideRequest) return;
  if (STATE.activeRideDbId || STATE.isSearchingForDriver) {
    setInputError("You already have an active ride request.");
    if (STATE.activeRideDbId) openSearchingForDrivers(Number(E.offerInput.value || getActiveFare()));
    return;
  }
  const scheduleAttempt = Boolean(STATE.scheduledAt);
  let createdScheduledRide = null;
  STATE.creatingRideRequest = true;
  E.bookBtn.disabled = true;
  E.bookBtn.textContent = scheduleAttempt ? "Scheduling..." : "Booking...";
  try {
    if (!STATE.pickupPlace) throw new Error("Please select a valid pickup location.");
    if (!STATE.dropPlace) throw new Error("Please select a valid destination.");
    if (!Number.isFinite(Number(STATE.pickupPlace.lat)) || !Number.isFinite(Number(STATE.pickupPlace.lng))) {
      throw new Error("Pickup coordinates are unavailable. Please select the pickup again.");
    }
    if (!Number.isFinite(Number(STATE.dropPlace.lat)) || !Number.isFinite(Number(STATE.dropPlace.lng))) {
      throw new Error("Destination coordinates are unavailable. Please select the destination again.");
    }
    if (!RIDE_TYPES[STATE.rideType]) throw new Error("Please choose a vehicle.");
    if (!await ensureBookableRouteForBooking()) throw new Error("Please wait for a valid driving route before booking.");
    const paymentMethod = getSelectedPaymentMethod();
    if (!paymentMethod) throw new Error("Please select a payment method.");
    if (!isScheduledRideDateValid()) throw new Error("Please choose a valid scheduled ride time.");
    const requestedFare = Math.max(0, Number(E.offerInput.value || getActiveFare()));
    const validation = getOfferValidation(requestedFare);
    if (!validation.valid) throw new Error(validation.message || "Please enter a valid fare.");
    updateOfferRangeHint();
    syncPaymentHint();
    setInputError("");
    const rideMeta = await createRideRequestWithFallback(requestedFare);
    if (!rideMeta.rideId) throw new Error("ride_request_failed");
    if (STATE.carpoolOn) {
      localStorage.setItem("wow_carpool_ride_id", rideMeta.rideId);
      const card = document.getElementById("carpoolCard");
      if (card && !document.getElementById("openCarpoolStatus")) {
        const link = document.createElement("a");
        link.id = "openCarpoolStatus";
        link.className = "carpool-status-link";
        link.href = `passenger-carpool.html?rideId=${encodeURIComponent(rideMeta.rideId)}`;
        link.textContent = "Open live carpool details";
        card.appendChild(link);
      }
    }
    const scheduled = Boolean(STATE.scheduledAt);
    console.info("[WOW Passenger] ride created", {
      collection: "rides",
      rideId: rideMeta.rideId,
      status: scheduled ? "scheduled" : "searching",
      requestStatus: scheduled ? "scheduled" : "open"
    });
    if (scheduled) {
      createdScheduledRide = {
        rideId: rideMeta.rideId,
        rideCode: rideMeta.rideCode,
        pickup: STATE.pickupAddress || STATE.pickup,
        dropoff: STATE.dropAddress || STATE.drop,
        scheduledAt: STATE.scheduledAt,
        vehicle: STATE.rideType,
        fare: requestedFare,
        payment: getSelectedPaymentMethod()
      };
      try {
        persistScheduledRide(requestedFare, { rideCode: rideMeta.rideCode, rideId: rideMeta.rideId });
      } catch (cacheError) {
        console.warn("[WOW Passenger] Scheduled ride local cache skipped", cacheError);
      }
      openScheduleResult(createdScheduledRide);
      STATE.scheduledSubmissionRideId = "";
      STATE.scheduledSubmissionRideCode = "";
      try {
        resetScheduledRide();
      } catch (resetError) {
        console.warn("[WOW Passenger] Scheduled form reset skipped", resetError);
      }
      return;
    }
    STATE.requestId = rideMeta.rideId;
    STATE.declinedDriverOfferIds.clear();
    STATE.activeRideCode = rideMeta.rideCode;
    STATE.activeRideDbId = rideMeta.rideId;
    STATE.isSearchingForDriver = true;
    persistPendingRide(requestedFare, { rideCode: rideMeta.rideCode, rideId: rideMeta.rideId });
    openSearchingForDrivers(requestedFare);
    attachPassengerRideRequestListeners(rideMeta.rideId);
  } catch (error) {
    if (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) console.error("WOW ride request create failed:", error);
    E.matchOverlay.classList.remove("is-open");
    E.matchOverlay.setAttribute("aria-hidden", "true");
    STATE.isSearchingForDriver = false;
    if (scheduleAttempt) {
      setInputError("");
      if (createdScheduledRide?.rideId) {
        // The Firestore write succeeded; a secondary UI/cache error must not
        // invite a retry that could create a duplicate scheduled booking.
        openScheduleResult(createdScheduledRide);
        STATE.scheduledSubmissionRideId = "";
        STATE.scheduledSubmissionRideCode = "";
      } else {
        const message = String(error?.message || "").toLowerCase();
        const friendlyMessage = message.includes("scheduled ride time") || message.includes("future")
          ? "Please choose a future date and time for your scheduled ride."
          : message.includes("pickup")
            ? "Please select a valid pickup location and try again."
            : message.includes("destination")
              ? "Please select a valid drop-off location and try again."
              : message.includes("payment")
                ? "Please select a payment method and try again."
                : message.includes("sign") || message.includes("log in") || message.includes("permission")
                  ? "Your session could not be verified. Please sign in again and retry."
                  : "We couldn’t schedule your ride. Please check your connection and try again.";
        openScheduleError(friendlyMessage);
      }
    } else {
      const bookingMessage = error?.message || "Please try again.";
      setInputError(
        /valid driving route|route between pickup/i.test(bookingMessage)
          ? bookingMessage
          : "Ride request failed: " + bookingMessage
      );
    }
  } finally {
    STATE.creatingRideRequest = false;
    updateBookButton();
  }
}

async function createRideRequestDocument(passengerOfferFare) {
  if (!window.WowFirestore) throw new Error("Firestore unavailable");
  const { db, FieldValue, firebase } = await window.WowFirestore.ready();
  const currentUser = firebase?.auth ? firebase.auth().currentUser : null;
  const isScheduledSubmission = Boolean(STATE.scheduledAt);
  const rideRef = isScheduledSubmission && STATE.scheduledSubmissionRideId
    ? db.collection("rides").doc(STATE.scheduledSubmissionRideId)
    : db.collection("rides").doc();
  const rideCode = isScheduledSubmission && STATE.scheduledSubmissionRideCode
    ? STATE.scheduledSubmissionRideCode
    : generateRideCode();
  if (isScheduledSubmission) {
    STATE.scheduledSubmissionRideId = rideRef.id;
    STATE.scheduledSubmissionRideCode = rideCode;
  }
  if (!currentUser?.uid) throw new Error("You must be signed in to request a ride.");
  const passengerId = currentUser.uid;
  const passengerName = localStorage.getItem("wow_user_name") || currentUser.displayName || "Passenger";
  const passengerPhone = localStorage.getItem("wow_user_phone") || currentUser.phoneNumber || "";
  const selectedVehicleType = window.WowVehicle?.normalize(STATE.rideType) || "";
  if (!selectedVehicleType) throw new Error("Please choose a valid vehicle type.");
  const offeredFare = Number(passengerOfferFare || 0);
  const scheduledAt = STATE.scheduledAt ? new Date(STATE.scheduledAt) : null;
  const isScheduled = Boolean(scheduledAt);
  const requestedAtDate = new Date();
  const requestedAtTimestamp = firebase.firestore.Timestamp.fromDate(requestedAtDate);
  const expiresAtTimestamp = firebase.firestore.Timestamp.fromMillis(
    (isScheduled ? scheduledAt.getTime() : requestedAtDate.getTime()) + (10 * 60 * 1000)
  );
  const carpoolTotalSeats = STATE.carpoolOn ? Math.max(1, Number(STATE.seatsLeft || RIDE_TYPES["WOW Car"]?.seats || 4)) : 0;
  const carpoolSeatsRequired = STATE.carpoolOn ? Math.max(1, Math.min(carpoolTotalSeats || 1, Number(STATE.passengers || 1))) : 1;
  const carpoolAvailableSeats = STATE.carpoolOn ? Math.max(0, carpoolTotalSeats - carpoolSeatsRequired) : 0;
  const carpoolPassenger = STATE.carpoolOn ? {
    userId: passengerId,
    name: passengerName,
    phone: passengerPhone,
    photo: localStorage.getItem("wow_user_photo") || localStorage.getItem("wow_profile_photo") || "",
    pickup: STATE.pickupAddress || STATE.pickupPlace.address || STATE.pickup,
    destination: STATE.dropAddress || STATE.dropPlace.address || STATE.drop,
    pickupStatus: "waiting",
    seatsRequired: carpoolSeatsRequired,
    joinedAt: firebase.firestore.Timestamp.fromDate(new Date())
  } : null;
  await rideRef.set({
    rideId: rideRef.id,
    passengerId: passengerId,
    passengerUid: passengerId,
    userId: passengerId,
    passengerName,
    passengerPhone,
    passengerProfileImage: localStorage.getItem("wow_user_photo") || localStorage.getItem("wow_profile_photo") || "",
    pickupName: STATE.pickupPlace.title || STATE.pickup,
    pickup: STATE.pickupAddress || STATE.pickupPlace.address || STATE.pickup,
    pickupAddress: STATE.pickupAddress || STATE.pickupPlace.address || STATE.pickup,
    pickupLatitude: Number(STATE.pickupPlace.lat),
    pickupLongitude: Number(STATE.pickupPlace.lng),
    pickupMapboxId: STATE.pickupPlace.mapboxId || "",
    destinationName: STATE.dropPlace.title || STATE.drop,
    destinationAddress: STATE.dropAddress || STATE.dropPlace.address || STATE.drop,
    dropoff: STATE.dropAddress || STATE.dropPlace.address || STATE.drop,
    dropoffName: STATE.dropPlace.title || STATE.drop,
    dropoffAddress: STATE.dropAddress || STATE.dropPlace.address || STATE.drop,
    dropoffLatitude: Number(STATE.dropPlace.lat),
    dropoffLongitude: Number(STATE.dropPlace.lng),
    destinationLatitude: Number(STATE.dropPlace.lat),
    destinationLongitude: Number(STATE.dropPlace.lng),
    destinationMapboxId: STATE.dropPlace.mapboxId || "",
    dropoffMapboxId: STATE.dropPlace.mapboxId || "",
    pickupPlaceType: STATE.pickupPlace.type || "",
    dropoffPlaceType: STATE.dropPlace.type || "",
    requestedVehicleType: selectedVehicleType,
    vehicleType: selectedVehicleType,
    rideType: STATE.carpoolOn ? "carpool" : "private",
    isCarpool: Boolean(STATE.carpoolOn),
    creatorId: STATE.carpoolOn ? passengerId : null,
    passengerIds: STATE.carpoolOn ? [passengerId] : [],
    passengers: STATE.carpoolOn && carpoolPassenger ? [carpoolPassenger] : [],
    totalSeats: STATE.carpoolOn ? carpoolTotalSeats : null,
    availableSeats: STATE.carpoolOn ? carpoolAvailableSeats : null,
    occupiedSeats: STATE.carpoolOn ? carpoolSeatsRequired : null,
    distanceKm: Number(STATE.routeDistanceKm || STATE.fareMeta.distance_km || 0),
    distance: Number(STATE.routeDistanceKm || STATE.fareMeta.distance_km || 0),
    durationMin: Number(STATE.routeDurationMin || STATE.fareMeta.duration_min || 0),
    durationMinutes: Number(STATE.routeDurationMin || STATE.fareMeta.duration_min || 0),
    estimatedFare: Number(getActiveFare() || offeredFare),
    originalFare: Number(STATE.baseFare || getActiveFare() || offeredFare),
    sharedFare: Number(getActiveFare() || offeredFare),
    savings: Math.max(0, Number(STATE.baseFare || 0) - Number(getActiveFare() || offeredFare)),
    estimatedSavings: Math.max(0, Number(STATE.baseFare || 0) - Number(getActiveFare() || offeredFare)),
    seatsRequired: STATE.carpoolOn ? carpoolSeatsRequired : Number(STATE.passengers || 1),
    carpoolStatus: STATE.carpoolOn ? "active" : null,
    matchStatus: STATE.carpoolOn ? "searching" : null,
    maxAllowedDetour: STATE.carpoolOn ? 35 : null,
    pickupNotes: STATE.carpoolOn ? String(E.carpoolPickupNotes?.value || "").trim() : "",
    passengerOffer: offeredFare,
    paymentMethod: getSelectedPaymentMethod(),
    paymentStatus: getSelectedPaymentMethod() === "cash" ? "cash_pending" : "unpaid",
    requestedAt: requestedAtTimestamp,
    requestCreatedAt: requestedAtTimestamp,
    clientCreatedAt: requestedAtDate.toISOString(),
    createdAtMs: requestedAtDate.getTime(),
    requestedAtMs: requestedAtDate.getTime(),
    status: isScheduled ? "scheduled" : "searching",
    requestStatus: isScheduled ? "scheduled" : "open",
    driverId: null,
    driverUid: null,
    driverName: null,
    driverAccepted: false,
    passengerAccepted: false,
    driverDecision: "pending",
    passengerDecision: "pending",
    counterOffer: null,
    driverAssigned: false,
    assignmentStatus: isScheduled ? "pending" : "searching",
    isScheduled,
    ...(STATE.carpoolOn ? {
      carpool: {
        enabled: true,
        matchStatus: "searching",
        totalSeats: carpoolTotalSeats,
        availableSeats: carpoolAvailableSeats,
        sharedFare: Number(getActiveFare() || offeredFare),
        originalFare: Number(STATE.baseFare || getActiveFare() || offeredFare),
        savings: Math.max(0, Number(STATE.baseFare || 0) - Number(getActiveFare() || offeredFare)),
        seatsRequired: carpoolSeatsRequired,
        maxDetourKm: 2.5,
        matchedPassengerIds: [],
        passengerUids: [passengerId]
      }
    } : {}),
    ...(isScheduled ? {
      isScheduled: true,
      scheduledAt: firebase.firestore.Timestamp.fromDate(scheduledAt),
      scheduledDate: calendarDateKey(scheduledAt),
      scheduledTime: scheduledAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      assignmentStartsAt: firebase.firestore.Timestamp.fromMillis(scheduledAt.getTime() - (30 * 60 * 1000)),
      assignmentAttempt: 0,
      searchRadiusKm: 5
    } : {}),
    assignedDriverId: null,
    rideCode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAtTimestamp,
    expiresAtMs: expiresAtTimestamp.toMillis()
  });
  if (isScheduled) {
    const scheduledNotificationId = `${rideRef.id}_ride_scheduled`;
    try {
      await db.runTransaction(async transaction => {
        const notificationRef = db.collection("notifications").doc(scheduledNotificationId);
        const existingNotification = await transaction.get(notificationRef);
        if (existingNotification.exists) return;
        transaction.set(notificationRef, {
          notificationId: scheduledNotificationId,
          eventId: scheduledNotificationId,
          type: "ride_scheduled",
          eventStatus: "scheduled",
          rideId: rideRef.id,
          passengerUid: passengerId,
          receiverUid: passengerId,
          receiverRole: "passenger",
          title: "Ride scheduled",
          body: "Your ride has been scheduled successfully.",
          read: false,
          isRead: false,
          createdAt: FieldValue.serverTimestamp()
        });
      });
    } catch (error) {
      console.warn("[WOW Passenger] Scheduled notification skipped", error?.code || error?.message);
    }
  }
  // Spark-plan carpool: the canonical `rides` document created above is the
  // complete shared-ride record. Other passengers join it through a Firestore
  // transaction; no PHP action, Cloud Function, or secondary booking record.
  console.info("[WOW Passenger] Firestore write complete", {
    collection: "rides",
    rideId: rideRef.id,
    rideCode,
    status: isScheduled ? "scheduled" : "searching",
    requestStatus: isScheduled ? "scheduled" : "open",
    vehicleType: selectedVehicleType,
    scheduledAt: isScheduled ? scheduledAt.toISOString() : null,
    pickupAvailable: Boolean(STATE.pickupAddress || STATE.pickup),
    dropoffAvailable: Boolean(STATE.dropAddress || STATE.drop)
  });
  return { rideId: rideRef.id, rideCode, fare: Number(passengerOfferFare || 0) };
}

function openSearchingForDrivers(requestedFare) {
  STATE.isSearchingForDriver = true;
  E.matchOverlay.classList.add("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "false");
  E.matchPanel.classList.remove("show-offer");
  E.matchPanel.classList.add("show-drivers");
  const header = E.matchPanel.querySelector(".match-header strong");
  const loadingText = E.matchPanel.querySelector(".match-loading p");
  const title = E.matchPanel.querySelector(".match-title strong");
  const sub = E.matchPanel.querySelector(".match-title span");
  if (header) header.textContent = "Finding drivers...";
  if (loadingText) loadingText.textContent = `Pickup: ${STATE.pickup} | Drop-off: ${STATE.drop} | Vehicle: ${STATE.rideType} | Offer: ${money(requestedFare)}`;
  if (title) title.textContent = "Live driver offers";
  if (sub) sub.textContent = "Passenger offer: " + money(requestedFare);
  if (E.driverGrid) E.driverGrid.innerHTML = '<div class="empty-state"><strong>Finding drivers...</strong><p>Available drivers will appear here instantly.</p></div>';
  if (E.matchOfferInput) E.matchOfferInput.value = String(Math.round(requestedFare));
  if (E.sendOffer) E.sendOffer.style.display = "none";
  if (E.acceptOffer) E.acceptOffer.disabled = true;
  if (E.declineOffer) E.declineOffer.disabled = true;
  stopMatchingPoll();
}

function normalizeDriverRideType(type) {
  const text = String(type || "").toLowerCase();
  if (text.includes("bike")) return "WOW Bike";
  if (text.includes("scooty")) return "WOW Scooty";
  return "WOW Car";
}

function loadPassengerDriversWithFallback(requestedFare, forceDemo = false) {
  void requestedFare;
  void forceDemo;
}

function renderPassengerDriverCards(drivers, requestedFare, isDemo) {
  if (!E.driverGrid) return;
  STATE.demoDriverCardsRendered = true;
  STATE.activeDriverOffers.clear();
  STATE.selectedOffer = null;
  E.matchPanel.classList.remove("show-offer");
  E.matchPanel.classList.add("show-drivers");
  E.driverGrid.innerHTML = "";
  drivers.forEach((driver, index) => {
    const offer = {
      id: driver.id || "demo-driver-" + index,
      driverId: driver.id || "demo-driver-" + index,
      driverName: driver.name || "Driver",
      driverPhone: driver.phone || "",
      driverVehicle: driver.vehicleType || STATE.rideType,
      driverVehicleNumber: driver.vehicleNumber || "",
      driverRating: driver.rating || "4.8",
      etaMin: Number(driver.etaMin || 4),
      offeredFare: Number(driver.offerFare || driver.offeredFare || Math.max(1, Math.round(Number(requestedFare || getActiveFare() || 0) + (index * 20)))),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + OFFER_RESPONSE_WINDOW_MS).toISOString(),
      isDemo: !!isDemo
    };
    STATE.activeDriverOffers.set(offer.id, offer);
    renderPassengerDriverCard(offer);
    scheduleOfferExpiry(offer);
  });
}

function renderPassengerDriverCard(offer) {
  const card = document.createElement("article");
  card.className = "driver-card";
  card.dataset.offerId = offer.id;
  card.innerHTML =
    '<div class="driver-info">' +
    '<strong>' + esc(offer.driverName) + '</strong>' +
    '<span>' + esc(offer.driverVehicle) + ' . ' + esc(offer.driverVehicleNumber || "Vehicle") + ' . ' + esc(String(offer.driverRating)) + ' rating</span>' +
    '<span>ETA ' + esc(String(offer.etaMin || offer.driverEta || 4)) + ' min away</span>' +
    '</div>' +
    '<div class="driver-meta">' +
    '<strong>' + money(offer.offeredFare) + '</strong>' +
    '<span data-countdown="' + esc(offer.id) + '">120s left</span>' +
    '</div>' +
    '<div class="offer-actions">' +
    '<button class="offer-btn decline" type="button" data-demo-decline="' + esc(offer.id) + '">Decline</button>' +
    '<button class="offer-btn accept" type="button" data-demo-accept="' + esc(offer.id) + '">Accept</button>' +
    '</div>';
  card.querySelector("[data-demo-accept]").addEventListener("click", () => acceptPassengerDriverCard(offer.id));
  card.querySelector("[data-demo-decline]").addEventListener("click", () => declinePassengerDriverCard(offer.id));
  E.driverGrid.appendChild(card);
}

async function attachPassengerRideRequestListeners(rideId) {
  detachPassengerRideRequestListeners();
  let db;
  try {
    if (!window.WowFirestore) throw new Error("Firestore unavailable");
    ({ db } = await window.WowFirestore.ready());
  } catch (error) {
    console.warn("[WOW Passenger] Firestore listener unavailable; using PHP ride polling", error?.message || error);
    startPassengerOfferFallbackPoll(String(rideId));
    return;
  }
  const rideRef = db.collection("rides").doc(String(rideId));
  STATE.passengerRideUnsubscribe = rideRef.onSnapshot((doc) => {
    if (!doc.exists) return;
    const ride = { id: doc.id, ...doc.data() };
    const status = String(ride.status || "").toLowerCase();
    localStorage.setItem("wow_ride_status", status);
    if (status === "searching" && ride.requestStatus === "open" && !ride.assignedDriverId) {
      const parentOffer = dashboardOfferFromRide(ride);
      if (parentOffer && offerExpiryMillis(parentOffer) > Date.now()) {
        STATE.activeDriverOffers.set(parentOffer.id, parentOffer);
      }
      const requestedFare = Number(ride.passengerOffer || 0);
      openSearchingForDrivers(requestedFare);
      renderPassengerDriverOffers();
      return;
    }
    if (["driver_assigned", "accepted", "driver_selected", "driver_en_route", "driver_arriving", "arriving", "arrived", "ride_started", "started", "ongoing", "in_progress", "on_trip", "active"].includes(status) && (ride.assignedDriverId || ride.acceptedDriverId || ride.driverId || ride.driverUid)) {
      STATE.selectedDriver = {
        name: ride.driverName || ride.acceptedDriverName || "Driver",
        phone: ride.driverPhone || ride.acceptedDriverPhone || "",
        rating: ride.driverRating || "4.9",
        trips: ride.driverTrips || "",
        etaMin: 6,
        vehicleType: ride.driverVehicleType || ride.acceptedDriverVehicle || ride.vehicleType || STATE.rideType,
        vehicleNumber: ride.driverVehicleNumber || ride.vehicleNumber || ""
      };
      finalizeAcceptedRideFlow(Number(ride.finalFare || ride.acceptedFare || ride.passengerOffer || 0), ride.rideCode || STATE.activeRideCode, doc.id, status);
    }
    if (status === "started") {
      localStorage.setItem("wow_ride_started", "1");
      window.location.assign(`passenger-ride.html?ride_code=${encodeURIComponent(ride.rideCode || STATE.activeRideCode || "")}`);
    }
    if (["cancelled", "expired"].includes(status) || ["cancelled", "closed"].includes(String(ride.requestStatus || "").toLowerCase())) {
      STATE.isSearchingForDriver = false;
      STATE.activeRideDbId = "";
      E.matchOverlay.classList.remove("is-open");
      E.matchOverlay.setAttribute("aria-hidden", "true");
      detachPassengerRideRequestListeners();
      updateBookButton();
    }
  }, (error) => {
    console.error("[WOW Passenger] ride listener error", error);
    startPassengerOfferFallbackPoll(String(rideId));
    setInputError("Live ride updates failed: " + (error?.message || "Firestore error"));
  });
  STATE.passengerOffersUnsubscribe = rideRef.collection("offers")
    .where("status", "==", "pending")
    .limit(30)
    .onSnapshot((snapshot) => {
      const next = new Map();
      snapshot.forEach((doc) => {
        const offer = { id: doc.id, ...doc.data() };
        const offeredFare = Number(offer.offeredFare);
        const requestedType = window.WowVehicle?.normalize(STATE.rideType) || "";
        const offeredType = window.WowVehicle?.normalize(offer.driverVehicleType || offer.vehicleType) || "";
        if (!STATE.declinedDriverOfferIds.has(String(doc.id)) && offerExpiryMillis(offer) > Date.now() && Number.isFinite(offeredFare) && offeredFare > 0 && requestedType && offeredType === requestedType) next.set(doc.id, offer);
      });
      STATE.activeDriverOffers = next;
      if (STATE.selectedOffer && !next.has(STATE.selectedOffer.id)) STATE.selectedOffer = null;
      renderPassengerDriverOffers();
    }, (error) => {
      console.error("[WOW Passenger] offer listener error", error);
      startPassengerOfferFallbackPoll(String(rideId));
      setInputError("Driver offers could not be loaded: " + (error?.message || "Firestore error"));
    });
}

function startPassengerOfferFallbackPoll(rideId) {
  if (STATE.passengerOfferPollTimer) clearInterval(STATE.passengerOfferPollTimer);
  const poll = async () => {
    if (!rideId || !STATE.isSearchingForDriver) return;
    const passengerUid = currentPassengerUid();
    const query = new URLSearchParams({
      ride_id: rideId,
      role: "passenger",
      email: currentPassengerEmail(),
      firebase_uid: passengerUid,
      uid: passengerUid,
      user_id: passengerUid
    });
    try {
      const res = await fetch(`${RIDE_API.details}?${query.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.ride) return;
      const ride = data.ride;
      const status = String(ride.status || "").toLowerCase();
      if (["driver_assigned", "accepted"].includes(status) && ride.driver_id) {
        STATE.selectedDriver = {
          id: ride.driver_id, name: ride.driver_name || "Driver", phone: ride.driver_phone || "",
          rating: ride.respondingDriverRating || "4.9", etaMin: 6,
          vehicleType: ride.driver_vehicle_type || STATE.rideType,
          vehicleNumber: ride.driver_vehicle_number || ""
        };
        finalizeAcceptedRideFlow(Number(ride.fare || ride.offered_fare || 0), ride.ride_code || STATE.activeRideCode, ride.id || rideId, status);
        return;
      }
      const offer = dashboardOfferFromRide(ride);
      if (offer && offerExpiryMillis(offer) > Date.now()) {
        STATE.activeDriverOffers.set(offer.id, offer);
        renderPassengerDriverOffers();
      }
    } catch (error) {
      console.warn("[WOW Passenger] offer fallback poll failed", error);
    }
  };
  poll();
  STATE.passengerOfferPollTimer = setInterval(poll, 6000);
}

function dashboardOfferFromRide(ride) {
  if (String(ride.latestOfferStatus || "").toLowerCase() !== "pending") return null;
  const id = String(ride.latestOfferId || ride.respondingDriverId || "").trim();
  const offeredFare = Number(ride.driverOffer || ride.acceptedFare || 0);
  if (STATE.declinedDriverOfferIds.has(id)) return null;
  if (!id || !Number.isFinite(offeredFare) || offeredFare <= 0) return null;
  return {
    id,
    rideId: ride.id,
    driverId: id,
    driverName: ride.respondingDriverName || "Driver",
    driverPhone: ride.respondingDriverPhone || "",
    driverProfileImage: ride.respondingDriverProfileImage || "",
    driverVehicleType: ride.respondingDriverVehicleType || "",
    driverVehicleName: ride.respondingDriverVehicleName || "",
    driverVehicleNumber: ride.respondingDriverVehicleNumber || "",
    vehicleType: ride.respondingDriverVehicleType || "",
    vehicleName: ride.respondingDriverVehicleName || "",
    vehicleNumber: ride.respondingDriverVehicleNumber || "",
    driverRating: Number(ride.respondingDriverRating || 0),
    passengerOffer: Number(ride.passengerOffer || 0),
    offeredFare,
    offerType: ride.latestOfferType || "counter_offer",
    status: "pending",
    createdAt: ride.driverResponseAt,
    expiresAt: ride.driverResponseExpiresAt
  };
}

async function restoreSearchingRideFromFirestore() {
  try {
    if (!window.WowFirestore) return;
    const { db, uid, FieldValue } = await window.WowFirestore.ready();
    if (!uid || STATE.activeRideDbId || STATE.creatingRideRequest) return;
    let snapshot;
    const restoreQuery = db.collection("rides").where("passengerId", "==", uid);
    try {
      snapshot = await restoreQuery.orderBy("createdAt", "desc").limit(10).get();
    } catch (error) {
      console.warn("[WOW Passenger] ordered active ride restore unavailable", error?.code || error?.message);
      snapshot = await restoreQuery.limit(10).get();
    }
    let active = null;
    let assignedActive = null;
    const expiredRefs = [];
    const now = Date.now();
    snapshot.forEach((doc) => {
      const ride = doc.data() || {};
      const created = firestoreTimestampMillis(ride.createdAt || ride.requestedAt);
      const lastKnownTime = created || firestoreTimestampMillis(ride.updatedAt);
      if (ride.status === "searching" && ride.requestStatus === "open" && !ride.assignedDriverId) {
        const expires = firestoreTimestampMillis(ride.expiresAt) || (lastKnownTime ? lastKnownTime + (10 * 60 * 1000) : now - 1);
        if (expires && expires <= now) {
          expiredRefs.push(doc.ref);
          return;
        }
        if (!active || created > active.created) active = { id: doc.id, ride, created };
      } else if (["driver_assigned", "accepted", "driver_selected", "driver_en_route", "driver_arriving", "arriving", "arrived", "ride_started", "started", "ongoing", "in_progress", "on_trip", "active"].includes(normalizeRideStatus(ride.status)) && (ride.assignedDriverId || ride.acceptedDriverId || ride.driverId || ride.driverUid)) {
        if (!assignedActive || created > assignedActive.created) assignedActive = { id: doc.id, ride, created };
      }
    });
    await Promise.all(expiredRefs.map((ref) => ref.set({
      status: "expired",
      requestStatus: "closed",
      expiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }).catch((error) => console.warn("[WOW Passenger] expired ride cleanup failed", error))));
    if (assignedActive) {
      localStorage.setItem("wow_ride_db_id", assignedActive.id);
      if (assignedActive.ride.rideCode) localStorage.setItem("wow_ride_code", String(assignedActive.ride.rideCode));
      localStorage.setItem("wow_ride_status", normalizeRideStatus(assignedActive.ride.status));
      window.location.assign(`passenger-ride.html?rideId=${encodeURIComponent(assignedActive.id)}`);
      return;
    }
    if (!active) return;
    STATE.activeRideDbId = active.id;
    STATE.requestId = active.id;
    STATE.activeRideCode = String(active.ride.rideCode || "");
    STATE.pickup = active.ride.pickupName || active.ride.pickupAddress || "Pickup";
    STATE.drop = active.ride.destinationName || active.ride.destinationAddress || "Destination";
    STATE.rideType = normalizeDriverRideType(active.ride.requestedVehicleType || active.ride.vehicleType || STATE.rideType);
    STATE.isSearchingForDriver = true;
    localStorage.setItem("wow_ride_db_id", active.id);
    if (STATE.activeRideCode) localStorage.setItem("wow_ride_code", STATE.activeRideCode);
    openSearchingForDrivers(Number(active.ride.passengerOffer || active.ride.estimatedFare || 0));
    attachPassengerRideRequestListeners(active.id);
    updateBookButton();
  } catch (error) {
    console.error("[WOW Passenger] active ride restore failed", error);
  }
}

function firestoreTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return Number(value.seconds || 0) * 1000;
}

function detachPassengerRideRequestListeners() {
  if (STATE.passengerOfferPollTimer) {
    clearInterval(STATE.passengerOfferPollTimer);
    STATE.passengerOfferPollTimer = null;
  }
  if (STATE.passengerRideUnsubscribe) {
    try { STATE.passengerRideUnsubscribe(); } catch {}
    STATE.passengerRideUnsubscribe = null;
  }
  if (STATE.passengerOffersUnsubscribe) {
    try { STATE.passengerOffersUnsubscribe(); } catch {}
    STATE.passengerOffersUnsubscribe = null;
  }
  STATE.offerExpiryTimers.forEach((timer) => {
    clearTimeout(timer.timer || timer);
    clearInterval(timer.timer || timer);
  });
  STATE.offerExpiryTimers.clear();
  if (STATE.demoFallbackTimer) {
    clearTimeout(STATE.demoFallbackTimer);
    STATE.demoFallbackTimer = null;
  }
}

function scheduleDemoDriverFallback(rideId, requestedFare) {
  if (STATE.demoFallbackTimer) clearTimeout(STATE.demoFallbackTimer);
  STATE.demoFallbackTimer = null;
  void rideId;
  void requestedFare;
}

function renderPassengerDriverOffers() {
  if (!E.driverGrid) return;
  const offers = Array.from(STATE.activeDriverOffers.values())
    .sort((a, b) => firestoreMillis(a.createdAt) - firestoreMillis(b.createdAt));
  if (!offers.length) {
    E.driverGrid.innerHTML = '<div class="empty-state"><strong>Searching for drivers...</strong><p>No driver offers yet. Keep this screen open.</p></div>';
    return;
  }
  E.driverGrid.innerHTML = "";
  offers.forEach((offer) => {
    scheduleOfferExpiry(offer);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "driver-card";
    const left = Math.max(0, Math.ceil((offerExpiryMillis(offer) - Date.now()) / 1000));
    card.innerHTML =
      '<div class="driver-info">' +
      '<strong>' + esc(offer.driverName || "Driver") + '</strong>' +
      '<span>' + esc([window.WowVehicle?.label(offer.driverVehicleType || offer.vehicleType), offer.driverVehicleName || offer.vehicleName || "", offer.driverVehicleNumber || offer.vehicleNumber || "", offer.driverPhone || ""].filter(Boolean).join(" . ")) + '</span>' +
      '</div>' +
      '<div class="driver-meta">' +
      '<strong>' + money(offer.offeredFare || 0) + '</strong>' +
      '<span data-countdown="' + esc(offer.id) + '">' + left + 's left</span>' +
      '</div>';
    card.addEventListener("click", () => selectPassengerOffer(offer));
    E.driverGrid.appendChild(card);
  });
  if (!STATE.selectedOffer || !STATE.activeDriverOffers.has(STATE.selectedOffer.id)) {
    selectPassengerOffer(offers[0]);
  }
}

function selectPassengerOffer(offer) {
  STATE.selectedOffer = offer;
  E.matchPanel.classList.remove("show-drivers");
  E.matchPanel.classList.add("show-offer");
  E.offerDriverName.textContent = offer.driverName || "Driver";
  const driverPhoto = document.getElementById("offerDriverPhoto");
  if (driverPhoto) {
    driverPhoto.src = String(offer.driverProfileImage || offer.driverPhotoURL || "").trim() || "images/logo.png";
    driverPhoto.alt = `${offer.driverName || "Driver"} profile photo`;
  }
  E.offerDriverMeta.textContent = [
    `Requested: ${window.WowVehicle?.label(STATE.rideType)}`,
    `Driver vehicle: ${window.WowVehicle?.label(offer.driverVehicleType || offer.vehicleType)}`,
    offer.driverVehicleName || offer.vehicleName || "",
    offer.driverVehicleNumber || offer.vehicleNumber || "",
    offer.driverRating ? `${offer.driverRating} rating` : ""
  ].filter(Boolean).join(" . ");
  const offeredFare = Number(offer.offeredFare);
  const passengerOffer = Number(offer.passengerOffer || E.offerInput.value || getActiveFare());
  E.offerFare.textContent = money(offeredFare);
  E.matchOfferInput.value = String(Math.round(offeredFare));
  E.offerNote.textContent = offer.offerType === "accepted_passenger_offer"
    ? `Driver accepted your offer: ${money(offeredFare)}. Decide before the countdown expires.`
    : `Driver's offer: ${money(offeredFare)}. Your original offer was ${money(passengerOffer)}.`;
  if (E.sendOffer) E.sendOffer.style.display = "none";
  E.acceptOffer.disabled = false;
  E.declineOffer.disabled = false;
}

async function declinePassengerDriverCard(offerId) {
  const offer = STATE.activeDriverOffers.get(String(offerId));
  if (!offer) return;
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    await db.collection("rides").doc(STATE.activeRideDbId).collection("offers").doc(offer.id).set({
      status: "declined", declinedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    STATE.declinedDriverOfferIds.add(String(offer.id));
    STATE.activeDriverOffers.delete(String(offer.id));
    if (STATE.selectedOffer?.id === offer.id) STATE.selectedOffer = null;
    renderPassengerDriverOffers();
  } catch (error) {
    setInputError("Could not decline offer: " + (error?.message || "Firestore error"));
  }
}

function expireLocalOfferCard(offer, reason) {
  const timerEntry = STATE.offerExpiryTimers.get(offer.id);
  if (timerEntry) clearInterval(timerEntry.timer || timerEntry);
  STATE.offerExpiryTimers.delete(offer.id);
  STATE.activeDriverOffers.delete(offer.id);
  const card = E.driverGrid?.querySelector(`[data-offer-id="${CSS.escape(String(offer.id))}"]`);
  if (card) card.remove();
  if (STATE.selectedOffer?.id === offer.id) STATE.selectedOffer = null;
  if (E.driverGrid && !E.driverGrid.children.length) {
    E.driverGrid.innerHTML = '<div class="empty-state"><strong>Searching for drivers...</strong><p>Waiting for another live offer.</p></div>';
  }
  if (reason === "expired") console.info("[WOW Passenger] driver offer expired", { driverId: offer.id });
}

async function acceptPassengerDriverCard(offerId) {
  const offer = STATE.activeDriverOffers.get(String(offerId));
  if (!offer) return;
  if (STATE.acceptanceInProgress) return;
  STATE.acceptanceInProgress = true;
  STATE.selectedOffer = offer;
  const rideId = STATE.activeRideDbId || "";
  const fare = Number(offer.offeredFare || E.offerInput?.value || getActiveFare() || 0);
  const clickedButton = E.driverGrid?.querySelector(`[data-demo-accept="${CSS.escape(String(offer.id))}"]`) || E.acceptOffer;
  const originalButtonHtml = clickedButton?.innerHTML || "Accept";
  E.driverGrid?.querySelectorAll("button").forEach((node) => { node.disabled = true; });
  if (E.acceptOffer) E.acceptOffer.disabled = true;
  if (clickedButton) clickedButton.innerHTML = '<span class="accept-spinner" aria-hidden="true"></span>Accepting...';
  console.info("[WOW Passenger] accept clicked", { rideId, driverId: offer.driverId || offer.id });
  try {
    if (window.WowFirestore && rideId && !String(rideId).startsWith("local-")) {
      const { db, uid, FieldValue } = await window.WowFirestore.ready();
      const rideRef = db.collection("rides").doc(String(rideId));
      const selectedRef = rideRef.collection("offers").doc(offer.id);
      await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);
      const offerSnap = await transaction.get(selectedRef);
      if (!rideSnap.exists || !offerSnap.exists) throw new Error("Ride or offer no longer exists.");
      const ride = rideSnap.data() || {};
      const selected = offerSnap.data() || {};
      const driverId = String(selected.driverId || offer.id || "");
      const verifiedVehicle = window.WowVehicle.driverVehicle(selected);
      const requestedVehicleType = window.WowVehicle.requestedType(ride);
      if (String(ride.passengerId || ride.passengerUid || "") !== String(uid || "")) throw new Error("You are not authorized to accept this ride.");
      if (ride.assignedDriverId || ride.acceptedDriverId) throw new Error("A driver has already been selected for this ride.");
      if (ride.status !== "searching" || ride.requestStatus !== "open") throw new Error("This ride is no longer available.");
      if (selected.status !== "pending" || offerExpiryMillis(selected) <= Date.now()) throw new Error("This offer is no longer available.");
      if (!requestedVehicleType || verifiedVehicle.type !== requestedVehicleType) throw new Error(`This ride requires a ${window.WowVehicle.label(requestedVehicleType)} driver.`);
        if (String(selected.driverId || "") !== driverId) throw new Error("The selected offer does not belong to this driver.");
        transaction.update(rideRef, {
          assignedDriverId: driverId,
          driverId,
          driverUid: driverId,
          driverName: selected.driverName || "Driver",
          driverPhone: selected.driverPhone || "",
          driverProfileImage: selected.driverProfileImage || "",
          driverRating: Number(selected.driverRating || 0),
          requestedVehicleType,
          vehicleType: requestedVehicleType,
          driverVehicleType: verifiedVehicle.type,
          driverVehicleName: verifiedVehicle.name,
          driverVehicleNumber: verifiedVehicle.number,
          vehicleName: verifiedVehicle.name,
          vehicleNumber: verifiedVehicle.number,
          finalFare: Number(selected.offeredFare),
          acceptedFare: Number(selected.offeredFare),
          fareUpdatedFrom: "passenger_website",
          lastUpdatedFrom: "passenger_website",
          acceptedOfferId: offer.id,
          passengerDecision: "accepted",
          driverDecision: "accepted",
          requestStatus: "matched",
          status: "driver_assigned",
          matchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        transaction.update(selectedRef, {
          status: "accepted",
          passengerAccepted: true,
          driverAccepted: true,
          respondedAt: FieldValue.serverTimestamp(),
          acceptedAt: FieldValue.serverTimestamp()
        });
      });
      console.info("[WOW Passenger] offer accepted", { rideId, offerId: offer.id, driverId: offer.driverId });
    }
  } catch (error) {
    console.error("[WOW Passenger] Firebase accept failed", error);
    STATE.acceptanceInProgress = false;
    E.driverGrid?.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    if (E.acceptOffer) E.acceptOffer.disabled = false;
    if (clickedButton) clickedButton.innerHTML = originalButtonHtml;
    setInputError(error?.message || "Could not accept this offer. Please try again.");
    return;
  }
  STATE.selectedDriver = {
    id: offer.driverId || offer.id,
    name: offer.driverName || "Driver",
    phone: offer.driverPhone || "",
    rating: offer.driverRating || "4.8",
    trips: "",
    etaMin: Number(offer.etaMin || offer.driverEta || 4),
    vehicleType: window.WowVehicle?.label(offer.driverVehicleType || offer.vehicleType),
    vehicleNumber: offer.driverVehicleNumber || offer.vehicleNumber || ""
  };
  localStorage.setItem("wow_ride_status_message", "Ride accepted. Driver is on the way.");
  finalizeAcceptedRideFlow(fare, STATE.activeRideCode || localStorage.getItem("wow_ride_code") || generateRideCode(), rideId, "accepted");
}

function showDriverOfferFromRide(ride, rideId) {
  const offer = {
    id: String(ride.driverId || "driver"),
    rideId,
    driverId: String(ride.driverId || ""),
    driverName: ride.driverName || "Driver",
    driverPhone: ride.driverPhone || "",
    driverVehicle: ride.driverVehicle || ride.vehicleType || STATE.rideType,
    driverVehicleNumber: ride.driverVehicleNumber || "",
    driverRating: ride.driverRating || "4.9",
    offeredFare: Number(ride.driverOfferFare || ride.passengerOfferFare || ride.offeredFare || 0),
    expiresAt: ride.offerExpiresAt || null,
    createdAt: ride.driverOfferedAt || ride.updatedAt || ride.createdAt || null
  };
  STATE.activeDriverOffers.clear();
  STATE.activeDriverOffers.set(offer.id, offer);
  STATE.selectedOffer = offer;
  if (STATE.demoFallbackTimer) {
    clearTimeout(STATE.demoFallbackTimer);
    STATE.demoFallbackTimer = null;
  }
  E.matchOverlay.classList.add("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "false");
  E.matchPanel.classList.remove("show-drivers");
  E.matchPanel.classList.add("show-offer");
  E.offerDriverName.textContent = offer.driverName;
  E.offerDriverMeta.textContent = [offer.driverVehicle, offer.driverPhone, offer.driverRating ? `${offer.driverRating} rating` : ""].filter(Boolean).join(" . ");
  E.offerFare.textContent = money(offer.offeredFare);
  E.matchOfferInput.value = String(Math.round(offer.offeredFare || 0));
  if (E.sendOffer) E.sendOffer.style.display = "none";
  E.acceptOffer.disabled = false;
  E.declineOffer.disabled = false;
  updateDriverOfferCountdown(offer);
  scheduleOfferExpiry(offer);
}

function updateDriverOfferCountdown(offer) {
  const left = Math.max(0, Math.ceil((offerExpiryMillis(offer) - Date.now()) / 1000));
  const offeredFare = Number(offer.offeredFare);
  const passengerOffer = Number(offer.passengerOffer || E.offerInput.value || getActiveFare());
  E.offerNote.textContent = offer.offerType === "accepted_passenger_offer"
    ? `Driver accepted your offer: ${money(offeredFare)}. Expires in ${left}s.`
    : `Driver's offer: ${money(offeredFare)}. Your original offer was ${money(passengerOffer)}. Expires in ${left}s.`;
  return left;
}

function offerExpiryMillis(offer) {
  const explicit = firestoreMillis(offer.expiresAt);
  if (explicit) return explicit;
  const created = firestoreMillis(offer.createdAt);
  return created ? created + OFFER_RESPONSE_WINDOW_MS : (Date.now() + OFFER_RESPONSE_WINDOW_MS);
}

function scheduleOfferExpiry(offer) {
  if (!offer?.id) return;
  const expiry = offerExpiryMillis(offer);
  const existing = STATE.offerExpiryTimers.get(offer.id);
  if (existing?.expiry === expiry) return;
  if (existing) clearInterval(existing.timer || existing);
  const timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
    const badge = E.driverGrid?.querySelector(`[data-countdown="${CSS.escape(String(offer.id))}"]`);
    if (badge) badge.textContent = left + "s left";
    if (STATE.selectedOffer && STATE.selectedOffer.id === offer.id) updateDriverOfferCountdown(offer);
    if (left <= 0) expireDriverOffer(offer);
  }, 1000);
  STATE.offerExpiryTimers.set(offer.id, { timer, expiry });
}

async function expireDriverOffer(offer) {
  const timerEntry = STATE.offerExpiryTimers.get(offer.id);
  if (timerEntry) clearInterval(timerEntry.timer || timerEntry);
  STATE.offerExpiryTimers.delete(offer.id);
  if (!STATE.activeRideDbId || !offer?.id) return;
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    const offerRef = db.collection("rides").doc(STATE.activeRideDbId).collection("offers").doc(offer.id);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(offerRef);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      if (current.status !== "pending" || offerExpiryMillis(current) > Date.now()) return;
      transaction.set(offerRef, {
        status: "expired", expiredAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  } catch (error) { console.error("[WOW Passenger] offer expiry failed", error); }
}

function redirectPassengerAfterBook(fare, rideCode, rideId, status = "pending") {
  const safeCode = String(rideCode || generateRideCode());
  const rideType = STATE.rideType || "WOW Car";
  const vehicleMeta = RIDE_TYPES[rideType] || RIDE_TYPES["WOW Car"];
  const paymentMethod = getSelectedPaymentMethod() || localStorage.getItem("wow_ride_payment_method") || "online";

  localStorage.setItem("wow_ride_pickup", STATE.pickup || "");
  localStorage.setItem("wow_ride_drop", STATE.drop || "");
  localStorage.setItem("wow_ride_pickup_address", STATE.pickupAddress || STATE.pickup || "");
  localStorage.setItem("wow_ride_drop_address", STATE.dropAddress || STATE.drop || "");
  localStorage.setItem("wow_ride_fare", String(Number(fare || 0)));
  localStorage.setItem("wow_ride_vehicle", rideType);
  localStorage.setItem("wow_ride_vehicle_model", vehicleMeta.model);
  localStorage.setItem("wow_ride_vehicle_color", vehicleMeta.color);
  if (status !== "pending") {
    localStorage.setItem("wow_ride_driver_name", STATE.selectedDriver?.name || "Driver");
    localStorage.setItem("wow_ride_driver_phone", STATE.selectedDriver?.phone || "+92 300 0000000");
  } else {
    localStorage.removeItem("wow_ride_driver_name");
    localStorage.removeItem("wow_ride_driver_phone");
  }
  localStorage.setItem("wow_ride_payment_method", paymentMethod);
  localStorage.setItem("wow_ride_payment_label", paymentMethodLabel(paymentMethod));
  localStorage.setItem("wow_ride_code", safeCode);
  localStorage.setItem("wow_ride_status", status);
  localStorage.setItem("wow_ride_pickup_lat", STATE.pickupPlace ? String(STATE.pickupPlace.lat) : "");
  localStorage.setItem("wow_ride_pickup_lng", STATE.pickupPlace ? String(STATE.pickupPlace.lng) : "");
  localStorage.setItem("wow_ride_drop_lat", STATE.dropPlace ? String(STATE.dropPlace.lat) : "");
  localStorage.setItem("wow_ride_drop_lng", STATE.dropPlace ? String(STATE.dropPlace.lng) : "");
  localStorage.setItem("wow_ride_distance_km", String(Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0)));
  localStorage.setItem("wow_ride_duration_min", String(Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0)));
  localStorage.setItem("wow_ride_traffic_level", STATE.fareMeta.traffic_level || inferTrafficLevel());
  localStorage.setItem("wow_ride_time_of_day", STATE.fareMeta.time_of_day || inferTimeOfDay());
  if (String(rideId || "").trim()) localStorage.setItem("wow_ride_db_id", String(rideId));

  window.location.assign(`passenger-ride.html?ride_code=${encodeURIComponent(safeCode)}`);
}

function ensureRequestedRideSynced(fare, rideCode) {
  if (STATE.requestedRideSyncPromise) return STATE.requestedRideSyncPromise;
  STATE.requestedRideSyncPromise = createRideRecord(fare, rideCode)
    .then((rideMeta) => {
      if (rideMeta && rideMeta.rideCode) {
        STATE.activeRideCode = String(rideMeta.rideCode);
        localStorage.setItem("wow_ride_code", STATE.activeRideCode);
      }
      const dbId = String((rideMeta && rideMeta.rideId) || "");
      if (dbId) {
        STATE.activeRideDbId = dbId;
        localStorage.setItem("wow_ride_db_id", dbId);
      }
      return rideMeta;
    })
    .finally(() => {
      STATE.requestedRideSyncPromise = null;
    });
  return STATE.requestedRideSyncPromise;
}

async function syncRequestedRideFare(fare) {
  const rideCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  try {
    const paymentMethod = getSelectedPaymentMethod() || "online";
    const passengerUid = currentPassengerUid();
    await fetch(RIDE_API.update, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_code: rideCode,
        status: "pending",
        fare: Number(fare || 0),
        offered_fare: Number(fare || 0),
        payment_method: paymentMethod,
        payment_label: paymentMethodLabel(paymentMethod),
        target_driver_id: "",
        target_driver_name: "",
        distance_km: Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0),
        duration_min: Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0),
        vehicle_type: STATE.rideType,
        traffic_level: STATE.fareMeta.traffic_level || inferTrafficLevel(),
        time_of_day: STATE.fareMeta.time_of_day || inferTimeOfDay(),
        role: "passenger",
        email: currentPassengerEmail(),
        firebase_uid: passengerUid,
        uid: passengerUid,
        user_id: passengerUid
      })
    });
  } catch {
    // Keep booking flow non-blocking if request update fails.
  }
}

async function cancelPendingRideRequest() {
  stopMatchingPoll();
  stopDriverAcceptancePoll();
  detachPassengerRideRequestListeners();
  E.matchOverlay.classList.remove("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "true");
  E.matchPanel.classList.remove("show-drivers", "show-offer");
  if (E.acceptOffer) E.acceptOffer.disabled = false;
  if (E.sendOffer) E.sendOffer.disabled = false;
  if (E.declineOffer) E.declineOffer.disabled = false;

  const rideCode = STATE.activeRideCode || "";
  const rideId = String(STATE.activeRideDbId || "");
  if (STATE.requestedRideSyncPromise) {
    try { await STATE.requestedRideSyncPromise; } catch {}
  }
  const syncedRideCode = STATE.activeRideCode || rideCode;
  const syncedRideId = String(STATE.activeRideDbId || rideId || "");
  if (syncedRideId && window.WowFirestore) {
    try {
      const { db, FieldValue } = await window.WowFirestore.ready();
      await db.collection("rides").doc(syncedRideId).set({
        status: "cancelled",
        requestStatus: "closed",
        cancelledBy: "passenger",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch {}
  } else if (syncedRideCode || syncedRideId) {
    try {
      const passengerUid = currentPassengerUid();
      await fetch(RIDE_API.update, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_code: syncedRideCode,
          ride_id: syncedRideId,
          status: "cancelled",
          cancel_mode: "remove_pending",
          role: "passenger",
          email: currentPassengerEmail(),
          firebase_uid: passengerUid,
          uid: passengerUid,
          user_id: passengerUid
        })
      });
    } catch {}
  }

  const rows = loadJson(STORAGE.liveRequests, []);
  const filtered = rows.filter((row) => {
    if (STATE.requestId && String(row.id || "") === String(STATE.requestId)) return false;
    if (syncedRideCode && String(row.rideCode || "") === String(syncedRideCode)) return false;
    return true;
  });
  localStorage.setItem(STORAGE.liveRequests, JSON.stringify(filtered));
  publishRealtime("ride.cancelled", {
    requestId: STATE.requestId || "",
    rideCode: syncedRideCode || "",
    status: "cancelled"
  });

  STATE.requestId = null;
  STATE.activeRideCode = "";
  STATE.activeRideDbId = "";
  STATE.isSearchingForDriver = false;
  localStorage.removeItem("wow_ride_db_id");
  localStorage.removeItem("wow_ride_code");
  updateBookButton();
  if (STATE.demoFallbackTimer) {
    clearTimeout(STATE.demoFallbackTimer);
    STATE.demoFallbackTimer = null;
  }
}

function openMatching(requestedFare) {
  E.matchOverlay.classList.add("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "false");
  E.matchPanel.classList.remove("show-drivers", "show-offer");
  E.matchOffer.classList.remove("is-sent");

  stopMatchingPoll();
  clearTimeout(STATE.matchingTimer);
  STATE.matchingTimer = setTimeout(() => {
    renderDriverGrid(requestedFare);
    E.matchPanel.classList.add("show-drivers");
    startMatchingPoll();
  }, 500);
}

function startMatchingPoll() {
  stopMatchingPoll();
  STATE.matchingPollTimer = setInterval(() => {
    if (!E.matchOverlay.classList.contains("is-open")) {
      stopMatchingPoll();
      return;
    }
    requestFareEstimate();
    renderDriverGrid(Math.max(0, Number(E.offerInput.value || getActiveFare())));
  }, 5000);
}

function stopMatchingPoll() {
  if (STATE.matchingPollTimer) {
    clearInterval(STATE.matchingPollTimer);
    STATE.matchingPollTimer = null;
  }
}

function stopDriverAcceptancePoll() {
  if (STATE.driverAcceptanceTimer) {
    clearInterval(STATE.driverAcceptanceTimer);
    STATE.driverAcceptanceTimer = null;
  }
  STATE.driverAcceptanceStartedAt = 0;
}

function getPickupPoint() {
  if (STATE.pickupPlace) return { lat: STATE.pickupPlace.lat, lng: STATE.pickupPlace.lng };
  return resolvePoint(STATE.pickup);
}

function mapRideTypeToVehicle(rideType) {
  const value = String(rideType || "").toLowerCase();
  if (value.includes("bike")) return "bike";
  if (value.includes("scooty")) return "scooty";
  return "car";
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function rad(v) {
  return v * Math.PI / 180;
}

function nearbyRadiusForVehicle(vehicle) {
  if (vehicle === "bike") return 6;
  if (vehicle === "scooty") return 5;
  return 10;
}

function normalizeVehicleKey(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("bike")) return "bike";
  if (text.includes("scooty")) return "scooty";
  return "car";
}

function readRealtimeOnlineDrivers() {
  try {
    const rows = JSON.parse(localStorage.getItem(REALTIME_PRESENCE_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function buildRealtimePresenceCandidates() {
  const pickup = getPickupPoint();
  const expectedVehicle = mapRideTypeToVehicle(STATE.rideType);
  const baseFare = Math.max(50, Math.round(getActiveFare()));
  const radiusKm = nearbyRadiusForVehicle(expectedVehicle);

  return readRealtimeOnlineDrivers()
    .filter((driver) => Number(driver.online) === 1 && Number(driver.available) === 1)
    .filter((driver) => normalizeVehicleKey(driver.vehicleType) === expectedVehicle)
    .map((driver) => {
      const lat = Number(driver.lat);
      const lng = Number(driver.lng);
      const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
      const distanceKm = hasPoint ? haversineKm(pickup, { lat, lng }) : 1.5;
      const etaMin = Math.max(3, Math.round((distanceKm / 28) * 60));
      return {
        driver: {
          id: String(driver.id || ""),
          name: String(driver.name || "Driver"),
          rating: String(driver.rating || "4.8"),
          trips: String(driver.trips || "120"),
          phone: String(driver.phone || "+92 300 0000000"),
          vehicleType: expectedVehicle,
          online: true,
          etaMin
        },
        distanceKm,
        etaMin,
        estimatedFare: Math.round(baseFare + (distanceKm * 5))
      };
    })
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

async function getNearbyVehicleMatchedDrivers() {
  const expectedVehicle = mapRideTypeToVehicle(STATE.rideType);
  const baseFare = Math.max(50, Math.round(getActiveFare()));
  const pickup = getPickupPoint();
  const radiusKm = nearbyRadiusForVehicle(expectedVehicle);
  const presenceCandidates = buildRealtimePresenceCandidates();
  const presenceById = new Map(
    presenceCandidates
      .map((item) => [String(item.driver.id || ""), item])
      .filter((pair) => pair[0])
  );
  try {
    const query = new URLSearchParams({
      vehicle_type: expectedVehicle,
      pickup_lat: String(Number(pickup.lat || 0)),
      pickup_lng: String(Number(pickup.lng || 0)),
      radius_km: String(radiusKm),
      limit: "20"
    });
    const res = await fetch(`${DRIVER_API.available}?${query.toString()}`);
    const data = await res.json();
    console.debug("WOW drivers fetched:", Number(data?.count || 0), data?.drivers || []);
    if (res.ok && data && data.ok && Array.isArray(data.drivers) && data.drivers.length) {
      const apiCandidates = data.drivers.map((driver) => {
        const apiId = String(driver.id || driver.db_id || "");
        const presenceMatch = presenceById.get(apiId);
        const distanceKm = Number(driver.distance_km || 0) > 0
          ? Number(driver.distance_km)
          : (presenceMatch ? Number(presenceMatch.distanceKm || 0) : Math.max(0.7, Number((Number(driver.eta_min || 8) / 3.2).toFixed(1))));
        const etaMin = Math.max(3, Number(driver.eta_min || Math.round((distanceKm / 28) * 60)));
        const displayName = presenceMatch ? presenceMatch.driver.name : String(driver.name || "Driver");
        const displayPhone = presenceMatch ? presenceMatch.driver.phone : String(driver.phone || "+92 300 0000000");
        return {
          driver: {
            id: apiId,
            name: displayName,
            rating: String(driver.rating || "4.8"),
            trips: String(driver.trips || "120"),
            phone: displayPhone,
            vehicleNumber: String(driver.vehicle_number || ""),
            vehicleType: expectedVehicle,
            online: true,
            etaMin
          },
          distanceKm,
          etaMin,
          estimatedFare: Math.round(baseFare + (distanceKm * 5))
        };
      });
      const seen = new Set(apiCandidates.map((item) => String(item.driver.id || "")));
      const seenNames = new Set(apiCandidates.map((item) => String(item.driver.name || "").trim().toLowerCase()).filter(Boolean));
      const extras = presenceCandidates.filter((item) => {
        const id = String(item.driver.id || "");
        const name = String(item.driver.name || "").trim().toLowerCase();
        if (id && seen.has(id)) return false;
        if (name && seenNames.has(name)) return false;
        return Boolean(id || name);
      });
      return apiCandidates.concat(extras).sort((a, b) => a.distanceKm - b.distanceKm);
    }
  } catch {
    // Fallback to local pool if API is temporarily unavailable.
  }
  return presenceCandidates;
}

async function renderDriverGrid(requestedFare) {
  E.driverGrid.innerHTML = "";
  const candidates = await getNearbyVehicleMatchedDrivers();
  STATE.lastDriverCandidates = candidates;
  if (!candidates.length) {
    E.driverGrid.innerHTML = '<div class="empty-state"><strong>No nearby drivers</strong><p>Try another ride type or location.</p></div>';
    return;
  }

  candidates.forEach((candidate, index) => {
    const driver = candidate.driver;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "driver-card" + (index === 0 ? " is-selected" : "");
    const vehicleMeta = [STATE.rideType, driver.vehicleNumber || ""].filter(Boolean).join(" . ");
    card.innerHTML =
      '<div class="driver-info">' +
      "<strong>" + esc(driver.name) + "</strong>" +
      "<span>" + esc(vehicleMeta) + " . " + candidate.distanceKm.toFixed(1) + " km . ETA " + candidate.etaMin + " min</span>" +
      "</div>" +
      '<div class="driver-meta">' +
      "<strong>Online</strong>" +
      "<span>" + esc(driver.rating) + " rating</span>" +
      "</div>";
    card.addEventListener("click", () => {
      E.driverGrid.querySelectorAll(".driver-card").forEach((el) => el.classList.remove("is-selected"));
      card.classList.add("is-selected");
      STATE.selectedDriver = { ...driver, etaMin: candidate.etaMin };
      const activeOffer = Math.max(0, Number(E.offerInput.value || getActiveFare()));
      renderMatchOffer(STATE.selectedDriver, activeOffer);
      E.matchPanel.classList.remove("show-drivers");
      E.matchPanel.classList.add("show-offer");
    });
    E.driverGrid.appendChild(card);
  });

  const first = candidates[0];
  STATE.selectedDriver = { ...first.driver, etaMin: first.etaMin };
  renderMatchOffer(STATE.selectedDriver, Math.max(0, Number(requestedFare || E.offerInput.value || getActiveFare())));
}

function renderMatchOffer(driver, suggestedFare) {
  const fare = Math.max(0, Number(suggestedFare || (E.offerInput ? E.offerInput.value : getActiveFare())));
  E.offerDriverName.textContent = driver.name;
  E.offerDriverMeta.textContent = STATE.rideType + " . ETA " + driver.etaMin + " min";
  E.offerFare.textContent = money(fare);
  E.offerNote.textContent = "Driver is offering this ride.";
  E.matchOfferInput.value = String(fare);
}

function sendCustomOffer() {
  const fare = Math.max(0, Number(E.matchOfferInput.value || 0));
  if (!isOfferValid(fare)) {
    const bounds = getOfferBounds();
    E.offerNote.textContent = `Offer must be within Rs. ${bounds.minOffer} - Rs. ${bounds.maxOffer}.`;
    return;
  }
  E.matchOfferInput.value = String(Math.round(fare));
  E.offerFare.textContent = money(fare);
  E.offerNote.textContent = "Offer saved. Waiting for a real driver response...";
  E.sendOffer.disabled = true;
  E.sendOffer.disabled = false;
}

async function declineOffer() {
  const offer = STATE.selectedOffer;
  if (offer) await declinePassengerDriverCard(offer.id);
  STATE.selectedOffer = null;
  E.acceptOffer.disabled = false;
  E.sendOffer.disabled = false;
  E.declineOffer.disabled = false;
  E.matchPanel.classList.remove("show-offer");
  E.matchPanel.classList.add("show-drivers");
}

async function acceptOffer() {
  if (STATE.acceptanceInProgress) return;
  const offer = STATE.selectedOffer;
  const rideId = STATE.activeRideDbId;
  if (offer && STATE.activeDriverOffers.has(offer.id)) {
    await acceptPassengerDriverCard(offer.id);
    return;
  }
  if (!offer || !rideId) {
    E.offerNote.textContent = "Select a driver offer first.";
    return;
  }
  STATE.acceptanceInProgress = true;
  const originalButtonHtml = E.acceptOffer.innerHTML;
  E.acceptOffer.disabled = true;
  E.acceptOffer.innerHTML = '<span class="accept-spinner" aria-hidden="true"></span>Accepting...';
  E.declineOffer.disabled = true;
  console.info("[WOW Passenger] accept clicked", { rideId, driverId: offer.driverId || offer.id });
  try {
    const { db, FieldValue } = await window.WowFirestore.ready();
    const rideRef = db.collection("rides").doc(rideId);
    await db.runTransaction(async (transaction) => {
      const rideSnap = await transaction.get(rideRef);
      if (!rideSnap.exists) throw new Error("ride_not_found");
      const ride = rideSnap.data() || {};
      if (String(ride.status || "").toLowerCase() !== "driver_offered") throw new Error("ride_not_driver_offered");
      transaction.set(rideRef, {
        status: "accepted",
        finalFare: Number(ride.driverOfferFare || offer.offeredFare || 0),
        fareUpdatedFrom: "passenger_website",
        lastUpdatedFrom: "passenger_website",
        passengerAcceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
    console.info("[WOW Passenger] ride updated", { rideId, status: "accepted" });
    E.offerNote.textContent = "Offer accepted.";
    STATE.selectedDriver = {
      name: offer.driverName || "Driver",
      phone: offer.driverPhone || "",
      rating: offer.driverRating || "4.9",
      trips: "",
      etaMin: 6
    };
  } catch (error) {
    console.error("[WOW Passenger] Firebase accept error:", error);
    STATE.acceptanceInProgress = false;
    E.acceptOffer.disabled = false;
    E.acceptOffer.innerHTML = originalButtonHtml;
    E.declineOffer.disabled = false;
    setInputError(error?.message || "Could not accept this offer. Please try again.");
  }
}

function startDriverAcceptancePoll(fare, rideCode, rideId) {
  stopDriverAcceptancePoll();
  STATE.driverAcceptanceStartedAt = Date.now();
  const poll = async () => {
    const status = await fetchCurrentRideStatus(rideCode, rideId);
    if (!status) return;
    if (["driver_assigned", "accepted", "arrived", "driver_arriving", "in_progress", "ride_started", "completed"].includes(status)) {
      finalizeAcceptedRideFlow(fare, rideCode, rideId, status);
      return;
    }
    if (Date.now() - STATE.driverAcceptanceStartedAt > 180000) {
      stopDriverAcceptancePoll();
      E.acceptOffer.disabled = false;
      E.sendOffer.disabled = false;
      E.declineOffer.disabled = false;
      E.offerNote.textContent = "No driver accepted yet. Please try again.";
    }
  };
  poll();
  STATE.driverAcceptanceTimer = setInterval(poll, 3000);
}

function finalizeAcceptedRideFlow(fare, rideCode, rideId, status) {
  if (STATE.acceptanceHandled) return;
  STATE.acceptanceHandled = true;
  STATE.isSearchingForDriver = false;
  stopDriverAcceptancePoll();
  E.acceptOffer.disabled = false;
  E.sendOffer.disabled = false;
  E.declineOffer.disabled = false;
  E.offerNote.textContent = "Driver has accepted your ride";
  if (STATE.demoFallbackTimer) {
    clearTimeout(STATE.demoFallbackTimer);
    STATE.demoFallbackTimer = null;
  }
  localStorage.setItem("wow_ride_status_message", "Driver has accepted your ride");
  E.matchOverlay.classList.remove("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "true");
  E.matchPanel.classList.remove("show-drivers", "show-offer");
  const activeRideId = String(rideId || STATE.activeRideDbId || "").trim();
  if (!activeRideId) {
    STATE.acceptanceHandled = false;
    setInputError("The matched ride ID is unavailable. Please wait for the ride update.");
    return;
  }
  localStorage.setItem("wow_ride_db_id", activeRideId);
  localStorage.setItem("wow_ride_status", String(status || "driver_assigned"));
  window.location.assign(`passenger-ride.html?rideId=${encodeURIComponent(activeRideId)}`);
}

async function fetchCurrentRideStatus(rideCode, rideId) {
  if (!rideCode && !String(rideId || "").trim()) return "";
  const passengerUid = currentPassengerUid();
  const query = new URLSearchParams({
    role: "passenger",
    email: currentPassengerEmail(),
    firebase_uid: passengerUid,
    uid: passengerUid,
    user_id: passengerUid
  });
  if (rideCode) query.set("ride_code", rideCode);
  if (String(rideId || "").trim()) query.set("ride_id", String(rideId));
  try {
    const startedAt = performance.now();
    const res = await fetch(`${RIDE_API.details}?${query.toString()}`);
    const data = await res.json();
    console.info("[WOW Perf] Passenger ride status query timeMs:", perfElapsed(startedAt));
    if (!res.ok || !data || !data.ok || !data.ride) return "";
    const ride = data.ride;
    if (ride.driver_name) localStorage.setItem("wow_ride_driver_name", String(ride.driver_name));
    if (ride.driver_phone) localStorage.setItem("wow_ride_driver_phone", String(ride.driver_phone));
    if (ride.fare) localStorage.setItem("wow_ride_fare", String(Number(ride.fare)));
    return String(ride.status || "").toLowerCase();
  } catch {
    return "";
  }
}

function showConfirmation(finalFare) {
  stopChatPolling();
  STATE.chatLastSeen = "";
  E.confirmPickup.textContent = STATE.pickup;
  E.confirmDrop.textContent = STATE.drop;
  E.confirmFare.textContent = money(finalFare);
  E.confirmDriverName.textContent = STATE.selectedDriver.name;
  E.confirmDriverVehicle.textContent = [STATE.selectedDriver.vehicleType || STATE.rideType, STATE.selectedDriver.vehicleNumber || ""].filter(Boolean).join(" - ") || (RIDE_TYPES[STATE.rideType].model + " - " + RIDE_TYPES[STATE.rideType].color);
  E.confirmDriverRating.textContent = "star " + STATE.selectedDriver.rating + " . " + STATE.selectedDriver.trips + " trips";
  E.chatDriverName.textContent = STATE.selectedDriver.name;
  E.callDriverName.textContent = STATE.selectedDriver.name;
  E.chatAvatar.textContent = initial(STATE.selectedDriver.name);
  const wowCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || generateRideCode();
  if (E.confirmRideCode) E.confirmRideCode.textContent = "Your WOW Code: " + wowCode;
  if (E.confirmWowCode) E.confirmWowCode.textContent = wowCode;
  if (E.startPassengerRide) {
    E.startPassengerRide.disabled = true;
    E.startPassengerRide.textContent = "Waiting for Driver";
  }

  E.confirmationPanel.classList.add("is-visible");
  E.confirmationPanel.setAttribute("aria-hidden", "false");
  if (E.chatBtn) E.chatBtn.style.display = "inline-flex";
  if (E.callBtn) E.callBtn.style.display = "inline-flex";
  const mapWrap = E.confirmMap.closest(".confirm-map");
  if (mapWrap) mapWrap.classList.add("is-active");

  STATE.arrivalSeconds = Math.max(120, STATE.selectedDriver.etaMin * 60);
  updateArrivalUi();
  clearInterval(STATE.arrivalTimer);
  STATE.arrivalTimer = setInterval(() => {
    STATE.arrivalSeconds -= 1;
    updateArrivalUi();
    if (STATE.arrivalSeconds <= 0) {
      clearInterval(STATE.arrivalTimer);
      E.rideStatusTitle.textContent = "Driver arriving";
      E.rideStatusPill.textContent = "Arriving";
      E.arrivalMessage.textContent = "Driver is near your pickup. Waiting for arrival confirmation.";
    }
  }, 1000);

  seedChat();
  drawConfirmRoute();
  setTimeout(() => {
    if (STATE.confirmMap) {
      STATE.confirmMap.resize();
      drawConfirmRoute();
    }
  }, 220);
}

function updateArrivalUi() {
  const mins = Math.max(0, Math.floor(STATE.arrivalSeconds / 60));
  const secs = Math.max(0, STATE.arrivalSeconds % 60);
  E.etaText.textContent = mins + " min";
  E.arrivalCountdown.textContent = String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  E.rideStatusSub.textContent = "ETA " + E.arrivalCountdown.textContent;
  E.rideStatusPill.textContent = mins > 0 ? "Arriving" : "Arrived";
}

function cancelRide() {
  stopRideStatusPolling();
  stopMatchingPoll();
  closeModal(E.cancelOverlay, E.cancelModal);
  E.confirmationPanel.classList.remove("is-visible");
  E.confirmationPanel.setAttribute("aria-hidden", "true");
  closePanel(E.chatOverlay, E.chatPanel);
  closePanel(E.callOverlay, E.callPanel);
  clearInterval(STATE.arrivalTimer);
  closeCall();
  const mapWrap = E.confirmMap.closest(".confirm-map");
  if (mapWrap) mapWrap.classList.remove("is-active");
}

function stopRideStatusPolling() {
  if (STATE.matchingPollTimer) {
    clearInterval(STATE.matchingPollTimer);
    STATE.matchingPollTimer = null;
  }
}

function startRideStatusPolling() {
  stopRideStatusPolling();
  fetchActiveRideDetails();
  STATE.matchingPollTimer = setInterval(fetchActiveRideDetails, 4000);
}

async function fetchActiveRideDetails() {
  const rideCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const passengerUid = currentPassengerUid();
  const query = new URLSearchParams({
    ride_code: rideCode,
    role: "passenger",
    email: currentPassengerEmail(),
    firebase_uid: passengerUid,
    uid: passengerUid,
    user_id: passengerUid
  });
  try {
    const res = await fetch(`${RIDE_API.details}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !data.ride) return;
    applyRideDetailsFromDb(data.ride);
  } catch {
    // Keep waiting UI non-blocking if polling fails temporarily.
  }
}

function applyRideDetailsFromDb(ride) {
  const fare = Number(ride.fare || 0);
  if (fare > 0) {
    localStorage.setItem("wow_ride_fare", String(fare));
    E.confirmFare.textContent = money(fare);
  }
  const wowCode = String(ride.ride_code || "");
  if (wowCode) {
    STATE.activeRideCode = wowCode;
    localStorage.setItem("wow_ride_code", wowCode);
    if (E.confirmRideCode) E.confirmRideCode.textContent = "Your WOW Code: " + wowCode;
    if (E.confirmWowCode) E.confirmWowCode.textContent = wowCode;
  }

  const status = String(ride.status || "accepted").toLowerCase();
  localStorage.setItem("wow_ride_status", status);
  if (isDriverArrivingStatus(status)) {
    E.rideStatusTitle.textContent = "Driver arrived";
    E.rideStatusPill.textContent = "Arrived";
    E.rideStatusSub.textContent = "Waiting for the driver to start the ride";
    E.arrivalMessage.textContent = "Driver has reached pickup. The assigned driver will start the ride when you are onboard.";
    if (E.startPassengerRide) {
      E.startPassengerRide.disabled = true;
      E.startPassengerRide.textContent = "Waiting for Driver";
    }
    clearInterval(STATE.arrivalTimer);
  } else if (isRideStartedStatus(status)) {
    if (E.startPassengerRide) E.startPassengerRide.disabled = true;
    location.href = "passenger-ride.html";
  } else {
    if (E.startPassengerRide) {
      E.startPassengerRide.disabled = true;
      E.startPassengerRide.textContent = "Start Ride";
    }
  }
}

function onPassengerStartRide() {
  setInputError("Only the assigned driver can start the ride.");
}

function activateSos() {
  disableDashboardSosNotice();
}

function openSosPanel() {
  disableDashboardSosNotice();
}

function syncSosPanelState() {
  disableDashboardSosNotice();
}

function isPassengerRideActive() {
  return window.location.pathname.toLowerCase().includes("passenger-ride.html");
}

async function openChat() {
  openPanel(E.chatOverlay, E.chatPanel);
  const rideId = String(STATE.activeRideDbId || localStorage.getItem("wow_ride_db_id") || "").trim();
  if (rideId && window.WowRideChat) {
    try {
      if (STATE.chatUnsubscribe) STATE.chatUnsubscribe();
      STATE.chatUnsubscribe = await WowRideChat.listen({
        rideId,
        onMessages: (messages) => {
          E.chatBody.innerHTML = "";
          messages.forEach((msg) => {
            const role = String(msg.senderRole || "").toLowerCase() === "driver" ? "driver" : "passenger";
            appendChatBubble(role, String(msg.messageText || ""), readableDashboardChatTime(msg.timestamp));
          });
        }
      });
    } catch {
      fetchChatMessages(false);
      startChatPolling();
    }
  }
  window.WowRideChat?.requestNotifications?.();
  E.chatInput.focus();
}

async function sendChat() {
  const text = E.chatInput.value.trim();
  if (!text) return;
  const rideId = String(STATE.activeRideDbId || localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId) return;
  try {
    await WowRideChat.send({ rideId, message: text });
    E.chatInput.value = "";
  } catch (error) {
    E.chatInput.value = text;
    setInputError(error?.message || "Message could not be sent. Press Send to retry.");
  }
}

function readableDashboardChatTime(value) {
  const ms = firestoreMillis(value);
  return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function seedChat() {
  fetchChatMessages(false);
}

function appendChatBubble(type, text, at = "") {
  const row = document.createElement("div");
  row.className = "chat-row " + type;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + type;
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "chat-time";
  time.textContent = at || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.appendChild(bubble);
  row.appendChild(time);
  E.chatBody.appendChild(row);
  E.chatBody.scrollTop = E.chatBody.scrollHeight;
}

function startChatPolling() {
  stopChatPolling();
  STATE.chatPollTimer = setInterval(() => fetchChatMessages(true), 2000);
}

function stopChatPolling() {
  if (STATE.chatPollTimer) {
    clearInterval(STATE.chatPollTimer);
    STATE.chatPollTimer = null;
  }
}

async function fetchChatMessages(incremental = true) {
  const rideCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "";
  if (!rideCode || !E.chatBody) return;
  const query = new URLSearchParams({
    action: "list",
    ride_code: rideCode
  });
  if (incremental && STATE.chatLastSeen) {
    query.set("since", STATE.chatLastSeen);
  }
  try {
    const res = await fetch(`${CHAT_API}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !Array.isArray(data.messages)) return;
    if (!incremental) E.chatBody.innerHTML = "";
    data.messages.forEach((msg) => {
      const role = String(msg.role || "").toLowerCase() === "driver" ? "driver" : "passenger";
      const t = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      appendChatBubble(role, String(msg.message || ""), t);
    });
    if (data.messages.length) {
      STATE.chatLastSeen = String(data.messages[data.messages.length - 1].created_at || STATE.chatLastSeen);
    }
  } catch {
    // Keep chat UI resilient if polling fails.
  }
}

function openCall() {
  openPanel(E.callOverlay, E.callPanel);
  STATE.callSeconds = 0;
  updateCallTimer();
  clearInterval(STATE.callTimer);
  STATE.callTimer = setInterval(() => {
    STATE.callSeconds += 1;
    updateCallTimer();
  }, 1000);
}

function closeCall() {
  closePanel(E.callOverlay, E.callPanel);
  clearInterval(STATE.callTimer);
  STATE.callTimer = null;
}

function updateCallTimer() {
  const m = String(Math.floor(STATE.callSeconds / 60)).padStart(2, "0");
  const s = String(STATE.callSeconds % 60).padStart(2, "0");
  E.callTimer.textContent = m + ":" + s;
}

function openPanel(overlay, panel) {
  overlay.classList.add("is-open");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function closePanel(overlay, panel) {
  overlay.classList.remove("is-open");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  if (panel === E.chatPanel) stopChatPolling();
}

function openModal(overlay, modal) {
  overlay.classList.add("is-open");
  modal.classList.add("is-open");
}

function closeModal(overlay, modal) {
  overlay.classList.remove("is-open");
  modal.classList.remove("is-open");
}

function openSchedule() {
  renderCalendar();
  renderTimeSlots();
  syncCustomScheduleTime();
  updateScheduleControls();
  E.scheduleOverlay.classList.add("open");
  E.scheduleSidebar.classList.add("open");
  E.scheduleSidebar.setAttribute("aria-hidden", "false");
}

function closeSchedule() {
  E.scheduleOverlay.classList.remove("open");
  E.scheduleSidebar.classList.remove("open");
  E.scheduleSidebar.setAttribute("aria-hidden", "true");
}

let viewMonth = new Date();
let selectedDate = new Date();
let selectedTime = "12:00 PM";

function shiftMonth(delta) {
  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  if (isBeforeCurrentMonth(nextMonth)) return;
  viewMonth = nextMonth;
  renderCalendar();
}

function renderCalendar() {
  if (isPastCalendarDate(selectedDate)) selectedDate = startOfDay(new Date());
  if (isBeforeCurrentMonth(viewMonth)) viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  E.calendarTitle.textContent = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (E.prevMonth) E.prevMonth.disabled = isBeforeOrSameCurrentMonth(viewMonth);
  E.calendarGrid.innerHTML = "";
  ["S", "M", "T", "W", "T", "F", "S"].forEach((day) => {
    const node = document.createElement("div");
    node.className = "day-name";
    node.textContent = day;
    E.calendarGrid.appendChild(node);
  });

  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < first; i += 1) {
    E.calendarGrid.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= days; day += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(day);
    const date = new Date(year, month, day);
    const isToday = isSameDay(date, new Date());
    const isSelected = isSameDay(date, selectedDate);
    const isPastDate = isPastCalendarDate(date);
    if (isToday) btn.classList.add("is-today");
    if (isSelected) btn.classList.add("is-selected");
    if (isPastDate) {
      btn.disabled = true;
      btn.classList.add("is-disabled");
    }
    btn.addEventListener("click", () => {
      if (isPastCalendarDate(date)) return;
      selectedDate = date;
      renderCalendar();
      renderTimeSlots();
      syncCustomScheduleTime();
      updateScheduleText();
    });
    E.calendarGrid.appendChild(btn);
  }

  updateScheduleText();
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function calendarDateKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function isPastCalendarDate(date) {
  const dateKey = calendarDateKey(date);
  return !dateKey || dateKey < calendarDateKey(new Date());
}

function isBeforeCurrentMonth(date) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  return monthStart.getTime() < currentMonthStart().getTime();
}

function isBeforeOrSameCurrentMonth(date) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  return monthStart.getTime() <= currentMonthStart().getTime();
}

function renderTimeSlots() {
  E.timeGrid.innerHTML = "";
  const slots = ["08:00 AM", "09:30 AM", "11:00 AM", "12:00 PM", "01:30 PM", "03:00 PM", "05:30 PM", "07:00 PM"];
  const availableSlots = slots.filter((slot) => !isPastScheduledDateTime(scheduledDateFromSelection(selectedDate, slot)));
  if (availableSlots.length && isPastScheduledDateTime(scheduledDateFromSelection(selectedDate, selectedTime))) {
    selectedTime = availableSlots[0];
  }
  slots.forEach((slot) => {
    const btn = document.createElement("button");
    const disabled = isPastScheduledDateTime(scheduledDateFromSelection(selectedDate, slot));
    btn.type = "button";
    btn.textContent = slot;
    btn.disabled = disabled;
    btn.classList.toggle("is-disabled", disabled);
    if (!disabled && slot === selectedTime) btn.classList.add("is-selected");
    btn.addEventListener("click", () => {
      if (disabled) return;
      selectedTime = slot;
      renderTimeSlots();
      syncCustomScheduleTime();
      updateScheduleText();
    });
    E.timeGrid.appendChild(btn);
  });
}

function onCustomScheduleTime() {
  const value = E.customScheduleTime.value;
  if (!value) return;
  selectedTime = timeInputToDisplay(value);
  renderTimeSlots();
  updateScheduleText();
}

function syncCustomScheduleTime() {
  if (!E.customScheduleTime) return;
  E.customScheduleTime.value = displayTimeToInput(selectedTime);
  E.customScheduleTime.min = isSameDay(selectedDate, new Date())
    ? currentTimeInputValue()
    : "";
}

function timeInputToDisplay(value) {
  const parts = String(value).split(":");
  const hour24 = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour24) || !Number.isInteger(minute)) return selectedTime;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function displayTimeToInput(value) {
  const parsed = parseTime(value);
  return `${String(parsed.h).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")}`;
}

function currentTimeInputValue() {
  const now = new Date(Date.now() + 60000);
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function updateScheduleText() {
  if (isPastScheduledDateTime(scheduledDateFromSelection(selectedDate, selectedTime))) {
    E.scheduleText.textContent = "Select a future time";
    updateScheduleControls();
    return;
  }
  const label = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }) + " at " + selectedTime;
  E.scheduleText.textContent = label;
  updateScheduleControls();
}

function updateScheduleControls() {
  if (!E.confirmSchedule) return;
  const scheduled = scheduledDateFromSelection(selectedDate, selectedTime);
  const invalid = !hasValidScheduledLocations() || isPastCalendarDate(selectedDate) || isPastScheduledDateTime(scheduled);
  E.confirmSchedule.disabled = invalid;
  E.confirmSchedule.classList.toggle("is-disabled", invalid);
  if (invalid) {
    E.confirmSchedule.title = hasValidScheduledLocations()
      ? "Select a future date and time."
      : "Select pickup and destination first.";
  } else {
    E.confirmSchedule.removeAttribute("title");
  }
  E.confirmSchedule.setAttribute("aria-disabled", String(invalid));
}

function confirmSchedule() {
  if (!hasValidScheduledLocations()) {
    closeSchedule();
    beginScheduleFlow();
    return;
  }
  if (isPastCalendarDate(selectedDate)) {
    selectedDate = startOfDay(new Date());
    viewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderCalendar();
    return;
  }
  const scheduled = scheduledDateFromSelection(selectedDate, selectedTime);
  if (isPastScheduledDateTime(scheduled)) {
    rejectPastScheduledRide();
    return;
  }
  STATE.scheduledAt = scheduled;
  closeSchedule();
  E.scheduleSummary.style.display = "grid";
  E.scheduleText.textContent = scheduled.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  if (hasBookableRoute()) {
    setInputError("");
  } else {
    setInputError("Please wait for the route, or select pickup and destination again.");
  }
  updateBookButton();
}

function isScheduledRideDateValid() {
  return !STATE.scheduledAt || !isPastScheduledDateTime(STATE.scheduledAt);
}

function rejectPastScheduledRide() {
  STATE.scheduledAt = null;
  selectedDate = startOfDay(new Date());
  viewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  if (E.scheduleSummary) E.scheduleSummary.style.display = "none";
  renderCalendar();
  renderTimeSlots();
  syncCustomScheduleTime();
  setInputError("Please select a future date and time for your scheduled ride.");
}

function resetScheduledRide() {
  STATE.scheduledAt = null;
  STATE.scheduledSubmissionRideId = "";
  STATE.scheduledSubmissionRideCode = "";
  STATE.scheduleFlowPending = false;
  selectedDate = startOfDay(new Date());
  viewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  selectedTime = "12:00 PM";
  if (E.scheduleSummary) E.scheduleSummary.style.display = "none";
  updateScheduleControls();
  updateBookButton();
}

function scheduledDateFromSelection(date, timeText) {
  const scheduled = new Date(date);
  const parsed = parseTime(timeText);
  scheduled.setHours(parsed.h, parsed.m, 0, 0);
  return scheduled;
}

function isPastScheduledDateTime(date) {
  const scheduled = new Date(date);
  if (Number.isNaN(scheduled.getTime())) return true;
  return scheduled.getTime() <= Date.now();
}

function parseTime(timeText) {
  const parts = timeText.split(" ");
  const hm = parts[0].split(":");
  let h = Number(hm[0]);
  const m = Number(hm[1]);
  const ap = (parts[1] || "AM").toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return { h, m };
}

function addLiveRequest(fare) {
  const paymentMethod = getSelectedPaymentMethod() || "online";
  const row = {
    id: STATE.requestId,
    rideCode: STATE.activeRideCode || "",
    pickup: STATE.pickup,
    drop: STATE.drop,
    pickupAddress: STATE.pickupAddress || STATE.pickup,
    dropAddress: STATE.dropAddress || STATE.drop,
    rideType: STATE.rideType,
    fare,
    offeredFare: fare,
    paymentMethod,
    paymentLabel: paymentMethodLabel(paymentMethod),
    status: "pending",
    passengerName: localStorage.getItem("wow_user_name") || "Passenger",
    passengerPhone: localStorage.getItem("wow_user_phone") || "+92 300 0000000",
    targetDriverId: "",
    targetDriverName: "",
    passengerRating: "4.9",
    distanceKm: Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0),
    durationMin: Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0),
    trafficLevel: STATE.fareMeta.traffic_level || inferTrafficLevel(),
    timeOfDay: STATE.fareMeta.time_of_day || inferTimeOfDay(),
    requestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const rows = loadJson(STORAGE.liveRequests, []);
  rows.push(row);
  localStorage.setItem(STORAGE.liveRequests, JSON.stringify(rows));
  publishRealtime("ride.requested", {
    requestId: row.id,
    rideCode: row.rideCode,
    pickup: row.pickup,
    drop: row.drop,
    pickupAddress: row.pickupAddress,
    dropAddress: row.dropAddress,
    rideType: row.rideType,
    offeredFare: row.offeredFare,
    paymentMethod: row.paymentMethod,
    paymentLabel: row.paymentLabel,
    passengerName: row.passengerName,
    passengerPhone: row.passengerPhone,
    targetDriverId: row.targetDriverId,
    targetDriverName: row.targetDriverName,
    requestedAt: row.requestedAt
  });
}

function updateLiveRequestAfterAccept(fare) {
  const rows = loadJson(STORAGE.liveRequests, []);
  const idx = rows.findIndex((r) => r.id === STATE.requestId);
  if (idx < 0) return;
  const rideCode = STATE.activeRideCode || generateRideCode();
  rows[idx] = {
    ...rows[idx],
    fare,
    offeredFare: fare,
    status: "accepted",
    driverName: STATE.selectedDriver.name,
    driverPhone: STATE.selectedDriver.phone,
    driverRating: STATE.selectedDriver.rating,
    driverTrips: STATE.selectedDriver.trips,
    driverEta: STATE.selectedDriver.etaMin + " min",
    paymentMethod: rows[idx].paymentMethod || getSelectedPaymentMethod() || "online",
    paymentLabel: rows[idx].paymentLabel || paymentMethodLabel(rows[idx].paymentMethod || getSelectedPaymentMethod() || "online"),
    rideCode,
    driverVehicleType: mapRideTypeToVehicle(STATE.rideType),
    acceptedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE.liveRequests, JSON.stringify(rows));
  publishRealtime("ride.accepted", {
    requestId: rows[idx].id,
    rideCode,
    status: "accepted",
    fare,
    driverName: rows[idx].driverName || STATE.selectedDriver?.name || "Driver",
    driverPhone: rows[idx].driverPhone || STATE.selectedDriver?.phone || ""
  });
}

function persistRide(fare, meta = {}) {
  const rideCode = meta.rideCode || STATE.activeRideCode || generateRideCode();
  const paymentMethod = getSelectedPaymentMethod() || "online";
  localStorage.setItem("wow_ride_pickup", STATE.pickup);
  localStorage.setItem("wow_ride_drop", STATE.drop);
  localStorage.setItem("wow_ride_pickup_address", STATE.pickupAddress || STATE.pickup);
  localStorage.setItem("wow_ride_drop_address", STATE.dropAddress || STATE.drop);
  localStorage.setItem("wow_ride_fare", String(fare));
  localStorage.setItem("wow_ride_vehicle", STATE.rideType);
  localStorage.setItem("wow_ride_vehicle_model", RIDE_TYPES[STATE.rideType].model);
  localStorage.setItem("wow_ride_vehicle_color", RIDE_TYPES[STATE.rideType].color);
  localStorage.setItem("wow_ride_driver_name", STATE.selectedDriver.name);
  localStorage.setItem("wow_ride_driver_phone", STATE.selectedDriver.phone);
  localStorage.setItem("wow_ride_passenger", localStorage.getItem("wow_user_name") || "Passenger");
  localStorage.setItem("wow_ride_passenger_phone", localStorage.getItem("wow_user_phone") || "+92 300 0000000");
  localStorage.setItem("wow_ride_payment_method", paymentMethod);
  localStorage.setItem("wow_ride_payment_label", paymentMethodLabel(paymentMethod));
  localStorage.setItem("wow_ride_code", rideCode);
  localStorage.setItem("wow_ride_status", "accepted");
  if (meta.rideId) localStorage.setItem("wow_ride_db_id", String(meta.rideId));
  localStorage.setItem("wow_ride_pickup_lat", STATE.pickupPlace ? String(STATE.pickupPlace.lat) : "");
  localStorage.setItem("wow_ride_pickup_lng", STATE.pickupPlace ? String(STATE.pickupPlace.lng) : "");
  localStorage.setItem("wow_ride_drop_lat", STATE.dropPlace ? String(STATE.dropPlace.lat) : "");
  localStorage.setItem("wow_ride_drop_lng", STATE.dropPlace ? String(STATE.dropPlace.lng) : "");
  localStorage.setItem("wow_ride_distance_km", String(Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0)));
  localStorage.setItem("wow_ride_duration_min", String(Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0)));
  localStorage.setItem("wow_ride_traffic_level", STATE.fareMeta.traffic_level || inferTrafficLevel());
  localStorage.setItem("wow_ride_time_of_day", STATE.fareMeta.time_of_day || inferTimeOfDay());
  localStorage.setItem("wow_ride_distance_source", STATE.fareMeta.distance_source || "fallback");

  if (STATE.scheduledAt) {
    const rows = loadJson(STORAGE.rideHistory, []);
    rows.unshift({
      id: "up-" + Date.now(),
      pickup: STATE.pickup,
      drop: STATE.drop,
      fare,
      scheduled: STATE.scheduledAt.toLocaleString("en-US"),
      status: "scheduled"
    });
    localStorage.setItem(STORAGE.rideHistory, JSON.stringify(rows.slice(0, 10)));
  }
}

function persistScheduledRide(fare, meta = {}) {
  const rows = loadJson(STORAGE.rideHistory, []);
  rows.unshift({
    id: meta.rideId || ("scheduled-" + Date.now()),
    rideCode: meta.rideCode || generateRideCode(),
    pickup: STATE.pickup,
    drop: STATE.drop,
    fare: Number(fare || 0),
    scheduled: STATE.scheduledAt ? STATE.scheduledAt.toLocaleString("en-US") : "",
    vehicleType: STATE.rideType,
    paymentMethod: getSelectedPaymentMethod(),
    driverAssigned: false,
    assignmentStatus: "pending",
    status: "scheduled"
  });
  localStorage.setItem(STORAGE.rideHistory, JSON.stringify(rows.slice(0, 30)));
}

function persistPendingRide(fare, meta = {}) {
  const rideCode = meta.rideCode || STATE.activeRideCode || generateRideCode();
  const rideType = STATE.rideType || "WOW Car";
  const vehicleMeta = RIDE_TYPES[rideType] || RIDE_TYPES["WOW Car"];
  const paymentMethod = getSelectedPaymentMethod() || "online";
  localStorage.setItem("wow_ride_pickup", STATE.pickup);
  localStorage.setItem("wow_ride_drop", STATE.drop);
  localStorage.setItem("wow_ride_pickup_address", STATE.pickupAddress || STATE.pickup);
  localStorage.setItem("wow_ride_drop_address", STATE.dropAddress || STATE.drop);
  localStorage.setItem("wow_ride_fare", String(fare));
  localStorage.setItem("wow_ride_vehicle", rideType);
  localStorage.setItem("wow_ride_vehicle_model", vehicleMeta.model);
  localStorage.setItem("wow_ride_vehicle_color", vehicleMeta.color);
  localStorage.setItem("wow_ride_passenger", localStorage.getItem("wow_user_name") || "Passenger");
  localStorage.setItem("wow_ride_passenger_phone", localStorage.getItem("wow_user_phone") || "+92 300 0000000");
  localStorage.setItem("wow_ride_payment_method", paymentMethod);
  localStorage.setItem("wow_ride_payment_label", paymentMethodLabel(paymentMethod));
  localStorage.setItem("wow_ride_code", rideCode);
  localStorage.setItem("wow_ride_status", "finding_driver");
  if (meta.rideId) localStorage.setItem("wow_ride_db_id", String(meta.rideId));
  localStorage.setItem("wow_ride_pickup_lat", STATE.pickupPlace ? String(STATE.pickupPlace.lat) : "");
  localStorage.setItem("wow_ride_pickup_lng", STATE.pickupPlace ? String(STATE.pickupPlace.lng) : "");
  localStorage.setItem("wow_ride_drop_lat", STATE.dropPlace ? String(STATE.dropPlace.lat) : "");
  localStorage.setItem("wow_ride_drop_lng", STATE.dropPlace ? String(STATE.dropPlace.lng) : "");
  localStorage.setItem("wow_ride_distance_km", String(Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0)));
  localStorage.setItem("wow_ride_duration_min", String(Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0)));
  localStorage.setItem("wow_ride_traffic_level", STATE.fareMeta.traffic_level || inferTrafficLevel());
  localStorage.setItem("wow_ride_time_of_day", STATE.fareMeta.time_of_day || inferTimeOfDay());

  const requestedAt = new Date().toISOString();
  const requestId = String(meta.rideId || STATE.requestId || "").trim();
  const liveRow = {
    id: requestId,
    rideId: requestId,
    rideCode,
    pickup: STATE.pickup,
    drop: STATE.drop,
    pickupAddress: STATE.pickupAddress || STATE.pickup,
    dropAddress: STATE.dropAddress || STATE.drop,
    rideType,
    requestedVehicleType: mapRideTypeToVehicle(rideType),
    fare: Number(fare || 0),
    offeredFare: Number(fare || 0),
    paymentMethod,
    paymentLabel: paymentMethodLabel(paymentMethod),
    status: "pending",
    passengerName: localStorage.getItem("wow_user_name") || "Passenger",
    passengerPhone: localStorage.getItem("wow_user_phone") || "",
    passengerRating: "4.9",
    distanceKm: Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0),
    durationMin: Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0),
    requestedAt,
    updatedAt: requestedAt
  };
  const rows = loadJson(STORAGE.liveRequests, []);
  const index = rows.findIndex((row) => String(row.id || row.rideId || row.rideCode || "") === String(requestId || rideCode));
  if (index >= 0) rows[index] = { ...rows[index], ...liveRow };
  else rows.push(liveRow);
  localStorage.setItem(STORAGE.liveRequests, JSON.stringify(rows.slice(-100)));
  publishRealtime("ride.requested", {
    requestId,
    rideId: requestId,
    rideCode,
    pickup: liveRow.pickup,
    drop: liveRow.drop,
    pickupAddress: liveRow.pickupAddress,
    dropAddress: liveRow.dropAddress,
    rideType,
    requestedVehicleType: liveRow.requestedVehicleType,
    offeredFare: liveRow.offeredFare,
    paymentMethod,
    paymentLabel: liveRow.paymentLabel,
    passengerName: liveRow.passengerName,
    passengerPhone: liveRow.passengerPhone,
    passengerRating: liveRow.passengerRating,
    requestedAt
  });
}

function generateRideCode() {
  return "WOW-" + String(Date.now()).slice(-6);
}

async function createRideRecord(finalFare, rideCode, options = {}) {
  const paymentMethod = getSelectedPaymentMethod() || "online";
  if (!isScheduledRideDateValid()) {
    return { rideId: "", rideCode, fare: Number(finalFare || 0), error: "scheduled_date_in_past" };
  }
  const passengerUid = currentPassengerUid();
  const passengerEmail = currentPassengerEmail();
  const passengerName = currentPassengerName();
  const passengerPhone = currentPassengerPhone();
  const payload = {
    ride_code: rideCode,
    pickup: STATE.pickup,
    drop: STATE.drop,
    pickup_address: STATE.pickupAddress || STATE.pickup,
    drop_address: STATE.dropAddress || STATE.drop,
    pickup_place_name: STATE.pickupPlace ? (STATE.pickupPlace.title || STATE.pickup) : STATE.pickup,
    dropoff_place_name: STATE.dropPlace ? (STATE.dropPlace.title || STATE.drop) : STATE.drop,
    pickup_mapbox_id: STATE.pickupPlace ? (STATE.pickupPlace.mapboxId || "") : "",
    dropoff_mapbox_id: STATE.dropPlace ? (STATE.dropPlace.mapboxId || "") : "",
    pickup_place_type: STATE.pickupPlace ? (STATE.pickupPlace.type || "") : "",
    dropoff_place_type: STATE.dropPlace ? (STATE.dropPlace.type || "") : "",
    pickup_lat: STATE.pickupPlace ? STATE.pickupPlace.lat : "",
    pickup_lng: STATE.pickupPlace ? STATE.pickupPlace.lng : "",
    drop_lat: STATE.dropPlace ? STATE.dropPlace.lat : "",
    drop_lng: STATE.dropPlace ? STATE.dropPlace.lng : "",
    distance_km: Number(STATE.fareMeta.distance_km || STATE.routeDistanceKm || 0),
    duration_min: Number(STATE.fareMeta.duration_min || STATE.routeDurationMin || 0),
    vehicle_type: STATE.rideType,
    traffic_level: STATE.fareMeta.traffic_level || inferTrafficLevel(),
    time_of_day: STATE.fareMeta.time_of_day || inferTimeOfDay(),
    fare: Number(finalFare || 0),
    offered_fare: Number(finalFare || 0),
    passenger_name: passengerName,
    passenger_phone: passengerPhone,
    payment_method: paymentMethod,
    payment_label: paymentMethodLabel(paymentMethod),
    target_driver_id: "",
    target_driver_name: "",
    status: "pending",
    ride_type: STATE.carpoolOn ? "carpool" : "single",
    is_carpool: STATE.carpoolOn ? 1 : 0,
    carpool: STATE.carpoolOn ? "yes" : "no",
    email: passengerEmail,
    role: "passenger",
    firebase_uid: passengerUid,
    uid: passengerUid,
    user_id: passengerUid
  };

  if (STATE.scheduledAt) {
    payload.scheduled_at = STATE.scheduledAt.toISOString();
    payload.scheduled_date = calendarDateKey(STATE.scheduledAt);
  }

  if (STATE.carpoolOn) {
    const breakdown = getFareBreakdown();
    const totalSeats = Math.max(1, Number(STATE.seatsLeft || 1));
    const occupiedSeats = Math.max(1, Math.min(totalSeats, Number(STATE.passengers || 1)));
    payload.total_seats = totalSeats;
    payload.available_seats = Math.max(0, totalSeats - occupiedSeats);
    payload.passenger_count = occupiedSeats;
    payload.fare_per_person = Number(breakdown.individualFare || finalFare || 0);
    payload.discount_percentage = Number(breakdown.discountPercent || 0);
  }

  try {
    const startedAt = performance.now();
    const res = await fetch(RIDE_API.create, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.info("[WOW Perf] Passenger create ride timeMs:", perfElapsed(startedAt));
    if (res.ok && data && data.ok) {
      return {
        rideId: String(data.ride_id || ""),
        rideCode: String(data.ride_code || rideCode),
        fare: Number(data.fare || finalFare),
        status: String(data.status || ""),
        message: String(data.message || "")
      };
    }
    if (options.throwOnError) throw new Error(data?.error || "ride_request_failed");
  } catch (error) {
    if (options.throwOnError) throw error;
    // Keep flow non-blocking if DB write fails.
  }
  return { rideId: "", rideCode, fare: Number(finalFare || 0) };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function initial(text) {
  return (text || "D").trim().charAt(0).toUpperCase() || "D";
}

function isDriverArrivingStatus(status) {
  return ["arrived", "driver_arriving"].includes(String(status || "").toLowerCase());
}

function isRideStartedStatus(status) {
  return ["in_progress", "ride_started", "started", "on_trip"].includes(String(status || "").toLowerCase());
}

function money(value) {
  return "Rs. " + Number(value || 0).toLocaleString("en-PK");
}

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

function firestoreMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return Number(value.seconds) * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePoint(label) {
  const c = { lat: 24.8607, lng: 67.0011 };
  const hash = String(label || "")
    .split("")
    .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return {
    lat: c.lat + (((hash % 17) - 8) * 0.0042),
    lng: c.lng + ((((hash >> 2) % 17) - 8) * 0.0042)
  };
}

async function maybeDrawRoute() {
  if (!window.WowMapbox || !STATE.map) {
    if (hasValidBookingLocations()) {
      applyFallbackRouteFromLocations(STATE.pickupPlace, STATE.dropPlace);
      setInputError("Map routing is unavailable right now. Please wait for Mapbox to load before booking.");
      updateBookButton();
    }
    return;
  }
  if (!STATE.pickupPlace || !STATE.dropPlace) {
    STATE.routeLoading = false;
    STATE.routeAvailable = false;
    STATE.routeDistanceKm = 0;
    STATE.routeDurationMin = 0;
    setBookingMapRouteVisible(false);
    setInputError("Please select pickup and destination from the suggestions.");
    updateBookButton();
    return;
  }
  const requestSeq = ++STATE.routeRequestSeq;
  STATE.routeLoading = true;
  STATE.routeAvailable = false;
  setBookingMapRouteVisible(false);
  updateBookButton();
  let origin = null;
  let destination = null;
  try {
    origin = await resolveRoutePoint("pickup");
    destination = await resolveRoutePoint("drop");
    if (!origin || !destination) throw Object.assign(new Error("Please select pickup and destination from the suggestions."), { code: "InvalidInput" });
    if (!WowMapbox.isInsidePakistan(origin) || !WowMapbox.isInsidePakistan(destination)) {
      throw Object.assign(new Error("Please select pickup and destination within Pakistan."), { code: "InvalidInput" });
    }
    if (Math.abs(origin.lng - destination.lng) < 0.000001 && Math.abs(origin.lat - destination.lat) < 0.000001) {
      throw Object.assign(new Error("Pickup and destination cannot be identical."), { code: "InvalidInput" });
    }
    const routeKey = routeCacheKey(origin, destination, STATE.rideType);
    if (STATE.lastMainRouteKey === routeKey && STATE.routeAvailable && STATE.routeDistanceKm > 0) return;
    STATE.pickupPlace = origin;
    STATE.dropPlace = destination;
    setRouteMarkers("main", origin, destination);
    const route = await WowMapbox.directions(origin, destination);
    if (requestSeq !== STATE.routeRequestSeq) return;
    if (!Array.isArray(route.coordinates) || route.coordinates.length < 2) throw Object.assign(new Error("The routing service returned no route geometry."), { code: "MissingGeometry" });
    WowMapbox.drawRoute(STATE.map, STATE.mainRouteLayerId, route.coordinates, "#1a73e8", 5);
    STATE.routeDistanceKm = Number((route.distanceMeters / 1000).toFixed(3));
    STATE.routeDurationMin = Number((route.durationSeconds / 60).toFixed(2));
    STATE.baseFare = calculateFareFromRoute(STATE.routeDistanceKm, STATE.routeDurationMin);
    STATE.routeAvailable = true;
    STATE.routeLoading = false;
    STATE.lastMainRouteKey = routeKey;
    updateFareUi();
    if (!STATE.mapUserExploring) WowMapbox.fitMap(STATE.map, route.path, 52);
    setBookingMapRouteVisible(true);
    setInputError("");
    updateBookButton();
    queueFareEstimate(120);
  } catch (error) {
    if (requestSeq !== STATE.routeRequestSeq) return;
    STATE.routeLoading = false;
    applyFallbackRouteFromLocations(origin || STATE.pickupPlace, destination || STATE.dropPlace);
    STATE.routeAvailable = false;
    STATE.routeDistanceKm = 0;
    STATE.routeDurationMin = 0;
    STATE.lastMainRouteKey = "";
    WowMapbox.clearRoute(STATE.map, STATE.mainRouteLayerId);
    setBookingMapRouteVisible(false);
    console.error("[WOW Passenger] Mapbox route failed", { code: error?.code || "Exception", status: error?.status || 0, message: error?.message || String(error) });
    setInputError(routeFailureMessage(error));
    updateBookButton();
  }
}

function setBookingMapRouteVisible(visible) {
  const box = E.map?.closest(".map-box");
  if (box) box.classList.toggle("has-route", Boolean(visible));
}

function routeFailureMessage(error) {
  const code = String(error?.code || "");
  if (code === "NoRoute") return "No driving route was found between these locations.";
  if (code === "NoSegment") return "One selected location is too far from a routable road. Please choose a nearby entrance or road.";
  if (["Unauthorized", "Forbidden"].includes(code) || [401, 403].includes(Number(error?.status))) return "Map service authentication failed.";
  if (code === "TooManyRequests" || Number(error?.status) === 429) return "Map service request limit reached. Please try again shortly.";
  if (code === "NetworkError") return "Unable to connect to the routing service.";
  if (code === "InvalidInput") return error?.message || "Please select pickup and destination from the suggestions.";
  return error?.message || "Unable to load the driving route right now.";
}

async function drawConfirmRoute() {
  if (!window.WowMapbox || !E.confirmMap) return;
  if (!STATE.confirmMap) {
    STATE.confirmMap = WowMapbox.createMap(E.confirmMap, { center: MAPS_CONFIG.defaultCenter, zoom: 12 });
  }
  if (!STATE.confirmMap) return;

  try {
    const origin = await resolveRoutePoint("pickup");
    const destination = await resolveRoutePoint("drop");
    if (!origin || !destination) return;
    const routeKey = routeCacheKey(origin, destination, "confirm");
    if (STATE.lastConfirmRouteKey === routeKey) return;
    STATE.lastConfirmRouteKey = routeKey;
    setRouteMarkers("confirm", origin, destination);
    const route = await WowMapbox.directions(origin, destination);
    WowMapbox.drawRoute(STATE.confirmMap, STATE.confirmRouteLayerId, route.coordinates, "#1a73e8", 5);
    WowMapbox.fitMap(STATE.confirmMap, route.path, 44);
  } catch (error) {
    WowMapbox.clearRoute(STATE.confirmMap, STATE.confirmRouteLayerId);
    console.error("[WOW Passenger] confirmation route failed", { code: error?.code || "Exception", status: error?.status || 0, message: error?.message || String(error) });
  }
}

function initMap() {
  if (!E.map) {
    E.map = document.getElementById("map");
    E.pickup = E.pickup || document.getElementById("pickup");
    E.drop = E.drop || document.getElementById("drop");
  }
  if (!window.WowMapbox || !E.map) return;
  if (STATE.map) return;
  STATE.map = WowMapbox.createMap(E.map, { center: MAPS_CONFIG.defaultCenter, zoom: 11 });
  if (!STATE.map) return;
  STATE.map.on("dragstart", (event) => { if (event?.originalEvent) STATE.mapUserExploring = true; });
  STATE.map.on("zoomstart", (event) => { if (event?.originalEvent) STATE.mapUserExploring = true; });
  const resizeMap = () => {
    try { STATE.map.resize(); } catch {}
  };
  window.requestAnimationFrame(resizeMap);
  STATE.map.once("load", () => {
    resizeMap();
    maybeDrawRoute();
  });
  // Mapbox handles click selection for pickup/drop points.
  STATE.map.on("click", async (event) => {
    const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
    await setPointFromMap(STATE.activeLocationTarget || "pickup", point);
  });
  maybeDrawRoute();
}

function selectRide(type, fare, cardEl) {
  if (!RIDE_TYPES[type]) return;
  if (type !== "WOW Car") {
    STATE.carpoolOn = false;
    if (E.carpool) E.carpool.checked = false;
  }
  STATE.rideType = type;
  STATE.baseFare = Number(fare || RIDE_TYPES[type].fare);
  STATE.seatsLeft = RIDE_TYPES[type].seats;
  E.carpoolRideType.textContent = type;
  document.querySelectorAll(".ride-card").forEach((card) => card.classList.remove("active"));
  if (cardEl) cardEl.classList.add("active");
  updateRideCardLabels();
  updateFareUi();
  maybeDrawRoute();
  queueFareEstimate(120);
}

function panMapToSelectedPlace(loc) {
  if (!loc || !STATE.map) return;
  STATE.map.easeTo({ center: [loc.lng, loc.lat], zoom: 14 });
}

function setRouteMarkers(scope, start, end) {
  const isMain = scope === "main";
  const map = isMain ? STATE.map : STATE.confirmMap;
  if (!map) return;

  const pickupKey = isMain ? "mapPickupMarker" : "confirmPickupMarker";
  const dropKey = isMain ? "mapDropMarker" : "confirmDropMarker";
  if ((start && !WowMapbox.isInsidePakistan(start)) || (end && !WowMapbox.isInsidePakistan(end))) {
    console.error("[WOW Passenger] marker coordinates rejected", { start, end });
    return;
  }
  if (start) {
    if (!STATE[pickupKey]) {
      STATE[pickupKey] = WowMapbox.createLabelMarker(map, start, "#25c38b", "P", { draggable: isMain });
      if (isMain) STATE[pickupKey].on("dragend", () => setPointFromMap("pickup", markerPoint(STATE[pickupKey])));
    } else {
      WowMapbox.setMarkerPoint(STATE[pickupKey], start);
    }
  }
  if (end) {
    if (!STATE[dropKey]) {
      STATE[dropKey] = WowMapbox.createLabelMarker(map, end, "#ff4d4d", "D", { draggable: isMain });
      if (isMain) STATE[dropKey].on("dragend", () => setPointFromMap("drop", markerPoint(STATE[dropKey])));
    } else {
      WowMapbox.setMarkerPoint(STATE[dropKey], end);
    }
  }
}

function markerPoint(marker) {
  const lngLat = marker.getLngLat();
  return { lat: lngLat.lat, lng: lngLat.lng };
}

function routeCacheKey(origin, destination, scope) {
  return [
    scope || "",
    Number(origin.lng).toFixed(5),
    Number(origin.lat).toFixed(5),
    Number(destination.lng).toFixed(5),
    Number(destination.lat).toFixed(5)
  ].join("|");
}

function cleanupPassengerDashboard() {
  detachPassengerRideRequestListeners();
  clearTimeout(STATE.matchingTimer);
  clearTimeout(STATE.autoOpenRideTimer);
  clearTimeout(STATE.fareEstimateTimer);
  if (STATE.fareEstimateAbortController) {
    STATE.fareEstimateAbortController.abort();
    STATE.fareEstimateAbortController = null;
  }
  clearTimeout(STATE.offerValidationTimer);
  Object.keys(STATE.locationSearchTimers || {}).forEach((key) => clearTimeout(STATE.locationSearchTimers[key]));
  stopMatchingPoll();
  stopDriverAcceptancePoll();
  stopChatPolling();
  if (STATE.arrivalTimer) clearInterval(STATE.arrivalTimer);
  if (STATE.callTimer) clearInterval(STATE.callTimer);
  if (STATE.realtimeUnsubscribe) {
    try { STATE.realtimeUnsubscribe(); } catch {}
    STATE.realtimeUnsubscribe = null;
  }
  if (STATE.authUnsubscribe) {
    try { STATE.authUnsubscribe(); } catch {}
    STATE.authUnsubscribe = null;
  }
  if (STATE.chatUnsubscribe) {
    try { STATE.chatUnsubscribe(); } catch {}
    STATE.chatUnsubscribe = null;
  }
}

function perfElapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

async function setPointFromMap(target, point) {
  try {
    const label = await WowMapbox.reverseGeocode(point);
    applyLocationSelection(target, label || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, point);
  } catch {
    applyLocationSelection(target, `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, point);
    setInputError("Unable to update the address for this map point.");
  }
}

async function resolveRoutePoint(target) {
  const saved = target === "pickup" ? STATE.pickupPlace : STATE.dropPlace;
  return saved ? WowMapbox.normalizePoint(saved) : null;
}

function updateRideCardLabels() {
  E.rideCards.forEach((card) => {
    const action = card.querySelector("span");
    if (!action) return;
    action.textContent = "";
  });
}

function rideActionLabel(rideType) {
  const action = STATE.scheduledAt ? "Schedule" : "Book";
  if (rideType === "WOW Bike") return `${action} Bike`;
  if (rideType === "WOW Scooty") return `${action} Scooty`;
  return `${action} Car`;
}

function isCarpoolAllowed() {
  return STATE.rideType === "WOW Car";
}

window.selectRide = selectRide;
