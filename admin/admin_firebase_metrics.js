(function () {
  "use strict";

  const COLLECTIONS = [
    "passengers",
    "drivers",
    "driverApplications",
    "users",
    "rideRequests",
    "rides",
    "sosAlerts",
    "payments",
    "callMetadata",
    "rideReviews",
    "ratings"
  ];
  const REQUIRED_COLLECTIONS = ["passengers", "drivers", "rideRequests", "sosAlerts", "payments", "rideReviews", "ratings"];
  const ACTIVE_STATUSES = ["driver_assigned", "driver_selected", "accepted", "driver_en_route", "driver_arriving", "arriving", "arrived", "started", "ride_started", "ongoing", "in_progress", "on_trip", "active"];
  const PENDING_STATUSES = ["pending", "requested", "searching_driver"];
  const COLLECTION_LIMITS = {
    passengers: 100,
    drivers: 100,
    driverApplications: 75,
    users: 100,
    rideRequests: 150,
    rides: 150,
    sosAlerts: 75,
    payments: 150,
    callMetadata: 75,
    rideReviews: 100,
    ratings: 100
  };
  const DRIVER_OFFERS_LIMIT = 100;
  const state = { docs: {}, errors: {}, unsubscribes: [], driverOffers: [], liveLocations: [] };
  let publishTimer = null;

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pagehide", cleanupListeners);
  window.addEventListener("beforeunload", cleanupListeners);

  function adminMetricsEnabled() {
    try {
      return new URLSearchParams(location.search || "").get("live_admin_metrics") === "1"
        || localStorage.getItem("wow_admin_live_metrics") === "1";
    } catch {
      return false;
    }
  }

  async function init() {
    if (window.WOW_ADMIN_METRICS_STARTED) {
      console.warn("[WOW Admin Firebase] Duplicate metrics listener skipped.");
      return;
    }
    if (!adminMetricsEnabled()) {
      emitStatus("paused", "Realtime Firebase metrics are paused to reduce Firestore reads.");
      return;
    }
    window.WOW_ADMIN_METRICS_STARTED = true;
    emitStatus("loading", "Preparing dashboard...");
    try {
      const db = await getDb();
      COLLECTIONS.forEach((name) => listenCollection(db, name));
      listenDriverOffers(db);
      listenLiveLocations(db);
    } catch (error) {
      console.error("[WOW Admin Firebase] Firebase realtime init failed:", error);
      emitStatus("error", friendlyError(error));
    }
  }

  async function getDb() {
    if (window.WowAdminFirebase?.getDb) return window.WowAdminFirebase.getDb();
    if (!window.firebase) throw new Error("Firebase SDK unavailable");
    if (!firebase.apps.length) firebase.initializeApp(window.WowAdminFirebase?.config || {});
    if (window.WowAdminFirebase?.ensureAdminAuth) await window.WowAdminFirebase.ensureAdminAuth();
    return firebase.firestore();
  }

  function listenCollection(db, name) {
    const limit = COLLECTION_LIMITS[name] || 250;
    const startedAt = performance.now();
    const unsubscribe = db.collection(name).limit(limit).onSnapshot((snapshot) => {
      state.errors[name] = null;
      state.docs[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      console.info("[WOW Admin Firebase] Read collection:", name, "documents:", snapshot.size, "limit:", limit, "timeMs:", elapsed(startedAt));
      schedulePublishMetrics();
    }, (error) => {
      state.docs[name] = state.docs[name] || [];
      state.errors[name] = error;
      if (isPermissionError(error)) {
        console.error("[WOW Admin Firebase] Permission denied reading collection:", name, error);
      } else {
        console.error("[WOW Admin Firebase] Error reading collection:", name, error);
      }
      schedulePublishMetrics();
    });
    state.unsubscribes.push(unsubscribe);
  }

  function listenDriverOffers(db) {
    const startedAt = performance.now();
    const unsubscribe = db.collectionGroup("driverOffers").limit(DRIVER_OFFERS_LIMIT).onSnapshot((snapshot) => {
      state.errors.driverOffers = null;
      state.driverOffers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      console.info("[WOW Admin Firebase] Read collection group: driverOffers documents:", snapshot.size, "limit:", DRIVER_OFFERS_LIMIT, "timeMs:", elapsed(startedAt));
      schedulePublishMetrics();
    }, (error) => {
      state.errors.driverOffers = error;
      state.driverOffers = [];
      console.error("[WOW Admin Firebase] Error reading collection group: driverOffers", error);
      schedulePublishMetrics();
    });
    state.unsubscribes.push(unsubscribe);
  }

  function listenLiveLocations(db) {
    const unsubscribe = db.collectionGroup("liveLocations")
      .where("isActive", "==", true)
      .where("isSharing", "==", true)
      .limit(50)
      .onSnapshot((snapshot) => {
      state.liveLocations = snapshot.docs.map((doc) => ({
        id: doc.id,
        rideId: doc.ref.parent.parent?.id || "",
        ...doc.data()
      }));
      console.info("[WOW Admin Firebase] Live ride locations updated:", snapshot.size);
      schedulePublishMetrics();
    }, (error) => {
      state.liveLocations = [];
      state.errors.liveLocations = error;
      console.error("[WOW Admin Firebase] Live location listener failed", error);
      schedulePublishMetrics();
    });
    state.unsubscribes.push(unsubscribe);
  }

  function schedulePublishMetrics() {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publishMetrics, 80);
  }

  function publishMetrics() {
    const startedAt = performance.now();
    const payload = buildPayload();
    window.WOW_ADMIN_FIREBASE_METRICS = payload;
    window.dispatchEvent(new CustomEvent("wow-admin-firebase-metrics", { detail: payload }));
    console.info("[WOW Admin Firebase] Metrics updated timeMs:", elapsed(startedAt));
  }

  function cleanupListeners() {
    if (!window.WOW_ADMIN_METRICS_STARTED && !state.unsubscribes.length) return;
    clearTimeout(publishTimer);
    state.unsubscribes.splice(0).forEach((unsubscribe) => {
      try { unsubscribe(); } catch {}
    });
    window.WOW_ADMIN_METRICS_STARTED = false;
    console.info("[WOW Admin Firebase] Metrics listeners unsubscribed.");
  }

  function buildPayload() {
    const passengersRaw = docs("passengers");
    const driversRaw = docs("drivers");
    const users = docs("users");
    const passengers = passengersRaw.length ? passengersRaw : users.filter((u) => roleOf(u) === "passenger");
    const drivers = driversRaw.length ? driversRaw : users.filter((u) => roleOf(u) === "driver");
    const applicantsFromDrivers = driversRaw.filter((d) => statusOf(d, "verificationStatus") === "pending");
    const applicationDocs = docs("driverApplications").filter((d) => statusOf(d, "verificationStatus") === "pending" || (!d.verificationStatus && statusOf(d, "status") === "pending"));
    const applicants = applicationDocs.length ? applicationDocs : applicantsFromDrivers;
    const rides = mergeById(docs("rideRequests"), docs("rides"));
    const sos = docs("sosAlerts");
    const payments = docs("payments");
    const callMetadata = docs("callMetadata");
    const reviews = docs("rideReviews").concat(docs("ratings"));
    const completed = rides.filter((r) => statusOf(r) === "completed");
    const cancelled = rides.filter((r) => statusOf(r) === "cancelled");
    const active = rides.filter((r) => ACTIVE_STATUSES.includes(statusOf(r)));
    const pending = rides.filter((r) => PENDING_STATUSES.includes(statusOf(r)));
    const accepted = rides.filter((r) => statusOf(r) === "accepted");
    const scheduled = rides.filter((r) => !!(r.scheduledAt || r.scheduledDate));
    const carpool = rides.filter((r) => statusOf(r, "rideType") === "carpool" || !!r.carpool);
    const activeSos = sos.filter((a) => statusOf(a) !== "resolved" && statusOf(a) !== "closed");
    const fares = rides.map((r) => numberField(r, ["finalFare", "fare", "estimatedFare"])).filter((n) => n > 0);
    const passengerOffers = rides.map((r) => numberField(r, ["passengerOfferFare", "passengerOfferPrice", "offeredFare", "offerPrice"])).filter((n) => n > 0);
    const driverOffers = state.driverOffers.map((o) => numberField(o, ["offeredFare", "driverOfferPrice", "offerPrice", "fare"])).filter((n) => n > 0);
    const paymentUsage = countBy(rides.concat(payments), (r) => statusOf(r, "paymentMethod") || statusOf(r, "paymentLabel") || "unknown");
    const vehicleUsage = countBy(rides, (r) => statusOf(r, "vehicleType") || "unknown");
    const statusCounts = {
      completed: completed.length,
      active: active.length,
      pending: pending.length,
      cancelled: cancelled.length,
      other: Math.max(0, rides.length - completed.length - active.length - pending.length - cancelled.length),
      carpool: carpool.length
    };
    const hasAnyData = passengers.length + drivers.length + applicants.length + rides.length + sos.length + payments.length + reviews.length > 0;
    const deniedCollections = Object.keys(state.errors).filter((name) => isPermissionError(state.errors[name]));
    const blockingDeniedCollections = deniedCollections.filter((name) => REQUIRED_COLLECTIONS.includes(name) || name === "driverOffers");
    if (deniedCollections.length) {
      console.warn("[WOW Admin Firebase] Permission denied collections:", deniedCollections.join(", "));
    }
    const permissionDenied = false;
    const permissionMessage = "";
    const hourly = buildHourly(rides);
    const weekly = buildWeekly(completed);
    const todayRides = rides.filter((ride) => isToday(ride.createdAt));
    const onlineDrivers = drivers.filter((driver) => driver.isOnline === true);
    const driverApprovalCounts = {
      approved: drivers.filter((d) => d.isApproved === true || statusOf(d, "verificationStatus") === "approved").length,
      pending: applicants.length,
      rejected: drivers.filter((d) => statusOf(d, "verificationStatus") === "rejected").length
    };
    const charts = buildAnalyticsCharts(rides, completed, cancelled, passengers, sos, vehicleUsage, driverApprovalCounts);
    const analytics = {
      summary: {
        passengers: passengers.length,
        drivers: drivers.length,
        rides: rides.length,
        completed_rides: completed.length,
        cancelled_rides: cancelled.length,
        pending_rides: pending.length,
        active_rides: active.length,
        peak_area: topKey(countBy(rides, (r) => areaName(r.pickup || r.pickupLocation))) || "N/A",
        peak_area_change: 0,
        peak_hour_label: peakHourLabel(hourly),
        peak_hour_avg: Math.max(0, ...hourly),
        driver_efficiency: drivers.length ? Math.round((drivers.filter((d) => d.isApproved === true || statusOf(d, "verificationStatus") === "approved").length / drivers.length) * 100) : 0,
        safety_score: Math.max(0, 100 - activeSos.length * 4),
        most_used_vehicle_type: topKey(vehicleUsage) || "N/A",
        avg_fare: average(fares) || 0,
        avg_passenger_offer: average(passengerOffers) || 0,
        avg_driver_offer: average(driverOffers) || 0,
        carpool_rides: carpool.length,
        payment_records: payments.length || rides.length
      },
      top_pickups: topList(countBy(rides, (r) => areaName(r.pickup || r.pickupLocation)), 3),
      top_dropoffs: topList(countBy(rides, (r) => areaName(r.dropoff || r.dropoffLocation)), 3),
      vehicle_usage: vehicleUsage,
      payment_method_usage: paymentUsage,
      passenger_growth: countRecent(passengers, 30),
      driver_approval_trend: driverApprovalCounts,
      recent_sos: activeSos.slice().sort(sortNewest).slice(0, 3).map(formatSosRow),
      charts,
      insights: buildInsights(rides, pending, completed, cancelled, carpool, activeSos, fares, passengerOffers, driverOffers, vehicleUsage, paymentUsage)
    };

    return {
      ok: true,
      loading: false,
      empty: !hasAnyData,
      permissionDenied,
      message: permissionMessage || (!hasAnyData ? "No live dashboard data is available yet." : ""),
      deniedCollections,
      collections: Object.fromEntries(COLLECTIONS.map((name) => [name, docs(name).length])),
      raw: { passengers, drivers, applicants, rides, sos, payments, reviews, callMetadata },
      dashboard: {
        stats: {
          total_users: passengers.length,
          total_passengers: passengers.length,
          total_drivers: drivers.length,
          pending_driver_applications: applicants.length,
          total_rides: rides.length,
          active_rides: active.length,
          pending_rides: pending.length,
          accepted_rides: accepted.length,
          completed_rides: completed.length,
          cancelled_rides: cancelled.length,
          today_rides: todayRides.length,
          scheduled_rides: scheduled.length,
          carpool_rides: carpool.length,
          payment_records: payments.length || rides.length,
          private_call_records: callMetadata.length,
          review_records: reviews.length,
          sos_alerts: activeSos.length,
          active_drivers: onlineDrivers.length,
          // Finance is intentionally server-reconciled by financial_service.php.
          // Never expose an unverified client-side gross total as platform earnings.
          earnings: null
        },
        quick_stats: {
          avg_ride_duration_min: average(completed.map((r) => numberField(r, ["durationMin", "duration"]))),
          avg_fare: average(fares),
          driver_rating_avg: average(drivers.map((d) => numberField(d, ["rating", "avgRating"]))),
          passenger_rating_avg: average(passengers.map((p) => numberField(p, ["rating", "avgRating"]))),
          cancellation_rate: rides.length ? (cancelled.length / rides.length) * 100 : 0,
          peak_hours: peakHourLabel(hourly)
        },
        hourly_activity: hourly.map((ridesCount, hour) => ({ hour, rides: ridesCount, rides_count: ridesCount })),
        recent_rides: rides.slice().sort(sortNewest).slice(0, 10).map(formatRideRow),
        pending_drivers: applicants.slice().sort(sortNewest).slice(0, 3).map(formatPendingDriverRow),
        sos_alerts: activeSos.slice().sort(sortNewest).slice(0, 12).map(formatSosRow),
        map_points: buildMapPoints(rides, drivers, state.liveLocations),
        map_center: { lat: 24.8607, lng: 67.0011 },
        analytics
      },
      analytics
    };
  }

  function docs(name) {
    return (Array.isArray(state.docs[name]) ? state.docs[name] : []).filter(isRealRecord);
  }
  function mergeById(primary, legacy) {
    const seen = new Set();
    return (primary || []).concat(legacy || []).filter((row) => {
      const key = String(row.id || row.rideCode || row.rideId || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function isRealRecord(row) {
    const id = String(row?.id || row?.uid || row?.rideId || row?.rideCode || row?.passengerId || row?.driverId || row?.paymentId || row?.ratingId || "").toLowerCase();
    const email = String(row?.email || row?.passengerEmail || row?.driverEmail || "").toLowerCase();
    const type = String(row?.type || row?.status || row?.category || "").toLowerCase();
    if (id.startsWith("test_") || id.includes("_test_")) return false;
    if (email.includes("@womenonwheels.local") || email.includes("test.")) return false;
    if (type === "test" || row?.isDemo === true || row?.demo === true || row?.sample === true) return false;
    return true;
  }
  function statusOf(row, key) { return String(row?.[key || "status"] || "").trim().toLowerCase(); }
  function roleOf(row) { return statusOf(row, "role"); }
  function numberField(row, keys) {
    for (const key of keys) {
      const n = Number(row?.[key]);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }
  function average(values) {
    const nums = values.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
  }
  function countBy(rows, getter) {
    return rows.reduce((acc, row) => {
      const key = String(getter(row) || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }
  function topKey(obj) {
    return Object.keys(obj || {}).sort((a, b) => Number(obj[b] || 0) - Number(obj[a] || 0))[0] || "";
  }
  function topList(obj, limit) {
    return Object.keys(obj || {})
      .filter((key) => key && key !== "unknown")
      .sort((a, b) => Number(obj[b] || 0) - Number(obj[a] || 0))
      .slice(0, limit || 3)
      .map((key) => ({ label: cap(key), count: Number(obj[key] || 0) }));
  }
  function countRecent(rows, days) {
    const cutoff = Date.now() - Number(days || 30) * 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
      const ms = toMillis(row.createdAt || row.registeredAt);
      return ms && ms >= cutoff;
    }).length;
  }
  function isToday(value) {
    const ms = toMillis(value);
    if (!ms) return false;
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  function countMatching(rows, terms) {
    return rows.filter((row) => {
      const text = String(row.type || row.category || row.reason || row.incidentType || "").toLowerCase();
      return terms.some((term) => text.includes(term));
    }).length;
  }
  function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(String(value).replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function sortNewest(a, b) { return toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt); }
  function buildHourly(rides) {
    const hours = new Array(24).fill(0);
    rides.forEach((ride) => {
      const ms = toMillis(ride.createdAt);
      if (ms) hours[new Date(ms).getHours()]++;
    });
    return hours;
  }
  function peakHourLabel(hours) {
    const max = Math.max(0, ...hours);
    if (!max) return "N/A";
    const hour = hours.indexOf(max);
    const suffix = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return h12 + " " + suffix;
  }
  function buildWeekly(completed) {
    const labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const rides = [0, 0, 0, 0];
    const now = Date.now();
    completed.forEach((ride) => {
      const ms = toMillis(ride.completedAt || ride.completedTime || ride.createdAt);
      if (!ms) return;
      const index = 3 - Math.floor((now - ms) / (7 * 24 * 60 * 60 * 1000));
      if (index < 0 || index > 3) return;
      rides[index]++;
    });
    return { labels, rides, revenue: [] };
  }
  function dailySeries(rows, timeGetter, valueGetter, days) {
    const span = Number(days || 7);
    const labels = [];
    const values = [];
    const keys = [];
    for (let i = span - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      keys.push(key);
      labels.push(date.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      values.push(0);
    }
    rows.forEach((row) => {
      const ms = toMillis(timeGetter(row));
      if (!ms) return;
      const key = new Date(ms).toISOString().slice(0, 10);
      const index = keys.indexOf(key);
      if (index === -1) return;
      values[index] += valueGetter ? Number(valueGetter(row) || 0) : 1;
    });
    return { labels, values: values.map((n) => Math.round(Number(n || 0) * 100) / 100) };
  }
  function countChart(counts, limit) {
    const entries = Object.keys(counts || {})
      .filter((key) => key && key !== "unknown")
      .sort((a, b) => Number(counts[b] || 0) - Number(counts[a] || 0))
      .slice(0, Number(limit || 6));
    return { labels: entries.map(cap), values: entries.map((key) => Number(counts[key] || 0)) };
  }
  function listChart(rows) {
    return {
      labels: (rows || []).map((row) => String(row.label || "")),
      values: (rows || []).map((row) => Number(row.count || 0))
    };
  }
  function buildAnalyticsCharts(rides, completed, cancelled, passengers, sos, vehicleUsage, driverApprovalCounts) {
    const hourly = buildHourly(rides);
    return {
      ride_requests_by_day: dailySeries(rides, (ride) => ride.createdAt, null, 7),
      completed_vs_cancelled: { labels: ["Completed", "Cancelled"], values: [completed.length, cancelled.length] },
      vehicle_type_demand: countChart(vehicleUsage, 6),
      peak_request_hours: {
        labels: hourly.map((_, hour) => {
          const suffix = hour >= 12 ? "PM" : "AM";
          const h12 = hour % 12 === 0 ? 12 : hour % 12;
          return h12 + " " + suffix;
        }),
        values: hourly
      },
      pickup_areas: listChart(topList(countBy(rides, (r) => areaName(r.pickup || r.pickupLocation)), 6)),
      dropoff_areas: listChart(topList(countBy(rides, (r) => areaName(r.dropoff || r.dropoffLocation)), 6)),
      passenger_growth: dailySeries(passengers, (p) => p.createdAt || p.registeredAt, null, 7),
      driver_approval_trend: countChart(driverApprovalCounts, 3),
      sos_alerts_trend: dailySeries(sos, (alert) => alert.createdAt, null, 7),
      // The authenticated PHP analytics endpoint supplies the verified revenue series.
      revenue_trend: { labels: [], values: [] }
    };
  }
  function formatRideRow(ride) {
    return {
      id: ride.id || ride.uid || ride.rideId || ride.rideCode || "",
      ride_code: ride.rideCode || ride.id || "-",
      passenger_name: ride.passengerName || "Passenger",
      driver_name: ride.driverName || ride.targetDriverName || "Unassigned",
      pickup: ride.pickup || ride.pickupLocation || "-",
      dropoff: ride.dropoff || ride.dropoffLocation || "-",
      fare: numberField(ride, ["finalFare", "fare", "estimatedFare"]),
      payment_label: ride.paymentLabel || ride.paymentMethod || "",
      status: ride.status || "pending",
      status_badge: statusOf(ride) || "pending",
      created_at: readableDate(ride.createdAt)
    };
  }
  function formatSosRow(alert) {
    return {
      id: alert.id || "",
      status: alert.status || "active",
      created_at: readableDate(alert.createdAt),
      location: alert.location || alert.address || "",
      ride_id: alert.rideId || "",
      role: alert.role || "",
      reporter_name: alert.reporterName || alert.name || "Unknown User"
    };
  }
  function formatPendingDriverRow(driver) {
    return {
      id: driver.id || driver.uid || driver.driverId || "",
      application_id: driver.applicationId || driver.id || driver.uid || driver.driverId || "",
      name: driver.name || driver.fullName || "Driver",
      email: driver.email || "",
      phone: driver.phone || "",
      vehicle: driver.vehicleType || driver.vehicle || driver.vehicleModel || "N/A",
      status: driver.verificationStatus || driver.status || "pending",
      created_at: readableDate(driver.createdAt || driver.appliedAt || driver.updatedAt)
    };
  }
  function buildMapPoints(rides, drivers, liveLocations) {
    const activeRideIds = new Set(rides.filter((ride) => ACTIVE_STATUSES.includes(statusOf(ride))).map((ride) => String(ride.id || ride.rideId || "")));
    const driverPoints = drivers.filter((driver) => driver.currentRideId && activeRideIds.has(String(driver.currentRideId))).map((driver) => {
      const loc = driver.currentLocation || {};
      return { type: "driver", label: driver.name || "Driver", status: driver.isAvailable ? "online" : "busy", lat: loc.lat ?? loc.latitude, lng: loc.lng ?? loc.longitude };
    });
      const ridePoints = rides.filter((ride) => activeRideIds.has(String(ride.id || ride.rideId || ""))).flatMap((ride) => {
      const rideId = ride.id || ride.uid || ride.rideId || ride.rideCode || "";
      return [
        { type: "pickup", ride_id: rideId, label: ride.pickup || "Pickup", status: ride.status || "pending", lat: ride.pickupLat, lng: ride.pickupLng },
        { type: "dropoff", ride_id: rideId, label: ride.dropoff || "Drop-off", status: ride.status || "pending", lat: ride.dropLat ?? ride.dropoffLat, lng: ride.dropLng ?? ride.dropoffLng }
      ];
    });
    const livePoints = (liveLocations || [])
      .filter((location) => activeRideIds.has(String(location.rideId || "")) && location.isActive === true && location.active !== false && location.isSharing !== false)
      .map((location) => ({
        type: location.role === "driver" ? "driver_live" : "passenger_live",
        ride_id: location.rideId || "",
        label: location.role === "driver" ? "Assigned driver" : "Passenger",
        status: rides.find((ride) => String(ride.id || ride.rideId || "") === String(location.rideId || ""))?.status || "live",
        lat: location.latitude,
        lng: location.longitude,
        updatedAt: location.updatedAt
      }));
    return livePoints.concat(driverPoints, ridePoints)
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  }
  function buildDriverPerformance(rides, drivers, reviews) {
    const counts = countBy(rides.filter((r) => r.driverUid || r.driverID), (r) => r.driverUid || r.driverID);
    const ratings = {};
    reviews.forEach((review) => {
      const uid = review.driverUid || review.driverID || review.driverId;
      const rating = numberField(review, ["driverRating", "rating", "stars"]);
      if (!uid || !rating) return;
      ratings[uid] = ratings[uid] || [];
      ratings[uid].push(rating);
    });
    const rows = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 6);
    return {
      labels: rows.map((uid) => drivers.find((d) => d.id === uid || d.uid === uid)?.name || uid.slice(0, 6)),
      values: rows.map((uid) => Math.min(100, Math.round(((average(ratings[uid] || []) || 5) / 5) * 70 + Math.min(30, counts[uid] * 3))))
    };
  }
  function buildInsights(rides, pending, completed, cancelled, carpool, sos, fares, passengerOffers, driverOffers, vehicleUsage, paymentUsage) {
    if (!rides.length) return ["Not enough data for analytics yet."];
    const insights = [
      "Total rides: " + rides.length + ".",
      "Completed rides: " + completed.length + ", cancelled rides: " + cancelled.length + ", pending rides: " + pending.length + ".",
      "Carpool usage: " + carpool.length + " ride" + (carpool.length === 1 ? "" : "s") + ".",
      "SOS alert count: " + sos.length + "."
    ];
    if (topKey(vehicleUsage)) insights.push("Most used vehicle type is " + cap(topKey(vehicleUsage)) + ".");
    if (average(fares)) insights.push("Average fare is Rs. " + Math.round(average(fares)).toLocaleString("en-US") + ".");
    if (average(passengerOffers)) insights.push("Average passenger offer is Rs. " + Math.round(average(passengerOffers)).toLocaleString("en-US") + ".");
    if (average(driverOffers)) insights.push("Average driver offer is Rs. " + Math.round(average(driverOffers)).toLocaleString("en-US") + ".");
    if (topKey(paymentUsage)) insights.push("Most used payment method is " + cap(topKey(paymentUsage)) + ".");
    return insights;
  }
  function areaName(location) {
    const first = String(location || "Karachi").split(",")[0].trim();
    return first || "Karachi";
  }
  function readableDate(value) {
    const ms = toMillis(value);
    return ms ? new Date(ms).toISOString() : "";
  }
  function cap(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ") : "N/A";
  }
  function isPermissionError(error) {
    return !!error && (error.code === "permission-denied" || String(error.message || "").toLowerCase().includes("permission"));
  }
  function friendlyError(error) {
    return isPermissionError(error) ? "Unable to load this section. Please try again." : "Unable to load this section. Please try again.";
  }
  function elapsed(startedAt) {
    return Math.round((performance.now() - startedAt) * 10) / 10;
  }
  function emitStatus(status, message) {
    window.dispatchEvent(new CustomEvent("wow-admin-firebase-metrics", { detail: { loading: status === "loading", ok: false, empty: false, message } }));
  }
}());
