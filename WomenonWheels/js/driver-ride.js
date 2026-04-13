let rideMap;
let rideMapFull;
let rideDirectionsService;
let rideDirectionsRenderer;
let rideBounds;
let callInterval;
let callSeconds = 0;
let ridePath = [];
let rideStep = 0;
let rideMarker;
let rideTotalDistance = 0;
let rideTotalDuration = 0;
let rideTicker;
let ridePickup;
let rideDrop;
let ridePhase = "toPickup";
let rideDriverAnchor;
let rideChatKey = "";
let rideChatMessages = [];

const SOS_API = {
  send: "php/send_sos.php"
};

const FARE_API = {
  saveData: "php/save_fare_data.php"
};

const RIDE_API = {
  updateStatus: "php/update_ride_status.php",
  details: "php/get_ride.php"
};

function initDriverRideMap() {
  const mapEl = document.getElementById("driverRideMap");
  if (!mapEl || !window.google) return;
  rideMap = buildRideMap(mapEl, false);
}

document.addEventListener("DOMContentLoaded", () => {
  syncRidePhaseFromStorage();
  syncDriverName();
  setDriverRideDetails();
  refreshDriverRideFromDb();
  setInterval(refreshDriverRideFromDb, 4000);
  prepareRideChat();
  seedDriverChat();
  bindDriverRideActions();
});

function buildRideMap(element, isFull) {
  ridePickup = localStorage.getItem("wow_ride_pickup") || "Gulshan Block 13, Karachi";
  rideDrop = localStorage.getItem("wow_ride_drop") || "DHA Phase 6, Karachi";
  const pickupPoint = readSavedLatLng("pickup") || pointFromText(ridePickup, { lat: 24.9207, lng: 67.0903 });
  const dropPoint = readSavedLatLng("drop") || pointFromText(rideDrop, { lat: 24.8146, lng: 67.0438 });
  if (!rideDriverAnchor) {
    rideDriverAnchor = readSavedLatLng("driver") || {
      lat: pickupPoint.lat + 0.012,
      lng: pickupPoint.lng - 0.01
    };
  }
  const origin = ridePhase === "toDrop" ? pickupPoint : rideDriverAnchor;
  const destination = ridePhase === "toDrop" ? dropPoint : pickupPoint;

  const map = new google.maps.Map(element, {
    zoom: 13,
    center: { lat: 24.8607, lng: 67.0011 },
    disableDefaultUI: true,
    gestureHandling: "greedy"
  });

  if (!rideDirectionsService) {
    rideDirectionsService = new google.maps.DirectionsService();
  }

  const renderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeColor: "#1a73e8",
      strokeWeight: 4
    }
  });

  renderer.setMap(map);
  if (!isFull) {
    rideDirectionsRenderer = renderer;
  }

  const request = {
    origin,
    destination,
    travelMode: "DRIVING"
  };

  rideDirectionsService.route(request, (result, status) => {
    if (status === "OK") {
      renderer.setDirections(result);
      const leg = result.routes[0].legs[0];
      createMarker(map, pickupPoint, "#25c38b", "P");
      createMarker(map, dropPoint, "#f06aa5", "D");
      rideTotalDistance = leg.distance.value;
      rideTotalDuration = leg.duration.value;
      ridePath = result.routes[0].overview_path || [];
      rideStep = 0;
      fitDriverBounds(map, origin, pickupPoint, dropPoint);
      if (!isFull) {
        startRideTracking(map);
      }
    } else {
      ridePath = [origin, destination];
      rideTotalDistance = 4000;
      rideTotalDuration = 600;
      createMarker(map, pickupPoint, "#25c38b", "P");
      createMarker(map, dropPoint, "#f06aa5", "D");
      new google.maps.Polyline({
        path: ridePath,
        strokeColor: "#1a73e8",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map
      });
      fitDriverBounds(map, origin, pickupPoint, dropPoint);
      if (!isFull) startRideTracking(map);
    }
  });

  return map;
}

