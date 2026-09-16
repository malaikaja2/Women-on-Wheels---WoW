(function passengerHomeSections() {
  "use strict";
  if (!location.pathname.toLowerCase().endsWith("app-home.html")) return;

  const terminal = new Set(["completed", "cancelled", "canceled", "ride_completed", "payment_completed", "cancelled_by_passenger", "cancelled_by_driver", "expired", "timed_out", "failed", "archived", "no_driver_found", "rejected"]);
  const activeStatuses = new Set([
    "searching", "searching_driver", "request_pending", "pending", "driver_pending",
    "driver_responded", "offer_received", "counteroffer_received", "awaiting_passenger_response",
    "driver_selected", "driver_assigned", "assigned", "accepted", "driver_accepted",
    "driver_on_the_way", "driver_en_route", "driver_arriving", "arriving",
    "driver_reached_pickup", "driver_arrived", "arrived", "started", "ride_started",
    "ongoing", "in_progress", "on_trip", "active", "waiting_for_payment"
  ]);
  const completedPaymentStatuses = new Set([
    "paid", "payment_completed", "completed", "success", "successful",
    "confirmed", "cash_collected", "collected", "received"
  ]);
  const scheduled = new Set(["scheduled", "schedule_pending", "scheduled_confirmed"]);
  const normalizeStatus = input => String(input || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const value = (data, ...keys) => keys.map(key => data[key]).find(item => item != null && String(item).trim()) || "";
  const escapeHtml = input => String(input).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const safeText = input => {
    if (input == null || typeof input === "boolean") return "";
    if (typeof input === "object") {
      const nested = value(input, "formattedAddress", "address", "name", "label", "placeName");
      return nested && typeof nested !== "object" ? safeText(nested) : "";
    }
    const text = String(input).trim();
    return !text || text === "[object Object]" || /^(null|undefined)$/i.test(text) ? "" : text;
  };
  const locationText = (data, keys, fallback) => {
    for (const key of keys) {
      const text = safeText(data[key]);
      if (text && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)) return text;
    }
    return fallback;
  };
  const rideDate = data => {
    const source = data.scheduledAt || data.scheduledDateTime;
    if (source?.toDate) return source.toDate();
    if (source?.seconds) return new Date(source.seconds * 1000);
    if (source instanceof Date) return source;
    if (source) {
      const parsed = new Date(source);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (data.scheduledDate) {
      const time = safeText(data.scheduledTime || data.pickupTime) || "23:59";
      const parsed = new Date(`${data.scheduledDate}T${time}`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };
  const timestampMillis = input => {
    if (input?.toMillis) return input.toMillis();
    if (Number.isFinite(Number(input?.seconds))) return Number(input.seconds) * 1000;
    if (input instanceof Date) return input.getTime();
    const parsed = Date.parse(String(input || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const rideCreatedMillis = data => timestampMillis(
    data.createdAt || data.requestedAt || data.bookedAt || data.updatedAt
  );
  const rideUpdatedMillis = data => timestampMillis(data.updatedAt || data.createdAt);
  const staleSearchingStatuses = new Set(["searching", "searching_driver", "request_pending", "pending", "driver_pending"]);
  const isExpiredSearchingRide = data => {
    const status = normalizeStatus(data.status || data.rideStatus);
    if (!staleSearchingStatuses.has(status) || data.assignedDriverId || data.driverId || data.driverUid) return false;
    const requestStatus = normalizeStatus(data.requestStatus || "open");
    if (!["", "open", "pending", "searching"].includes(requestStatus)) return false;
    const created = rideCreatedMillis(data);
    const expires = timestampMillis(data.expiresAt || data.requestExpiresAt) || (created ? created + 10 * 60 * 1000 : 0);
    return expires > 0 && expires <= Date.now();
  };
  const isActiveRide = data => {
    const status = normalizeStatus(data.status || data.rideStatus);
    if (!activeStatuses.has(status) || terminal.has(status) || isExpiredSearchingRide(data)) return false;
    return !(status === "waiting_for_payment" &&
      completedPaymentStatuses.has(normalizeStatus(data.paymentStatus)));
  };
  const storedRideKeys = [
    "wow_ride_db_id", "wow_ride_code", "wow_ride_status", "wow_ride_started",
    "wow_ride_started_at", "wow_ride_status_message", "wow_ride_pickup",
    "wow_ride_pickup_address", "wow_ride_pickup_lat", "wow_ride_pickup_lng",
    "wow_ride_drop", "wow_ride_drop_address", "wow_ride_drop_lat",
    "wow_ride_drop_lng", "wow_ride_distance_km", "wow_ride_distance_source",
    "wow_ride_duration_min", "wow_ride_traffic_level", "wow_ride_time_of_day",
    "wow_ride_fare", "wow_ride_vehicle", "wow_ride_vehicle_model",
    "wow_ride_vehicle_color", "wow_ride_requested_vehicle", "wow_ride_driver_id",
    "wow_ride_driver_name", "wow_ride_driver_phone", "wow_ride_driver_photo",
    "wow_ride_driver_vehicle_name", "wow_ride_driver_vehicle_number",
    "wow_ride_driver_vehicle_type", "wow_ride_payment_method",
    "wow_ride_payment_label", "wow_ride_passenger", "wow_ride_passenger_phone"
  ];
  const clearStoredRide = () => storedRideKeys.forEach(key => localStorage.removeItem(key));
  const syncStoredActiveRide = ride => {
    const storedId = String(localStorage.getItem("wow_ride_db_id") || "");
    if (!ride) {
      clearStoredRide();
      return;
    }
    if (storedId && storedId !== ride.id) clearStoredRide();
    localStorage.setItem("wow_ride_db_id", ride.id);
    localStorage.setItem("wow_ride_status", normalizeStatus(ride.data.status || ride.data.rideStatus));
    if (ride.data.rideCode) localStorage.setItem("wow_ride_code", String(ride.data.rideCode));
  };
  const money = input => {
    if (typeof input === "boolean" || input == null || typeof input === "object") return "";
    const cleaned = String(input).replace(/(?:PKR|Rs\.?)/gi, "").replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return "";
    const amount = Number(cleaned);
    if (!Number.isFinite(amount) || amount < 0) return "";
    return `Rs. ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  };
  const finalScheduledFare = data => {
    for (const key of ["finalFare", "acceptedFare", "agreedFare", "totalFare", "fare", "estimatedFare"]) {
      const formatted = money(data[key]);
      if (formatted) return formatted;
    }
    return "Fare unavailable";
  };
  const vehicleType = data => {
    const raw = safeText(value(data, "vehicleType", "requestedVehicleType", "vehicleCategory", "vehicle"));
    const lower = raw.toLowerCase();
    if (lower.includes("scoot")) return "Scooty";
    if (lower.includes("bike") || lower.includes("motor")) return "Bike";
    if (lower.includes("car") || lower.includes("auto")) return "Car";
    return raw || "Vehicle unavailable";
  };
  const statusInfo = data => {
    const raw = String(data.status || data.rideStatus || "").trim().toLowerCase();
    if (["driver_arriving", "arriving", "driver_reached_pickup", "arrived"].includes(raw)) return ["Driver Arriving", "arriving"];
    if (["driver_on_the_way", "driver_en_route", "driver_accepted", "accepted"].includes(raw)) return ["Driver On The Way", "on-way"];
    if (data.assignedDriverId || data.driverId || data.driverUid) return ["Driver Assigned", "assigned"];
    return ["Scheduled", "scheduled"];
  };
  const canManage = data => String(data.status || "").toLowerCase() === "scheduled" && !(data.assignedDriverId || data.driverId || data.driverUid);

  function legacyRideCard(ride, kind) {
    const data = ride.data;
    const pickup = value(data, "pickupAddress", "pickupName") || "Pickup";
    const drop = value(data, "dropoffAddress", "destinationName") || "Drop-off";
    const status = String(data.status || "").replaceAll("_", " ");
    const id = encodeURIComponent(ride.id);
    const action = `<a class="home-section-action" href="passenger-ride.html?rideId=${id}">Open ride</a>`;
    return `<div class="home-data-row"><div><strong>${escapeHtml(pickup)} → ${escapeHtml(drop)}</strong>` +
      `<span>${escapeHtml(status || kind)}</span></div>${action}</div>`;
  }

  const activeStatusInfo = data => {
    const raw = String(data.status || data.rideStatus || "searching").trim().toLowerCase();
    if (raw === "waiting_for_payment") return ["Waiting for Payment", "in-progress"];
    if (["driver_arriving", "driver_on_the_way", "driver_en_route", "arriving"].includes(raw)) return ["Driver Arriving", "arriving"];
    if (["driver_arrived", "driver_reached_pickup", "arrived"].includes(raw)) return ["Driver Arrived", "arriving"];
    if (["accepted", "driver_accepted", "driver_assigned", "driver_selected", "assigned"].includes(raw)) return ["Driver Assigned", "assigned"];
    if (["started", "ride_started", "in_progress", "ongoing"].includes(raw)) return ["In Progress", "in-progress"];
    return ["Searching", "searching"];
  };

  const rideActionUrl = (rideId, panel = "overview") =>
    `passenger-ride.html?rideId=${encodeURIComponent(String(rideId || ""))}&panel=${encodeURIComponent(panel)}`;

  function rideCard(ride) {
    const data = ride.data;
    const pickup = locationText(data, ["pickupAddress", "pickupName", "pickupLocation", "pickup"], "Pickup unavailable");
    const drop = locationText(data, ["destinationAddress", "dropoffAddress", "destinationName", "dropoffLocation", "dropoff"], "Drop-off unavailable");
    const [statusLabel, statusClass] = activeStatusInfo(data);
    const driver = safeText(value(data, "driverName", "assignedDriverName")) || "Driver pending";
    const ratingValue = Number(value(data, "driverRating", "driverAvgRating", "assignedDriverRating"));
    const rating = Number.isFinite(ratingValue) && ratingValue > 0 ? `★ ${ratingValue.toFixed(1)}` : "Rating unavailable";
    const vehicleDetails = [safeText(value(data, "driverVehicleName", "vehicleModel", "vehicleName")), safeText(value(data, "vehicleNumber", "registrationNumber", "driverVehicleNumber"))].filter(Boolean).join(" · ") || vehicleType(data);
    const eta = safeText(value(data, "eta", "estimatedArrival", "driverEta", "estimatedTime")) || "Updating";
    const payment = safeText(value(data, "paymentLabel", "paymentMethod")) || "Payment unavailable";
    const rideUrl = rideActionUrl(ride.id);
    const activeStatus = String(data.status || data.rideStatus || "").toLowerCase();
    const sosAction = ["started", "ride_started", "in_progress", "ongoing"].includes(activeStatus) ? `<a href="${rideUrl}&sos=1">SOS</a>` : "";
    return `<article class="active-ride-card">
      <div class="active-ride-head"><strong>Ride ${escapeHtml(data.rideCode || ride.id)}</strong><span class="passenger-status ${statusClass}">${statusLabel}</span></div>
      <div class="active-driver"><span class="active-driver-avatar">${escapeHtml(driver.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(driver)}</strong><span>${escapeHtml(vehicleDetails)} · ${escapeHtml(rating)}</span></div></div>
      <div class="active-ride-route"><div><span>Pickup</span><strong>${escapeHtml(pickup)}</strong></div><div><span>Drop-off</span><strong>${escapeHtml(drop)}</strong></div></div>
      <div class="active-ride-meta"><div class="active-meta"><span>Arrival</span><strong>${escapeHtml(eta)}</strong></div><div class="active-meta"><span>Fare</span><strong>${escapeHtml(finalScheduledFare(data))}</strong></div><div class="active-meta"><span>Payment</span><strong>${escapeHtml(payment)}</strong></div><div class="active-meta"><span>Vehicle</span><strong>${escapeHtml(vehicleType(data))}</strong></div></div>
      <div class="active-ride-actions"><a class="primary" href="${rideActionUrl(ride.id, "overview")}">Open Ride</a><a href="${rideActionUrl(ride.id, "chat")}">Chat</a><a href="${rideActionUrl(ride.id, "call")}">In-App Call</a><a href="${rideActionUrl(ride.id, "tracking")}">Track Ride</a>${sosAction}</div>
    </article>`;
  }

  function scheduledRideCard(ride) {
    const data = ride.data;
    const when = rideDate(data);
    const [statusLabel, statusClass] = statusInfo(data);
    const pickup = locationText(data, ["pickupAddress", "pickupName", "pickupLocation", "pickup"], "Pickup unavailable");
    const dropoff = locationText(data, ["dropoffAddress", "destinationAddress", "destinationName", "dropoffLocation", "dropoff"], "Drop-off unavailable");
    const payment = safeText(value(data, "paymentMethod", "paymentLabel")) || "Payment unavailable";
    const encodedId = encodeURIComponent(ride.id);
    const driverName = safeText(value(data, "driverName", "assignedDriverName"));
    const vehicleNumber = safeText(value(data, "vehicleNumber", "registrationNumber", "vehicleRegistration"));
    const vehicleModel = safeText(value(data, "vehicleModel", "driverVehicleName", "vehicleName", "carModel", "model"));
    const ratingRaw = Number(value(data, "driverRating", "rating", "avgRating"));
    const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ` · ★ ${ratingRaw.toFixed(1)}` : "";
    const driverBlock = driverName || vehicleNumber || vehicleModel
      ? `<div class="scheduled-driver"><span class="scheduled-driver-avatar">${escapeHtml((driverName || "D").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase())}</span><div class="scheduled-driver-info"><strong>${escapeHtml(driverName || "Assigned driver")}</strong><span>${escapeHtml([vehicleModel, vehicleNumber].filter(Boolean).join(" · ") || "Vehicle details unavailable")}${escapeHtml(rating)}</span></div></div>`
      : "";
    const manageButtons = canManage(data)
      ? `<button class="scheduled-action" type="button" data-edit-scheduled="${encodedId}">Edit Ride</button><button class="scheduled-action danger" type="button" data-cancel-scheduled="${encodedId}">Cancel Ride</button>`
      : "";
    return `<article class="scheduled-card">
      <div class="scheduled-card-head"><div class="scheduled-card-date"><strong>${escapeHtml(when.toLocaleDateString("en-PK", { weekday:"short", day:"numeric", month:"short", year:"numeric" }))}</strong><span>${escapeHtml(when.toLocaleTimeString("en-PK", { hour:"numeric", minute:"2-digit" }))}</span></div><span class="scheduled-status ${statusClass}">${statusLabel}</span></div>
      <div class="scheduled-route"><div class="scheduled-stop"><span>Pickup</span><strong>${escapeHtml(pickup)}</strong></div><div class="scheduled-stop drop"><span>Drop-off</span><strong>${escapeHtml(dropoff)}</strong></div></div>
      <div class="scheduled-meta"><div class="scheduled-meta-item"><span>Vehicle</span><strong>${escapeHtml(vehicleType(data))}</strong></div><div class="scheduled-meta-item"><span>Payment</span><strong>${escapeHtml(payment)}</strong></div><div class="scheduled-meta-item"><span>Fare</span><strong>${escapeHtml(finalScheduledFare(data))}</strong></div></div>
      ${driverBlock}<span class="scheduled-ride-id">Ride ID: ${escapeHtml(data.rideCode || ride.id)}</span>
      <div class="scheduled-actions"><a class="scheduled-action primary" href="ride-details.html?rideId=${encodedId}">View Details</a>${manageButtons}</div>
    </article>`;
  }

  function scheduledEmpty() {
    return `<div class="scheduled-empty"><span class="scheduled-empty-icon" aria-hidden="true">◷</span><strong>No Scheduled Ride</strong><p>You don't have any upcoming scheduled rides.</p><a class="scheduled-action primary" href="dashboard.html?schedule=1">Schedule a Ride</a></div>`;
  }

  async function load() {
    const host = document.getElementById("appConnectedSections");
    if (!host || !window.WowFirestore) return;
    try {
      const ready = await WowFirestore.ready();
      const uid = ready.auth?.currentUser?.uid || ready.uid;
      if (!uid) return;
      const rideDocs = new Map();
      const snapshots = new Map();
      const expiryUpdates = new Set();
      const render = () => {
        rideDocs.clear();
        snapshots.forEach(docs => docs.forEach(doc => {
          const existing = rideDocs.get(doc.id);
          if (!existing || rideUpdatedMillis(doc.data() || {}) >= rideUpdatedMillis(existing.data() || {})) {
            rideDocs.set(doc.id, doc);
          }
        }));
        const rides = [...rideDocs.values()].map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
        rides.filter(ride => isExpiredSearchingRide(ride.data) && !expiryUpdates.has(ride.id)).forEach(ride => {
          expiryUpdates.add(ride.id);
          ride.ref.set({
            status: "expired",
            requestStatus: "closed",
            assignmentStatus: "expired",
            expiredAt: ready.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: ready.firebase.firestore.FieldValue.serverTimestamp()
          }, { merge:true }).catch(error => {
            expiryUpdates.delete(ride.id);
            console.warn("[Passenger Home] expired ride cleanup failed", error?.code || error?.message);
          });
        });
        window.wowPassengerScheduledRides = rides;
        const active = rides.filter(ride => isActiveRide(ride.data) &&
          !scheduled.has(normalizeStatus(ride.data.status || ride.data.rideStatus)) && !rideDate(ride.data))
          .sort((a, b) => rideCreatedMillis(b.data) - rideCreatedMillis(a.data))[0];
        const upcoming = rides.filter(ride => {
          const when = rideDate(ride.data);
          return when && when.getTime() > Date.now() && !terminal.has(normalizeStatus(ride.data.status || ride.data.rideStatus));
        }).sort((a, b) => rideDate(a.data).getTime() - rideDate(b.data).getTime());
        syncStoredActiveRide(active || null);
        document.getElementById("activeRideSummary").innerHTML = active
          ? rideCard(active, "active")
          : '<div class="active-empty-state"><strong>No Active Ride</strong><p>You don\'t have any ongoing rides.</p><a class="scheduled-action primary" href="dashboard.html">Book Ride</a></div>';
        document.getElementById("scheduledRideSummary").innerHTML = upcoming[0]
          ? scheduledRideCard(upcoming[0])
          : scheduledEmpty();
      };
      const readRides = async (key, field) => {
        const baseQuery = ready.db.collection("rides").where(field, "==", uid);
        try {
          const snapshot = await baseQuery.orderBy("createdAt", "desc").limit(30).get();
          snapshots.set(key, snapshot.docs);
        } catch (error) {
          console.warn(`[Passenger Home] ${key} ordered ride read unavailable`, error?.code || error?.message);
          const snapshot = await baseQuery.limit(30).get();
          snapshots.set(key, snapshot.docs);
        }
      };
      await readRides("passengerId", "passengerId");
      if (!(snapshots.get("passengerId") || []).length) {
        await readRides("passengerUid", "passengerUid");
      }
      render();
    } catch (error) {
      console.warn("[Passenger Home] Connected summaries unavailable", error);
    }
  }

  window.addEventListener("load", load);

  let scheduledModalRide = null;
  let scheduledModalTrigger = null;
  let scheduledSubmitting = false;

  function ensureScheduledModal() {
    if (document.getElementById("scheduledManageOverlay")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="scheduled-manage-overlay" id="scheduledManageOverlay" hidden>
        <section class="scheduled-manage-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduledManageTitle">
          <button class="scheduled-manage-close" type="button" data-close-scheduled aria-label="Close">&times;</button>
          <span class="scheduled-manage-eyebrow">Women on Wheels</span>
          <h2 id="scheduledManageTitle">Edit Scheduled Ride</h2>
          <p id="scheduledManageMessage">Update the allowed booking details below.</p>
          <form id="scheduledEditForm">
            <div class="scheduled-manage-grid">
              <label>Date<input id="scheduledEditDate" type="date" required></label>
              <label>Time<input id="scheduledEditTime" type="time" required></label>
              <label class="wide">Pickup<input id="scheduledEditPickup" type="text" readonly></label>
              <label class="wide">Drop-off<input id="scheduledEditDropoff" type="text" readonly></label>
              <label>Vehicle<select id="scheduledEditVehicle"><option value="car">Car</option><option value="bike">Bike</option><option value="scooty">Scooty</option></select></label>
              <label>Payment<select id="scheduledEditPayment"><option>Cash</option><option>Easypaisa</option><option>JazzCash</option><option>NayaPay</option></select></label>
            </div>
            <p class="scheduled-manage-note">Pickup and drop-off stay locked here so saved map coordinates remain accurate.</p>
            <p class="scheduled-manage-error" id="scheduledManageError" role="alert"></p>
            <div class="scheduled-manage-actions"><button type="button" data-close-scheduled>Cancel</button><button class="primary" id="scheduledSaveBtn" type="submit">Save Changes</button></div>
          </form>
          <div id="scheduledCancelView" hidden>
            <p>This action will cancel the scheduled ride. It will remain available in your ride history.</p>
            <label>Reason (optional)<textarea id="scheduledCancelReason" maxlength="250" placeholder="Tell us why you are cancelling"></textarea></label>
            <p class="scheduled-manage-error" id="scheduledCancelError" role="alert"></p>
            <div class="scheduled-manage-actions"><button type="button" data-close-scheduled>Keep Ride</button><button class="danger" id="scheduledConfirmCancel" type="button">Cancel Ride</button></div>
          </div>
          <div class="scheduled-manage-success" id="scheduledSuccessView" hidden role="status">
            <span aria-hidden="true">&#10003;</span><h3>Ride Updated</h3><p id="scheduledSuccessText"></p>
            <button class="primary" type="button" data-close-scheduled>Back to Dashboard</button>
          </div>
        </section>
      </div>`);
    const overlay = document.getElementById("scheduledManageOverlay");
    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest("[data-close-scheduled]")) closeScheduledModal();
    });
    document.getElementById("scheduledEditForm").addEventListener("submit", saveScheduledRide);
    document.getElementById("scheduledConfirmCancel").addEventListener("click", cancelScheduledRide);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !overlay.hidden && !scheduledSubmitting) closeScheduledModal();
    });
  }

  function closeScheduledModal() {
    const overlay = document.getElementById("scheduledManageOverlay");
    if (!overlay || scheduledSubmitting) return;
    overlay.hidden = true;
    document.body.classList.remove("scheduled-modal-open");
    scheduledModalTrigger?.focus();
  }

  function openScheduledModal(ride, mode, trigger) {
    ensureScheduledModal();
    scheduledModalRide = ride;
    scheduledModalTrigger = trigger;
    const data = ride.data;
    const when = rideDate(data) || new Date();
    const overlay = document.getElementById("scheduledManageOverlay");
    const edit = document.getElementById("scheduledEditForm");
    const cancel = document.getElementById("scheduledCancelView");
    const success = document.getElementById("scheduledSuccessView");
    document.getElementById("scheduledManageTitle").textContent = mode === "cancel" ? "Cancel Scheduled Ride?" : "Edit Scheduled Ride";
    edit.hidden = mode !== "edit";
    cancel.hidden = mode !== "cancel";
    success.hidden = true;
    document.getElementById("scheduledManageError").textContent = "";
    document.getElementById("scheduledCancelError").textContent = "";
    if (mode === "edit") {
      const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000);
      document.getElementById("scheduledEditDate").value = local.toISOString().slice(0, 10);
      document.getElementById("scheduledEditDate").min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      document.getElementById("scheduledEditTime").value = local.toISOString().slice(11, 16);
      document.getElementById("scheduledEditPickup").value = locationText(data, ["pickupAddress", "pickupName", "pickupLocation", "pickup"], "Pickup unavailable");
      document.getElementById("scheduledEditDropoff").value = locationText(data, ["destinationAddress", "dropoffAddress", "destinationName", "dropoffLocation", "dropoff"], "Drop-off unavailable");
      document.getElementById("scheduledEditVehicle").value = String(value(data, "requestedVehicleType", "vehicleType") || "car").toLowerCase();
      document.getElementById("scheduledEditPayment").value = safeText(value(data, "paymentMethod")) || "Cash";
    }
    overlay.hidden = false;
    document.body.classList.add("scheduled-modal-open");
    requestAnimationFrame(() => overlay.querySelector("input,textarea,button:not(.scheduled-manage-close)")?.focus());
  }

  async function withScheduledTransaction(mode, changes) {
    const ready = await WowFirestore.ready();
    const uid = ready.auth?.currentUser?.uid || ready.uid;
    const rideId = scheduledModalRide?.id;
    if (!uid || !rideId) throw new Error("This scheduled ride is unavailable.");
    await ready.db.runTransaction(async transaction => {
      const ref = ready.db.collection("rides").doc(rideId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("This scheduled ride is unavailable.");
      const live = snapshot.data() || {};
      const liveStatus = String(live.status || "").toLowerCase();
      if (String(live.passengerId || live.passengerUid || "") !== String(uid) ||
          liveStatus !== "scheduled" || live.assignedDriverId || live.driverId) {
        throw new Error(`This scheduled ride can no longer be ${mode === "cancel" ? "cancelled" : "changed"}.`);
      }
      transaction.update(ref, changes(ready));
    });
  }

  function showScheduledSuccess(text) {
    document.getElementById("scheduledEditForm").hidden = true;
    document.getElementById("scheduledCancelView").hidden = true;
    document.getElementById("scheduledSuccessView").hidden = false;
    document.getElementById("scheduledSuccessText").textContent = text;
  }

  async function saveScheduledRide(event) {
    event.preventDefault();
    if (scheduledSubmitting) return;
    const date = document.getElementById("scheduledEditDate").value;
    const time = document.getElementById("scheduledEditTime").value;
    const payment = document.getElementById("scheduledEditPayment").value;
    const vehicle = document.getElementById("scheduledEditVehicle").value;
    const scheduledAt = new Date(`${date}T${time}:00`);
    const errorNode = document.getElementById("scheduledManageError");
    if (!date || !time || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      errorNode.textContent = "Please select a future date and time."; return;
    }
    scheduledSubmitting = true;
    const button = document.getElementById("scheduledSaveBtn");
    button.disabled = true; button.textContent = "Saving...";
    try {
      await withScheduledTransaction("edit", ready => ({
        scheduledAt: ready.firebase.firestore.Timestamp.fromDate(scheduledAt),
        scheduledDate: date,
        scheduledTime: time,
        assignmentStartsAt: ready.firebase.firestore.Timestamp.fromMillis(scheduledAt.getTime() - 30 * 60 * 1000),
        requestedVehicleType: vehicle,
        vehicleType: vehicle,
        paymentMethod: payment,
        paymentStatus: payment === "Cash" ? "cash_pending" : "unpaid",
        assignmentStatus: "pending",
        assignmentAttempt: 0,
        searchRadiusKm: 5,
        passengerUpdatedAt: ready.FieldValue.serverTimestamp(),
        updatedAt: ready.FieldValue.serverTimestamp()
      }));
      showScheduledSuccess("Your scheduled ride was updated successfully.");
    } catch (error) {
      errorNode.textContent = error?.message || "Unable to update this ride. Please try again.";
    } finally {
      scheduledSubmitting = false; button.disabled = false; button.textContent = "Save Changes";
    }
  }

  async function cancelScheduledRide() {
    if (scheduledSubmitting) return;
    scheduledSubmitting = true;
    const button = document.getElementById("scheduledConfirmCancel");
    const errorNode = document.getElementById("scheduledCancelError");
    button.disabled = true; button.textContent = "Cancelling...";
    try {
      const reason = document.getElementById("scheduledCancelReason").value.trim();
      await withScheduledTransaction("cancel", ready => ({
        status: "cancelled", requestStatus: "closed", cancelledBy: "passenger",
        cancellationReason: reason || "Cancelled by passenger",
        cancelledAt: ready.FieldValue.serverTimestamp(), updatedAt: ready.FieldValue.serverTimestamp()
      }));
      showScheduledSuccess("Your scheduled ride was cancelled and kept in ride history.");
    } catch (error) {
      errorNode.textContent = error?.message || "Unable to cancel this ride. Please try again.";
    } finally {
      scheduledSubmitting = false; button.disabled = false; button.textContent = "Cancel Ride";
    }
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-edit-scheduled],[data-cancel-scheduled]");
    if (!button || !window.WowFirestore) return;
    const rideId = decodeURIComponent(button.getAttribute("data-edit-scheduled") || button.getAttribute("data-cancel-scheduled") || "");
    const ride = (window.wowPassengerScheduledRides || []).find(item => item.id === rideId);
    if (!ride || ride.data.status !== "scheduled" || ride.data.assignedDriverId) return;
    openScheduledModal(ride, button.hasAttribute("data-cancel-scheduled") ? "cancel" : "edit", button);
  });
})();
