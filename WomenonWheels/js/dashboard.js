const STORAGE = {
  liveRequests: "wow_live_ride_requests",
  rideHistory: "wow_upcoming_rides"
};

const FARE_API = {
  estimate: "php/get_fare_estimate.php"
};

const RIDE_API = {
  create: "php/create_ride.php",
  update: "php/update_ride_status.php",
  details: "php/get_ride.php"
};

const OFFER_POLICY = {
  minFactor: 0.9,
  maxFactor: 1.125
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
  pickupPlace: null,
  dropPlace: null,
  rideType: "WOW Car",
  baseFare: 380,
  seatsLeft: 3,
  passengers: 1,
  carpoolOn: false,
  discountPercent: 30,
  scheduledAt: null,
  selectedDriver: DRIVER_POOL[0],
  requestId: null,
  matchingTimer: null,
  arrivalTimer: null,
  arrivalSeconds: 5 * 60,
  callTimer: null,
  callSeconds: 0,
  chatReplyTimer: null,
  map: null,
  directionsService: null,
  directionsRenderer: null,
  confirmMap: null,
  confirmDirectionsService: null,
  confirmDirectionsRenderer: null,
  mapPickupMarker: null,
  mapDropMarker: null,
  confirmPickupMarker: null,
  confirmDropMarker: null,
  pickupAutocomplete: null,
  dropAutocomplete: null,
  autoOpenRideTimer: null,
  routeDistanceKm: 0,
  routeDurationMin: 0,
  fareEstimateTimer: null,
  fareEstimateSeq: 0,
  matchingPollTimer: null,
  lastDriverCandidates: [],
  activeRideCode: "",
  activeRideDbId: 0,
  fareMeta: {
    distance_km: 0,
    duration_min: 0,
    traffic_level: "medium",
    time_of_day: "day",
    distance_source: "fallback"
  }
};

const E = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  seedUser();
  bindEvents();
  selectRide(STATE.rideType, STATE.baseFare, document.querySelector(".ride-card.active"));
  updateInputSummary();
  updateBookButton();
  renderCalendar();
  renderTimeSlots();
  renderMatchOffer(STATE.selectedDriver);
  disableDashboardSos();
});

function cacheEls() {
  [
  "pickup", "drop", "pickupConfirm", "dropConfirm", "inputError", "bookBtn", "offerInput",
  "offerRangeHint",
    "carpool", "carpoolCard", "carpoolDetails", "carpoolRideType", "carpoolSeats", "carpoolPassengerCount",
    "originalFare", "carpoolFare", "saveNote",
    "scheduleBtn", "scheduleOverlay", "scheduleSidebar", "closeSchedule", "calendarTitle", "calendarGrid",
    "prevMonth", "nextMonth", "timeGrid", "scheduleText", "scheduleSummary", "confirmSchedule",
    "matchOverlay", "matchPanel", "driverGrid", "matchOffer", "offerDriverName", "offerDriverMeta",
    "offerFare", "offerNote", "matchOfferInput", "sendOffer", "declineOffer", "acceptOffer",
    "confirmationPanel", "confirmPickup", "confirmDrop", "confirmFare", "confirmWowCode", "confirmRideCode", "confirmDriverName", "confirmDriverVehicle",
    "confirmDriverRating", "etaText", "rideStatusPill", "rideStatusTitle", "rideStatusSub", "arrivalCountdown",
    "arrivalMessage", "confirmMap", "driverDot", "cancelRideBtn", "cancelOverlay", "cancelModal",
    "keepRideBtn", "confirmCancelBtn", "sosBtn", "sosOverlay", "sosPanel", "closeSos", "activateSosBtn",
    "chatBtn", "chatOverlay", "chatPanel", "closeChat", "chatDriverName", "chatAvatar", "chatBody", "chatInput",
    "sendChat", "emojiBtn", "callBtn", "callOverlay", "callPanel", "closeCall", "callDriverName", "callTimer",
    "endCallBtn", "startPassengerRide", "greetingText", "userName", "map", "inputConfirmation"
  ].forEach((id) => {
    E[id] = document.getElementById(id);
  });
  E.rideCards = Array.from(document.querySelectorAll(".ride-card"));
  E.rideFareHint = E.offerRangeHint || document.querySelector(".offer-box p");
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
}

