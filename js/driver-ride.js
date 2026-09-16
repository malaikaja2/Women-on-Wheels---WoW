let rideMap;
let rideMapFull;
let rideBounds;
let callInterval;
let callSeconds = 0;
let driverCallReady = false;
let driverCallMuted = false;
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
let rideChatUnsubscribe = null;
let tripTimerInterval = null;
let tripStartedAtMs = 0;
let driverRideRefreshTimer = null;
let driverGeoWatchId = null;
let driverFallbackTicker = null;
let pendingRideUnsubscribe = null;
let driverOfferUnsubscribe = null;
let driverRequestDocs = new Map();
let driverOfferStatusByRide = new Map();
let driverOfferNotifications = new Set();
let driverRideLiveTracker = null;
let driverStartPending = false;
let driverCompletePending = false;
let driverFollowMode = false;
let driverMapUserInteracted = false;
let driverRouteRequestToken = 0;
let driverPaymentUnsubscribe = null;
let driverPaymentRecord = null;
const driverStaticMarkersByMap = new WeakMap();
const ACTIVE_RIDE_STATUSES = new Set([
  "driver_assigned", "accepted", "driver_en_route", "driver_arriving",
  "arriving", "arrived", "started", "ride_started", "ongoing",
  "in_progress", "on_trip", "active"
]);
const INSTANT_REQUEST_LIFETIME_MS = 10 * 60 * 1000;
const TERMINAL_REQUEST_STATUSES = new Set([
  "cancelled", "canceled", "cancelled_by_passenger", "completed",
  "rejected", "declined", "expired", "failed"
]);

function assignedDriverValue(ride) {
  const raw = ride || {};
  const value = raw.assignedDriverId ?? raw.driverUid ?? raw.driverId ?? raw.acceptedDriverId ?? raw.selectedDriverId ?? "";
  const text = String(value ?? "").trim();
  return /^(null|undefined)$/i.test(text) ? "" : text;
}

function hasAssignedDriver(ride) {
  return Boolean(assignedDriverValue(ride));
}

function requestCreatedMillis(ride) {
  const raw = ride || {};
  return firestoreMillis(
    raw.createdAt || raw.requestedAt || raw.requestCreatedAt ||
    raw.clientCreatedAt || raw.createdAtMs || raw.requestedAtMs
  );
}

function isActionableRequest(ride, now = Date.now()) {
  if (!ride) return false;
  const status = String(ride.status || "").trim().toLowerCase();
  const requestStatus = String(ride.requestStatus || "open").trim().toLowerCase();
  if (TERMINAL_REQUEST_STATUSES.has(status)) return false;
  if (!["searching", "searching_driver", "pending"].includes(status)) return false;
  if (!["open", "pending", ""].includes(requestStatus)) return false;
  if (hasAssignedDriver(ride)) return false;
  const expiresMs = firestoreMillis(ride.expiresAt);
  if (expiresMs) return expiresMs > now;
  const createdMs = requestCreatedMillis(ride);
  if (!createdMs) return false;
  return now - createdMs <= INSTANT_REQUEST_LIFETIME_MS;
}

function rideScheduledMillis(ride) {
  const source = ride?.scheduledAt || ride?.scheduledDateTime || ride?.scheduleAt;
  if (source?.toMillis) return source.toMillis();
  if (source?.seconds) return Number(source.seconds) * 1000;
  if (source) {
    const parsed = new Date(source).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (ride?.scheduledDate) {
    const parsed = new Date(`${ride.scheduledDate}T${ride.scheduledTime || ride.pickupTime || "23:59"}`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function rideBlocksDriverAvailability(ride, uid, now = Date.now()) {
  if (!ride) return false;
  const status = String(ride.status || "").trim().toLowerCase();
  if (!ACTIVE_RIDE_STATUSES.has(status)) return false;
  const assigned = assignedDriverValue(ride);
  if (assigned && assigned !== String(uid || "")) return false;
  const scheduledMs = rideScheduledMillis(ride);
  if (scheduledMs > now + (30 * 60 * 1000) && ["driver_assigned", "accepted"].includes(status)) return false;
  return true;
}

async function driverHasBlockingRide(db, uid, currentRideId) {
  const rideId = String(currentRideId || "").trim();
  if (!rideId) return false;
  try {
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) return false;
    return rideBlocksDriverAvailability({ id: snapshot.id, ...(snapshot.data() || {}) }, uid);
  } catch (error) {
    console.warn("[WOW Driver Ride] current ride availability check skipped", error?.code || error?.message || error);
    return false;
  }
}

function localDriverOnline() {
  try {
    const status = JSON.parse(localStorage.getItem("wow_driver_status") || "{}");
    return status?.online !== false;
  } catch {
    return true;
  }
}

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
  if (!mapEl || !window.WowMapbox) return;
  rideMap = buildRideMap(mapEl, false);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Paint the locally cached ride immediately while Firebase verifies the session.
  // This avoids leaving the driver on a blank/loading shell on slower networks.
  syncRidePhaseFromStorage();
  syncDriverName();
  setDriverRideDetails();
  syncTripTimerState();
  updateTripHeaderMeta();
  if (!await authorizeDriverActiveRide()) return;
  document.querySelector(".request-inbox-card")?.setAttribute("hidden", "hidden");
  setDriverRideDetails();
  refreshDriverRideFromDb();
  driverRideRefreshTimer = setInterval(refreshDriverRideFromDb, 7000);
  seedDriverChat();
  bindDriverRideActions();
  handleDriverRideDeepLink();
  document.getElementById("driverCashCollectedBtn")?.addEventListener("click", confirmDriverCashCollected);
  initDriverRideMap();
  initDriverRideLiveTracking();
});

function handleDriverRideDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const action = String(params.get("action") || "").toLowerCase();
  if (params.get("navigate") === "pickup") {
    window.setTimeout(() => document.getElementById("driverOpenNav")?.click(), 0);
    return;
  }
  if (action === "cancel") {
    window.setTimeout(() => document.getElementById("driverCancelRide")?.click(), 0);
    return;
  }
  if (action === "start" && String(localStorage.getItem("wow_ride_status") || "").toLowerCase() === "arrived") {
    window.setTimeout(() => document.getElementById("driverStartRide")?.click(), 0);
  }
}

async function authorizeDriverActiveRide() {
  try {
    const params = new URLSearchParams(window.location.search);
    const rideId = String(params.get("rideId") || localStorage.getItem("wow_ride_db_id") || "").trim();
    const isPreview = String(params.get("mode") || "").toLowerCase() === "preview";
    if (!rideId || !window.WowFirestore) throw new Error("A valid active ride is required.");
    const { db, uid } = await window.WowFirestore.ready();
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) throw new Error("This ride no longer exists.");
    const ride = snapshot.data() || {};
    const rideStatus = String(ride.status || "").toLowerCase();
    const isScheduledPreview = isPreview && rideStatus === "scheduled" && !ride.assignedDriverId;
    if (!isScheduledPreview && String(ride.assignedDriverId || "") !== String(uid || "")) {
      throw new Error("This driver is not assigned to the requested ride.");
    }
    if (![...ACTIVE_RIDE_STATUSES, "scheduled", "completed", "cancelled"].includes(rideStatus)) {
      throw new Error("This ride is not ready for the active ride page.");
    }
    localStorage.setItem("wow_ride_db_id", rideId);
    initDriverLiveCall(rideId).catch(() => {});
    clearDriverRideVehicleCache();
    localStorage.setItem("wow_ride_status", String(ride.status || "driver_assigned"));
    if (ride.rideCode) localStorage.setItem("wow_ride_code", String(ride.rideCode));
    if (ride.pickupName || ride.pickupAddress) localStorage.setItem("wow_ride_pickup", String(ride.pickupName || ride.pickupAddress));
    if (ride.destinationName || ride.destinationAddress) localStorage.setItem("wow_ride_drop", String(ride.destinationName || ride.destinationAddress));
    if (ride.passengerName) localStorage.setItem("wow_ride_passenger", String(ride.passengerName));
    if (ride.passengerPhone) localStorage.setItem("wow_ride_passenger_phone", String(ride.passengerPhone));
    cacheDriverRideVehicle(ride);
    if (ride.finalFare || ride.passengerOffer) localStorage.setItem("wow_ride_fare", String(ride.finalFare || ride.passengerOffer));
    cacheRideCoordinates(ride);
    initDriverDemoPayment(rideId, ride);
    return true;
  } catch (error) {
    console.error("[WOW Driver Ride] authorization failed", error);
    showRideInfoModal("Ride Unavailable", error?.message || "Unable to open this ride.");
    window.setTimeout(() => window.location.replace("driver-dashboard.html"), 1800);
    return false;
  }
}

window.addEventListener("pagehide", cleanupDriverRidePage);
window.addEventListener("beforeunload", cleanupDriverRidePage);
window.addEventListener("beforeunload", (event) => {
  if (!window.WowRideCall?.hasActiveCall?.()) return;
  event.preventDefault();
  event.returnValue = "";
});

function cleanupDriverRidePage() {
  window.WowRideCall?.stop();
  driverCallReady = false;
  if (driverRideRefreshTimer) clearInterval(driverRideRefreshTimer);
  if (pendingRideUnsubscribe) pendingRideUnsubscribe();
  if (driverOfferUnsubscribe) driverOfferUnsubscribe();
  if (driverPaymentUnsubscribe) driverPaymentUnsubscribe();
  stopRideChatPolling();
  stopTripTimer();
  stopDriverLocationTracking();
  if (driverRideLiveTracker) {
    driverRideLiveTracker.stop();
    driverRideLiveTracker = null;
  }
}

function driverPaymentLabel(status) {
  return ({
    unpaid: "Unpaid", pending: "Payment Pending", paid: "Paid",
    processing: "Payment Pending", demo_paid: "Paid",
    demo_failed: "Payment Pending", cancelled: "Payment Pending",
    cash_pending: "Payment Pending", cash_collected: "Paid"
  })[String(status || "unpaid")] || "Unpaid";
}

function driverPaymentMethodLabel(method) {
  return ({ cash: "Cash", easypaisa: "Easypaisa", jazzcash: "JazzCash", nayapay: "NayaPay" })[
    window.WowDemoPayment?.normalizeMethod(method)
  ] || "Not selected";
}