function createMarker(map, position, color, label) {
  return new google.maps.Marker({
    position,
    map,
    zIndex: 3,
    label: {
      text: label,
      color: "#ffffff",
      fontSize: "9px",
      fontWeight: "700"
    },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2
    }
  });
}

function bindDriverRideActions() {
  const chatBtn = document.getElementById("driverRideChat");
  const callBtn = document.getElementById("driverRideCall");
  const helpBtn = document.getElementById("driverRideHelp");
  const cancelBtn = document.getElementById("driverCancelRide");
  const keepRideBtn = document.getElementById("keepRideBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const startRideBtn = document.getElementById("driverStartRide");
  const completeRideBtn = document.getElementById("driverCompleteRide");
  const closeStartBtn = document.getElementById("closeStartBtn");
  const viewMapBtn = document.getElementById("driverViewMap");
  const closeMapBtn = document.getElementById("closeMap");
  const sosBtn = document.getElementById("driverRideSosBtn");

  if (chatBtn) chatBtn.addEventListener("click", () => toggleChatPanel(true));
  if (helpBtn) helpBtn.addEventListener("click", () => location.href = "driver-help.html");
  if (callBtn) callBtn.addEventListener("click", () => toggleCallPanel(true));

  if (cancelBtn) cancelBtn.addEventListener("click", () => toggleCancelModal(true));
  if (keepRideBtn) keepRideBtn.addEventListener("click", () => toggleCancelModal(false));
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", () => {
      toggleCancelModal(false);
    });
  }

  if (startRideBtn) startRideBtn.addEventListener("click", markArrivedAtPickup);
  if (completeRideBtn) completeRideBtn.addEventListener("click", completeRide);
  if (closeStartBtn) closeStartBtn.addEventListener("click", () => toggleStartModal(false));

  if (viewMapBtn) viewMapBtn.addEventListener("click", openMapModal);
  if (closeMapBtn) closeMapBtn.addEventListener("click", closeMapModal);
  if (sosBtn) sosBtn.addEventListener("click", sendDriverSosAlert);

  document.getElementById("cancelOverlay").addEventListener("click", () => toggleCancelModal(false));
  document.getElementById("startOverlay").addEventListener("click", () => toggleStartModal(false));
  document.getElementById("mapOverlay").addEventListener("click", closeMapModal);
  document.getElementById("closeChat").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("chatOverlay").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("closeCall").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("callOverlay").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("endCallBtn").addEventListener("click", () => toggleCallPanel(false));

  document.getElementById("sendChat").addEventListener("click", sendChatMessage);
  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
  });
  document.querySelectorAll(".quick-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("chatInput");
      input.value = btn.textContent;
      sendChatMessage();
    });
  });
  const emojiBtn = document.getElementById("emojiBtn");
  if (emojiBtn) {
    emojiBtn.addEventListener("click", () => {
      const input = document.getElementById("chatInput");
      input.value = `${input.value} :)`.trim();
      input.focus();
    });
  }

  updateRideActionState();
}

function syncRidePhaseFromStorage() {
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  let started = status === "in_progress" || localStorage.getItem("wow_ride_started") === "1";
  if (!started) {
    started = isRideInProgressFromLiveRequests();
    if (started) {
      localStorage.setItem("wow_ride_started", "1");
    }
  }
  ridePhase = started ? "toDrop" : "toPickup";
}

function isRideInProgressFromLiveRequests() {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return false;
  try {
    const rows = JSON.parse(localStorage.getItem("wow_live_ride_requests") || "[]");
    if (!Array.isArray(rows)) return false;
    const row = rows.find((item) => String(item.rideCode || "") === String(rideCode));
    if (!row) return false;
    const status = String(row.status || "").toLowerCase();
    return status === "started" || status === "on_trip" || status === "in_progress";
  } catch {
    return false;
  }
}