function bindEvents() {
  E.pickup.addEventListener("input", () => onLocationInput("pickup"));
  E.drop.addEventListener("input", () => onLocationInput("drop"));

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

  E.offerInput.addEventListener("input", syncOfferInput);
  E.bookBtn.addEventListener("click", onBookRide);

  E.scheduleBtn.addEventListener("click", openSchedule);
  E.closeSchedule.addEventListener("click", closeSchedule);
  E.scheduleOverlay.addEventListener("click", closeSchedule);
  E.prevMonth.addEventListener("click", () => shiftMonth(-1));
  E.nextMonth.addEventListener("click", () => shiftMonth(1));
  E.confirmSchedule.addEventListener("click", confirmSchedule);

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

  E.startPassengerRide.addEventListener("click", onPassengerStartRide);
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

function onLocationInput(target) {
  if (target === "pickup") STATE.pickupPlace = null;
  if (target === "drop") STATE.dropPlace = null;
  STATE.pickup = E.pickup.value.trim();
  STATE.drop = E.drop.value.trim();
  if (!STATE.pickupPlace || !STATE.dropPlace) {
    STATE.routeDistanceKm = 0;
    STATE.routeDurationMin = 0;
  }
  updateInputSummary();
  updateBookButton();
  maybeDrawRoute();
  queueFareEstimate();
}

function updateInputSummary() {
  E.pickupConfirm.textContent = STATE.pickup || "--";
  E.dropConfirm.textContent = STATE.drop || "--";
}

function updateBookButton() {
  const valid = Boolean(STATE.pickup && STATE.drop);
  E.bookBtn.disabled = !valid;
  if (!valid) {
    setInputError("Please enter both pickup and drop-off locations.");
  } else {
    setInputError("");
  }
  E.bookBtn.textContent = rideActionLabel(STATE.rideType);
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
  E.carpoolSeats.textContent = maxSeats + (maxSeats === 1 ? " seat" : " seats");
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

  const base = STATE.baseFare;
  const discounted = Math.max(50, Math.round(base * (1 - STATE.discountPercent / 100)));
  const activeFare = STATE.carpoolOn ? discounted : base;
  E.originalFare.textContent = money(base);
  E.carpoolFare.textContent = money(discounted);
  E.saveNote.textContent = "You save " + money(base - discounted) + " on this ride!";
  updateOfferRangeHint();

  if (!E.offerInput.value || Number(E.offerInput.value) <= 0) {
    E.offerInput.value = String(activeFare);
  }
  const bounds = getOfferBounds();
  E.offerInput.min = String(bounds.minOffer);
  E.offerInput.max = String(bounds.maxOffer);
  E.offerInput.title = "Your Offer";
  updateBookButton();
  syncOfferInput();
}

function syncOfferInput() {
  const value = Math.max(0, Number(E.offerInput.value || 0));
  const rounded = Math.round(value);
  E.offerInput.value = String(rounded);
  if (rounded > 0 && !isOfferValid(rounded)) {
    updateOfferRangeHint("Offer out of range. ");
  } else {
    updateOfferRangeHint();
  }
}

function updateOfferRangeHint(prefix = "") {
  if (!E.rideFareHint) return;
  const bounds = getOfferBounds();
  E.rideFareHint.textContent = `${prefix}Your Offer range: Rs. ${bounds.minOffer} - Rs. ${bounds.maxOffer}`;
}

function getActiveFare() {
  const base = STATE.baseFare;
  if (!STATE.carpoolOn) return base;
  return Math.max(50, Math.round(base * (1 - STATE.discountPercent / 100)));
}

function getOfferBounds() {
  const estimated = Math.max(1, Math.round(getActiveFare()));
  const minOffer = Math.max(1, Math.round(estimated * OFFER_POLICY.minFactor));
  const maxOffer = Math.max(minOffer + 5, Math.round(estimated * OFFER_POLICY.maxFactor));
  return { estimated, minOffer, maxOffer };
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
  }
  if (STATE.dropPlace) {
    payload.drop_lat = STATE.dropPlace.lat;
    payload.drop_lng = STATE.dropPlace.lng;
  }

  if (STATE.routeDistanceKm > 0 && STATE.routeDurationMin > 0) {
    payload.distance_km = STATE.routeDistanceKm;
    payload.duration_min = STATE.routeDurationMin;
  }

  return payload;
}