function initDriverDemoPayment(rideId, ride) {
  if (!window.WowDemoPayment || driverPaymentUnsubscribe) return;
  const amount = window.WowDemoPayment.fareOf(ride);
  document.getElementById("driverPaymentRideId").textContent = rideId;
  document.getElementById("driverPaymentFare").textContent = amount ? `PKR ${amount.toFixed(0)}` : "PKR --";
  driverPaymentUnsubscribe = window.WowDemoPayment.watch(rideId, (payment) => {
    driverPaymentRecord = payment;
    const status = payment?.paymentStatus || ride.paymentStatus || "unpaid";
    const method = payment?.paymentMethod || ride.paymentMethod;
    document.getElementById("driverPaymentBadge").textContent = driverPaymentLabel(status);
    document.getElementById("driverPaymentMethod").textContent = driverPaymentMethodLabel(method);
    document.getElementById("driverCommissionAmount").textContent = payment?.platformCommission != null ? `PKR ${Number(payment.platformCommission).toFixed(0)}` : "PKR --";
    document.getElementById("driverNetEarning").textContent = payment?.driverEarning != null ? `PKR ${Number(payment.driverEarning).toFixed(0)}` : "PKR --";
    document.getElementById("driverCommissionStatus").textContent = payment?.commissionStatus || "Not calculated";
    document.getElementById("driverPaymentNote").textContent =
      ["paid", "completed", "success", "successful", "confirmed", "cash_collected", "collected", "received"].includes(status) ? "Payment received successfully. Rating is now unlocked for the passenger." :
      method === "cash" && status === "pending" ? "Confirm cash receipt after collecting the final fare from the passenger." :
      status === "pending" || status === "processing" ? `Waiting for the passenger's ${driverPaymentMethodLabel(method)} payment.` :
      "Waiting for the passenger's payment.";
    const completed = ["completed", "ride_completed"].includes(String(localStorage.getItem("wow_ride_status") || ride.status || "").toLowerCase());
    document.getElementById("driverCashCollectedBtn").hidden = !(method === "cash" && status === "pending" && completed);
  }, (error) => {
    console.error("[WOW Payment] driver listener failed", error);
    document.getElementById("driverPaymentNote").textContent = "Unable to load payment status.";
  });
}

async function confirmDriverCashCollected() {
  if (!driverPaymentRecord || driverPaymentRecord.paymentMethod !== "cash" || driverPaymentRecord.paymentStatus !== "pending") return;
  if (!await confirmCashPaymentReceived()) return;
  const button = document.getElementById("driverCashCollectedBtn");
  button.disabled = true;
  try {
    await window.WowDemoPayment.collectCash(String(localStorage.getItem("wow_ride_db_id") || ""));
    showRideInfoModal("Payment confirmed", "Cash receipt confirmed. The passenger can now submit a rating and review.");
  } catch (error) {
    showRideInfoModal("Cash confirmation failed", error?.message || "Please try again.");
  } finally {
    button.disabled = false;
  }
}

function confirmCashPaymentReceived() {
  const overlay = document.getElementById("cashConfirmOverlay");
  const modal = document.getElementById("cashConfirmModal");
  const okBtn = document.getElementById("cashConfirmOkBtn");
  const cancelBtn = document.getElementById("cashConfirmCancelBtn");
  const fareEl = document.getElementById("cashConfirmFare");
  if (!overlay || !modal || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm("Confirm that you have received the cash payment from the passenger."));
  }
  const amount = Number(
    driverPaymentRecord?.finalFare ??
    driverPaymentRecord?.totalFare ??
    localStorage.getItem("wow_ride_fare") ??
    0
  );
  if (fareEl) fareEl.textContent = amount > 0 ? `PKR ${Math.round(amount).toLocaleString("en-PK")}` : "PKR --";
  overlay.classList.add("is-open");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  okBtn.focus();

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      overlay.classList.remove("is-open");
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      okBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeydown);
      resolve(confirmed);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    okBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}

async function initDriverFirestoreRequests() {
  const stateEl = document.getElementById("driverRequestState");
  try {
    if (!window.WowFirestore) throw new Error("Firestore helper missing");
    const { db, uid } = await window.WowFirestore.ready();
    const driverSnapshot = await db.collection("drivers").doc(uid).get();
    if (!driverSnapshot.exists) throw new Error("driver_profile_missing");
    const driverProfile = driverSnapshot.data() || {};
    const registeredVehicle = window.WowVehicle?.driverVehicle(driverProfile) || { type: "", name: "", number: "" };
    if (!isApprovedDriverProfile(driverProfile)) throw new Error("driver_not_approved");
    if (driverProfile.isOnline !== true && !localDriverOnline()) throw new Error("driver_offline");
    const currentRideId = String(driverProfile.currentRideId || "").trim();
    if (currentRideId && await driverHasBlockingRide(db, uid, currentRideId)) {
      throw new Error("driver_unavailable");
    }
    if (!registeredVehicle.type) throw new Error("driver_vehicle_missing");
    console.info("[WOW Driver Ride] listener started", {
      projectId: window.WowFirestore?.config?.projectId || "unknown",
      uid,
      online: driverProfile.isOnline === true,
      approved: isApprovedDriverProfile(driverProfile),
      vehicleType: registeredVehicle.type,
      // Match the Firestore rule predicates exactly. A status-only query is
      // rejected by Firestore rules because it could return non-open rides,
      // even though this page filters those records afterwards.
      filters: { status: "searching", requestStatus: "open", assignedDriverId: null }
    });
    if (stateEl) stateEl.textContent = "Live";
    if (pendingRideUnsubscribe) pendingRideUnsubscribe();
    if (driverOfferUnsubscribe) driverOfferUnsubscribe();
    pendingRideUnsubscribe = db.collection("rides")
      .where("status", "==", "searching")
      .where("requestStatus", "==", "open")
      .where("assignedDriverId", "==", null)
      .limit(30)
      .onSnapshot((snapshot) => {
        console.info("[WOW Driver Ride] snapshot", {
          count: snapshot.size,
          rideIds: snapshot.docs.map((doc) => doc.id)
        });
        driverRequestDocs.clear();
        snapshot.forEach((doc) => {
          const ride = { id: doc.id, ...doc.data() };
          const status = String(ride.status || "").toLowerCase();
          const requestStatus = String(ride.requestStatus || "").toLowerCase();
          const isOpen = status === "searching"
            && requestStatus === "open"
            && !hasAssignedDriver(ride);
          if (isOpen && isActionableRequest(ride) && window.WowVehicle?.requestedType(ride) === registeredVehicle.type) {
            driverRequestDocs.set(doc.id, ride);
          }
        });
        renderDriverRequestCards();
      }, (error) => {
        console.error("[WOW Driver Ride] request listener failed", {
          code: error?.code || "unknown",
          message: error?.message || String(error)
        });
        if (stateEl) stateEl.textContent = "Offline";
        renderDriverRequestError(error?.code === "failed-precondition"
          ? "Ride request index is unavailable."
          : error?.code === "permission-denied"
            ? "Your driver session is not authorized for ride requests."
            : "Unable to load ride requests.");
      });

    driverOfferUnsubscribe = db.collectionGroup("offers")
      .where("driverId", "==", uid)
      .limit(50)
      .onSnapshot((snapshot) => {
        driverOfferStatusByRide.clear();
        snapshot.forEach((doc) => {
          const data = doc.data() || {};
          if (data.rideId) driverOfferStatusByRide.set(String(data.rideId), { id: doc.id, ...data });
        });
        snapshot.docChanges().forEach((change) => handleDriverOfferChange(change.doc));
        renderDriverRequestCards();
      });
  } catch (error) {
    console.error("[WOW Driver Ride] listener setup failed", {
      code: error?.code || error?.message || "unknown"
    });
    if (stateEl) stateEl.textContent = "Offline";
    renderDriverRequestError("Firebase connection unavailable. Please login again if requests do not appear.");
  }
}

async function verifyAcceptedDriverAccess() {
  try {
    if (!window.WowFirestore) return;
    const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    const rideCode = String(localStorage.getItem("wow_ride_code") || "").trim();
    if (!rideId && !rideCode) return;
    const { db, uid } = await window.WowFirestore.ready();
    let snap = rideId ? await db.collection("rides").doc(rideId).get() : null;
    if ((!snap || !snap.exists) && rideCode) {
      const query = await db.collection("rides").where("rideCode", "==", rideCode).limit(1).get();
      query.forEach((doc) => { snap = doc; });
    }
    if (!snap || !snap.exists) return;
    const ride = snap.data() || {};
    const acceptedDriverId = String(ride.assignedDriverId || ride.acceptedDriverId || ride.driverUid || ride.driverId || "");
    if (acceptedDriverId && acceptedDriverId !== String(uid)) {
      showRideInfoModal("Ride Unavailable", "This ride has already been accepted by another driver.");
      window.setTimeout(() => {
        window.location.href = "driver-dashboard.html";
      }, 1600);
    }
  } catch {
    // Keep existing ride page behavior if Firestore is unavailable.
  }
}

function renderDriverRequestError(message) {
  const list = document.getElementById("driverRequestList");
  if (list) list.innerHTML = `<div class="request-empty">${escapeHtml(message)}</div>`;
}

function renderDriverRequestCards() {
  const list = document.getElementById("driverRequestList");
  if (!list) return;
  const rides = Array.from(driverRequestDocs.values())
    .filter((ride) => String(ride.status || "").toLowerCase() === "searching" && String(ride.requestStatus || "").toLowerCase() === "open" && !hasAssignedDriver(ride))
    .filter((ride) => isActionableRequest(ride))
    .filter((ride) => !(Array.isArray(ride.declinedDriverIds) && ride.declinedDriverIds.includes(firebase.auth().currentUser?.uid)))
    .sort((a, b) => requestCreatedMillis(b) - requestCreatedMillis(a));

  const visible = rides.filter((ride) => {
    const offer = driverOfferStatusByRide.get(String(ride.id));
    if (!offer) return true;
    return String(offer.status || "").toLowerCase() !== "driver_declined";
  });

  if (!visible.length) {
    list.innerHTML = '<div class="request-empty">No pending passenger requests right now.</div>';
    return;
  }

  list.innerHTML = "";
  visible.forEach((ride) => list.appendChild(buildDriverRequestCard(ride)));
}

async function handleDriverOfferChange(doc) {
  const offer = doc.data() || {};
  const status = String(offer.status || "").toLowerCase();
  if (!["accepted", "declined", "rejected", "expired"].includes(status)) return;
  const key = `${doc.ref.path}:${status}`;
  if (driverOfferNotifications.has(key)) return;
  driverOfferNotifications.add(key);
  if (["declined", "rejected"].includes(status)) {
    showRideInfoModal("Offer Rejected", "Passenger rejected your offer. You can continue receiving other requests.");
    return;
  }
  if (status === "expired") {
    showRideInfoModal("Offer Expired", "Passenger did not respond within 30 seconds.");
    return;
  }
  if (status === "accepted") {
    const rideRef = doc.ref.parent.parent;
    if (!rideRef) return;
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) return;
    const ride = { id: rideSnap.id, ...rideSnap.data() };
    markDriverBusyForRide(ride.id).catch((error) => console.warn("[WOW Driver Ride] busy status sync skipped", error?.code || error?.message || error));
    applyAcceptedFirestoreRide(ride, offer);
    showRideInfoModal("Offer Accepted", "Passenger accepted your offer. Ride details are ready.");
  }
}