function updateRideActionState() {
  const startRideBtn = document.getElementById("driverStartRide");
  const completeRideBtn = document.getElementById("driverCompleteRide");
  const status = String(localStorage.getItem("wow_ride_status") || "accepted").toLowerCase();
  const started = status === "in_progress";
  const canComplete = hasActiveRideContext();
  if (startRideBtn) {
    startRideBtn.disabled = started || status === "arrived";
    startRideBtn.textContent = started ? "Ride Started" : (status === "arrived" ? "Waiting Passenger Start" : "Mark Arrived");
  }
  if (completeRideBtn) {
    completeRideBtn.disabled = !canComplete || !started;
  }
  const statusEl = document.getElementById("driverRideStatus");
  if (statusEl) {
    if (started) statusEl.textContent = "Ride in progress";
    else if (status === "arrived") statusEl.textContent = "Arrived at pickup";
    else statusEl.textContent = "Heading to pickup";
  }
}

async function markArrivedAtPickup() {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const startRideBtn = document.getElementById("driverStartRide");
  if (startRideBtn) {
    startRideBtn.disabled = true;
    startRideBtn.textContent = "Updating...";
  }
  try {
    const res = await fetch(RIDE_API.updateStatus, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ride_code: rideCode,
        status: "arrived",
        user_id: Number(localStorage.getItem("wow_user_id") || 0),
        email: localStorage.getItem("wow_user_email") || "",
        role: "driver"
      })
    });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      localStorage.setItem("wow_ride_status", "arrived");
      toggleStartModal(true);
      updateRideActionState();
      setDriverRideDetails();
      return;
    }
  } catch {
    // Fallback keeps UI responsive.
  }
  localStorage.setItem("wow_ride_status", "arrived");
  updateRideActionState();
  setDriverRideDetails();
}

async function completeRide() {
  const completeRideBtn = document.getElementById("driverCompleteRide");
  if (!hasActiveRideContext()) {
    alert("No active ride found. Please accept and start a ride first.");
    updateRideActionState();
    return;
  }
  if (completeRideBtn) {
    completeRideBtn.disabled = true;
    completeRideBtn.textContent = "Completing...";
  }

  const rideCode = localStorage.getItem("wow_ride_code") || "";
  const fare = Number(localStorage.getItem("wow_ride_fare") || 0);
  const payload = {
    pickup: localStorage.getItem("wow_ride_pickup") || "",
    drop: localStorage.getItem("wow_ride_drop") || "",
    pickup_lat: localStorage.getItem("wow_ride_pickup_lat") || "",
    pickup_lng: localStorage.getItem("wow_ride_pickup_lng") || "",
    drop_lat: localStorage.getItem("wow_ride_drop_lat") || "",
    drop_lng: localStorage.getItem("wow_ride_drop_lng") || "",
    distance_km: Number(localStorage.getItem("wow_ride_distance_km") || 0),
    duration_min: Number(localStorage.getItem("wow_ride_duration_min") || 0),
    vehicle_type: localStorage.getItem("wow_ride_vehicle") || "WOW Car",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    fare,
    user_id: Number(localStorage.getItem("wow_user_id") || 0),
    email: localStorage.getItem("wow_user_email") || "",
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase()
  };

  try {
    await fetch(FARE_API.saveData, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    // Keep completion flow non-blocking if API fails temporarily.
  }

  try {
    await fetch(RIDE_API.updateStatus, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ride_code: rideCode,
        status: "completed"
      })
    });
  } catch {
    // Keep completion flow non-blocking if sync fails.
  }

  markLiveRequestCompleted(rideCode);
  localStorage.setItem("wow_ride_status", "completed");
  localStorage.removeItem("wow_ride_started");
  ridePhase = "toPickup";
  alert("Ride completed successfully.");
  location.href = "driver-dashboard.html";
}

function markLiveRequestCompleted(rideCode) {
  if (!rideCode) return;
  const key = "wow_live_ride_requests";
  try {
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) return;
    const idx = rows.findIndex((row) => String(row.rideCode || "") === String(rideCode));
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        status: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(rows));
    }
  } catch {
    // Ignore storage parse errors.
  }
}

