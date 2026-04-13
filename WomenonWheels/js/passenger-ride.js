let rideMap;
let rideDirectionsService;
let rideDirectionsRenderer;
let rideBounds;
let ridePath = [];
let rideStep = 0;
let rideMarker;
let rideTotalDistance = 0;
let rideTotalDuration = 0;
let rideTicker;
let callInterval;
let callSeconds = 0;
let replyTimeout;
let emergencyContactsCache = [];

const defaultPickup = "Gulshan Block 13, Karachi";
const defaultDrop = "DHA Phase 6, Karachi";

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

const RIDE_API = {
  details: "php/get_ride.php"
};

function readSavedLatLng(prefix) {
  const lat = Number(localStorage.getItem(`wow_ride_${prefix}_lat`));
  const lng = Number(localStorage.getItem(`wow_ride_${prefix}_lng`));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function routeEndpoints() {
  const pickupText = document.getElementById("passengerPickupText").textContent || defaultPickup;
  const dropText = document.getElementById("passengerDropText").textContent || defaultDrop;
  return {
    origin: readSavedLatLng("pickup") || pickupText,
    destination: readSavedLatLng("drop") || dropText
  };
}

function initPassengerRideMap() {
  const mapEl = document.getElementById("passengerRideMap");
  if (!mapEl || !window.google) return;

  rideMap = new google.maps.Map(mapEl, {
    zoom: 13,
    center: { lat: 24.8607, lng: 67.0011 },
    disableDefaultUI: true,
    gestureHandling: "greedy"
  });

  rideDirectionsService = new google.maps.DirectionsService();
  rideDirectionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#1a73e8",
      strokeWeight: 5
    }
  });
  rideDirectionsRenderer.setMap(rideMap);

  setRideDetails();
  calculateRideRoute();
}

document.addEventListener("DOMContentLoaded", () => {
  setPassengerName();
  setRideDetails();
  refreshRideDetailsFromDb();
  seedChat();
  bindPassengerActions();
});

function setPassengerName() {
  const storedName = localStorage.getItem("wow_user_name") || "";
  const storedEmail = localStorage.getItem("wow_user_email") || "";
  const name = storedName || storedEmail.split("@")[0] || "Passenger";
  const nameEl = document.getElementById("passengerName");
  if (nameEl) nameEl.textContent = name;
}

function setRideDetails() {
  const pickup = localStorage.getItem("wow_ride_pickup") || defaultPickup;
  const drop = localStorage.getItem("wow_ride_drop") || defaultDrop;
  const fare = localStorage.getItem("wow_ride_fare") || "380";
  const wowCode = localStorage.getItem("wow_ride_code") || "WOW-000";
  const vehicle = localStorage.getItem("wow_ride_vehicle") || "WOW Car";
  const vehicleModel = localStorage.getItem("wow_ride_vehicle_model") || "Suzuki Alto";
  const vehicleColor = localStorage.getItem("wow_ride_vehicle_color") || "White";
  const storedDriver = localStorage.getItem("wow_ride_driver_name") || "";
  const driverName = storedDriver || "Driver";

  document.getElementById("passengerPickupText").textContent = pickup;
  document.getElementById("passengerDropText").textContent = drop;
  document.getElementById("passengerFareText").textContent = `Rs. ${fare}`;
  const wowCodeEl = document.getElementById("passengerWowCode");
  if (wowCodeEl) wowCodeEl.textContent = wowCode;
  document.getElementById("vehicleType").textContent = vehicle;
  document.getElementById("vehicleModel").textContent = `${vehicleModel} · ${vehicleColor}`;
  document.getElementById("driverName").textContent = driverName;
  document.getElementById("chatDriverName").textContent = driverName;
  document.getElementById("callDriverName").textContent = driverName;
  const chatAvatar = document.getElementById("chatAvatar");
  if (chatAvatar) {
    chatAvatar.textContent = driverName.trim().charAt(0).toUpperCase() || "D";
  }
  document.getElementById("driverPhoto").textContent = driverName.trim().charAt(0).toUpperCase() || "D";
  document.getElementById("callAvatar").textContent = driverName.trim().charAt(0).toUpperCase() || "D";
  const badge = document.getElementById("vehicleBadge");
  const badgeText = vehicle.replace("WOW ", "");
  if (badge) {
    badge.textContent = badgeText;
    badge.classList.remove("car", "bike", "scooty");
    const badgeKey = badgeText.toLowerCase();
    if (badgeKey.includes("bike")) badge.classList.add("bike");
    else if (badgeKey.includes("scooty")) badge.classList.add("scooty");
    else badge.classList.add("car");
  }
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
    const res = await fetch(`${RIDE_API.details}?${query.toString()}`);
    const data = await res.json();
    if (!res.ok || !data || !data.ok || !data.ride) return;
    const ride = data.ride;
    const fare = Number(ride.fare || 0);
    if (fare > 0) localStorage.setItem("wow_ride_fare", String(fare));
    if (ride.pickup) localStorage.setItem("wow_ride_pickup", String(ride.pickup));
    if (ride.dropoff) localStorage.setItem("wow_ride_drop", String(ride.dropoff));
    if (ride.ride_code) localStorage.setItem("wow_ride_code", String(ride.ride_code));
    if (ride.driver_name) localStorage.setItem("wow_ride_driver_name", String(ride.driver_name));
    if (ride.driver_phone) localStorage.setItem("wow_ride_driver_phone", String(ride.driver_phone));
    if (ride.vehicle_type) localStorage.setItem("wow_ride_vehicle", normalizeRideType(ride.vehicle_type));
    if (ride.status) localStorage.setItem("wow_ride_status", String(ride.status));
    setRideDetails();
  } catch {
    // Keep fallback local ride context if refresh fails.
  }
}