async function markDriverBusyForRide(rideId) {
  const activeRideId = String(rideId || "").trim();
  if (!activeRideId) return;
  const { db, uid, FieldValue } = await window.WowFirestore.ready();
  await db.collection("drivers").doc(uid).set({
    currentRideId: activeRideId,
    isAvailable: false,
    status: "busy",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

function applyAcceptedFirestoreRide(ride, offer) {
  const fare = Number(offer.offeredFare || offer.driverOfferPrice || offer.offerPrice || ride.finalFare || ride.acceptedFare || ride.fare || ride.passengerOffer || ride.passengerOfferPrice || 0);
  const pickup = ride.pickupName || ride.pickupAddress || ride.pickupLocation?.address || ride.pickup || "";
  const dropoff = ride.destinationName || ride.destinationAddress || ride.dropoffAddress || ride.dropoffLocation?.address || ride.dropLocation?.address || ride.dropoff || "";
  localStorage.setItem("wow_ride_pickup", pickup);
  localStorage.setItem("wow_ride_drop", dropoff);
  localStorage.setItem("wow_ride_fare", String(fare));
  localStorage.setItem("wow_ride_payment_method", ride.paymentMethod || "cash");
  localStorage.setItem("wow_ride_payment_label", ride.paymentLabel || ride.paymentMethod || "Cash");
  localStorage.setItem("wow_ride_vehicle", normalizeRideType(ride.requestedVehicleType || ride.vehicleType || offer.vehicleType || ""));
  localStorage.setItem("wow_ride_driver_name", offer.driverName || localStorage.getItem("wow_user_name") || "Driver");
  localStorage.setItem("wow_ride_driver_phone", offer.driverPhone || localStorage.getItem("wow_user_phone") || "");
  localStorage.setItem("wow_ride_passenger", ride.passengerName || "Passenger");
  localStorage.setItem("wow_ride_passenger_phone", ride.passengerPhone || "");
  localStorage.setItem("wow_ride_code", ride.rideCode || "");
  localStorage.setItem("wow_ride_db_id", ride.id || "");
  localStorage.setItem("wow_ride_status", String(ride.status || "driver_assigned"));
  const scheduledSource = ride.scheduledAt || ride.scheduledDateTime || ride.scheduleAt;
  if (scheduledSource?.toDate) localStorage.setItem("wow_ride_scheduled_at", scheduledSource.toDate().toISOString());
  else if (scheduledSource) localStorage.setItem("wow_ride_scheduled_at", String(scheduledSource));
  if (ride.scheduledDate) localStorage.setItem("wow_ride_scheduled_date", String(ride.scheduledDate));
  if (ride.scheduledTime) localStorage.setItem("wow_ride_scheduled_time", String(ride.scheduledTime));
  if (ride.pickupLat) localStorage.setItem("wow_ride_pickup_lat", String(ride.pickupLat));
  if (ride.pickupLng) localStorage.setItem("wow_ride_pickup_lng", String(ride.pickupLng));
  if (ride.dropLat || ride.dropoffLat) localStorage.setItem("wow_ride_drop_lat", String(ride.dropLat || ride.dropoffLat));
  if (ride.dropLng || ride.dropoffLng) localStorage.setItem("wow_ride_drop_lng", String(ride.dropLng || ride.dropoffLng));
  if (ride.distance || ride.distanceKm) localStorage.setItem("wow_ride_distance_km", String(ride.distance || ride.distanceKm));
  if (ride.durationMin) localStorage.setItem("wow_ride_duration_min", String(ride.durationMin));
  setDriverRideDetails();
  updateRideActionState();
}

function buildDriverRequestCard(ride) {
  const card = document.createElement("article");
  card.className = "driver-request-card";
  card.dataset.rideId = ride.id;
  const passengerOffer = Number(ride.passengerOfferPrice || ride.offeredFare || ride.offerPrice || ride.fare || 0);
  const distance = Number(ride.distance || ride.distanceKm || 0);
  const payment = ride.paymentLabel || ride.paymentMethod || "Cash";
  const vehicle = normalizeRideType(ride.vehicleType || ride.rideType || "WOW Car");
  const passengerName = ride.passengerName || "Passenger";
  const pickup = ride.pickupAddress || ride.pickupName || ride.pickupLocation?.address || ride.pickup || "Pickup location unavailable";
  const dropoff = ride.dropoffAddress || ride.destinationAddress || ride.destinationName || ride.dropoffLocation?.address || ride.dropLocation?.address || ride.dropoff || "Drop-off location unavailable";
  const offer = driverOfferStatusByRide.get(String(ride.id));
  const offerStatus = String(offer?.status || "").toLowerCase();
  const waitingForPassenger = offerStatus === "pending";
  const noteText = waitingForPassenger ? "Waiting for passenger response..." : "";
  card.innerHTML = `
    <div class="request-card-top">
      <div>
        <strong>${escapeHtml(passengerName)}</strong>
        <span>${escapeHtml(vehicle)} · ${distance > 0 ? distance.toFixed(1) + " km" : "-- km"}</span>
      </div>
      <div class="request-price">Rs. ${Math.round(passengerOffer).toLocaleString("en-PK")}</div>
    </div>
    <div class="request-route">
      <div><span class="dot pickup-dot"></span><p>${escapeHtml(pickup)}</p></div>
      <div><span class="dot drop-dot"></span><p>${escapeHtml(dropoff)}</p></div>
    </div>
    <div class="request-meta-grid">
      <span>Payment <strong>${escapeHtml(payment)}</strong></span>
      <span>Contact <strong>Private in-app calling</strong></span>
    </div>
    <div class="request-actions">
      <button class="primary-btn" type="button" data-action="accept" ${waitingForPassenger ? "disabled" : ""}>${waitingForPassenger ? "Waiting" : "Accept Ride"}</button>
      <button class="outline-btn danger-text" type="button" data-action="decline" ${waitingForPassenger ? "disabled" : ""}>Decline</button>
    </div>
    <div class="request-note" aria-live="polite">${escapeHtml(noteText)}</div>
  `;
  card.querySelector('[data-action="accept"]').addEventListener("click", () => acceptDriverRideRequest(card, ride));
  card.querySelector('[data-action="decline"]').addEventListener("click", () => declineDriverRequest(card, ride));
  return card;
}

async function acceptDriverRideRequest(card, ride) {
  const note = card.querySelector(".request-note");
  setRequestCardBusy(card, true);
  try {
    const { db, uid, FieldValue, firebase } = await window.WowFirestore.ready();
    const rideRef = db.collection("rides").doc(ride.id);
    const offerRef = rideRef.collection("offers").doc(uid);
    const driverRef = db.collection("drivers").doc(uid);
    const driverName = localStorage.getItem("wow_user_name") || "Driver";
    const driverPhone = localStorage.getItem("wow_user_phone") || "";
    let pendingOffer = null;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(rideRef);
      const existingOfferSnap = await transaction.get(offerRef);
      const driverSnap = await transaction.get(driverRef);
      if (!snap.exists) throw new Error("ride_not_found");
      if (!driverSnap.exists) throw new Error("driver_unavailable");
      const current = snap.data() || {};
      if (String(current.status || "").toLowerCase() !== "searching" || String(current.requestStatus || "").toLowerCase() !== "open" || hasAssignedDriver(current)) throw new Error("already_accepted");
      if (!isActionableRequest(current)) throw new Error("request_expired");
      const driver = driverSnap.data() || {};
      const currentRideId = String(driver.currentRideId || "").trim();
      const currentRideSnap = currentRideId && currentRideId !== rideRef.id
        ? await transaction.get(db.collection("rides").doc(currentRideId))
        : null;
      const currentRideData = currentRideId === rideRef.id
        ? current
        : currentRideSnap?.exists
          ? { id: currentRideSnap.id, ...(currentRideSnap.data() || {}) }
          : null;
      if (!isApprovedDriverProfile(driver) || driver.lostItemRestricted === true || (currentRideId && rideBlocksDriverAvailability(currentRideData, uid))) {
        throw new Error("driver_unavailable");
      }
      const verifiedVehicle = window.WowVehicle?.driverVehicle(driver) || { type: "", name: "", number: "" };
      const driverVehicle = verifiedVehicle.name;
      const vehicleNumber = verifiedVehicle.number;
      const driverPhoto = String(driver.profilePhotoUrl || driver.profileImage || driver.photoURL || "");
      const fare = Number(current.passengerOffer || current.offeredFare || current.offerPrice || current.fare || 0);
      const requestedVehicleType = window.WowVehicle?.requestedType(current) || "";
      const vehicleType = verifiedVehicle.type;
      if (!requestedVehicleType || requestedVehicleType !== vehicleType) throw new Error("vehicle_mismatch");
      if (existingOfferSnap.exists && String((existingOfferSnap.data() || {}).status || "").toLowerCase() === "accepted") {
        throw new Error("already_accepted");
      }
      const offerExpiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + (2 * 60 * 1000));
      pendingOffer = {
        offerId: uid,
        rideId: rideRef.id,
        driverId: uid,
        driverName,
        driverPhone,
        driverProfileImage: driverPhoto,
        driverRating: Number(driver.rating || 0),
        requestedVehicleType,
        driverVehicleType: vehicleType,
        driverVehicleName: driverVehicle,
        driverVehicleNumber: vehicleNumber,
        vehicleType,
        vehicleName: driverVehicle,
        vehicleNumber,
        passengerOffer: fare,
        offeredFare: fare,
        offerType: "accepted_passenger_offer",
        status: "pending",
        createdAt: existingOfferSnap.exists && (existingOfferSnap.data() || {}).createdAt ? (existingOfferSnap.data() || {}).createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: offerExpiresAt
      };
      transaction.set(offerRef, pendingOffer, { merge: true });
      transaction.update(rideRef, {
        driverResponseStatus: "pending",
        driverDecision: "accepted",
        passengerDecision: "pending",
        respondingDriverId: uid,
        respondingDriverUid: uid,
        respondingDriverName: driverName,
        respondingDriverPhone: driverPhone,
        respondingDriverProfileImage: driverPhoto,
        respondingDriverVehicleType: vehicleType,
        respondingDriverVehicleName: driverVehicle,
        respondingDriverVehicleNumber: vehicleNumber,
        driverOffer: fare,
        acceptedFare: fare,
        latestOfferId: uid,
        latestOfferType: "accepted_passenger_offer",
        latestOfferStatus: "pending",
        driverResponseAt: FieldValue.serverTimestamp(),
        driverResponseExpiresAt: offerExpiresAt,
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    driverOfferStatusByRide.set(String(ride.id), { id: uid, ...(pendingOffer || {}), status: "pending" });
    if (note) note.textContent = "Waiting for passenger response...";
    showRideInfoModal("Offer sent", "Waiting for passenger response.");
    renderDriverRequestCards();
  } catch (error) {
    if (String(error?.message || "").includes("already_accepted")) {
      driverRequestDocs.delete(String(ride.id));
      renderDriverRequestCards();
      showRideInfoModal("Ride Unavailable", "This ride has already been accepted by another driver.");
    } else if (String(error?.message || "").includes("request_expired")) {
      driverRequestDocs.delete(String(ride.id));
      renderDriverRequestCards();
      showRideInfoModal("Request Expired", "This passenger request is no longer available.");
    } else if (note) {
      note.textContent = "Unable to accept. Please try again.";
      setRequestCardBusy(card, false);
    }
  }
}

async function declineDriverRequest(card, ride) {
  setRequestCardBusy(card, true);
  try {
    const { db, uid, FieldValue } = await window.WowFirestore.ready();
    await db.collection("rides").doc(ride.id).set({
      declinedDriverIds: FieldValue.arrayUnion(uid),
      lastRejectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    card.remove();
  } catch {
    const note = card.querySelector(".request-note");
    if (note) note.textContent = "Unable to decline right now.";
    setRequestCardBusy(card, false);
  }
}

function setRequestCardBusy(card, busy) {
  const acceptButton = card.querySelector('[data-action="accept"]');
  if (acceptButton) {
    if (busy) {
      if (!acceptButton.dataset.originalText) acceptButton.dataset.originalText = acceptButton.textContent || "Accept Ride";
      acceptButton.textContent = "Accepting...";
    } else {
      acceptButton.textContent = acceptButton.dataset.originalText || "Accept Ride";
      delete acceptButton.dataset.originalText;
    }
  }
  card.querySelectorAll("button, input").forEach((el) => {
    el.disabled = busy;
  });
}

function firestoreMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRideType(type) {
  const text = String(type || "").toLowerCase();
  if (text.includes("bike")) return "WOW Bike";
  if (text.includes("scooty")) return "WOW Scooty";
  return "WOW Car";
}

function isApprovedDriverProfile(profile) {
  const row = profile && typeof profile === "object" ? profile : {};
  const role = String(row.role || "").trim().toLowerCase();
  const verificationStatus = String(row.verificationStatus || row.accountStatus || "").trim().toLowerCase();
  const gender = String(row.gender || "").trim().toLowerCase();
  const isSuspended = row.isSuspended === true || String(row.accountStatus || "").toLowerCase() === "suspended";
  return role === "driver"
    && ["approved", "verified", "active"].includes(verificationStatus)
    && row.isApproved !== false
    && !isSuspended
    && (!gender || gender === "female");
}

function buildRideMap(element, isFull) {
  ridePickup = localStorage.getItem("wow_ride_pickup") || "Pickup";
  rideDrop = localStorage.getItem("wow_ride_drop") || "Destination";
  const pickupPoint = readSavedLatLng("pickup");
  const dropPoint = readSavedLatLng("drop");
  if (!rideDriverAnchor) rideDriverAnchor = readSavedLatLng("driver");
  const origin = rideDriverAnchor || (ridePhase === "toDrop" ? pickupPoint : null);
  const destination = ridePhase === "toDrop" ? dropPoint : pickupPoint;

  const map = WowMapbox.createMap(element, { center: origin || destination || WowMapbox.center, zoom: 15 });
  if (!map) return null;
  map.on("dragstart", () => { driverFollowMode = false; driverMapUserInteracted = true; updateFollowControl(); });
  map.on("zoomstart", (event) => {
    if (event?.originalEvent) { driverFollowMode = false; driverMapUserInteracted = true; updateFollowControl(); }
  });
  map.on("error", () => setDriverTrackingText("driverRideTrackingStatus", "Map tiles are reconnecting. Your ride remains active."));
  if (!origin || !destination) {
    setDriverTrackingText("driverRideTrackingStatus", "Ride coordinates are missing. Select valid pickup and destination coordinates.");
    return map;
  }
  drawDriverRideRoute(map, isFull, origin, destination, pickupPoint, dropPoint);
  return map;
}

function createMarker(map, position, color, label) {
  const isPickup = label === "P";
  const markers = driverStaticMarkersByMap.get(map) || { pickup: null, drop: null };
  const marker = isPickup ? markers.pickup : markers.drop;
  if (marker) {
    WowMapbox.setMarkerPoint(marker, position);
    return marker;
  }
  const created = WowMapbox.createLabelMarker(map, position, color, label, {
    size: 24,
    title: isPickup ? "Pickup location" : "Destination",
    popupText: isPickup ? (ridePickup || "Pickup location") : (rideDrop || "Destination")
  });
  if (isPickup) markers.pickup = created;
  else markers.drop = created;
  driverStaticMarkersByMap.set(map, markers);
  return created;
}

async function drawDriverRideRoute(map, isFull, origin, destination, pickupPoint, dropPoint) {
  const requestToken = ++driverRouteRequestToken;
  const layerId = isFull ? "driver-ride-active-route-full" : "driver-ride-active-route";
  WowMapbox.clearRoute(map, layerId);
  try {
    const route = await WowMapbox.directions(origin, destination);
    if (requestToken !== driverRouteRequestToken && !isFull) return;
    WowMapbox.drawRoute(map, layerId, route.coordinates, "#6c2bd9", 6);
    if (ridePhase === "toDrop" && dropPoint) createMarker(map, dropPoint, "#f06aa5", "D");
    if (ridePhase !== "toDrop" && pickupPoint) createMarker(map, pickupPoint, "#25c38b", "P");
    rideTotalDistance = route.distanceMeters;
    rideTotalDuration = route.durationSeconds;
    ridePath = route.path;
    rideStep = 0;
    fitDriverBounds(map, origin, destination);
    if (!isFull) startRideTracking(map);
  } catch (error) {
    ridePath = [];
    rideTotalDistance = 0;
    rideTotalDuration = 0;
    if (ridePhase === "toDrop" && dropPoint) createMarker(map, dropPoint, "#f06aa5", "D");
    if (ridePhase !== "toDrop" && pickupPoint) createMarker(map, pickupPoint, "#25c38b", "P");
    WowMapbox.clearRoute(map, layerId);
    fitDriverBounds(map, origin, destination);
    console.error("[WOW Driver Ride] route failed", error);
    setDriverTrackingText("driverDistance", "Recalculating...");
    setDriverTrackingText("driverRideTrackingStatus", "Route is being recalculated.");
    if (!isFull) startRideTracking(map);
  }
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
  const cancelCompleteBtn = document.getElementById("cancelCompleteBtn");
  const confirmCompleteBtn = document.getElementById("confirmCompleteBtn");
  const closeCompleteSuccessBtn = document.getElementById("closeCompleteSuccessBtn");
  const rideInfoOkBtn = document.getElementById("rideInfoOkBtn");
  const closeStartBtn = document.getElementById("closeStartBtn");
  const viewMapBtn = document.getElementById("driverViewMap");
  const openNavBtn = document.getElementById("driverOpenNav");
  const closeMapBtn = document.getElementById("closeMap");
  const sosBtn = document.getElementById("driverRideSosBtn");

  if (chatBtn) chatBtn.addEventListener("click", () => {
    if (!hasMatchedRideContext()) return showRideInfoModal("Chat unavailable", "This ride is not active.");
    toggleChatPanel(true);
  });
  if (helpBtn) helpBtn.addEventListener("click", () => location.href = "driver-help.html");
  if (callBtn) callBtn.addEventListener("click", () => {
    if (!hasMatchedRideContext()) return showRideInfoModal("Call unavailable", "This ride is not active.");
    const passenger = localStorage.getItem("wow_ride_passenger") || "the assigned passenger";
    if (!window.confirm(`Start a secure in-app call with ${passenger}?`)) return;
    toggleCallPanel(true);
  });

  if (cancelBtn) cancelBtn.addEventListener("click", () => toggleCancelModal(true));
  if (keepRideBtn) keepRideBtn.addEventListener("click", () => toggleCancelModal(false));
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", cancelDriverRide);
  }

  if (startRideBtn) startRideBtn.addEventListener("click", markArrivedAtPickup);
  if (completeRideBtn) completeRideBtn.addEventListener("click", completeRide);
  if (cancelCompleteBtn) cancelCompleteBtn.addEventListener("click", () => toggleCompleteConfirmModal(false));
  if (confirmCompleteBtn) confirmCompleteBtn.addEventListener("click", executeCompleteRide);
  if (closeCompleteSuccessBtn) closeCompleteSuccessBtn.addEventListener("click", closeCompleteSuccessAndExit);
  if (rideInfoOkBtn) rideInfoOkBtn.addEventListener("click", () => toggleRideInfoModal(false));
  if (closeStartBtn) closeStartBtn.addEventListener("click", () => toggleStartModal(false));

  if (viewMapBtn) viewMapBtn.addEventListener("click", openMapModal);
  if (openNavBtn) openNavBtn.addEventListener("click", openExternalNavigation);
  if (closeMapBtn) closeMapBtn.addEventListener("click", closeMapModal);
  if (sosBtn) sosBtn.addEventListener("click", sendDriverSosAlert);

  document.getElementById("cancelOverlay").addEventListener("click", () => toggleCancelModal(false));
  document.getElementById("startOverlay").addEventListener("click", () => toggleStartModal(false));
  document.getElementById("completeConfirmOverlay").addEventListener("click", () => toggleCompleteConfirmModal(false));
  document.getElementById("completeSuccessOverlay").addEventListener("click", closeCompleteSuccessAndExit);
  document.getElementById("rideInfoOverlay").addEventListener("click", () => toggleRideInfoModal(false));
  document.getElementById("mapOverlay").addEventListener("click", closeMapModal);
  document.getElementById("closeChat").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("chatOverlay").addEventListener("click", () => toggleChatPanel(false));
  document.getElementById("closeCall").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("callOverlay").addEventListener("click", () => toggleCallPanel(false));
  document.getElementById("endCallBtn").addEventListener("click", () => { window.WowRideCall?.end().catch(() => {}); toggleCallPanel(false); });
  document.getElementById("answerCallBtn")?.addEventListener("click", async () => { try { showDriverCallState("connecting"); await WowRideCall.answer(); } catch (e) { alert(e.message); } });
  document.getElementById("declineCallBtn")?.addEventListener("click", () => { WowRideCall.decline().catch(() => {}); toggleCallPanel(false); });
  document.getElementById("muteCallBtn")?.addEventListener("click", () => { driverCallMuted=!driverCallMuted;WowRideCall.mute(driverCallMuted);const button=document.getElementById("muteCallBtn");button?.setAttribute("aria-pressed",String(driverCallMuted));const label=button?.querySelector("span:last-child");if(label)label.textContent=driverCallMuted?"Unmute":"Mute"; });
  document.getElementById("speakerCallBtn")?.addEventListener("click", () => { const button=document.getElementById("speakerCallBtn");const enabled=button?.getAttribute("aria-pressed")!=="true";WowRideCall.speaker(enabled);button?.setAttribute("aria-pressed",String(enabled)); });

  document.getElementById("sendChat").addEventListener("click", sendChatMessage);
  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
  });
  document.getElementById("chatInput").addEventListener("input", () => {
    const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    if (rideId && window.WowRideChat) WowRideChat.typing(rideId, Boolean(document.getElementById("chatInput").value.trim())).catch(() => {});
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

async function cancelDriverRide() {
  const btn = document.getElementById("confirmCancelBtn");
  const rideCode = localStorage.getItem("wow_ride_code") || "";
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId || !window.WowFirestore) {
    toggleCancelModal(false);
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Cancelling...";
  }
  try {
    const { db, uid, FieldValue } = await window.WowFirestore.ready();
    const rideRef = db.collection("rides").doc(rideId);
    const driverRef = db.collection("drivers").doc(String(uid || ""));
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rideRef);
      const driverSnapshot = await transaction.get(driverRef);
      if (!snapshot.exists) throw new Error("Ride no longer exists.");
      const ride = snapshot.data() || {};
      if (String(ride.assignedDriverId || "") !== String(uid || "")) throw new Error("Only the assigned driver can cancel this ride.");
      if (["completed", "cancelled"].includes(String(ride.status || ""))) throw new Error("This ride is already closed.");
      const driver = driverSnapshot.exists ? (driverSnapshot.data() || {}) : {};
      const currentRideId = String(driver.currentRideId || "").trim();
      transaction.update(rideRef, {
        status: "cancelled",
        requestStatus: "closed",
        cancelledBy: "driver",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      if (driverSnapshot.exists && (!currentRideId || currentRideId === rideRef.id)) {
        const isOnline = driver.isOnline === true;
        transaction.set(driverRef, {
          currentRideId: null,
          isAvailable: isOnline,
          status: isOnline ? "online" : "offline",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });
    localStorage.setItem("wow_ride_status", "cancelled");
    localStorage.removeItem("wow_ride_started");
    localStorage.removeItem("wow_ride_started_at");
    markLiveRequestStatus(rideCode, "cancelled");
    stopTripTimer();
    stopDriverLocationTracking();
    if (window.WowRealtime && typeof window.WowRealtime.publish === "function") {
      window.WowRealtime.publish("ride.status", {
        rideCode,
        status: "cancelled"
      });
    }
    toggleCancelModal(false);
    window.location.href = "driver-dashboard.html";
    return;
  } catch (error) {
    console.error("[WOW Driver Ride] cancellation failed", error);
    showRideInfoModal("Unable to Cancel", error?.message || "Please try again.");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Yes, Cancel";
  }
}

function syncRidePhaseFromStorage() {
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  let started = isRideStartedStatus(status);
  if (!started && localStorage.getItem("wow_ride_started") === "1") {
    started = isRideInProgressFromLiveRequests();
    if (!started) localStorage.removeItem("wow_ride_started");
  }
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
    return isRideStartedStatus(status);
  } catch {
    return false;
  }
}

function driverScheduledRideMillis() {
  const source = localStorage.getItem("wow_ride_scheduled_at") || localStorage.getItem("wow_ride_scheduled_datetime");
  if (!source) {
    const date = localStorage.getItem("wow_ride_scheduled_date");
    if (!date) return 0;
    const parsed = new Date(`${date}T${localStorage.getItem("wow_ride_scheduled_time") || "23:59"}`).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = new Date(source).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function updateRideActionState() {
  const startRideBtn = document.getElementById("driverStartRide");
  const completeRideBtn = document.getElementById("driverCompleteRide");
  const navigateBtn = document.getElementById("driverOpenNav");
  const status = String(localStorage.getItem("wow_ride_status") || "accepted").toLowerCase();
  const started = isRideStartedStatus(status);
  const scheduledAt = driverScheduledRideMillis();
  const tooEarly = status === "arrived" && scheduledAt > Date.now();
  const canComplete = hasActiveRideContext();
  if (startRideBtn) {
    startRideBtn.disabled = started || tooEarly;
    startRideBtn.textContent = tooEarly ? "Waiting for scheduled time" : status === "arrived" ? "Start Ride" : "Mark Arrived";
    startRideBtn.hidden = started || status === "completed" || status === "cancelled";
    if (tooEarly) {
      startRideBtn.title = `This ride can start at ${new Date(scheduledAt).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
    } else {
      startRideBtn.removeAttribute("title");
    }
  }
  if (completeRideBtn) {
    completeRideBtn.disabled = !canComplete || !started;
    completeRideBtn.hidden = !started || status === "completed" || status === "cancelled";
  }
  if (navigateBtn) navigateBtn.hidden = started || status === "completed" || status === "cancelled";
  const statusEl = document.getElementById("driverRideStatus");
  if (statusEl) {
    if (started) statusEl.textContent = "Trip Started / On Trip";
    else if (status === "arrived") statusEl.textContent = "Driver arrived";
    else if (isDriverArrivingStatus(status)) statusEl.textContent = "Driver is on the way";
    else if (status === "completed") statusEl.textContent = "Trip completed";
    else statusEl.textContent = "Trip accepted";
  }
  syncTripTimerState();
  updateTripHeaderMeta();
}

async function markArrivedAtPickup() {
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId || !window.WowLiveTracking) return;
  if (driverStartPending) return;
  const currentStatus = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  const scheduledAt = driverScheduledRideMillis();
  if (currentStatus === "arrived" && scheduledAt > Date.now()) {
    showRideInfoModal("Ride cannot start yet", `This scheduled ride can start at ${new Date(scheduledAt).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`);
    updateRideActionState();
    return;
  }
  driverStartPending = true;
  const startRideBtn = document.getElementById("driverStartRide");
  if (startRideBtn) {
    startRideBtn.disabled = true;
    startRideBtn.textContent = "Updating...";
  }
  try {
    const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
    if (status === "arrived") {
      await WowLiveTracking.startRide(rideId);
      localStorage.setItem("wow_ride_status", "started");
      localStorage.setItem("wow_ride_started", "1");
      localStorage.setItem("wow_ride_started_at", String(Date.now()));
      ridePhase = "toDrop";
    } else {
      await WowLiveTracking.arriveRide(rideId);
      localStorage.setItem("wow_ride_status", "arrived");
      localStorage.removeItem("wow_ride_started");
      localStorage.removeItem("wow_ride_started_at");
      ridePhase = "toPickup";
    }
    updateRideActionState();
    setDriverRideDetails();
    driverStartPending = false;
    return;
  } catch (error) {
    showRideInfoModal("Unable to Start", error?.message || "Please try again.");
  }
  if (startRideBtn) {
    startRideBtn.disabled = false;
    startRideBtn.textContent = String(localStorage.getItem("wow_ride_status") || "") === "arrived" ? "Start Ride" : "Mark Arrived";
  }
  driverStartPending = false;
}

async function completeRide() {
  if (!hasActiveRideContext()) {
    showRideInfoModal("No Active Ride", "No active ride found. Please accept and start a ride first.");
    updateRideActionState();
    return;
  }
  const passengerEl = document.getElementById("completePassengerName");
  const fareEl = document.getElementById("completeFareAmount");
  if (passengerEl) {
    passengerEl.textContent = localStorage.getItem("wow_ride_passenger") || "Passenger";
  }
  if (fareEl) {
    fareEl.textContent = `Rs. ${Number(localStorage.getItem("wow_ride_fare") || 0)}`;
  }
  toggleCompleteConfirmModal(true);
}

async function executeCompleteRide() {
  if (driverCompletePending) return;
  driverCompletePending = true;
  const completeRideBtn = document.getElementById("driverCompleteRide");
  const confirmCompleteBtn = document.getElementById("confirmCompleteBtn");
  toggleCompleteConfirmModal(false);
  if (completeRideBtn) {
    completeRideBtn.disabled = true;
    completeRideBtn.textContent = "Completing...";
  }
  if (confirmCompleteBtn) {
    confirmCompleteBtn.disabled = true;
    confirmCompleteBtn.textContent = "Completing...";
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
    vehicle_type: localStorage.getItem("wow_ride_requested_vehicle") || "",
    traffic_level: localStorage.getItem("wow_ride_traffic_level") || "medium",
    time_of_day: localStorage.getItem("wow_ride_time_of_day") || "day",
    fare,
    user_id: Number(localStorage.getItem("wow_user_id") || 0),
    email: localStorage.getItem("wow_user_email") || "",
    role: (localStorage.getItem("wow_user_role") || "driver").toLowerCase()
  };

  // This is a legacy analytics sync and must not delay the driver's primary
  // Firestore completion action.
  const fareSyncPromise = fetch(FARE_API.saveData, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch((error) => {
    console.warn("[WOW Driver Ride] fare history sync deferred", error);
  });

  let completedSynced = false;
  try {
    const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    await WowLiveTracking.completeRide(rideId);
    completedSynced = true;
  } catch (error) {
    console.error("[WOW Driver Ride] Firestore completion failed", error);
  }
  if (!completedSynced) {
    showRideInfoModal("Completion Failed", "Ride cannot be completed yet. Ensure the passenger has started the ride and try again.");
    if (completeRideBtn) {
      completeRideBtn.disabled = false;
      completeRideBtn.textContent = "End Trip";
    }
    if (confirmCompleteBtn) {
      confirmCompleteBtn.disabled = false;
      confirmCompleteBtn.textContent = "Confirm";
    }
    driverCompletePending = false;
    return;
  }

  markLiveRequestCompleted(rideCode);
  localStorage.setItem("wow_ride_status", "completed");
  const completedRideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  localStorage.removeItem("wow_ride_started");
  localStorage.removeItem("wow_ride_started_at");
  ridePhase = "toPickup";
  stopTripTimer();
  stopDriverLocationTracking();
  showRideCompleteSuccess();
  if (confirmCompleteBtn) {
    confirmCompleteBtn.disabled = false;
    confirmCompleteBtn.textContent = "Confirm";
  }
  driverCompletePending = false;

  // The ride is already complete at this point. Run secondary PHP and payment
  // record synchronization together so slow endpoints do not hold the button.
  const legacyStatusPromise = fetch(RIDE_API.updateStatus, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      ride_code: rideCode,
      status: "completed"
    })
  }).catch((error) => {
    console.warn("[WOW Driver Ride] legacy ride status sync deferred", error);
  });

  const paymentSetupPromise = window.WowDemoPayment.prepareCompletion(completedRideId)
    .then((record) => {
      driverPaymentRecord = record;
      showRideCompleteSuccess();
    })
    .catch((error) => {
      console.error("[WOW Driver Ride] payment preparation failed", error);
    });

  void Promise.allSettled([fareSyncPromise, legacyStatusPromise, paymentSetupPromise]);
}

function markLiveRequestStatus(rideCode, status) {
  if (!rideCode) return;
  const key = "wow_live_ride_requests";
  try {
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) return;
    const idx = rows.findIndex((row) => String(row.rideCode || "") === String(rideCode));
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        status,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(rows));
    }
  } catch {
    // Ignore storage parse errors.
  }
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
  const lastSent = Number(sessionStorage.getItem("wow_driver_sos_sent_at") || 0);
  if (Date.now() - lastSent < 10000) return;
  if (!window.confirm("Send your active ride and location to the Women on Wheels admin safety team?")) return;
  if (!window.confirm("Final confirmation: send Emergency SOS now?")) return;
  // Do not make the emergency alert wait for a slow GPS fix. Firestore live
  // tracking remains the authoritative fallback for the driver's coordinates.
  const location = await Promise.race([
    currentLocationText(),
    new Promise((resolve) => window.setTimeout(() => resolve(cachedDriverSosLocationText()), 700))
  ]);
  const payload = {
    ...currentUserPayload(),
    role: "driver",
    ride_id: rideId,
    pickup,
    drop,
    location
  };
  try {
    let sent = false;
    for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
      try { await createDriverFirestoreSos(location); sent = true; }
      catch (error) { if (attempt === 1) throw error; }
    }
    sessionStorage.setItem("wow_driver_sos_sent_at", String(Date.now()));
    alert("Emergency SOS sent to the admin safety team.");
  } catch (error) {
    console.error("[WOW Driver SOS] Firestore alert failed", error);
    alert(error?.message || "Unable to send SOS right now.");
  }
}

async function createDriverFirestoreSos(locationText) {
  if (!window.WowFirestore) throw new Error("Firebase is unavailable.");
  const { db, uid, FieldValue } = await window.WowFirestore.ready();
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId || !uid) throw new Error("An authenticated active ride is required.");
  const rideRef = db.collection("rides").doc(rideId);
  const rideSnapshot = await rideRef.get();
  if (!rideSnapshot.exists) throw new Error("The active ride could not be found.");
  const ride = rideSnapshot.data() || {};
  if (String(ride.assignedDriverId || "") !== String(uid)) {
    throw new Error("Only the assigned driver can send this alert.");
  }
  if (!["driver_assigned", "accepted", "driver_en_route", "driver_arriving", "arriving", "arrived", "started", "ride_started", "in_progress", "active", "ongoing", "on_trip"].includes(String(ride.status || "").toLowerCase())) {
    throw new Error("SOS is available during an active assigned ride.");
  }
  const coordinates = String(locationText || "").match(/Lat\s+(-?\d+(?:\.\d+)?),\s*Lng\s+(-?\d+(?:\.\d+)?)/i);
  let latitude = coordinates ? Number(coordinates[1]) : null;
  let longitude = coordinates ? Number(coordinates[2]) : null;
  if (latitude == null || longitude == null) {
    try {
      const liveSnapshot = await rideRef.collection("liveLocations").doc("driver").get();
      const live = liveSnapshot.exists ? (liveSnapshot.data() || {}) : {};
      const point = live.location || ride.driver_location || ride.driverLocation || {};
      latitude = Number(live.latitude ?? live.lat ?? point.latitude ?? point.lat ?? ride.driverLatitude);
      longitude = Number(live.longitude ?? live.lng ?? point.longitude ?? point.lng ?? ride.driverLongitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        latitude = null;
        longitude = null;
      }
    } catch (_) {
      latitude = null;
      longitude = null;
    }
  }
  const alertRef = db.collection("sosAlerts").doc();
  const batch = db.batch();
  batch.set(alertRef, {
    alert_id: alertRef.id,
    alertId: alertRef.id,
    user_id: uid,
    reporterUid: uid,
    triggered_by: "driver",
    reporterRole: "driver",
    triggeredByLabel: "DRIVER SOS",
    driverId: uid,
    driverUid: uid,
    driverName: ride.driverName || localStorage.getItem("wow_user_name") || "Driver",
    driverPhone: ride.driverPhone || localStorage.getItem("wow_user_phone") || "",
    passengerId: ride.passengerId || ride.passengerUid || "",
    passengerUid: ride.passengerId || ride.passengerUid || "",
    passengerName: ride.passengerName || localStorage.getItem("wow_ride_passenger") || "Passenger",
    passengerPhone: ride.passengerPhone || localStorage.getItem("wow_ride_passenger_phone") || "",
    rideId,
    ride_id: rideId,
    rideCode: ride.rideCode || localStorage.getItem("wow_ride_code") || rideId,
    carpoolRideId: ride.carpoolRideId || "",
    carpoolBookingId: ride.carpoolBookingId || "",
    isCarpool: ride.isCarpool === true,
    pickupAddress: ride.pickupAddress || ride.pickup || localStorage.getItem("wow_ride_pickup") || "",
    dropoffAddress: ride.dropoffAddress || ride.dropoff || localStorage.getItem("wow_ride_drop") || "",
    currentLatitude: latitude,
    currentLongitude: longitude,
    currentLocation: latitude == null || longitude == null ? null : { lat: latitude, lng: longitude },
    location: latitude == null || longitude == null ? null : new firebase.firestore.GeoPoint(latitude, longitude),
    locationText: String(locationText || "Location unavailable"),
    location_is_stale: latitude == null || longitude == null,
    rideStatus: ride.status || "",
    emergencyMessage: "Emergency SOS triggered by driver",
    status: "active",
    priority: "critical",
    severity: "sos",
    source: "website_driver",
    platform: "website",
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    created_at: FieldValue.serverTimestamp(),
    resolved_at: null,
    resolved_by: null,
    updatedAt: FieldValue.serverTimestamp()
  });
  batch.set(alertRef.collection("activityLog").doc(), { type: "sos_triggered", message: "SOS triggered by driver", actorId: uid, actorRole: "driver", createdAt: FieldValue.serverTimestamp() });
  batch.set(alertRef.collection("activityLog").doc(), { type: "admin_notified", message: "Admin safety dashboard notified in real time", actorRole: "system", createdAt: FieldValue.serverTimestamp() });
  batch.set(rideRef, {
    sosActive: true,
    sosAlertId: alertRef.id,
    safetyStatus: "sos",
    activeEmergencyAlertId: alertRef.id,
    sosTriggeredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
}

function hasActiveRideContext() {
  const rideId = localStorage.getItem("wow_ride_code") || "";
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  return Boolean(rideId && pickup && drop && ["driver_assigned", "accepted", "driver_en_route", "driver_arriving", "arriving", "arrived", "started", "ride_started", "in_progress", "active", "ongoing", "on_trip"].includes(status));
}

function hasMatchedRideContext() {
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  return Boolean(rideId && !["completed", "cancelled"].includes(status));
}

function syncDriverName() {
  const storedName = localStorage.getItem("wow_user_name") || "";
  const storedEmail = localStorage.getItem("wow_user_email") || "";
  const name = storedName || storedEmail.split("@")[0] || "Driver";
  const driverNameEl = document.getElementById("driverRideName");
  if (driverNameEl) driverNameEl.textContent = name;
}

function setDriverRideDetails() {
  const pickup = localStorage.getItem("wow_ride_pickup") || "Waiting for pickup details...";
  const drop = localStorage.getItem("wow_ride_drop") || "Waiting for destination details...";
  const fare = localStorage.getItem("wow_ride_fare") || "";
  const fareNumber = Number(fare || 0);
  const earningPreview = window.WowFinancial?.split(fareNumber, 0.30).driverEarning ?? Math.max(0, Math.round(fareNumber * 0.70));
  const paymentMethod = localStorage.getItem("wow_ride_payment_label") || (localStorage.getItem("wow_ride_payment_method") === "cash" ? "Cash" : "Online");
  const passenger = localStorage.getItem("wow_ride_passenger") || "Passenger";
  const passengerPhone = localStorage.getItem("wow_ride_passenger_phone") || "Not available";
  const rideCode = localStorage.getItem("wow_ride_code") || "--";
  const status = String(localStorage.getItem("wow_ride_status") || "accepted").toLowerCase();
  const avatar = passenger.trim().charAt(0).toUpperCase() || "P";

  const pickupEl = document.getElementById("driverPickupText");
  const dropEl = document.getElementById("driverDropText");
  const fareEl = document.getElementById("driverFareText");
  const paymentEl = document.getElementById("driverPaymentType");
  const earningEl = document.getElementById("driverEarningText");
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
  const subEl = document.querySelector(".driver-sub");
  const requestedVehicleEl = document.getElementById("driverRequestedVehicle");
  const assignedVehicleEl = document.getElementById("driverAssignedVehicle");

  if (pickupEl) pickupEl.textContent = pickup;
  if (dropEl) dropEl.textContent = drop;
  if (fareEl) fareEl.textContent = fare ? `Rs. ${Number(fare)}` : "--";
  if (earningEl) earningEl.textContent = `Rs. ${earningPreview}`;
  if (paymentEl) paymentEl.textContent = paymentMethod;
  if (wowCodeEl) wowCodeEl.textContent = rideCode;
  if (passengerEl) passengerEl.textContent = passenger;
  if (passengerPhoneEl) passengerPhoneEl.textContent = "Private in-app contact";
  if (rideCodeEl) rideCodeEl.textContent = rideCode;
  if (avatarEl) avatarEl.textContent = avatar;
  if (chatPassengerEl) chatPassengerEl.textContent = passenger;
  if (chatRideCodeEl) chatRideCodeEl.textContent = "Passenger Online";
  if (chatPickupEl) chatPickupEl.textContent = pickup;
  if (chatDropEl) chatDropEl.textContent = drop;
  if (chatRideStatusEl) chatRideStatusEl.textContent = status.replace("_", " ");
  if (chatAvatarEl) chatAvatarEl.textContent = avatar;
  if (subEl) subEl.textContent = `${shortAddress(pickup)} -> ${shortAddress(drop)}`;
  if (requestedVehicleEl) requestedVehicleEl.textContent = window.WowVehicle?.label(localStorage.getItem("wow_ride_requested_vehicle")) || "Vehicle information unavailable";
  if (assignedVehicleEl) {
    const details = [
      window.WowVehicle?.label(localStorage.getItem("wow_ride_driver_vehicle_type")),
      localStorage.getItem("wow_ride_driver_vehicle_name") || "",
      localStorage.getItem("wow_ride_driver_vehicle_number") || ""
    ].filter((value) => value && value !== "Vehicle information unavailable");
    assignedVehicleEl.textContent = details.join(" · ") || "Vehicle information unavailable";
  }
  updateTripHeaderMeta();
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
    if (ride.scheduled_at) localStorage.setItem("wow_ride_scheduled_at", String(ride.scheduled_at));
    if (ride.scheduled_date) localStorage.setItem("wow_ride_scheduled_date", String(ride.scheduled_date));
    if (ride.scheduled_time) localStorage.setItem("wow_ride_scheduled_time", String(ride.scheduled_time));
    const firestoreRideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    if (ride.status && !firestoreRideId) {
      localStorage.setItem("wow_ride_status", String(ride.status));
    }
    const effectiveStatus = firestoreRideId
      ? localStorage.getItem("wow_ride_status") || ""
      : ride.status;
    const prevPhase = ridePhase;
    if (isRideStartedStatus(effectiveStatus)) {
      ridePhase = "toDrop";
      localStorage.setItem("wow_ride_started", "1");
      if (!localStorage.getItem("wow_ride_started_at")) {
        localStorage.setItem("wow_ride_started_at", String(Date.now()));
      }
    } else {
      ridePhase = "toPickup";
      localStorage.removeItem("wow_ride_started");
      localStorage.removeItem("wow_ride_started_at");
    }
    setDriverRideDetails();
    updateRideActionState();
    if (prevPhase !== ridePhase) refreshDriverRideMaps();
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

function toggleCompleteConfirmModal(open) {
  const overlay = document.getElementById("completeConfirmOverlay");
  const modal = document.getElementById("completeConfirmModal");
  if (!overlay || !modal) return;
  if (open) {
    overlay.classList.add("is-open");
    modal.classList.add("is-open");
  } else {
    overlay.classList.remove("is-open");
    modal.classList.remove("is-open");
  }
}

function showRideCompleteSuccess() {
  const overlay = document.getElementById("completeSuccessOverlay");
  const modal = document.getElementById("completeSuccessModal");
  const msg = document.getElementById("completeSuccessMessage");
  const fare = Number(localStorage.getItem("wow_ride_fare") || 0);
  if (msg) {
    const method = driverPaymentMethodLabel(driverPaymentRecord?.paymentMethod || localStorage.getItem("wow_ride_payment_method"));
    msg.textContent = method === "Cash"
      ? `Final fare: PKR ${fare}. Collect the cash and confirm receipt before rating is unlocked.`
      : `Final fare: PKR ${fare}. Waiting for the passenger's ${method} payment before rating is unlocked.`;
  }
  const closeButton = document.getElementById("closeCompleteSuccessBtn");
  if (closeButton) closeButton.textContent = driverPaymentRecord?.paymentMethod === "cash" ? "View Cash Confirmation" : "View Payment Status";
  if (overlay) overlay.classList.add("is-open");
  if (modal) modal.classList.add("is-open");
}

function closeCompleteSuccessAndExit() {
  const overlay = document.getElementById("completeSuccessOverlay");
  const modal = document.getElementById("completeSuccessModal");
  if (overlay) overlay.classList.remove("is-open");
  if (modal) modal.classList.remove("is-open");
  const paid = window.WowFinancial?.isPaymentSuccessful(driverPaymentRecord?.paymentStatus) === true;
  if (paid) {
    window.location.href = "driver-dashboard.html";
    return;
  }
  document.querySelector(".wow-payment-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showRideInfoModal(title, message) {
  const t = document.getElementById("rideInfoTitle");
  const m = document.getElementById("rideInfoMessage");
  if (t) t.textContent = title || "Ride Update";
  if (m) m.textContent = message || "Please continue.";
  toggleRideInfoModal(true);
}

function toggleRideInfoModal(open) {
  const overlay = document.getElementById("rideInfoOverlay");
  const modal = document.getElementById("rideInfoModal");
  if (!overlay || !modal) return;
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
    if (mapEl && window.WowMapbox) {
      rideMapFull = buildRideMap(mapEl, true);
    }
  } else if (rideBounds) {
    rideMapFull.resize();
    if (!driverMapUserInteracted) WowMapbox.fitMap(rideMapFull, rideBounds, 48);
  }
  if (rideMapFull) {
    driverRideLiveTracker?.attachMap?.("driver-full", rideMapFull, { routeLayerId: "driver-ride-active-route-full" });
    driverRideLiveTracker?.setFollow?.(true, "driver-full");
  }
}

function closeMapModal() {
  const overlay = document.getElementById("mapOverlay");
  const modal = document.getElementById("mapModal");
  overlay.classList.remove("is-open");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  driverRideLiveTracker?.detachMap?.("driver-full");
}

function toggleChatPanel(open) {
  const overlay = document.getElementById("chatOverlay");
  const panel = document.getElementById("chatPanel");
  if (open) {
    window.WowRideChat?.requestNotifications?.();
    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    fetchRideChat(false);
    updateDriverChatUnread(0);
    const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    if (rideId) window.WowRideChat?.markRead(rideId).catch(() => {});
    startRideChatPolling();
    document.getElementById("chatInput").focus();
  } else {
    const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
    if (rideId) window.WowRideChat?.typing(rideId, false).catch(() => {});
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
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
      try { await initDriverLiveCall(localStorage.getItem("wow_ride_db_id"));showDriverCallState("calling");await WowRideCall.start(); }
      catch(error){showDriverCallState("failed");showRideInfoModal("Call unavailable",error.message||"Unable to start in-app call.");}
    }
  } else {
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    stopCallTimer();
  }
}
async function initDriverLiveCall(rideId){if(!rideId||!window.WowRideCall||driverCallReady)return;await WowRideCall.init({rideId:String(rideId),role:"driver",platform:"driver_website",onIncoming:()=>{toggleCallPanel(true,true);showDriverCallState("ringing",true);},onState:(status,data)=>showDriverCallState(status,status==="ringing"&&data?.receiverRole==="driver")});driverCallReady=true;}
function showDriverCallState(status,incoming=false){const node=document.getElementById("callStatus"),answer=document.getElementById("answerCallBtn"),decline=document.getElementById("declineCallBtn"),mute=document.getElementById("muteCallBtn"),speaker=document.getElementById("speakerCallBtn"),end=document.getElementById("endCallBtn"),active=status==="active",terminal=["ended","declined","missed","cancelled","failed"].includes(status);if(node)node.textContent=incoming?"Incoming call":status==="ringing"?"Ringing...":status==="accepted"||status==="connecting"?"Connecting...":active?"Connected":status==="reconnecting"?"Reconnecting...":terminal?"Call Ended":"Calling...";if(answer)answer.hidden=!incoming;if(decline)decline.hidden=!incoming;if(mute)mute.hidden=!active;if(speaker)speaker.hidden=terminal;if(end)end.hidden=incoming||terminal;if(active)startCallTimer();if(terminal){stopCallTimer();setTimeout(()=>toggleCallPanel(false),450);}}

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
  fetchRideChat(false);
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const button = document.getElementById("sendChat");
  if (button?.disabled) return;
  input.value = "";
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId || !window.WowRideChat) return;
  const pendingRow = appendChatBubble("driver", text, "", "sending");
  if (button) button.disabled = true;
  try {
    await WowRideChat.send({ rideId, message: text });
  } catch (error) {
    pendingRow?.remove();
    console.error("[WOW Driver Ride] Chat send failed", error);
    input.value = text;
    input.title = "Message could not be sent. Press Send to retry.";
  } finally {
    if (button) window.setTimeout(() => { button.disabled = false; }, 500);
  }
}

function appendChatBubble(type, text, at = "", state = "") {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  const row = document.createElement("div");
  row.className = `chat-row ${type}`;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.textContent = text;
  const time = document.createElement("span");
  time.className = "chat-time";
  const receipt = state === "read" ? "✓✓ Seen" : state === "sending" ? "Sending…" : state ? "✓ Sent" : "";
  time.classList.toggle("is-read", state === "read");
  time.textContent = [at || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), receipt].filter(Boolean).join(" · ");
  row.appendChild(bubble);
  row.appendChild(time);
  chatBody.appendChild(row);
  chatBody.scrollTop = chatBody.scrollHeight;
  return row;
}

function renderRideChat(rows) {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;
  chatBody.innerHTML = "";
  (rows || []).forEach((msg) => {
    const role = String(msg.senderRole || msg.role || "").toLowerCase() === "driver" ? "driver" : "passenger";
    const timestamp = msg.timestamp || msg.sentAt || msg.createdAt;
    const date = timestamp?.toDate ? timestamp.toDate() : null;
    const at = date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const state = role === "driver" ? String(msg.deliveryStatus || (msg.isRead ? "read" : "sent")) : "";
    appendChatBubble(role, String(msg.messageText || msg.message || msg.text || ""), at, state);
  });
}

function startRideChatPolling() {
  stopRideChatPolling();
  fetchRideChat(false);
}

function stopRideChatPolling() {
  if (rideChatUnsubscribe) {
    rideChatUnsubscribe();
    rideChatUnsubscribe = null;
  }
}

async function fetchRideChat(incremental = true) {
  void incremental;
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId || !window.WowRideChat || rideChatUnsubscribe) return;
  try {
    rideChatUnsubscribe = await WowRideChat.listen({
      rideId,
      onMessages: renderRideChat,
      onTyping: (typing, role) => {
        const node = document.querySelector("#chatPanel .chat-status");
        if (node) node.textContent = typing ? `${role} is typing…` : "Passenger Online";
      },
      onUnread: updateDriverChatUnread
    });
  } catch (error) {
    console.error("[WOW Driver Ride] Chat setup failed", error);
  }
}

function updateDriverChatUnread(count) {
  const button = document.getElementById("driverRideChat");
  if (!button) return;
  const unread = document.getElementById("chatPanel")?.classList.contains("is-open") ? 0 : Math.max(0, Number(count) || 0);
  button.classList.toggle("has-unread", unread > 0);
  button.dataset.unread = unread > 9 ? "9+" : String(unread);
  button.setAttribute("aria-label", unread ? `Chat, ${unread} unread messages` : "Chat");
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

function cachedDriverSosLocationText() {
  const candidates = [
    ["wow_driver_live_lat", "wow_driver_live_lng"],
    ["wow_driver_lat", "wow_driver_lng"],
    ["wow_current_lat", "wow_current_lng"]
  ];
  for (const [latKey, lngKey] of candidates) {
    const lat = Number(localStorage.getItem(latKey));
    const lng = Number(localStorage.getItem(lngKey));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`;
    }
  }
  return `Pickup: ${localStorage.getItem("wow_ride_pickup") || "Unknown"} | Drop-off: ${localStorage.getItem("wow_ride_drop") || "Unknown"}`;
}

function startRideTracking(mapInstance) {
  if (!mapInstance || !window.WowMapbox) return;
}

async function initDriverRideLiveTracking() {
  if (driverRideLiveTracker || !window.WowLiveTracking || !rideMap) return;
  const rideId = String(localStorage.getItem("wow_ride_db_id") || "").trim();
  if (!rideId) {
    setDriverTrackingText("driverRideTrackingStatus", "Waiting for a valid ride to start live tracking.");
    return;
  }
  try {
    driverRideLiveTracker = await WowLiveTracking.start({
      role: "driver",
      rideId,
      getMap: () => rideMap,
      routeLayerId: "driver-ride-active-route",
      getDestination: (ride) => {
        const started = isRideStartedStatus(ride?.status);
        return started ? ridePoint(ride, "drop") || readSavedLatLng("drop") : ridePoint(ride, "pickup") || readSavedLatLng("pickup");
      },
      onStatus: (message) => setDriverTrackingText("driverRideTrackingStatus", message),
      onPeerState: (message, stale) => {
        const node = document.getElementById("driverRidePeerStatus");
        if (node) { node.textContent = message; node.classList.toggle("error", Boolean(stale)); }
      },
      onLocation: (role, location) => {
        if (role === "driver") { rideDriverAnchor = location.point; updateRideStats(); }
        if (role === "passenger") {
          setDriverTrackingText("driverRidePeerStatus", "Passenger and your live location are visible on the map.");
        }
      },
      onFollowChange: (enabled) => {
        driverFollowMode = Boolean(enabled);
        if (!enabled) driverMapUserInteracted = true;
        updateFollowControl();
      },
      onRoute: ({ distanceKm, etaMinutes }) => {
        ["driverDistance", "driverDistanceInline"].forEach((id) => setDriverTrackingText(id, `${distanceKm.toFixed(1)} km`));
        ["driverEta", "driverEtaInline"].forEach((id) => setDriverTrackingText(id, `${etaMinutes} min`));
      },
      onRouteError: () => {
        setDriverTrackingText("driverDistance", "Route temporarily unavailable");
        setDriverTrackingText("driverEta", "--");
      },
      onRideStatus: (status, ride) => {
        applyDriverRideSnapshot(ride);
        localStorage.setItem("wow_ride_status", status);
        const nextPhase = isRideStartedStatus(status) ? "toDrop" : "toPickup";
        if (ridePhase !== nextPhase) {
          ridePhase = nextPhase;
          refreshDriverRideMaps();
        }
        if (isRideStartedStatus(status)) syncTripTimerState();
        if (["completed", "cancelled"].includes(status)) stopDriverLocationTracking();
        if (status === "cancelled") {
          showRideInfoModal("Ride Cancelled", "This ride was cancelled.");
          window.setTimeout(() => window.location.replace("driver-dashboard.html"), 1800);
        }
        updateRideActionState();
      }
    });
    const recenter = document.getElementById("driverRideTrackingRecenter");
    if (recenter && !recenter.dataset.bound) {
      recenter.dataset.bound = "1";
      recenter.addEventListener("click", () => driverRideLiveTracker?.recenter());
    }
    bindDriverMapControls();
  } catch (error) {
    setDriverTrackingText("driverRideTrackingStatus", error?.message || "Live tracking could not start.");
  }
}

function applyDriverRideSnapshot(ride) {
  if (!ride || typeof ride !== "object") return;
  if (ride.rideCode) localStorage.setItem("wow_ride_code", String(ride.rideCode));
  if (ride.passengerName) localStorage.setItem("wow_ride_passenger", String(ride.passengerName));
  if (ride.passengerPhone) localStorage.setItem("wow_ride_passenger_phone", String(ride.passengerPhone));
  if (ride.pickupName || ride.pickupAddress) localStorage.setItem("wow_ride_pickup", String(ride.pickupName || ride.pickupAddress));
  if (ride.destinationName || ride.destinationAddress) localStorage.setItem("wow_ride_drop", String(ride.destinationName || ride.destinationAddress));
  cacheRideCoordinates(ride);
  if (ride.finalFare != null || ride.passengerOffer != null) localStorage.setItem("wow_ride_fare", String(Number(ride.finalFare ?? ride.passengerOffer)));
  cacheDriverRideVehicle(ride);
  setDriverRideDetails();
}

function cacheDriverRideVehicle(ride) {
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

function clearDriverRideVehicleCache() {
  ["wow_ride_requested_vehicle", "wow_ride_driver_vehicle_type", "wow_ride_driver_vehicle_name", "wow_ride_driver_vehicle_number"]
    .forEach((key) => localStorage.removeItem(key));
}

function setDriverTrackingText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function updateRideStats() {
  const pickupPoint = readSavedLatLng("pickup");
  const dropPoint = readSavedLatLng("drop");
  const destination = ridePhase === "toDrop" ? dropPoint : pickupPoint;
  const origin = rideDriverAnchor;
  if (!origin || !destination) return;
  const remainingDistance = Math.max(0, haversineMeters(origin, destination));

  const distanceEl = document.getElementById("driverDistance");
  const distanceInlineEl = document.getElementById("driverDistanceInline");
  const etaEl = document.getElementById("driverEta");
  const etaInlineEl = document.getElementById("driverEtaInline");
  const progressEl = document.getElementById("driverProgress");

  if (distanceEl) distanceEl.textContent = `${(remainingDistance / 1000).toFixed(1)} km`;
  if (distanceInlineEl) distanceInlineEl.textContent = `${(remainingDistance / 1000).toFixed(1)} km`;
  if (etaEl && !String(etaEl.textContent || "").includes("min")) etaEl.textContent = "--";
  if (etaInlineEl && !String(etaInlineEl.textContent || "").includes("min")) etaInlineEl.textContent = "--";
  if (progressEl) progressEl.style.width = "0%";
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

function fitDriverBounds(map, ...points) {
  const force = points[points.length - 1] === true;
  if (force) points.pop();
  if (!map || !window.WowMapbox) return;
  if (driverMapUserInteracted && !force) return;
  rideBounds = points.filter(Boolean);
  WowMapbox.fitMap(map, rideBounds, 48);
}

function refreshDriverRideMaps() {
  const pickupPoint = readSavedLatLng("pickup");
  const dropPoint = readSavedLatLng("drop");
  const origin = rideDriverAnchor;
  const destination = ridePhase === "toDrop" ? dropPoint : pickupPoint;
  if (!origin || !destination) {
    setDriverTrackingText("driverRideTrackingStatus", "Waiting for live ride coordinates...");
    return;
  }
  if (rideMap) drawDriverRideRoute(rideMap, false, origin, destination, pickupPoint, dropPoint);
  if (rideMapFull) drawDriverRideRoute(rideMapFull, true, origin, destination, pickupPoint, dropPoint);
  rideMap?.resize?.();
  rideMapFull?.resize?.();
}

function updateTripHeaderMeta() {
  const status = String(localStorage.getItem("wow_ride_status") || "accepted").toLowerCase();
  const rideCode = localStorage.getItem("wow_ride_code") || "--";
  const tripStateEl = document.getElementById("driverTripState");
  const tripRefEl = document.getElementById("driverTripRef");
  const tripModeEl = document.getElementById("driverTripMode");
  if (tripRefEl) tripRefEl.textContent = `Ride ${rideCode}`;
  if (tripModeEl) tripModeEl.textContent = ridePhase === "toDrop" ? "To Drop-off" : "To Pickup";
  if (!tripStateEl) return;
  if (isRideStartedStatus(status)) tripStateEl.textContent = "Trip Started / On Trip";
  else if (status === "arrived") tripStateEl.textContent = "Driver Arrived";
  else if (isDriverArrivingStatus(status)) tripStateEl.textContent = "Driver On The Way";
  else if (status === "completed") tripStateEl.textContent = "Trip Completed";
  else tripStateEl.textContent = "Trip Accepted";
}

function syncTripTimerState() {
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  if (isRideStartedStatus(status)) {
    if (!localStorage.getItem("wow_ride_started_at")) {
      localStorage.setItem("wow_ride_started_at", String(Date.now()));
    }
    startTripTimer();
  } else {
    stopTripTimer();
    renderTripTimer();
  }
}

function startTripTimer() {
  const storedMs = Number(localStorage.getItem("wow_ride_started_at") || 0);
  tripStartedAtMs = Number.isFinite(storedMs) && storedMs > 0 ? storedMs : Date.now();
  renderTripTimer();
  if (tripTimerInterval) return;
  tripTimerInterval = setInterval(renderTripTimer, 1000);
}

function stopTripTimer() {
  if (tripTimerInterval) {
    clearInterval(tripTimerInterval);
    tripTimerInterval = null;
  }
}

function renderTripTimer() {
  const timerEl = document.getElementById("driverTripTimer");
  if (!timerEl) return;
  const status = String(localStorage.getItem("wow_ride_status") || "").toLowerCase();
  if (!isRideStartedStatus(status)) {
    timerEl.textContent = "00:00";
    return;
  }
  if (!tripStartedAtMs) {
    const stored = Number(localStorage.getItem("wow_ride_started_at") || Date.now());
    tripStartedAtMs = Number.isFinite(stored) ? stored : Date.now();
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - tripStartedAtMs) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  timerEl.textContent = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stopDriverLocationTracking() {
  if (driverGeoWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(driverGeoWatchId);
    driverGeoWatchId = null;
  }
  if (rideTicker) {
    clearInterval(rideTicker);
    rideTicker = null;
  }
  if (driverFallbackTicker) {
    clearInterval(driverFallbackTicker);
    driverFallbackTicker = null;
  }
}

function haversineMeters(from, to) {
  if (!from || !to) return 0;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const lat1 = toRad(Number(from.lat));
  const lat2 = toRad(Number(to.lat));
  const dLat = toRad(Number(to.lat) - Number(from.lat));
  const dLng = toRad(Number(to.lng) - Number(from.lng));
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function shortAddress(text) {
  const firstPart = String(text || "").split(",")[0] || text || "";
  return firstPart.length > 24 ? `${firstPart.slice(0, 24)}...` : firstPart;
}

function openExternalNavigation() {
  const pickup = localStorage.getItem("wow_ride_pickup") || "";
  const drop = localStorage.getItem("wow_ride_drop") || "";
  const destination = ridePhase === "toDrop" ? drop : pickup;
  if (!destination) return;
  const origin = rideDriverAnchor
    ? `${rideDriverAnchor.lat},${rideDriverAnchor.lng}`
    : "";
  const url = origin
    ? `https://www.mapbox.com/directions/?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
    : `https://www.mapbox.com/directions/?destination=${encodeURIComponent(destination)}`;
  const popup = window.open(url, "_blank", "noopener");
  if (!popup) window.location.href = url;
}

function ridePoint(ride, type) {
  const sources = type === "pickup"
    ? [ride?.pickupLocation, ride?.pickup, { latitude: ride?.pickupLatitude ?? ride?.pickupLat, longitude: ride?.pickupLongitude ?? ride?.pickupLng }]
    : [ride?.dropLocation, ride?.dropoffLocation, ride?.destinationLocation, ride?.destination, { latitude: ride?.destinationLatitude ?? ride?.dropoffLatitude ?? ride?.dropLat, longitude: ride?.destinationLongitude ?? ride?.dropoffLongitude ?? ride?.dropLng }];
  for (const source of sources) {
    const lat = Number(source?.latitude ?? source?.lat ?? source?._latitude);
    const lng = Number(source?.longitude ?? source?.lng ?? source?._longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
  }
  return null;
}

function cacheRideCoordinates(ride) {
  const pickup = ridePoint(ride, "pickup");
  const drop = ridePoint(ride, "drop");
  if (pickup) {
    localStorage.setItem("wow_ride_pickup_lat", String(pickup.lat));
    localStorage.setItem("wow_ride_pickup_lng", String(pickup.lng));
  }
  if (drop) {
    localStorage.setItem("wow_ride_drop_lat", String(drop.lat));
    localStorage.setItem("wow_ride_drop_lng", String(drop.lng));
  }
}

function bindDriverMapControls() {
  ["driverMapRecenter", "driverMapCurrent"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      driverFollowMode = true;
      driverMapUserInteracted = false;
      updateFollowControl();
      const map = button.closest(".map-modal") ? rideMapFull : rideMap;
      const point = rideDriverAnchor || readSavedLatLng("driver");
      if (map && point) map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
      driverRideLiveTracker?.setFollow?.(true, button.closest(".map-modal") ? "driver-full" : "");
    });
  });
  ["driverMapFit", "driverMapFitFull"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      driverFollowMode = false;
      updateFollowControl();
      const map = button.closest(".map-modal") ? rideMapFull : rideMap;
      const target = ridePhase === "toDrop" ? readSavedLatLng("drop") : readSavedLatLng("pickup");
      fitDriverBounds(map, rideDriverAnchor, target, true);
    });
  });
  const follow = document.getElementById("driverMapFollow");
  if (follow && !follow.dataset.bound) {
    follow.dataset.bound = "1";
    follow.addEventListener("click", () => {
      driverFollowMode = !driverFollowMode;
      if (driverFollowMode) driverMapUserInteracted = false;
      updateFollowControl();
      if (driverFollowMode) driverRideLiveTracker?.setFollow?.(true);
    });
  }
  updateFollowControl();
}

function updateFollowControl() {
  const button = document.getElementById("driverMapFollow");
  if (button) {
    button.classList.toggle("is-active", driverFollowMode);
    button.setAttribute("aria-pressed", String(driverFollowMode));
  }
}

function isDriverArrivingStatus(status) {
  return ["arrived", "driver_arriving"].includes(String(status || "").toLowerCase());
}

function isRideStartedStatus(status) {
  return ["in_progress", "ride_started", "started", "on_trip"].includes(String(status || "").toLowerCase());
}

window.completeRide = completeRide;