async function sendDriverSosAlert() {
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  const rideId = localStorage.getItem("wow_ride_code") || "WOW-RIDE";
  if (!hasActiveRideContext()) {
    alert("SOS is available during active ride only.");
    return;
  }
  const location = await currentLocationText();
  const payload = {
    ...currentUserPayload(),
    role: "driver",
    ride_id: rideId,
    pickup,
    drop,
    location
  };
  try {
    await fetch(SOS_API.send, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert("Alert Sent Successfully");
  } catch {
    alert("Unable to send SOS right now.");
  }
}

function hasActiveRideContext() {
  const rideId = localStorage.getItem("wow_ride_code") || "";
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  return Boolean(rideId && pickup && drop);
}

function syncDriverName() {
  const storedName = localStorage.getItem("wow_user_name") || "";
  const storedEmail = localStorage.getItem("wow_user_email") || "";
  const name = storedName || storedEmail.split("@")[0] || "Driver";
  const driverNameEl = document.getElementById("driverRideName");
  if (driverNameEl) driverNameEl.textContent = name;
}

function setDriverRideDetails() {
  const pickup = localStorage.getItem("wow_ride_pickup") || "Gulshan Block 13, Karachi";
  const drop = localStorage.getItem("wow_ride_drop") || "DHA Phase 6, Karachi";
  const fare = localStorage.getItem("wow_ride_fare") || "380";
  const paymentMethod = localStorage.getItem("wow_ride_payment_label") || (localStorage.getItem("wow_ride_payment_method") === "cash" ? "Cash" : "Online");
  const passenger = localStorage.getItem("wow_ride_passenger") || "Passenger";
  const passengerPhone = localStorage.getItem("wow_ride_passenger_phone") || "+92 312 *** 56";
  const rideCode = localStorage.getItem("wow_ride_code") || "ABC-1234";
  const status = String(localStorage.getItem("wow_ride_status") || "accepted").toLowerCase();
  const avatar = passenger.trim().charAt(0).toUpperCase() || "P";

  const pickupEl = document.getElementById("driverPickupText");
  const dropEl = document.getElementById("driverDropText");
  const fareEl = document.getElementById("driverFareText");
  const paymentEl = document.getElementById("driverPaymentType");
  const wowCodeEl = document.getElementById("driverWowCode");
  const passengerEl = document.getElementById("driverPassengerName");
  const passengerPhoneEl = document.getElementById("driverPassengerPhone");
  const rideCodeEl = document.getElementById("driverRideCode");
  const avatarEl = document.getElementById("driverPassengerAvatar");
  const chatPassengerEl = document.getElementById("chatPassengerName");
  const chatRideCodeEl = document.getElementById("chatRideCodeLabel");
  const chatPickupEl = document.getElementById("chatPickupText");
  const chatDropEl = document.getElementById("chatDropText");
  const chatRideStatusEl = document.getElementById("chatRideStatus");
  const chatAvatarEl = document.getElementById("chatPassengerAvatar");

  if (pickupEl) pickupEl.textContent = pickup;
  if (dropEl) dropEl.textContent = drop;
  if (fareEl) fareEl.textContent = `Rs. ${fare}`;
  if (paymentEl) paymentEl.textContent = paymentMethod;
  if (wowCodeEl) wowCodeEl.textContent = rideCode;
  if (passengerEl) passengerEl.textContent = passenger;
  if (passengerPhoneEl) passengerPhoneEl.textContent = passengerPhone;
  if (rideCodeEl) rideCodeEl.textContent = rideCode;
  if (avatarEl) avatarEl.textContent = avatar;
  if (chatPassengerEl) chatPassengerEl.textContent = passenger;
  if (chatRideCodeEl) chatRideCodeEl.textContent = `Ride ${rideCode}`;
  if (chatPickupEl) chatPickupEl.textContent = pickup;
  if (chatDropEl) chatDropEl.textContent = drop;
  if (chatRideStatusEl) chatRideStatusEl.textContent = status.replace("_", " ");
  if (chatAvatarEl) chatAvatarEl.textContent = avatar;
}

async function refreshDriverRideFromDb() {
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  if (!rideCode) return;
  const query = new URLSearchParams({
    ride_code: rideCode,
    role: "driver",
    email: localStorage.getItem("wow_user_email") || "",
    user_id: localStorage.getItem("wow_user_id") || ""
  });
  try {
    const res = await fetch(`${RIDE_API.details}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !data.ride) return;
    const ride = data.ride;
    if (ride.pickup) localStorage.setItem("wow_ride_pickup", String(ride.pickup));
    if (ride.dropoff) localStorage.setItem("wow_ride_drop", String(ride.dropoff));
    if (ride.fare !== undefined) localStorage.setItem("wow_ride_fare", String(Number(ride.fare || 0)));
    if (ride.ride_code) localStorage.setItem("wow_ride_code", String(ride.ride_code));
    if (ride.status) localStorage.setItem("wow_ride_status", String(ride.status));
    if (String(ride.status || "").toLowerCase() === "in_progress") {
      ridePhase = "toDrop";
      localStorage.setItem("wow_ride_started", "1");
    }
    setDriverRideDetails();
    updateRideActionState();
  } catch {
    // Keep fallback local state when refresh fails.
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

function toggleStartModal(open) {
  const overlay = document.getElementById("startOverlay");
  const modal = document.getElementById("startModal");
  if (open) {
    overlay.classList.add("is-open");
    modal.classList.add("is-open");
  } else {
    overlay.classList.remove("is-open");
    modal.classList.remove("is-open");
  }
}

function openMapModal() {
  const overlay = document.getElementById("mapOverlay");
  const modal = document.getElementById("mapModal");
  overlay.classList.add("is-open");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");

  if (!rideMapFull) {
    const mapEl = document.getElementById("driverRideMapFull");
    if (mapEl && window.google) {
      rideMapFull = buildRideMap(mapEl, true);
    }
  } else if (window.google && rideBounds) {
    google.maps.event.trigger(rideMapFull, "resize");
    rideMapFull.fitBounds(rideBounds);
  }
}

function closeMapModal() {
  const overlay = document.getElementById("mapOverlay");
  const modal = document.getElementById("mapModal");
  overlay.classList.remove("is-open");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function toggleChatPanel(open) {
  const overlay = document.getElementById("chatOverlay");
  const panel = document.getElementById("chatPanel");
  if (open) {
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.getElementById("chatInput").focus();
  } else {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }
}

function toggleCallPanel(open) {
  const overlay = document.getElementById("callOverlay");
  const panel = document.getElementById("callPanel");
  if (open) {
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    startCallTimer();
  } else {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    stopCallTimer();
  }
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

function seedDriverChat() {
  if (!Array.isArray(rideChatMessages)) rideChatMessages = [];
  if (!rideChatMessages.length) {
    rideChatMessages = [
      makeChatMessage("passenger", "I'm at the pickup point."),
      makeChatMessage("driver", "On my way. See you in a few minutes.")
    ];
    saveRideChat();
  }
  renderRideChat();
}

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  appendChatBubble("driver", text);
  input.value = "";
  setTimeout(() => {
    appendChatBubble("passenger", "Okay, waiting here.");
  }, 700);
}

function appendChatBubble(type, text) {
  rideChatMessages.push(makeChatMessage(type, text));
  saveRideChat();
  renderRideChat();
}

function renderRideChat() {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  chatBody.innerHTML = "";
  rideChatMessages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = `chat-row ${msg.type}`;
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${msg.type}`;
    bubble.textContent = msg.text;
    const time = document.createElement("span");
    time.className = "chat-time";
    time.textContent = msg.time;
    row.appendChild(bubble);
    row.appendChild(time);
    chatBody.appendChild(row);
  });
  chatBody.scrollTop = chatBody.scrollHeight;
}

function makeChatMessage(type, text) {
  return {
    type,
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
}

function prepareRideChat() {
  const rideCode = localStorage.getItem("wow_ride_code") || "ABC-1234";
  rideChatKey = `wow_driver_chat_${rideCode}`;
  rideChatMessages = readRideChat();
}

function readRideChat() {
  try {
    const rows = JSON.parse(localStorage.getItem(rideChatKey) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveRideChat() {
  if (!rideChatKey) return;
  localStorage.setItem(rideChatKey, JSON.stringify(rideChatMessages));
}

function currentUserPayload() {
  return {
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase(),
    email: localStorage.getItem("wow_user_email") || ""
  };
}

function currentLocationText() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(`Pickup: ${localStorage.getItem("wow_ride_pickup") || "Unknown"} | Drop-off: ${localStorage.getItem("wow_ride_drop") || "Unknown"}`);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`Lat ${pos.coords.latitude.toFixed(6)}, Lng ${pos.coords.longitude.toFixed(6)}`),
      () => resolve(`Pickup: ${localStorage.getItem("wow_ride_pickup") || "Unknown"} | Drop-off: ${localStorage.getItem("wow_ride_drop") || "Unknown"}`),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 20000 }
    );
  });
}

