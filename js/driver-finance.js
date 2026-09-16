(function () {
  "use strict";

  let rides = [];
  let ratings = [];

  const PAID_STATUSES = new Set([
    "paid", "demo_paid", "cash_collected", "completed", "success",
    "successful", "confirmed", "collected", "received"
  ]);

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const available = (value) => String(value ?? "").trim() || "Not available";
  const number = (value) => window.WowFinancial?.number?.(value) ?? fallbackNumber(value);
  const money = (value) => window.WowFinancial?.money?.(value) ?? `Rs. ${(number(value) ?? 0).toLocaleString("en-PK")}`;

  function fallbackNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
    if (typeof value !== "string") return null;
    const text = value.trim().replace(/^\s*(rs\.?|pkr)\s*/i, "").replace(/[,\s]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
  }

  function setText(id, text) {
    const node = byId(id);
    if (node) node.textContent = text;
  }

  function asDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function selectedFare(row) {
    const selected = window.WowFinancial?.selectedFare?.(row);
    if (selected && selected.value !== null) return selected.value;
    for (const field of ["finalFare", "acceptedFare", "agreedFare", "totalFare", "fare", "estimatedFare"]) {
      const value = number(row?.[field]);
      if (value !== null && value > 0) return value;
    }
    return 0;
  }

  function entryDate(entry) {
    return asDate(entry.completedAt || entry.completed_at || entry.updatedAt || entry.createdAt);
  }

  function normalizeServerRide(row) {
    return {
      id: String(row.ride_id || row.id || ""),
      passengerName: row.passenger_name || row.passengerName || "Passenger",
      pickupName: row.pickup || row.pickupName || row.pickupAddress || "",
      destinationName: row.dropoff || row.destinationName || row.destinationAddress || "",
      fareValue: number(row.fare) ?? 0,
      driverEarning: number(row.driver_earning ?? row.driverEarning) ?? 0,
      paymentMethod: row.payment_method || row.paymentMethod || "",
      paymentStatus: row.payment_status || row.paymentStatus || "",
      commissionStatus: row.commission_status || row.commissionStatus || "",
      distanceKm: number(row.distance_km ?? row.distanceKm),
      completedAt: row.completed_at || row.completedAt || "",
      status: "completed",
      source: row.source || "server"
    };
  }

  function normalizeRideDoc(doc) {
    const data = doc.data() || {};
    return { id: doc.id, ...data, fareValue: selectedFare(data) };
  }

  function driverIdentityQuery(uid) {
    const params = new URLSearchParams({ role: "driver" });
    const resolvedUid = String(uid || localStorage.getItem("wow_user_id") || "").trim();
    const email = String(localStorage.getItem("wow_user_email") || "").trim();
    if (resolvedUid) {
      params.set("firebase_uid", resolvedUid);
      params.set("uid", resolvedUid);
      params.set("user_id", resolvedUid);
    }
    if (email) params.set("email", email);
    return params;
  }

  function renderEarnings() {
    const list = byId("earningsRideList");
    if (!list) return;

    const rows = [...rides].sort((a, b) => (entryDate(b)?.getTime() || 0) - (entryDate(a)?.getTime() || 0));
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));

    const earningOf = (ride) => {
      const stored = number(ride.driverEarning ?? ride.driverShare);
      if (stored !== null && stored > 0) return stored;
      const fare = number(ride.fareValue) ?? selectedFare(ride);
      return Math.round(fare * 0.70 * 100) / 100;
    };

    const total = rows.reduce((sum, ride) => sum + earningOf(ride), 0);
    const today = rows.reduce((sum, ride) => {
      const date = entryDate(ride);
      return sum + (date && date >= dayStart && date <= now ? earningOf(ride) : 0);
    }, 0);
    const week = rows.reduce((sum, ride) => {
      const date = entryDate(ride);
      return sum + (date && date >= weekStart && date <= now ? earningOf(ride) : 0);
    }, 0);

    setText("earnToday", money(today));
    setText("earnWeek", money(week));
    setText("earnTotal", money(total));
    setText("completedCount", String(rows.length));
    setText("completedRideCount", String(rows.length));
    setText("walletNote", `${rows.length} completed ride${rows.length === 1 ? "" : "s"} counted from driver ledger, payments, and completed rides. Cancelled rides are excluded.`);

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">No completed earning records yet.</div>';
      return;
    }

    list.innerHTML = rows.slice(0, 12).map((ride) => {
      const date = entryDate(ride);
      const when = date ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not available";
      const fare = number(ride.fareValue) ?? selectedFare(ride);
      const driverEarning = earningOf(ride);
      const commission = Math.max(0, Math.round((fare - driverEarning) * 100) / 100);
      const distance = number(ride.distanceKm);
      const paymentStatus = ride.paymentStatus || (ride.source === "ledger" ? "earned" : "");
      return `<article class="history-item"><div class="history-top"><strong>${esc(available(ride.passengerName))}</strong><span>${esc(when)}</span></div><div class="history-meta"><div><span>Total Fare</span><strong>${money(fare)}</strong></div><div><span>WOW Commission</span><strong>${money(commission)}</strong></div><div><span>Your Earning</span><strong>${money(driverEarning)}</strong></div><div><span>Payment</span><strong>${esc(available(ride.paymentMethod))} - ${esc(available(paymentStatus))}</strong></div><div><span>Source</span><strong>${esc(available(ride.source))}</strong></div><div><span>Ride ID</span><strong>${esc(available(ride.id))}</strong></div><div><span>Distance</span><strong>${distance !== null ? `${distance.toFixed(1)} km` : "Not available"}</strong></div></div></article>`;
    }).join("");
  }

  function renderRatings() {
    const list = byId("ratingsList");
    if (!list) return;
    const valid = ratings.filter((item) => Number.isFinite(Number(item.rating)) && Number(item.rating) >= 1 && Number(item.rating) <= 5);
    const average = valid.length ? valid.reduce((sum, item) => sum + Number(item.rating), 0) / valid.length : null;
    setText("averageRating", average === null ? "No ratings yet" : `${average.toFixed(1)} / 5`);
    setText("ratingCount", valid.length ? `${valid.length} passenger review${valid.length === 1 ? "" : "s"}` : "No ratings yet");
    if (!valid.length) {
      list.innerHTML = '<div class="empty-state">No ratings yet.</div>';
      return;
    }
    valid.sort((a, b) => (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0));
    list.innerHTML = valid.slice(0, 20).map((rating) => {
      const date = asDate(rating.createdAt);
      return `<article class="history-item"><div class="history-top"><strong>${esc(available(rating.passengerName || "Passenger"))}</strong><span>${esc(date ? date.toLocaleDateString() : "Not available")}</span></div><div class="history-meta"><div><span>Rating</span><strong>${Number(rating.rating).toFixed(1)} / 5</strong></div><div><span>Ride ID</span><strong>${esc(available(rating.rideId))}</strong></div><div><span>Review</span><strong>${esc(available(rating.reviewText))}</strong></div></div></article>`;
    }).join("");
  }

  function renderHistory() {
    const list = byId("historyList");
    if (!list) return;
    if (!rides.length) {
      list.innerHTML = '<div class="empty-state">No assigned ride history yet.</div>';
      return;
    }
    list.innerHTML = rides.map((ride) => {
      const date = entryDate(ride);
      return `<article class="item"><div class="top"><strong>${esc(available(ride.passengerName))}</strong><span>${esc(available(ride.id))}</span></div><div class="meta"><span>Pickup<strong>${esc(available(ride.pickupName || ride.pickupAddress))}</strong></span><span>Destination<strong>${esc(available(ride.destinationName || ride.destinationAddress))}</strong></span><span>Fare<strong>${money(ride.fareValue)}</strong></span><span>Status<strong>completed</strong></span><span>Completed<strong>${esc(date ? date.toLocaleString() : "Not available")}</strong></span></div></article>`;
    }).join("");
  }

  async function loadServerData(uid) {
    try {
      const response = await fetch(`php/get_driver_earnings_data.php?${driverIdentityQuery(uid).toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) return false;
      rides = Array.isArray(payload.history) ? payload.history.map(normalizeServerRide) : [];
      ratings = Array.isArray(payload.recent_reviews) ? payload.recent_reviews : [];
      renderEarnings();
      renderHistory();
      renderRatings();
      return true;
    } catch (error) {
      console.warn("[WOW Earnings] server earnings unavailable", error?.message || error);
      return false;
    }
  }

  function addEntry(entries, seen, rideId, row, source) {
    const id = String(rideId || row.id || "").trim();
    if (!id || seen.has(id)) return;
    const earning = number(row.earning ?? row.driverEarning ?? row.driverShare);
    const fare = number(row.fareValue ?? row.finalFare ?? row.amount ?? row.fare) ?? selectedFare(row);
    const driverEarning = earning !== null && earning > 0 ? earning : Math.round(fare * 0.70 * 100) / 100;
    if (driverEarning <= 0) return;
    seen.add(id);
    entries.push({
      id,
      ...row,
      fareValue: fare,
      driverEarning,
      completedAt: row.completedAt || row.completed_at || row.paidAt || row.collectedAt || row.updatedAt || row.createdAt,
      source
    });
  }

  async function readQuery(primary, fallback, label) {
    try {
      return await primary.get();
    } catch (error) {
      console.warn(`[WOW Driver Finance] ${label} primary read unavailable`, error?.code || error?.message);
      if (!fallback) throw error;
      return fallback.get();
    }
  }

  async function loadClientData(db, uid) {
    const ledgerQuery = db.collection("driverEarnings").doc(uid).collection("rides").limit(150);
    const paymentQuery = db.collection("payments").where("driverId", "==", uid).limit(150);
    const completedRideQuery = db.collection("rides")
      .where("assignedDriverId", "==", uid)
      .where("status", "in", ["completed", "ride_completed"])
      .limit(150);
    const rideFallbackQuery = db.collection("rides").where("assignedDriverId", "==", uid).limit(150);

    const [ledgerResult, paymentResult, rideResult] = await Promise.allSettled([
      ledgerQuery.get(),
      paymentQuery.get(),
      readQuery(completedRideQuery, rideFallbackQuery, "completed ride")
    ]);

    if ([ledgerResult, paymentResult, rideResult].every((result) => result.status === "rejected")) {
      throw ledgerResult.reason || paymentResult.reason || rideResult.reason;
    }

    const entries = [];
    const seen = new Set();
    if (ledgerResult.status === "fulfilled") {
      ledgerResult.value.docs.forEach((doc) => {
        const row = { id: doc.id, ...(doc.data() || {}) };
        if (String(row.status || "") !== "earned") return;
        addEntry(entries, seen, row.rideId || doc.id, row, "ledger");
      });
    }
    if (paymentResult.status === "fulfilled") {
      paymentResult.value.docs.forEach((doc) => {
        const row = { id: doc.id, ...(doc.data() || {}) };
        if (!PAID_STATUSES.has(String(row.paymentStatus || row.status || "").toLowerCase())) return;
        addEntry(entries, seen, row.rideId || doc.id, row, "payment");
      });
    }
    if (rideResult.status === "fulfilled") {
      rideResult.value.docs.forEach((doc) => {
        const row = normalizeRideDoc(doc);
        if (!["completed", "ride_completed"].includes(String(row.status || "").toLowerCase())) return;
        addEntry(entries, seen, row.rideId || doc.id, row, "ride");
      });
    }

    rides = entries;
    renderEarnings();
    renderHistory();

    try {
      const ratingSnapshot = await db.collection("rideReviews").where("driverUid", "==", uid).limit(50).get();
      ratings = ratingSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      renderRatings();
    } catch (error) {
      console.warn("[WOW Driver Finance] ratings unavailable", error?.code || error?.message);
      ratings = [];
      renderRatings();
    }
  }

  async function init() {
    try {
      if (!window.WowFirestore) throw new Error("Firebase helper is unavailable.");
      const { db, uid, auth } = await window.WowFirestore.ready();
      if (!auth.currentUser || !uid) throw new Error("Driver is not authenticated.");
      const loadedFromServer = await loadServerData(uid);
      if (!loadedFromServer) await loadClientData(db, uid);
    } catch (error) {
      console.error("[WOW Driver Finance] Initialization failed", error);
      setText("earnToday", money(0));
      setText("earnWeek", money(0));
      setText("earnTotal", money(0));
      setText("completedCount", "0");
      setText("completedRideCount", "0");
      setText("walletNote", "Unable to load earnings right now. Please check login and Firebase connection.");
      const target = byId("earningsRideList") || byId("historyList");
      if (target) target.innerHTML = '<div class="empty-state">Unable to load earnings data. Please log in again.</div>';
      renderRatings();
    }
  }

  init();
})();
