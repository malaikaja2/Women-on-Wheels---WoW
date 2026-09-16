(async function () {
  "use strict";

  const rideId = new URLSearchParams(location.search).get("rideId") || localStorage.getItem("wow_carpool_ride_id") || "";
  const summary = document.getElementById("cpSummary");
  const mine = document.getElementById("cpMine");
  const stops = document.getElementById("cpStops");
  const driver = document.getElementById("cpDriver");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  let unsubscribeRide = null;
  let fallbackTimer = null;
  let lastFallbackRefresh = 0;
  const FALLBACK_REFRESH_MS = 30000;

  if (!rideId) {
    showError("Carpool ride ID is missing.");
    return;
  }
  if (!window.WowFirestore) {
    showError("Firebase session is unavailable.");
    return;
  }

  const { db, auth } = await WowFirestore.ready();

  function currentUid() {
    return String(auth.currentUser?.uid || "").trim();
  }

  function isCarpoolRide(ride) {
    return ride?.isCarpool === true || String(ride?.rideType || "").toLowerCase() === "carpool";
  }

  function arrayStrings(value) {
    return Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean) : [];
  }

  function carpoolMemberIds(ride) {
    const carpool = ride && typeof ride.carpool === "object" ? ride.carpool : {};
    return new Set([
      String(ride.creatorId || ""),
      String(ride.passengerId || ""),
      String(ride.passengerUid || ""),
      String(ride.assignedDriverId || ""),
      ...arrayStrings(ride.passengerIds),
      ...arrayStrings(ride.passengerUids),
      ...arrayStrings(carpool.passengerUids),
      ...arrayStrings(carpool.matchedPassengerIds),
      ...((Array.isArray(ride.passengers) ? ride.passengers : []).map(person => String(person?.userId || "").trim()).filter(Boolean))
    ].filter(Boolean));
  }

  function canViewRide(ride) {
    const uid = currentUid();
    return uid !== "" && carpoolMemberIds(ride).has(uid);
  }

  async function authHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error("Please sign in again.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    };
  }

  async function loadDetails() {
    const response = await fetch("php/carpool_marketplace.php", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: await authHeaders(),
      body: JSON.stringify({ action: "detail", ride_id: rideId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Carpool details are unavailable.");
    render(data.ride || {});
  }

  function money(value) {
    return "Rs. " + Number(value || 0).toLocaleString("en-PK");
  }

  function statusLabel(value) {
    return String(value || "searching").replaceAll("_", " ");
  }

  function render(ride) {
    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
    const availableSeats = Number(ride.availableSeats || ride.carpool?.availableSeats || 0);
    const status = statusLabel(ride.status);
    summary.textContent = `${passengers.length || 1} passenger(s) - ${availableSeats} seat(s) left - ${status}`;

    mine.innerHTML = `
      <h2>Live carpool</h2>
      <div class="wow-carpool-route cp-route">
        <div class="wow-carpool-place">
          <span>Pickup</span>
          <strong>${esc(ride.pickup || ride.pickupAddress || "Pickup")}</strong>
        </div>
        <span class="wow-carpool-arrow">-&gt;</span>
        <div class="wow-carpool-place">
          <span>Drop-off</span>
          <strong>${esc(ride.dropoff || ride.dropoffAddress || ride.destinationAddress || "Destination")}</strong>
        </div>
      </div>
      <div class="wow-carpool-meta cp-meta">
        <span class="wow-carpool-badge">${esc(money(ride.sharedFare || ride.fare || 0))} share</span>
        <span class="wow-carpool-badge">${esc(status)}</span>
        ${Number(ride.savings || 0) > 0 ? `<span class="wow-carpool-badge saving">Save ${esc(money(ride.savings))}</span>` : ""}
      </div>`;

    driver.textContent = ride.assignedDriverId
      ? `${ride.driverName || "Assigned driver"} - ${ride.driverVehicleNumber || ride.vehicleNumber || "Vehicle details pending"}`
      : "Waiting for a verified driver...";

    stops.innerHTML = passengers.length
      ? passengers.map((person, index) => {
          const picked = String(person.pickupStatus || "waiting").replaceAll("_", " ");
          return `
            <article class="cp-stop">
              <span>${index + 1}</span>
              <div>
                <strong>${esc(person.name || "Passenger")}</strong>
                <p>${esc(person.pickup || ride.pickup || ride.pickupAddress || "")} - ${esc(person.destination || ride.dropoff || ride.dropoffAddress || "")}</p>
                <small>${esc(picked)}</small>
              </div>
            </article>`;
        }).join("")
      : '<div class="wow-carpool-state">Passenger details will appear here.</div>';
  }

  function showError(message) {
    if (summary) summary.textContent = message;
    if (mine) mine.innerHTML = `<div class="wow-carpool-state error">${esc(message)}</div>`;
    if (stops) stops.innerHTML = "";
    if (driver) driver.textContent = "";
  }

  async function refreshViaApi(force = false) {
    const now = Date.now();
    if (!force && now - lastFallbackRefresh < FALLBACK_REFRESH_MS) return;
    lastFallbackRefresh = now;
    try {
      await loadDetails();
    } catch (error) {
      showError(error.message || "Carpool unavailable.");
    }
  }

  function startFallbackPolling() {
    if (fallbackTimer) return;
    refreshViaApi(true);
    fallbackTimer = window.setInterval(() => {
      if (!document.hidden) refreshViaApi();
    }, FALLBACK_REFRESH_MS);
  }

  function cleanup() {
    if (unsubscribeRide) {
      try { unsubscribeRide(); } catch {}
      unsubscribeRide = null;
    }
    if (fallbackTimer) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function listenToRide() {
    unsubscribeRide = db.collection("rides").doc(String(rideId)).onSnapshot((snapshot) => {
      if (!snapshot.exists) {
        showError("Carpool ride is unavailable.");
        return;
      }
      const ride = { id: snapshot.id, ...(snapshot.data() || {}) };
      if (!isCarpoolRide(ride)) {
        showError("This ride is not a carpool.");
        cleanup();
        return;
      }
      if (!canViewRide(ride)) {
        showError("You are not part of this carpool.");
        cleanup();
        return;
      }
      render(ride);
    }, (error) => {
      console.warn("[WOW Carpool] Firestore listener unavailable; using slow fallback.", error?.code || error?.message || error);
      if (unsubscribeRide) {
        try { unsubscribeRide(); } catch {}
        unsubscribeRide = null;
      }
      startFallbackPolling();
    });
  }

  listenToRide();
  window.addEventListener("pagehide", cleanup, { once: true });
  window.addEventListener("beforeunload", cleanup, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && fallbackTimer) refreshViaApi();
  });
})().catch(error => {
  const summary = document.getElementById("cpSummary");
  if (summary) summary.textContent = error.message || "Carpool unavailable.";
});