function startRideTracking(mapInstance) {
  if (!ridePath.length) return;
  if (rideMarker) rideMarker.setMap(null);
  const vehicleType = localStorage.getItem("wow_ride_vehicle") || "WOW Car";
  const vehicleIcon = vehicleType === "WOW Bike"
    ? "images/bike.png"
    : vehicleType === "WOW Scooty"
      ? "images/scooty.png"
      : "images/car.png";
  rideMarker = new google.maps.Marker({
    map: mapInstance,
    position: ridePath[0],
    zIndex: 5,
    icon: {
      url: vehicleIcon,
      scaledSize: new google.maps.Size(28, 28)
    }
  });
  if (rideTicker) clearInterval(rideTicker);
  rideStep = 0;
  rideTicker = setInterval(() => {
    rideStep += 1;
    if (rideStep >= ridePath.length) {
      clearInterval(rideTicker);
      rideStep = ridePath.length - 1;
    }
    rideMarker.setPosition(ridePath[rideStep]);
    updateRideStats();
  }, 900);
  updateRideStats();
}

function updateRideStats() {
  if (!rideTotalDistance || !ridePath.length) return;
  const maxStep = Math.max(1, ridePath.length - 1);
  const progress = Math.min(1, rideStep / maxStep);
  const remainingDistance = Math.max(0, rideTotalDistance * (1 - progress));
  const remainingMinutes = Math.max(1, Math.round((rideTotalDuration * (1 - progress)) / 60));

  const distanceEl = document.getElementById("driverDistance");
  const etaEl = document.getElementById("driverEta");
  const progressEl = document.getElementById("driverProgress");

  if (distanceEl) distanceEl.textContent = `${(remainingDistance / 1000).toFixed(1)} km`;
  if (etaEl) etaEl.textContent = `${remainingMinutes} min`;
  if (progressEl) progressEl.style.width = `${Math.round(progress * 100)}%`;
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

function fitDriverBounds(map, origin, pickup, drop) {
  if (!map || !window.google) return;
  const bounds = new google.maps.LatLngBounds();
  [origin, pickup, drop].forEach((p) => bounds.extend(p));
  rideBounds = bounds;
  map.fitBounds(bounds, 48);
}

function refreshDriverRideMaps() {
  const compact = document.getElementById("driverRideMap");
  if (compact && window.google) {
    rideMap = buildRideMap(compact, false);
  }
  const full = document.getElementById("driverRideMapFull");
  if (rideMapFull && full && window.google) {
    rideMapFull = buildRideMap(full, true);
  }
}

function pointFromText(text, fallback) {
  const base = fallback || { lat: 24.8607, lng: 67.0011 };
  const chars = String(text || "").split("");
  if (!chars.length) return base;
  const hash = chars.reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return {
    lat: base.lat + (((hash % 11) - 5) * 0.004),
    lng: base.lng + ((((hash >> 2) % 11) - 5) * 0.004)
  };
}

window.completeRide = completeRide;