async function requestFareEstimate() {
  if (!STATE.pickup || !STATE.drop) return;

  const requestSeq = ++STATE.fareEstimateSeq;
  const payload = buildFarePayload();

  try {
    const res = await fetch(FARE_API.estimate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (requestSeq !== STATE.fareEstimateSeq) return;
    if (!res.ok || !data || !data.ok) return;

    const estimatedFare = Math.max(0, Number(data.estimated_fare || 0));
    if (estimatedFare > 0) {
      STATE.baseFare = Math.round(estimatedFare);
    }

    STATE.fareMeta = {
      distance_km: Number(data.distance_km || payload.distance_km || 0),
      duration_min: Number(data.duration_min || payload.duration_min || 0),
      traffic_level: String(data.traffic_level || payload.traffic_level || "medium"),
      time_of_day: String(data.time_of_day || payload.time_of_day || "day"),
      distance_source: String(data.distance_source || "fallback")
    };

    if (STATE.fareMeta.distance_km > 0) STATE.routeDistanceKm = STATE.fareMeta.distance_km;
    if (STATE.fareMeta.duration_min > 0) STATE.routeDurationMin = STATE.fareMeta.duration_min;
    updateFareUi();
  } catch {
    // Keep existing static fare if API fails.
  }
}

function onBookRide() {
  if (!STATE.pickup || !STATE.drop) {
    setInputError("Please enter both pickup and drop-off locations.");
    return;
  }

  const requestedFare = Math.max(0, Number(E.offerInput.value || getActiveFare()));
  if (!isOfferValid(requestedFare)) {
    updateOfferRangeHint("Offer out of range. ");
    return;
  }
  updateOfferRangeHint();
  setInputError("");
  const requestId = "req-" + Date.now();
  STATE.requestId = requestId;
  addLiveRequest(requestedFare);
  openMatching(requestedFare);
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

function getNearbyVehicleMatchedDrivers() {
  const pickup = getPickupPoint();
  const expectedVehicle = mapRideTypeToVehicle(STATE.rideType);
  const baseFare = Math.max(50, Math.round(getActiveFare()));
  const radiusKm = nearbyRadiusForVehicle(expectedVehicle);

  return DRIVER_POOL
    .filter((driver) => driver.online && driver.vehicleType === expectedVehicle)
    .map((driver) => {
      const distanceKm = haversineKm(pickup, { lat: driver.lat, lng: driver.lng });
      const etaMin = Math.max(3, Math.round((distanceKm / 28) * 60));
      const estimatedFare = Math.round(baseFare + (distanceKm * 5));
      return { driver, distanceKm, etaMin, estimatedFare };
    })
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function renderDriverGrid(requestedFare) {
  E.driverGrid.innerHTML = "";
  const candidates = getNearbyVehicleMatchedDrivers();
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
    const shownFare = Math.max(0, Number(requestedFare || E.offerInput.value || getActiveFare()));
    card.innerHTML =
      '<div class="driver-info">' +
      "<strong>" + esc(driver.name) + "</strong>" +
      "<span>" + esc(STATE.rideType) + " . " + candidate.distanceKm.toFixed(1) + " km . ETA " + candidate.etaMin + " min</span>" +
      "</div>" +
      '<div class="driver-meta">' +
      "<strong>" + money(shownFare) + "</strong>" +
      "<span>" + esc(driver.rating) + " rating</span>" +
      "</div>";
    card.addEventListener("click", () => {
      E.driverGrid.querySelectorAll(".driver-card").forEach((el) => el.classList.remove("is-selected"));
      card.classList.add("is-selected");
      STATE.selectedDriver = { ...driver, etaMin: candidate.etaMin };
      renderMatchOffer(STATE.selectedDriver, shownFare);
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
  E.offerNote.textContent = "Offer sent. Waiting for driver response...";
  E.sendOffer.disabled = true;
  setTimeout(() => {
    E.sendOffer.disabled = false;
    E.offerNote.textContent = "Driver accepted your updated offer.";
  }, 1100);
}

function declineOffer() {
  E.matchPanel.classList.remove("show-offer");
  E.matchPanel.classList.add("show-drivers");
}

async function acceptOffer() {
  const offeredFare = Math.max(0, Number(E.matchOfferInput.value || getActiveFare()));
  if (!isOfferValid(offeredFare)) {
    const bounds = getOfferBounds();
    E.offerNote.textContent = `Offer must be within Rs. ${bounds.minOffer} - Rs. ${bounds.maxOffer}.`;
    return;
  }
  stopMatchingPoll();
  E.matchOverlay.classList.remove("is-open");
  E.matchOverlay.setAttribute("aria-hidden", "true");
  E.matchPanel.classList.remove("show-drivers", "show-offer");

  const provisionalRideCode = generateRideCode();
  const rideMeta = await createRideRecord(offeredFare, provisionalRideCode);
  const confirmedFare = Number(rideMeta.fare || offeredFare);
  STATE.activeRideCode = rideMeta.rideCode || provisionalRideCode;
  STATE.activeRideDbId = Number(rideMeta.rideId || 0);

  updateLiveRequestAfterAccept(confirmedFare);
  persistRide(confirmedFare, { rideCode: STATE.activeRideCode, rideId: STATE.activeRideDbId });
  showConfirmation(confirmedFare);
  startRideStatusPolling();
}

function showConfirmation(finalFare) {
  E.confirmPickup.textContent = STATE.pickup;
  E.confirmDrop.textContent = STATE.drop;
  E.confirmFare.textContent = money(finalFare);
  E.confirmDriverName.textContent = STATE.selectedDriver.name;
  E.confirmDriverVehicle.textContent = RIDE_TYPES[STATE.rideType].model + " - " + RIDE_TYPES[STATE.rideType].color;
  E.confirmDriverRating.textContent = "star " + STATE.selectedDriver.rating + " . " + STATE.selectedDriver.trips + " trips";
  E.chatDriverName.textContent = STATE.selectedDriver.name;
  E.callDriverName.textContent = STATE.selectedDriver.name;
  E.chatAvatar.textContent = initial(STATE.selectedDriver.name);
  const wowCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || generateRideCode();
  if (E.confirmRideCode) E.confirmRideCode.textContent = "Your WOW Code: " + wowCode;
  if (E.confirmWowCode) E.confirmWowCode.textContent = wowCode;
  if (E.startPassengerRide) E.startPassengerRide.disabled = true;

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
  const query = new URLSearchParams({
    ride_code: rideCode,
    role: "passenger",
    email: localStorage.getItem("wow_user_email") || "",
    user_id: localStorage.getItem("wow_user_id") || ""
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
  if (status === "arrived") {
    E.rideStatusTitle.textContent = "Driver arrived";
    E.rideStatusPill.textContent = "Arrived";
    E.rideStatusSub.textContent = "Waiting for you to start ride";
    E.arrivalMessage.textContent = "Driver has reached pickup. Tap Start Ride when you are onboard.";
    if (E.startPassengerRide) E.startPassengerRide.disabled = false;
    clearInterval(STATE.arrivalTimer);
  } else if (status === "in_progress") {
    if (E.startPassengerRide) E.startPassengerRide.disabled = false;
    location.href = "passenger-ride.html";
  }
}

async function onPassengerStartRide() {
  const rideCode = STATE.activeRideCode || localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  if (E.startPassengerRide && E.startPassengerRide.disabled) return;
  if (E.startPassengerRide) {
    E.startPassengerRide.disabled = true;
    E.startPassengerRide.textContent = "Starting...";
  }
  try {
    const res = await fetch(RIDE_API.update, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_code: rideCode,
        status: "in_progress",
        role: "passenger",
        email: localStorage.getItem("wow_user_email") || "",
        user_id: Number(localStorage.getItem("wow_user_id") || 0)
      })
    });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      localStorage.setItem("wow_ride_status", "in_progress");
      location.href = "passenger-ride.html";
      return;
    }
  } catch {
    // Fallback below preserves flow if network is briefly unavailable.
  }
  localStorage.setItem("wow_ride_status", "in_progress");
  location.href = "passenger-ride.html";
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

function openChat() {
  openPanel(E.chatOverlay, E.chatPanel);
  E.chatInput.focus();
}

function sendChat() {
  const text = E.chatInput.value.trim();
  if (!text) return;
  appendChatBubble("passenger", text);
  E.chatInput.value = "";
  showTyping();
  clearTimeout(STATE.chatReplyTimer);
  STATE.chatReplyTimer = setTimeout(() => {
    hideTyping();
    const replies = [
      "I am nearby, see you soon.",
      "Thanks, I have your location.",
      "Please stay at the pickup point.",
      "On my way."
    ];
    appendChatBubble("driver", replies[Math.floor(Math.random() * replies.length)]);
  }, 900);
}

function seedChat() {
  if (!E.chatBody || E.chatBody.children.length) return;
  appendChatBubble("driver", "Hi, I am on my way and will arrive shortly.");
}

function appendChatBubble(type, text) {
  const row = document.createElement("div");
  row.className = "chat-row " + type;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + type;
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "chat-time";
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.appendChild(bubble);
  row.appendChild(time);
  E.chatBody.appendChild(row);
  E.chatBody.scrollTop = E.chatBody.scrollHeight;
}

function showTyping() {
  if (document.getElementById("typingRow")) return;
  const row = document.createElement("div");
  row.id = "typingRow";
  row.className = "chat-row driver";
  row.innerHTML =
    '<div class="chat-bubble driver"><span class="typing-indicator"><span></span><span></span><span></span></span></div>';
  E.chatBody.appendChild(row);
  E.chatBody.scrollTop = E.chatBody.scrollHeight;
}

function hideTyping() {
  const row = document.getElementById("typingRow");
  if (row) row.remove();
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
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderCalendar();
}

function renderCalendar() {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  E.calendarTitle.textContent = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
    if (isToday) btn.classList.add("is-today");
    if (isSelected) btn.classList.add("is-selected");
    btn.addEventListener("click", () => {
      selectedDate = date;
      renderCalendar();
      updateScheduleText();
    });
    E.calendarGrid.appendChild(btn);
  }

  updateScheduleText();
}

function renderTimeSlots() {
  E.timeGrid.innerHTML = "";
  const slots = ["08:00 AM", "09:30 AM", "11:00 AM", "12:00 PM", "01:30 PM", "03:00 PM", "05:30 PM", "07:00 PM"];
  slots.forEach((slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = slot;
    if (slot === selectedTime) btn.classList.add("is-selected");
    btn.addEventListener("click", () => {
      selectedTime = slot;
      renderTimeSlots();
      updateScheduleText();
    });
    E.timeGrid.appendChild(btn);
  });
}

function updateScheduleText() {
  const label = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }) + " at " + selectedTime;
  E.scheduleText.textContent = label;
}

function confirmSchedule() {
  const scheduled = new Date(selectedDate);
  const parsed = parseTime(selectedTime);
  scheduled.setHours(parsed.h, parsed.m, 0, 0);
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
  const row = {
    id: STATE.requestId,
    pickup: STATE.pickup,
    drop: STATE.drop,
    rideType: STATE.rideType,
    fare,
    status: "requested",
    passengerName: localStorage.getItem("wow_user_name") || "Passenger",
    passengerPhone: localStorage.getItem("wow_user_phone") || "+92 300 0000000",
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
}

function updateLiveRequestAfterAccept(fare) {
  const rows = loadJson(STORAGE.liveRequests, []);
  const idx = rows.findIndex((r) => r.id === STATE.requestId);
  if (idx < 0) return;
  const rideCode = STATE.activeRideCode || generateRideCode();
  rows[idx] = {
    ...rows[idx],
    fare,
    status: "accepted",
    driverName: STATE.selectedDriver.name,
    driverPhone: STATE.selectedDriver.phone,
    driverRating: STATE.selectedDriver.rating,
    driverTrips: STATE.selectedDriver.trips,
    driverEta: STATE.selectedDriver.etaMin + " min",
    rideCode,
    driverVehicleType: mapRideTypeToVehicle(STATE.rideType),
    acceptedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE.liveRequests, JSON.stringify(rows));
}

function persistRide(fare, meta = {}) {
  const rideCode = meta.rideCode || STATE.activeRideCode || generateRideCode();
  localStorage.setItem("wow_ride_pickup", STATE.pickup);
  localStorage.setItem("wow_ride_drop", STATE.drop);
  localStorage.setItem("wow_ride_fare", String(fare));
  localStorage.setItem("wow_ride_vehicle", STATE.rideType);
  localStorage.setItem("wow_ride_vehicle_model", RIDE_TYPES[STATE.rideType].model);
  localStorage.setItem("wow_ride_vehicle_color", RIDE_TYPES[STATE.rideType].color);
  localStorage.setItem("wow_ride_driver_name", STATE.selectedDriver.name);
  localStorage.setItem("wow_ride_driver_phone", STATE.selectedDriver.phone);
  localStorage.setItem("wow_ride_passenger", localStorage.getItem("wow_user_name") || "Passenger");
  localStorage.setItem("wow_ride_passenger_phone", localStorage.getItem("wow_user_phone") || "+92 300 0000000");
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

function generateRideCode() {
  return "WOW-" + String(Date.now()).slice(-6);
}

async function createRideRecord(finalFare, rideCode) {
  const payload = {
    ride_code: rideCode,
    pickup: STATE.pickup,
    drop: STATE.drop,
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
    offered_fare: Number(E.offerInput ? E.offerInput.value || finalFare : finalFare),
    status: "requested",
    email: localStorage.getItem("wow_user_email") || "",
    role: "passenger",
    user_id: Number(localStorage.getItem("wow_user_id") || 0)
  };

  try {
    const res = await fetch(RIDE_API.create, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      return {
        rideId: Number(data.ride_id || 0),
        rideCode: String(data.ride_code || rideCode),
        fare: Number(data.fare || finalFare)
      };
    }
  } catch {
    // Keep flow non-blocking if DB write fails.
  }
  return { rideId: 0, rideCode, fare: Number(finalFare || 0) };
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

function maybeDrawRoute() {
  if (!window.google || !STATE.map || !STATE.directionsService || !STATE.directionsRenderer) return;
  if (!STATE.pickup || !STATE.drop) return;

  const origin = STATE.pickupPlace
    ? { lat: STATE.pickupPlace.lat, lng: STATE.pickupPlace.lng }
    : STATE.pickup;
  const destination = STATE.dropPlace
    ? { lat: STATE.dropPlace.lat, lng: STATE.dropPlace.lng }
    : STATE.drop;

  STATE.directionsService.route(
    {
      origin,
      destination,
      travelMode: "DRIVING"
    },
    (result, status) => {
      if (status === "OK") {
        STATE.directionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        setRouteMarkers("main", leg.start_location, leg.end_location);
        if (leg && leg.distance && leg.duration) {
          STATE.routeDistanceKm = Number((leg.distance.value / 1000).toFixed(3));
          STATE.routeDurationMin = Number((leg.duration.value / 60).toFixed(2));
          queueFareEstimate(120);
        }
      }
    }
  );
}

function drawConfirmRoute() {
  if (!window.google || !E.confirmMap) return;
  if (!STATE.confirmMap) {
    STATE.confirmMap = new google.maps.Map(E.confirmMap, {
      center: { lat: 24.8607, lng: 67.0011 },
      zoom: 12,
      disableDefaultUI: true
    });
    STATE.confirmDirectionsService = new google.maps.DirectionsService();
    STATE.confirmDirectionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#1a73e8", strokeWeight: 5, strokeOpacity: 0.9 }
    });
    STATE.confirmDirectionsRenderer.setMap(STATE.confirmMap);
  }

  const origin = STATE.pickupPlace
    ? { lat: STATE.pickupPlace.lat, lng: STATE.pickupPlace.lng }
    : STATE.pickup;
  const destination = STATE.dropPlace
    ? { lat: STATE.dropPlace.lat, lng: STATE.dropPlace.lng }
    : STATE.drop;

  STATE.confirmDirectionsService.route(
    {
      origin,
      destination,
      travelMode: "DRIVING"
    },
    (result, status) => {
      if (status === "OK") {
        STATE.confirmDirectionsRenderer.setDirections(result);
        const leg = result.routes[0].legs[0];
        setRouteMarkers("confirm", leg.start_location, leg.end_location);
      } else {
        const start = resolvePoint(STATE.pickup);
        const end = resolvePoint(STATE.drop);
        setRouteMarkers("confirm", start, end);
        STATE.confirmMap.setCenter(start);
      }
    }
  );
}

function initMap() {
  if (!E.map) {
    E.map = document.getElementById("map");
    E.pickup = E.pickup || document.getElementById("pickup");
    E.drop = E.drop || document.getElementById("drop");
  }
  if (!window.google || !E.map) return;
  STATE.map = new google.maps.Map(E.map, {
    center: { lat: 24.8607, lng: 67.0011 },
    zoom: 12,
    disableDefaultUI: true
  });
  STATE.directionsService = new google.maps.DirectionsService();
  STATE.directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: { strokeColor: "#1a73e8", strokeWeight: 5 }
  });
  STATE.directionsRenderer.setMap(STATE.map);
  initPlacesAutocomplete();
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

function initPlacesAutocomplete() {
  if (!window.google || !google.maps || !google.maps.places) return;
  if (STATE.pickupAutocomplete || STATE.dropAutocomplete) return;
  if (!E.pickup || !E.drop) return;

  const options = {
    fields: ["formatted_address", "name", "geometry"],
    componentRestrictions: { country: "pk" }
  };

  STATE.pickupAutocomplete = new google.maps.places.Autocomplete(E.pickup, options);
  STATE.dropAutocomplete = new google.maps.places.Autocomplete(E.drop, options);

  STATE.pickupAutocomplete.addListener("place_changed", () => {
    applySelectedPlace(STATE.pickupAutocomplete, "pickup");
  });
  STATE.dropAutocomplete.addListener("place_changed", () => {
    applySelectedPlace(STATE.dropAutocomplete, "drop");
  });
}

function applySelectedPlace(autocomplete, target) {
  const place = autocomplete.getPlace();
  const text = (place && (place.formatted_address || place.name)) || "";
  if (!text) return;
  const loc = place && place.geometry && place.geometry.location
    ? { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }
    : null;
  if (target === "pickup") {
    E.pickup.value = text;
    STATE.pickup = text;
    STATE.pickupPlace = loc;
  } else {
    E.drop.value = text;
    STATE.drop = text;
    STATE.dropPlace = loc;
  }
  updateInputSummary();
  updateBookButton();
  maybeDrawRoute();
  queueFareEstimate(120);
}

function setRouteMarkers(scope, start, end) {
  if (!window.google) return;
  const isMain = scope === "main";
  const map = isMain ? STATE.map : STATE.confirmMap;
  if (!map) return;

  const pickupKey = isMain ? "mapPickupMarker" : "confirmPickupMarker";
  const dropKey = isMain ? "mapDropMarker" : "confirmDropMarker";
  if (STATE[pickupKey]) STATE[pickupKey].setMap(null);
  if (STATE[dropKey]) STATE[dropKey].setMap(null);

  STATE[pickupKey] = new google.maps.Marker({
    position: start,
    map,
    label: { text: "P", color: "#fff", fontSize: "10px", fontWeight: "700" },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: "#25c38b",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2
    }
  });
  STATE[dropKey] = new google.maps.Marker({
    position: end,
    map,
    label: { text: "D", color: "#fff", fontSize: "10px", fontWeight: "700" },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: "#ff4d4d",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2
    }
  });
}

function updateRideCardLabels() {
  E.rideCards.forEach((card) => {
    const action = card.querySelector("span");
    if (!action) return;
    action.textContent = "";
  });
}

function rideActionLabel(rideType) {
  if (rideType === "WOW Bike") return "Book Bike";
  if (rideType === "WOW Scooty") return "Book Scooty";
  return "Book Car";
}

function isCarpoolAllowed() {
  return STATE.rideType === "WOW Car";
}

window.initMap = initMap;
window.selectRide = selectRide;
