(async function () {
  "use strict";

  if (!window.WowFirestore || document.getElementById("wowCarpoolMarketplace")) return;

  const API_URL = "php/carpool_marketplace.php";
  const { auth } = await WowFirestore.ready();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const host = document.createElement("section");
  host.id = "wowCarpoolMarketplace";
  host.className = "trip-card wow-carpool-panel";
  host.hidden = true;
  host.innerHTML = `
    <div class="wow-carpool-panel-head">
      <div>
        <h2>Available carpool rides</h2>
        <p>Join a verified women-only shared ride going your way.</p>
      </div>
      <button class="wow-carpool-refresh" type="button" aria-label="Refresh carpool rides" title="Refresh">Refresh</button>
    </div>
    <div class="wow-carpool-list" id="wowCarpoolRows">
      <div class="wow-carpool-state">Loading rides...</div>
    </div>`;

  (document.querySelector(".dashboard-main") || document.querySelector("main") || document.body).appendChild(host);

  const tabs = document.createElement("div");
  tabs.className = "wow-carpool-tabs";
  tabs.innerHTML = `
    <button class="wow-carpool-tab is-active" type="button" data-tab="book">Book Ride</button>
    <button class="wow-carpool-tab" type="button" data-tab="list">Carpool Rides</button>`;

  const booking = document.getElementById("carpoolCard");
  if (booking?.parentNode) booking.parentNode.insertBefore(tabs, booking);
  else host.parentNode.insertBefore(tabs, host);

  const rows = host.querySelector("#wowCarpoolRows");
  const refreshButton = host.querySelector(".wow-carpool-refresh");

  function setRows(message, isError = false) {
    rows.innerHTML = `<div class="wow-carpool-state${isError ? " error" : ""}">${esc(message)}</div>`;
  }

  function paintTabs(showList) {
    tabs.querySelectorAll("[data-tab]").forEach(button => {
      const selected = (button.dataset.tab === "list") === showList;
      button.classList.toggle("is-active", selected);
    });
  }

  async function authHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error("Please sign in again.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    };
  }

  async function carpoolApi(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: await authHeaders(),
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Carpool service is unavailable.");
    return data;
  }

  function formatDate(value) {
    if (!value) return "Instant ride";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Instant ride";
    return date.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  }

  function renderRide(ride) {
    const seats = Number(ride.availableSeats || 0);
    const fare = Number(ride.sharedFare || ride.fare || 0);
    const savings = Number(ride.savings || ride.estimatedSavings || 0);
    return `
      <article class="wow-carpool-row">
        <div class="wow-carpool-route">
          <div class="wow-carpool-place">
            <span>Pickup</span>
            <strong>${esc(ride.pickup || "Pickup")}</strong>
          </div>
          <span class="wow-carpool-arrow">-&gt;</span>
          <div class="wow-carpool-place">
            <span>Drop-off</span>
            <strong>${esc(ride.dropoff || "Destination")}</strong>
          </div>
        </div>
        <div class="wow-carpool-meta">
          <span class="wow-carpool-badge">Rs. ${esc(fare.toLocaleString("en-PK"))} share</span>
          <span class="wow-carpool-badge">${esc(seats)} seat(s) left</span>
          <span class="wow-carpool-badge">${esc(formatDate(ride.scheduledAt))}</span>
          ${savings > 0 ? `<span class="wow-carpool-badge saving">Save Rs. ${esc(savings.toLocaleString("en-PK"))}</span>` : ""}
        </div>
        <div class="wow-carpool-actions">
          <button class="wow-carpool-join" type="button" data-join="${esc(ride.id || ride.rideId)}">Join Ride</button>
        </div>
      </article>`;
  }

  async function loadRides() {
    refreshButton.disabled = true;
    setRows("Loading rides...");
    try {
      const data = await carpoolApi("list");
      const rides = Array.isArray(data.rides) ? data.rides : [];
      rows.innerHTML = rides.length
        ? rides.map(renderRide).join("")
        : '<div class="wow-carpool-state">No available carpool rides right now.</div>';
      rows.querySelectorAll("[data-join]").forEach(button => {
        button.addEventListener("click", () => joinRide(button.dataset.join, button));
      });
    } catch (error) {
      setRows(error.message || "Carpool rides are unavailable right now.", true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function joinRide(rideId, button) {
    if (!rideId || button.disabled) return;
    button.disabled = true;
    button.textContent = "Joining...";
    try {
      const data = await carpoolApi("join", { ride_id: rideId, seats_required: 1 });
      const joinedRideId = data.ride?.id || rideId;
      localStorage.setItem("wow_carpool_ride_id", joinedRideId);
      button.textContent = "Joined";
      window.location.assign(`passenger-carpool.html?rideId=${encodeURIComponent(joinedRideId)}`);
    } catch (error) {
      alert(error.message || "Unable to join this carpool.");
      button.disabled = false;
      button.textContent = "Join Ride";
    }
  }

  tabs.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const showList = button.dataset.tab === "list";
      host.hidden = !showList;
      paintTabs(showList);
      if (showList) loadRides();
      (showList ? host : booking || tabs).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  refreshButton.addEventListener("click", loadRides);
})().catch(error => console.warn("[WOW Carpool] marketplace failed", error));