function normalizeRideType(type) {
  const text = String(type || "").toLowerCase();
  if (text.includes("bike")) return "WOW Bike";
  if (text.includes("scooty")) return "WOW Scooty";
  return "WOW Car";
}

function calculateRideRoute() {
  const endpoints = routeEndpoints();

  const request = {
    origin: endpoints.origin,
    destination: endpoints.destination,
    travelMode: "DRIVING"
  };

  rideDirectionsService.route(request, (result, status) => {
    if (status === "OK") {
      rideDirectionsRenderer.setDirections(result);
      const leg = result.routes[0].legs[0];
      rideTotalDistance = leg.distance.value;
      rideTotalDuration = leg.duration.value;
      ridePath = result.routes[0].overview_path || [];

      rideBounds = new google.maps.LatLngBounds();
      rideBounds.extend(leg.start_location);
      rideBounds.extend(leg.end_location);
      rideMap.fitBounds(rideBounds);

      createStaticMarkers(leg.start_location, leg.end_location);
      startRideTracking();
    } else {
      const pickup = readSavedLatLng("pickup") || { lat: 24.8607, lng: 67.0011 };
      const drop = readSavedLatLng("drop") || { lat: 24.8247, lng: 67.0356 };
      const line = new google.maps.Polyline({
        path: [pickup, drop],
        strokeColor: "#1a73e8",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: rideMap
      });
      ridePath = line.getPath().getArray();
      rideTotalDistance = 4000;
      rideTotalDuration = 600;
      createStaticMarkers(pickup, drop);
      rideMap.setCenter(pickup);
      startRideTracking();
    }
  });
}

function createStaticMarkers(pickup, drop) {
  new google.maps.Marker({
    position: pickup,
    map: rideMap,
    label: {
      text: "P",
      color: "#ffffff",
      fontSize: "9px",
      fontWeight: "700"
    },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: "#25c38b",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2
    }
  });

  new google.maps.Marker({
    position: drop,
    map: rideMap,
    label: {
      text: "D",
      color: "#ffffff",
      fontSize: "9px",
      fontWeight: "700"
    },
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

function startRideTracking() {
  if (!ridePath.length) return;
  if (rideMarker) rideMarker.setMap(null);

  const vehicleType = localStorage.getItem("wow_ride_vehicle") || "WOW Car";
  const vehicleIcon = vehicleType === "WOW Bike"
    ? "images/bike.png"
    : vehicleType === "WOW Scooty"
      ? "images/scooty.png"
      : "images/car.png";

  rideMarker = new google.maps.Marker({
    map: rideMap,
    position: ridePath[0],
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

  if (chatBtn) chatBtn.addEventListener("click", () => location.href = "chat.html");
  if (callBtn) callBtn.addEventListener("click", () => toggleCallPanel(true));
  if (helpBtn) helpBtn.addEventListener("click", () => location.href = "help.html");
  if (cancelBtn) cancelBtn.addEventListener("click", () => toggleCancelModal(true));
  if (keepRideBtn) keepRideBtn.addEventListener("click", () => toggleCancelModal(false));
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", () => {
      toggleCancelModal(false);
    });
  }

  if (sosBtn) sosBtn.addEventListener("click", () => toggleSosPanel(true));
  if (closeSosBtn) closeSosBtn.addEventListener("click", () => toggleSosPanel(false));
  if (activateSosBtn) activateSosBtn.addEventListener("click", activateSos);
  if (saveContactBtn) saveContactBtn.addEventListener("click", saveEmergencyContact);

  document.getElementById("cancelOverlay").addEventListener("click", () => toggleCancelModal(false));
  document.getElementById("sosOverlay").addEventListener("click", () => toggleSosPanel(false));
  document.getElementById("closeChat").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("chatOverlay").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("closeCall").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("callOverlay").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("endCallBtn").addEventListener("click", () => toggleCallPanel(false));

  document.getElementById("sendChat").addEventListener("click", sendChatMessage);
  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
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
    const headline = document.getElementById("sosHeadline");
    const subtext = document.getElementById("sosSubtext");
    const button = document.getElementById("activateSosBtn");
    headline.textContent = "Emergency SOS";
    subtext.textContent = "Press the SOS button to alert authorities and emergency contacts.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    button.dataset.pending = "0";
    loadEmergencyContacts();
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
  } else {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }
}

