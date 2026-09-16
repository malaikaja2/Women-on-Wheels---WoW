(async function () {
  "use strict";

  const rideId = new URLSearchParams(location.search).get("rideId") || localStorage.getItem("wow_ride_db_id") || "";
  if (!rideId || !window.WowFirestore) return;

  const { db, auth, firebase } = await WowFirestore.ready();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const mount = document.querySelector(".ride-shell");
  if (!mount) return;

  let card = null;
  let unsubscribeRide = null;
  const PICKUP_ACTION_STATUSES = new Set(["driver_assigned", "accepted", "driver_arriving", "arriving", "arrived", "started", "ride_started"]);
  const STARTED_STATUSES = new Set(["started", "ride_started", "ongoing", "in_progress", "on_trip", "active"]);

  function isCarpoolRide(ride) {
    return ride?.isCarpool === true || String(ride?.rideType || "").toLowerCase() === "carpool";
  }

  function ensureCard() {
    if (card) return card;
    card = document.createElement("section");
    card.className = "trip-card";
    card.innerHTML = '<h2 style="margin:0 0 8px">Carpool passengers</h2><p id="cpSummary">Loading passengers...</p><div id="cpPassengers"></div>';
    mount.insertBefore(card, document.querySelector(".action-row"));
    return card;
  }

  function cleanup() {
    if (unsubscribeRide) {
      try { unsubscribeRide(); } catch {}
      unsubscribeRide = null;
    }
  }

  function removeCardAndStop() {
    cleanup();
    if (card) {
      card.remove();
      card = null;
    }
  }

  async function markPickedUp(passengerId, button) {
    button.disabled = true;
    try {
      await db.runTransaction(async tx => {
        const ref = db.collection("rides").doc(rideId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new Error("This carpool is no longer available.");
        const ride = snapshot.data() || {};
        const status = String(ride.status || "").toLowerCase();
        if (String(ride.assignedDriverId || "") !== String(auth.currentUser?.uid || "") || !isCarpoolRide(ride)) {
          throw new Error("This carpool is no longer assigned to you.");
        }
        if (!PICKUP_ACTION_STATUSES.has(status)) throw new Error("Passenger pickup is not available at this stage.");
        let found = false;
        const passengers = (Array.isArray(ride.passengers) ? ride.passengers : []).map(person => {
          if (String(person.userId || "") !== String(passengerId || "")) return person;
          found = true;
          return { ...person, pickupStatus: "picked_up" };
        });
        if (!found) throw new Error("Passenger no longer exists on this ride.");
        const allPickedUp = passengers.length > 0 && passengers.every(person => person.pickupStatus === "picked_up");
        const updates = { passengers, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (allPickedUp && !STARTED_STATUSES.has(status)) updates.status = "arrived";
        tx.update(ref, updates);
      });
    } catch (error) {
      alert(error.message || "Unable to update passenger pickup.");
      button.disabled = false;
    }
  }

  unsubscribeRide = db.collection("rides").doc(rideId).onSnapshot(snapshot => {
    if (!snapshot.exists) {
      removeCardAndStop();
      return;
    }
    const ride = snapshot.data() || {};
    if (!isCarpoolRide(ride)) {
      removeCardAndStop();
      return;
    }

    const panel = ensureCard();
    const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
    const status = String(ride.status || "available").toLowerCase();
    const summary = panel.querySelector("#cpSummary");
    const rows = panel.querySelector("#cpPassengers");
    if (summary) {
      summary.textContent = `${passengers.length} passenger(s) - ${Number(ride.availableSeats || 0)} seat(s) left - ${status.replaceAll("_", " ")}`;
    }
    if (!rows) return;
    rows.innerHTML = passengers.map(person => {
      const picked = person.pickupStatus === "picked_up";
      const canMark = !picked && PICKUP_ACTION_STATUSES.has(status);
      return `<article style="padding:12px 0;border-top:1px solid #eadff0"><strong>${esc(person.name || "Passenger")}</strong><p>${esc(person.pickup || ride.pickupAddress || "")} -> ${esc(person.destination || ride.dropoffAddress || "")}</p><small>${picked ? "Picked up" : "Waiting for pickup"}</small>${canMark ? `<div style="margin-top:8px"><button class="outline-btn" data-passenger="${esc(person.userId)}">Mark picked up</button></div>` : ""}</article>`;
    }).join("") || "<p>No passenger details available.</p>";
    rows.querySelectorAll("[data-passenger]").forEach(button => {
      button.onclick = () => markPickedUp(button.dataset.passenger, button);
    });
  }, (error) => {
    console.warn("[WOW Carpool] driver live panel listener failed", error?.code || error?.message || error);
    removeCardAndStop();
  });

  window.addEventListener("pagehide", cleanup, { once: true });
  window.addEventListener("beforeunload", cleanup, { once: true });
})().catch(error => console.warn("[WOW Carpool] live driver panel failed", error));