async function activateSos() {
  const button = document.getElementById("activateSosBtn");
  const headline = document.getElementById("sosHeadline");
  const subtext = document.getElementById("sosSubtext");
  if (button.dataset.pending === "1") return;
  if (!hasActiveRideContext()) {
    headline.textContent = "SOS unavailable";
    subtext.textContent = "SOS is available during active ride only.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    return;
  }
  if (!emergencyContactsCache.length) {
    headline.textContent = "Add emergency contact first";
    subtext.textContent = "Passenger SOS sends alerts to your saved emergency contacts only.";
    return;
  }
  button.dataset.pending = "1";
  headline.textContent = "Sending alert...";
  subtext.textContent = "Sending to your emergency contacts...";
  const locationText = await currentLocationText();
  const payload = {
    ...currentUserPayload(),
    ride_id: localStorage.getItem("wow_ride_code") || "",
    location: locationText,
    pickup: localStorage.getItem("wow_ride_pickup") || "",
    drop: localStorage.getItem("wow_ride_drop") || ""
  };

  let notifiedCount = emergencyContactsCache.length;
  let sentOk = false;
  try {
    const res = await fetch(SOS_API.sendSos, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error("send_failed");
    notifiedCount = Number(data.notified_count) || notifiedCount;
    sentOk = true;
  } catch {}

  if (!sentOk) {
    headline.textContent = "Unable to send SOS";
    subtext.textContent = "Please try again in a moment.";
    button.textContent = "Activate SOS";
    button.classList.add("blink");
    button.dataset.pending = "0";
    return;
  }

  headline.textContent = "Alert Sent Successfully";
  subtext.textContent = `Emergency alert shared with ${notifiedCount} contact${notifiedCount === 1 ? "" : "s"}.`;
  button.textContent = "Alert Sent Successfully";
  button.classList.remove("blink");
  button.dataset.pending = "0";
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

function currentLocationText() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(buildFallbackLocation());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        resolve(`Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`);
      },
      () => resolve(buildFallbackLocation()),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 20000 }
    );
  });
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
  return Boolean(rideId && pickup && drop);
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

function seedChat() {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody || chatBody.children.length) return;
  appendChatBubble("driver", "Hi! I'm on my way. Will reach in 4 minutes.");
  appendChatBubble("passenger", "Perfect, I'll be waiting at the gate.");
  appendChatBubble("driver", "Great! I'm in a white Suzuki Alto.");
}

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  appendChatBubble("passenger", text);
  input.value = "";
  queueAutoReply();
}

function appendChatBubble(type, text) {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  const row = document.createElement("div");
  row.className = `chat-row ${type}`;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "chat-time";
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.appendChild(bubble);
  row.appendChild(time);
  chatBody.appendChild(row);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  requestAnimationFrame(() => {
    chatBody.scrollTop = chatBody.scrollHeight;
  });
}

function showTypingIndicator() {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody || chatBody.querySelector(".typing-row")) return;
  const row = document.createElement("div");
  row.className = "chat-row driver typing-row";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble driver";
  bubble.innerHTML = `
    <span class="typing-indicator">
      <span></span><span></span><span></span>
    </span>
  `;
  row.appendChild(bubble);
  chatBody.appendChild(row);
  scrollChatToBottom();
}

function removeTypingIndicator() {
  const typingRow = document.querySelector(".typing-row");
  if (typingRow) typingRow.remove();
}

function queueAutoReply() {
  if (replyTimeout) clearTimeout(replyTimeout);
  showTypingIndicator();
  const delay = 700 + Math.random() * 900;
  replyTimeout = setTimeout(() => {
    removeTypingIndicator();
    const reply = driverReplies[Math.floor(Math.random() * driverReplies.length)];
    appendChatBubble("driver", reply);
  }, delay);
}
