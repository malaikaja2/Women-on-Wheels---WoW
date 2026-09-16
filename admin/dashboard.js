(function () {
  "use strict";

  const API_URL = "dashboard_data.php";
  const REFRESH_MS = 15000;
  const SEARCH_SELECTOR = "#dashboardSearch";

  const viewMode =
    window.ADMIN_BOOTSTRAP && window.ADMIN_BOOTSTRAP.view
      ? String(window.ADMIN_BOOTSTRAP.view)
      : "dashboard";
  const isPassengersView = viewMode === "passengers";
  const PAKISTAN_CENTER = { lat: 24.8607, lng: 67.0011 };
  const PAKISTAN_BOUNDS = {
    north: 37.2,
    south: 23.4,
    west: 60.8,
    east: 77.9
  };
  const DEMO_REVENUE = buildDemoRevenue();

  const state = {
    timer: null,
    map: null,
    markers: [],
    liveMarkers: {},
    polylines: [],
    pendingMapData: null,
    mapObserver: null,
    allRides: [],
    allSos: [],
    allPassengers: [],
    usingRealtime: false,
    loading: false
  };

  const el = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();

    if (!isPassengersView) setWelcomeName();
    showDashboardMessage("Preparing dashboard...");

    if (isPassengersView) {
      fetchDashboardData();
      state.timer = window.setInterval(() => {
        if (!document.hidden) fetchDashboardData();
      }, 60000);
    }
    scheduleAdminDashboardMap();
  });
  window.addEventListener("pagehide", () => {
    if (state.timer) clearInterval(state.timer);
    state.mapObserver?.disconnect();
    state.markers.forEach((marker) => { try { marker.remove(); } catch {} });
    Object.values(state.liveMarkers).forEach((marker) => { try { marker.remove(); } catch {} });
    try { state.map?.remove(); } catch {}
    state.map = null;
  });

  function scheduleAdminDashboardMap() {
    if (isPassengersView) return;
    const mapElement = document.getElementById("adminMap");
    if (!mapElement) return;
    if (!("IntersectionObserver" in window)) {
      (window.requestIdleCallback || window.setTimeout)(initAdminDashboardMap);
      return;
    }
    state.mapObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      state.mapObserver.disconnect();
      state.mapObserver = null;
      initAdminDashboardMap();
    }, { rootMargin: "300px" });
    state.mapObserver.observe(mapElement);
  }

  function initAdminDashboardMap() {
    if (isPassengersView) return;
    const mapElement = document.getElementById("adminMap");
    if (!mapElement || !window.WowMapbox) return;

    state.map = WowMapbox.createMap(mapElement, { center: PAKISTAN_CENTER, zoom: 12 });
    if (!state.map) return;
    state.map.on("moveend", enforcePakistanBounds);

    if (state.pendingMapData) {
      renderMap(state.pendingMapData);
      state.pendingMapData = null;
    }
  }

  function cacheElements() {
    [
      "notifyCount",
      "refreshNow",
      "welcomeText",
      "statTotalUsers",
      "statTotalDrivers",
      "statPendingDriverApplications",
      "statTotalRides",
      "statActiveRides",
      "statPendingRides",
      "statAcceptedRides",
      "statCompletedRides",
      "statCancelledRides",
      "statTodayRides",
      "statScheduledRides",
      "statCarpoolRides",
      "statActiveSosAlerts",
      "statOnlineDrivers",
      "statPaymentRecords",
      "statReviewRecords",
      "statEarnings",
      "activeRideChip",
      "sosSubtext",
      "sosList",
      "recentRidesBody",
      "pendingDriversBody",
      "aiAnalyticsEmpty",
      "aiAnalyticsGrid",
      "analyticsChartsGrid",
      "aiPickupAreas",
      "aiDropAreas",
      "aiPeakTime",
      "aiActiveCompleted",
      "aiCancelPercent",
      "aiDriverTrend",
      "aiPassengerGrowth",
      "aiVehicleDemand",
      "aiSosSummary",
      "aiRecentSos",
      "avgDuration",
      "avgFare",
      "driverRating",
      "passengerRating",
      "cancelRate",
      "peakHours",
      "activityChart",
      "chartRideRequests",
      "chartCompletedCancelled",
      "chartVehicleDemand",
      "chartPeakHours",
      "chartPickupAreas",
      "chartDropAreas",
      "chartPassengerGrowth",
      "chartDriverTrend",
      "chartSosTrend",
      "chartRevenueTrend",
      "pmTotalPassengers",
      "pmVerifiedPassengers",
      "pmPendingPassengers",
      "pmBlockedPassengers",
      "passengerSearch",
      "passengerStatusFilter",
      "passengerTableBody"
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    if (el.refreshNow && isPassengersView) {
      el.refreshNow.addEventListener("click", fetchDashboardData);
    }
    if (!isPassengersView) {
      window.addEventListener("wow-admin-dashboard-data", (event) => {
        const payload = event.detail || {};
        state.allRides = Array.isArray(payload.recent_rides) ? payload.recent_rides.slice() : [];
        state.allSos = Array.isArray(payload.sos_alerts) ? payload.sos_alerts.slice() : [];
        state.pendingDrivers = Array.isArray(payload.pending_drivers) ? payload.pending_drivers.slice() : [];
        renderOverview(payload);
      });
    }

    const globalSearch = document.querySelector(SEARCH_SELECTOR);
    if (globalSearch) {
      globalSearch.addEventListener("input", () => {
        if (isPassengersView) {
          applyPassengerFilters();
          return;
        }
        applyOverviewSearch(globalSearch.value || "");
      });
    }

    if (isPassengersView) {
      if (el.passengerSearch) {
        el.passengerSearch.addEventListener("input", applyPassengerFilters);
      }
      if (el.passengerStatusFilter) {
        el.passengerStatusFilter.addEventListener("change", applyPassengerFilters);
      }
    }
  }

  function setWelcomeName() {
    if (!el.welcomeText) return;
    const name =
      window.ADMIN_BOOTSTRAP && window.ADMIN_BOOTSTRAP.adminName
        ? String(window.ADMIN_BOOTSTRAP.adminName)
        : "Admin";
    el.welcomeText.textContent = "Welcome, " + name;
  }

  async function fetchDashboardData() {
    if (state.usingRealtime || state.loading) return;
    state.loading = true;
    const modeParam = isPassengersView ? "?mode=passengers" : "";
    try {
      const response = await fetch(API_URL + modeParam, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      const json = await response.json();
      if (!response.ok || !json || json.ok !== true) return;

      if (isPassengersView) {
        state.allPassengers = Array.isArray(json.passengers) ? json.passengers.slice() : [];
        renderPassengerView(json);
      } else {
        state.allRides = Array.isArray(json.recent_rides) ? json.recent_rides.slice() : [];
        state.allSos = Array.isArray(json.sos_alerts) ? json.sos_alerts.slice() : [];
        state.pendingDrivers = Array.isArray(json.pending_drivers) ? json.pending_drivers.slice() : [];
        renderOverview(json);
      }
    } catch (error) {
      showDashboardMessage("Unable to load this section. Please try again.", true);
    } finally {
      state.loading = false;
    }
  }

  function handleRealtimeMetrics(event) {
    const payload = event.detail || {};
    if (payload.loading) {
      showDashboardMessage("Preparing dashboard...");
      return;
    }
    if (payload.permissionDenied) {
      showDashboardMessage("Preparing dashboard...");
      return;
    }
    if (payload.empty) {
      showDashboardMessage("", false, false);
      return;
    }
    if (!payload.dashboard && !payload.raw) return;
    state.usingRealtime = true;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    showDashboardMessage(payload.empty ? "No live dashboard data is available yet." : "", false, payload.empty);

    if (isPassengersView) {
      state.allPassengers = Array.isArray(payload.raw?.passengers) ? payload.raw.passengers.map(formatRealtimePassenger) : [];
      renderPassengerView({
        summary: {
          total: state.allPassengers.length,
          verified: state.allPassengers.filter((p) => p.status === "active").length,
          pending: state.allPassengers.filter((p) => p.status === "pending").length,
          blocked: state.allPassengers.filter((p) => p.status === "blocked").length
        }
      });
      return;
    }

    const dashboard = payload.dashboard || {};
    state.allRides = Array.isArray(dashboard.recent_rides) ? dashboard.recent_rides.slice() : [];
    state.allSos = Array.isArray(dashboard.sos_alerts) ? dashboard.sos_alerts.slice() : [];
    state.pendingDrivers = Array.isArray(dashboard.pending_drivers) ? dashboard.pending_drivers.slice() : [];
    renderOverview(dashboard);
  }

  function renderOverview(payload) {
    renderStats(payload.stats || {});
    renderQuickStats(payload.quick_stats || {});
    renderSosAlerts(state.allSos);
    renderRecentRides(state.allRides);
    renderPendingDrivers(state.pendingDrivers || []);
    renderAiAnalytics(payload.analytics || {});
    renderChart(payload.hourly_activity || []);
    renderMap(payload);
  }

  function renderPassengerView(payload) {
    const summary = payload.summary || {};
    setText(el.pmTotalPassengers, formatInt(summary.total || 0));
    setText(el.pmVerifiedPassengers, formatInt(summary.verified || 0));
    setText(el.pmPendingPassengers, formatInt(summary.pending || 0));
    setText(el.pmBlockedPassengers, formatInt(summary.blocked || 0));
    setText(el.notifyCount, formatInt(summary.pending || 0));
    applyPassengerFilters();
  }

  function applyPassengerFilters() {
    const localQuery = String((el.passengerSearch && el.passengerSearch.value) || "")
      .trim()
      .toLowerCase();
    const globalQuery = String((document.querySelector(SEARCH_SELECTOR)?.value || ""))
      .trim()
      .toLowerCase();
    const query = localQuery || globalQuery;
    const selectedStatus = String((el.passengerStatusFilter && el.passengerStatusFilter.value) || "all")
      .trim()
      .toLowerCase();

    const filtered = state.allPassengers.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      if (selectedStatus !== "all" && status !== selectedStatus) return false;

      if (!query) return true;
      const haystack = (
        String(item.passenger_id || "") +
        " " +
        String(item.name || "") +
        " " +
        String(item.email || "") +
        " " +
        String(item.phone || "") +
        " " +
        String(item.cnic || "") +
        " " +
        String(item.location_hint || "")
      ).toLowerCase();
      return haystack.includes(query);
    });

    renderPassengerRows(filtered);
  }

  function renderPassengerRows(rows) {
    if (!el.passengerTableBody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      el.passengerTableBody.innerHTML = '<tr><td colspan="8" class="empty">No passengers found.</td></tr>';
      return;
    }

    el.passengerTableBody.innerHTML = rows
      .map((p) => {
        const status = String(p.status || "inactive").toLowerCase();
        const rating = p.rating === null || p.rating === undefined ? "N/A" : Number(p.rating).toFixed(1);
        const statusBadgeClass = passengerStatusClass(status);
        const initials = getInitials(String(p.name || "Passenger"));
        const cnicText = String(p.cnic || "").trim() || "-";
        const phoneText = String(p.phone || "").trim() || "-";
        const location = String(p.location_hint || "").trim() || "Karachi";
        return (
          "<tr>" +
          '<td class="pm-col-passenger">' +
          '<span class="pm-avatar">' + escapeHtml(initials) + "</span>" +
          "<div>" +
          '<strong class="pm-name">' + escapeHtml(String(p.name || "Passenger")) + "</strong>" +
          '<span class="pm-sub">' + escapeHtml(location) + "</span>" +
          "</div>" +
          "</td>" +
          '<td class="pm-col-contact">' +
          '<span class="pm-contact-row">&#9993; ' + escapeHtml(String(p.email || "-")) + "</span>" +
          '<span class="pm-contact-row">&#9742; ' + escapeHtml(phoneText) + "</span>" +
          "</td>" +
          '<td class="pm-col-cnic">' +
          "<span>" + escapeHtml(cnicText) + "</span>" +
          '<span class="pm-cnic-state ' + escapeHtml(statusBadgeClass) + '"></span>' +
          "</td>" +
          '<td class="pm-col-rides"><strong>' + formatInt(p.total_rides || 0) + '</strong><span>Total rides</span></td>' +
          '<td class="pm-col-rating"><strong>' + escapeHtml(rating) + " &#9733;</strong></td>" +
          '<td><span class="badge ' + escapeHtml(statusBadgeClass) + '">' + escapeHtml(capitalize(status)) + "</span></td>" +
          "<td>" + escapeHtml(relativeTime(String(p.last_active || ""))) + "</td>" +
          '<td><div class="admin-action-group">' +
          '<button type="button" data-admin-action="view" data-id="' + escapeHtml(String(p.passenger_id || "")) + '" data-title="Passenger ' + escapeHtml(String(p.name || "Passenger")) + '" data-details="' + escapeHtml(detailsForPassenger(p)) + '">View</button>' +
          '<button type="button" data-admin-action="passenger_status" data-status="approved" data-id="' + escapeHtml(String(p.passenger_id || "")) + '" class="success">Approve</button>' +
          '<button type="button" data-admin-action="passenger_status" data-status="rejected" data-id="' + escapeHtml(String(p.passenger_id || "")) + '" class="danger">Reject</button>' +
          '<button type="button" data-admin-action="passenger_status" data-status="' + (status === "blocked" ? "unblocked" : "blocked") + '" data-id="' + escapeHtml(String(p.passenger_id || "")) + '">' + (status === "blocked" ? "Unblock" : "Block") + "</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function detailsForPassenger(p) {
    return [
      "Name: " + String(p.name || "Passenger"),
      "Email: " + String(p.email || "-"),
      "Phone: " + String(p.phone || "-"),
      "CNIC: " + String(p.cnic || "-"),
      "Total rides: " + String(p.total_rides || 0),
      "Rating: " + String(p.rating ?? "N/A"),
      "Status: " + String(p.status || "inactive"),
      "Last active: " + String(p.last_active || "-"),
      "Location: " + String(p.location_hint || "Karachi")
    ].join("\n");
  }

  function renderStats(stats) {
    setText(el.statTotalUsers, formatInt(stats.total_users));
    setText(el.statTotalDrivers, formatInt(stats.total_drivers));
    setText(el.statPendingDriverApplications, formatInt(stats.pending_driver_applications || 0));
    setText(el.statTotalRides, formatInt(stats.total_rides));
    setText(el.statActiveRides, formatInt(stats.active_rides));
    setText(el.statPendingRides, formatInt(stats.pending_rides || stats.searching_rides || 0));
    setText(el.statAcceptedRides, formatInt(stats.accepted_rides || 0));
    setText(el.statCompletedRides, formatInt(stats.completed_rides));
    setText(el.statCancelledRides, formatInt(stats.cancelled_rides || 0));
    setText(el.statTodayRides, formatInt(stats.today_rides || 0));
    setText(el.statScheduledRides, formatInt(stats.scheduled_rides || 0));
    setText(el.statCarpoolRides, formatInt(stats.carpool_rides || 0));
    setText(el.statActiveSosAlerts, formatInt(stats.sos_alerts || 0));
    setText(el.statOnlineDrivers, formatInt(stats.active_drivers || stats.online_drivers || 0));
    setText(el.statPaymentRecords, formatInt(stats.payment_records || 0));
    setText(el.statReviewRecords, formatInt(stats.review_records || 0));
    // DEMO ADMIN REVENUE - remove before production
    setText(el.statEarnings, "Rs. " + formatInt(DEMO_REVENUE.total));
    setText(el.activeRideChip, formatInt(stats.active_rides) + " Active Rides");
    setText(el.notifyCount, formatInt(stats.sos_alerts || 0));
    if (el.sosSubtext) {
      const alerts = Number(stats.sos_alerts || 0);
      el.sosSubtext.textContent =
        alerts > 0 ? alerts + " active alert" + (alerts > 1 ? "s" : "") + " requiring attention" : "No active alerts";
    }
    document.querySelectorAll(".stat-card.is-loading").forEach((card) => card.classList.remove("is-loading"));
  }

  function renderQuickStats(stats) {
    setText(el.avgDuration, formatNullable(stats.avg_ride_duration_min, " mins"));
    if (stats.avg_fare === null || stats.avg_fare === undefined || stats.avg_fare === "") {
      setText(el.avgFare, "N/A");
    } else {
      setText(el.avgFare, "Rs. " + formatInt(Math.round(Number(stats.avg_fare))));
    }
    setText(el.driverRating, formatNullable(stats.driver_rating_avg, ""));
    setText(el.passengerRating, formatNullable(stats.passenger_rating_avg, ""));
    setText(el.cancelRate, (Number(stats.cancellation_rate || 0)).toFixed(2) + "%");
    setText(el.peakHours, stats.peak_hours ? String(stats.peak_hours) : "N/A");
  }

  function renderSosAlerts(alerts) {
    if (!el.sosList) return;
    if (!Array.isArray(alerts) || alerts.length === 0) {
      el.sosList.innerHTML = '<div class="empty">No records found yet.</div>';
      return;
    }
    el.sosList.innerHTML = alerts
      .map((alert) => {
        const status = String(alert.status || "active").toLowerCase();
        const cls = status === "resolved" ? "resolved" : "active";
        return (
          '<article class="sos-item">' +
          '<div class="sos-meta"><span>SOS-' + escapeHtml(String(alert.id || "")) + "</span>" +
          '<span class="sos-status ' + cls + '">' + escapeHtml(capitalize(status)) + "</span></div>" +
          "<h4>" + escapeHtml(String(alert.reporter_name || "Unknown User")) + "</h4>" +
          "<p>" + escapeHtml(String(alert.location || "Location unavailable")) + "</p>" +
          '<p class="muted">' + escapeHtml(relativeTime(String(alert.created_at || ""))) + "</p>" +
          '<div class="admin-action-group">' +
          '<button type="button" data-admin-action="view" data-id="' + escapeHtml(String(alert.id || "")) + '" data-title="SOS Alert" data-details="' + escapeHtml(detailsForSos(alert)) + '">View</button>' +
          (status === "resolved" ? "" : '<button type="button" data-admin-action="sos_status" data-status="resolved" data-id="' + escapeHtml(String(alert.id || "")) + '" class="success">Resolve</button>') +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderRecentRides(rides) {
    if (!el.recentRidesBody) return;
    if (!Array.isArray(rides) || rides.length === 0) {
      el.recentRidesBody.innerHTML = '<tr><td colspan="8" class="empty">No records found yet.</td></tr>';
      return;
    }
    el.recentRidesBody.innerHTML = rides
      .map((ride) => {
        const statusClass = String(ride.status_badge || "pending").toLowerCase();
        return (
          "<tr>" +
          "<td>" + escapeHtml(String(ride.ride_code || "-")) + "</td>" +
          "<td>" + escapeHtml(String(ride.passenger_name || "Passenger")) + "</td>" +
          "<td>" + escapeHtml(String(ride.driver_name || "Unassigned")) + "</td>" +
          '<td class="route-cell"><div>' + escapeHtml(String(ride.pickup || "-")) + "</div><div>" +
          escapeHtml(String(ride.dropoff || "-")) + "</div></td>" +
          '<td><span class="money">Rs. ' + formatInt(Math.round(Number(ride.fare || 0))) + "</span><br><span class=\"muted\">" +
          escapeHtml(String(ride.payment_label || "")) + "</span></td>" +
          '<td><span class="badge ' + escapeHtml(statusClass) + '">' + escapeHtml(capitalize(String(ride.status || ""))) + "</span></td>" +
          "<td>" + escapeHtml(relativeTime(String(ride.created_at || ""))) + "</td>" +
          '<td><div class="admin-action-group">' +
          '<button type="button" data-admin-action="view" data-id="' + escapeHtml(String(ride.id || ride.ride_code || "")) + '" data-title="Ride Details" data-details="' + escapeHtml(detailsForRide(ride)) + '">View</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderPendingDrivers(rows) {
    if (!el.pendingDriversBody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      el.pendingDriversBody.innerHTML = '<tr><td colspan="6" class="empty">No records found yet.</td></tr>';
      return;
    }
    el.pendingDriversBody.innerHTML = rows.map((driver) => (
      "<tr>" +
      "<td><strong>" + escapeHtml(String(driver.name || "Driver")) + "</strong><br><span class=\"muted\">" + escapeHtml(String(driver.id || "")) + "</span></td>" +
      "<td>" + escapeHtml(String(driver.email || "-")) + "<br><span class=\"muted\">" + escapeHtml(String(driver.phone || "-")) + "</span></td>" +
      "<td>" + escapeHtml(String(driver.vehicle || "N/A")) + "</td>" +
      '<td><span class="badge pending">' + escapeHtml(capitalize(String(driver.status || "pending"))) + "</span></td>" +
      "<td>" + escapeHtml(relativeTime(String(driver.created_at || ""))) + "</td>" +
      '<td><div class="admin-action-group">' +
      '<button type="button" data-admin-action="view" data-id="' + escapeHtml(String(driver.id || "")) + '" data-title="Driver Verification" data-details="' + escapeHtml(detailsForDriver(driver)) + '">View</button>' +
      '<button type="button" data-admin-action="driver_status" data-status="approved" data-id="' + escapeHtml(String(driver.id || "")) + '" data-application-id="' + escapeHtml(String(driver.application_id || "")) + '" data-email="' + escapeHtml(String(driver.email || "")) + '" class="success">Approve</button>' +
      '<button type="button" data-admin-action="driver_status" data-status="rejected" data-id="' + escapeHtml(String(driver.id || "")) + '" data-application-id="' + escapeHtml(String(driver.application_id || "")) + '" data-email="' + escapeHtml(String(driver.email || "")) + '" class="danger">Reject</button>' +
      "</div></td>" +
      "</tr>"
    )).join("");
  }

  function detailsForRide(ride) {
    return [
      "Ride: " + String(ride.ride_code || ride.id || "-"),
      "Passenger: " + String(ride.passenger_name || "Passenger"),
      "Driver: " + String(ride.driver_name || "Unassigned"),
      "Pickup: " + String(ride.pickup || "-"),
      "Drop-off: " + String(ride.dropoff || "-"),
      "Fare: Rs. " + formatInt(Math.round(Number(ride.fare || 0))),
      "Status: " + String(ride.status || "pending"),
      "Created: " + String(ride.created_at || "-")
    ].join("\n");
  }

  function detailsForDriver(driver) {
    return [
      "Name: " + String(driver.name || "Driver"),
      "Email: " + String(driver.email || "-"),
      "Phone: " + String(driver.phone || "-"),
      "Vehicle: " + String(driver.vehicle || "N/A"),
      "Status: " + String(driver.status || "pending"),
      "Applied: " + String(driver.created_at || "-")
    ].join("\n");
  }

  function detailsForSos(alert) {
    return [
      "Reporter: " + String(alert.reporter_name || "Unknown User"),
      "Status: " + String(alert.status || "active"),
      "Location: " + String(alert.location || "Location unavailable"),
      "Ride: " + String(alert.ride_id || "-"),
      "Created: " + String(alert.created_at || "-")
    ].join("\n");
  }

  function renderAiAnalytics(analytics) {
    const summary = analytics.summary || {};
    const hasEnoughData = Number(summary.rides || 0) > 0 || Number(summary.passengers || 0) > 0 || Number(summary.drivers || 0) > 0;
    if (!hasEnoughData) {
      if (el.aiAnalyticsGrid) el.aiAnalyticsGrid.hidden = true;
      if (el.analyticsChartsGrid) el.analyticsChartsGrid.hidden = true;
      if (el.aiAnalyticsEmpty) {
        el.aiAnalyticsEmpty.hidden = false;
        el.aiAnalyticsEmpty.textContent = "Not enough data for analytics yet.";
      }
      return;
    }
    if (el.aiAnalyticsEmpty) el.aiAnalyticsEmpty.hidden = true;
    if (el.aiAnalyticsGrid) el.aiAnalyticsGrid.hidden = false;
    if (el.analyticsChartsGrid) el.analyticsChartsGrid.hidden = false;
    const active = Number(summary.active_rides || 0);
    const completed = Number(summary.completed_rides || 0);
    const cancelled = Number(summary.cancelled_rides || 0);
    const total = Number(summary.rides || active + completed + cancelled || 0);
    const trend = analytics.driver_approval_trend || {};
    setText(el.aiPickupAreas, formatTopList(analytics.top_pickups));
    setText(el.aiDropAreas, formatTopList(analytics.top_dropoffs));
    setText(el.aiPeakTime, summary.peak_hour_label || "N/A");
    setText(el.aiActiveCompleted, active + " active / " + completed + " completed");
    setText(el.aiCancelPercent, total ? ((cancelled / total) * 100).toFixed(1) + "%" : "0%");
    setText(el.aiDriverTrend, formatInt(trend.approved || 0) + " approved / " + formatInt(trend.pending || 0) + " pending");
    setText(el.aiPassengerGrowth, formatInt(analytics.passenger_growth || 0) + " new in last 30 days");
    setText(el.aiVehicleDemand, formatKeyCounts(analytics.vehicle_usage));
    setText(el.aiSosSummary, formatInt((analytics.recent_sos || []).length) + " recent emergency record" + ((analytics.recent_sos || []).length === 1 ? "" : "s"));
    setText(el.aiRecentSos, formatRecentSos(analytics.recent_sos));
    renderAnalyticsCharts(analytics.charts || {});
  }

  function renderAnalyticsCharts(charts) {
    drawBarChart(el.chartRideRequests, charts.ride_requests_by_day, "#7f34ca");
    drawDonutChart(el.chartCompletedCancelled, charts.completed_vs_cancelled, ["#22a873", "#d94a4a"]);
    drawBarChart(el.chartVehicleDemand, charts.vehicle_type_demand, "#a64bd7");
    drawBarChart(el.chartPeakHours, thinHourlyChart(charts.peak_request_hours), "#2f8fd8");
    drawBarChart(el.chartPickupAreas, charts.pickup_areas, "#27b37e");
    drawBarChart(el.chartDropAreas, charts.dropoff_areas, "#ef6aa5");
    drawLineChart(el.chartPassengerGrowth, charts.passenger_growth, "#7f34ca");
    drawDonutChart(el.chartDriverTrend, charts.driver_approval_trend, ["#22a873", "#f0a01a", "#d94a4a"]);
    drawLineChart(el.chartSosTrend, charts.sos_alerts_trend, "#d94a4a");
    // DEMO ADMIN REVENUE - remove before production
    drawLineChart(el.chartRevenueTrend, DEMO_REVENUE.chart, "#1aa36f", true);
  }

  function buildDemoRevenue() {
    const labels = [];
    const values = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      labels.push(day.toLocaleDateString([], { month: "short", day: "numeric" }));
      values.push(randomInt(1800, 12500));
    }
    return {
      total: values.reduce((sum, value) => sum + value, 0) + randomInt(25000, 85000),
      chart: { labels, values }
    };
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function thinHourlyChart(chart) {
    const normalized = normalizeChart(chart);
    if (!normalized.labels.length) return normalized;
    const labels = [];
    const values = [];
    normalized.labels.forEach((label, index) => {
      if (index % 3 === 0) {
        labels.push(label);
        values.push(normalized.values[index] || 0);
      }
    });
    return { labels, values };
  }

  function normalizeChart(chart) {
    const labels = Array.isArray(chart?.labels) ? chart.labels.map(String) : [];
    const values = Array.isArray(chart?.values) ? chart.values.map((value) => Number(value || 0)) : [];
    return { labels, values };
  }

  function hasChartData(chart) {
    return normalizeChart(chart).values.some((value) => Number(value) > 0);
  }

  function prepareCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(260, Math.floor(rect.width || canvas.width || 420));
    const height = Math.max(180, Math.floor(rect.height || canvas.height || 220));
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px Segoe UI";
    return { ctx, width, height };
  }

  function drawEmptyChart(canvas) {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    ctx.fillStyle = "#f7f5fb";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#706287";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data for analytics yet.", width / 2, height / 2);
  }

  function drawBarChart(canvas, chart, color) {
    if (!hasChartData(chart)) {
      drawEmptyChart(canvas);
      return;
    }
    const { labels, values } = normalizeChart(chart);
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const pad = { left: 36, right: 12, top: 16, bottom: 42 };
    const max = Math.max(1, ...values);
    const slot = (width - pad.left - pad.right) / values.length;
    ctx.strokeStyle = "#e8e1f1";
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, height - pad.bottom);
    ctx.lineTo(width - pad.right, height - pad.bottom);
    ctx.stroke();
    values.forEach((value, index) => {
      const barHeight = ((height - pad.top - pad.bottom) * value) / max;
      const x = pad.left + slot * index + slot * 0.18;
      const y = height - pad.bottom - barHeight;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.max(8, slot * 0.64), barHeight);
      ctx.fillStyle = "#6d607f";
      ctx.textAlign = "center";
      ctx.fillText(shortLabel(labels[index]), x + Math.max(8, slot * 0.64) / 2, height - 20);
    });
  }

  function drawLineChart(canvas, chart, color, money) {
    if (!hasChartData(chart)) {
      drawEmptyChart(canvas);
      return;
    }
    const { labels, values } = normalizeChart(chart);
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const pad = { left: 42, right: 14, top: 18, bottom: 38 };
    const max = Math.max(1, ...values);
    const graphW = width - pad.left - pad.right;
    const graphH = height - pad.top - pad.bottom;
    const points = values.map((value, index) => ({
      x: pad.left + (graphW / Math.max(1, values.length - 1)) * index,
      y: pad.top + graphH - (value / max) * graphH,
      value
    }));
    ctx.strokeStyle = "#e8e1f1";
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + graphH);
    ctx.lineTo(width - pad.right, pad.top + graphH);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#6d607f";
    ctx.textAlign = "left";
    ctx.fillText((money ? "Rs. " : "") + formatInt(Math.round(max)), 4, pad.top + 4);
    ctx.textAlign = "center";
    labels.forEach((label, index) => {
      if (index === 0 || index === labels.length - 1 || labels.length <= 4) {
        ctx.fillText(shortLabel(label), points[index].x, height - 16);
      }
    });
  }

  function drawDonutChart(canvas, chart, colors) {
    if (!hasChartData(chart)) {
      drawEmptyChart(canvas);
      return;
    }
    const { labels, values } = normalizeChart(chart);
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const total = values.reduce((sum, value) => sum + value, 0);
    const cx = width * 0.33;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.28;
    let start = -Math.PI / 2;
    values.forEach((value, index) => {
      const angle = total ? (value / total) * Math.PI * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      start += angle;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#21164b";
    ctx.font = "700 18px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(formatInt(total), cx, cy + 6);
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "left";
    labels.forEach((label, index) => {
      const y = 42 + index * 24;
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(width * 0.62, y - 10, 10, 10);
      ctx.fillStyle = "#514168";
      ctx.fillText(shortLabel(label) + " " + formatInt(values[index] || 0), width * 0.62 + 16, y);
    });
  }

  function shortLabel(label) {
    const text = String(label || "");
    return text.length > 12 ? text.slice(0, 11) + "." : text;
  }

  function renderChart(hourlyData) {
    const canvas = el.activityChart;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = { left: 46, right: 14, top: 10, bottom: 28 };
    const graphW = width - pad.left - pad.right;
    const graphH = height - pad.top - pad.bottom;
    ctx.clearRect(0, 0, width, height);

    const values = new Array(24).fill(0);
    if (Array.isArray(hourlyData)) {
      hourlyData.forEach((item) => {
        const hour = Number(item.hour);
        const rides = Number(item.rides || 0);
        if (hour >= 0 && hour <= 23) values[hour] = rides;
      });
    }

    const maxValue = Math.max(10, ...values);
    const ticks = 4;
    ctx.strokeStyle = "#e3ddee";
    ctx.lineWidth = 1;
    for (let i = 0; i <= ticks; i += 1) {
      const y = pad.top + (graphH / ticks) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "#85789a";
      ctx.font = "12px Segoe UI";
      ctx.fillText(String(Math.round(maxValue - (maxValue / ticks) * i)), 10, y + 4);
    }

    for (let i = 0; i <= 8; i += 1) {
      const x = pad.left + (graphW / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + graphH);
      ctx.stroke();
      ctx.fillStyle = "#85789a";
      ctx.fillText(formatHourLabel(6 + i * 2), x - 14, height - 8);
    }

    const points = [];
    for (let i = 0; i <= 8; i += 1) {
      const hour = 6 + i * 2;
      const value = values[hour] || 0;
      const x = pad.left + (graphW / 8) * i;
      const y = pad.top + graphH - (value / maxValue) * graphH;
      points.push({ x, y });
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp2x = cp1x;
      ctx.bezierCurveTo(cp1x, prev.y, cp2x, curr.y, curr.x, curr.y);
    }
    ctx.strokeStyle = "#7f34ca";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + graphH);
    gradient.addColorStop(0, "rgba(127, 52, 202, 0.2)");
    gradient.addColorStop(1, "rgba(127, 52, 202, 0.02)");
    ctx.lineTo(points[points.length - 1].x, pad.top + graphH);
    ctx.lineTo(points[0].x, pad.top + graphH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function formatRealtimePassenger(passenger) {
    const status = passenger.isBlocked ? "blocked" : (passenger.verificationStatus === "pending" || passenger.isActive === false ? "pending" : "active");
    return {
      passenger_id: passenger.id || passenger.uid || "",
      uid: passenger.id || passenger.uid || "",
      name: passenger.name || passenger.fullName || "Passenger",
      email: passenger.email || "",
      phone: passenger.phone || "",
      cnic: passenger.cnic || "",
      total_rides: passenger.totalRides || passenger.total_rides || 0,
      rating: passenger.rating ?? null,
      status,
      last_active: passenger.updatedAt || passenger.createdAt || "",
      location_hint: passenger.location || "Karachi"
    };
  }

  function showDashboardMessage(message, isError, isEmpty) {
    let banner = document.getElementById("firebaseDashboardStatus");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "firebaseDashboardStatus";
      banner.className = "firebase-status-banner";
      const content = document.querySelector(".content");
      const intro = content?.querySelector(".intro");
      if (content && intro) intro.insertAdjacentElement("afterend", banner);
    }
    if (!banner) return;
    if (!message) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    banner.hidden = false;
    const safe = String(message || (isEmpty ? "No records available yet." : ""))
      .replace(/Loading\s+\w+\s+data/gi, "Preparing dashboard")
      .replace(/Admin\s+does\s+not\s+have\s+permission[^.]*\.?/gi, "Unable to load this section. Please try again.")
      .replace(/Firebase/gi, "dashboard");
    banner.textContent = safe;
    banner.classList.toggle("is-error", !!isError);
    banner.classList.toggle("is-empty", !!isEmpty);
  }

  function renderMap(payload) {
    if (isPassengersView) return;
    const mapPoints = Array.isArray(payload.map_points) ? payload.map_points : [];
    const center = isInPakistan(payload.map_center) ? payload.map_center : PAKISTAN_CENTER;
    if (!state.map || !window.WowMapbox) {
      state.pendingMapData = payload;
      return;
    }
    clearMapObjects();
    const bounds = [];
    let hasBounds = false;
    const pendingRidePairs = {};
    const liveMarkerKeys = new Set();
    mapPoints.forEach((point) => {
      const location = { lat: Number(point.lat), lng: Number(point.lng) };
      if (!isValidLatLng(location) || !isInPakistan(location)) return;
      const type = String(point.type || "").toLowerCase();
      const status = String(point.status || "").toLowerCase();
      const color = type === "driver_live" ? "#1687ff"
        : type === "passenger_live" ? "#8e44ad"
          : type === "driver" ? (status === "online" ? "#25c38b" : "#f0a01a")
            : type === "dropoff" ? "#f06aa5" : "#833fd1";
      const label = type === "driver" || type === "driver_live" ? "D"
        : type === "passenger_live" ? "P"
          : type === "dropoff" ? "B" : "A";
      const isLive = type === "driver_live" || type === "passenger_live";
      const liveKey = isLive ? `${String(point.ride_id || "")}:${type}` : "";
      let marker;
      if (isLive) {
        liveMarkerKeys.add(liveKey);
        marker = state.liveMarkers[liveKey];
        if (marker) WowMapbox.setMarkerPoint(marker, location);
        else {
          marker = WowMapbox.createLabelMarker(state.map, location, color, label);
          state.liveMarkers[liveKey] = marker;
        }
      } else {
        marker = WowMapbox.createLabelMarker(state.map, location, color, label);
        state.markers.push(marker);
      }
      bounds.push(location);
      hasBounds = true;
      const rideKey = String(point.ride_id || point.rideId || point.id || "");
      if (rideKey && ["pickup", "dropoff", "driver_live", "passenger_live"].includes(type)) {
        pendingRidePairs[rideKey] = pendingRidePairs[rideKey] || {};
        pendingRidePairs[rideKey][type] = location;
        pendingRidePairs[rideKey].status = status;
      }
    });
    Object.keys(state.liveMarkers).forEach((key) => {
      if (liveMarkerKeys.has(key)) return;
      state.liveMarkers[key]?.remove?.();
      delete state.liveMarkers[key];
    });
    Object.keys(pendingRidePairs).forEach((key) => {
      const pair = pendingRidePairs[key];
      if (!pair.pickup || !pair.dropoff) return;
      const lineId = "admin-ride-line-" + state.polylines.length;
      const started = ["ride_started", "started", "ongoing", "in_progress", "on_trip", "active"].includes(pair.status);
      const origin = pair.driver_live || pair.pickup;
      const target = started ? pair.dropoff : pair.pickup;
      WowMapbox.drawRoute(state.map, lineId, [[origin.lng, origin.lat], [target.lng, target.lat]], "#833fd1", 3);
      state.polylines.push(lineId);
    });
    if (hasBounds) {
      WowMapbox.fitMap(state.map, bounds, 56);
      enforcePakistanBounds();
      return;
    }
    state.map.easeTo({ center: [Number(center.lng || PAKISTAN_CENTER.lng), Number(center.lat || PAKISTAN_CENTER.lat)], zoom: 12 });
    enforcePakistanBounds();
  }

  function clearMapObjects() {
    state.markers.forEach((marker) => marker?.remove());
    state.polylines.forEach((lineId) => {
      if (state.map && window.WowMapbox) WowMapbox.clearRoute(state.map, lineId);
    });
    state.markers = [];
    state.polylines = [];
  }

  function isInPakistan(point) {
    if (!point || !isValidLatLng(point)) return false;
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    return lat >= PAKISTAN_BOUNDS.south
      && lat <= PAKISTAN_BOUNDS.north
      && lng >= PAKISTAN_BOUNDS.west
      && lng <= PAKISTAN_BOUNDS.east;
  }

  function enforcePakistanBounds() {
    if (!state.map) return;
    const center = state.map.getCenter();
    if (!center) return;
    const lat = clamp(center.lat, PAKISTAN_BOUNDS.south, PAKISTAN_BOUNDS.north);
    const lng = clamp(center.lng, PAKISTAN_BOUNDS.west, PAKISTAN_BOUNDS.east);
    if (lat !== center.lat || lng !== center.lng) {
      state.map.easeTo({ center: [lng, lat] });
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyOverviewSearch(term) {
    const query = String(term || "").trim().toLowerCase();
    if (!query) {
      renderRecentRides(state.allRides);
      renderSosAlerts(state.allSos);
      return;
    }
    renderRecentRides(state.allRides.filter((ride) => {
      const hay = (
        String(ride.ride_code || "") + " " +
        String(ride.passenger_name || "") + " " +
        String(ride.driver_name || "") + " " +
        String(ride.pickup || "") + " " +
        String(ride.dropoff || "")
      ).toLowerCase();
      return hay.includes(query);
    }));
    renderSosAlerts(state.allSos.filter((alert) => {
      const hay = (
        String(alert.reporter_name || "") + " " +
        String(alert.location || "") + " " +
        String(alert.ride_id || "")
      ).toLowerCase();
      return hay.includes(query);
    }));
  }

  function passengerStatusClass(status) {
    if (status === "active") return "active";
    if (status === "pending") return "pending";
    if (status === "blocked") return "blocked";
    return "inactive";
  }

  function getInitials(name) {
    const clean = String(name || "").trim();
    if (!clean) return "P";
    const parts = clean.split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("");
  }

  function formatHourLabel(hour24) {
    const hour = Number(hour24) % 24;
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return hour12 + suffix;
  }

  function formatTopList(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return "Not enough data";
    return rows.map((row) => String(row.label || "Unknown") + " (" + formatInt(row.count || 0) + ")").join(", ");
  }

  function formatKeyCounts(obj) {
    const keys = Object.keys(obj || {}).filter((key) => key && key !== "unknown");
    if (!keys.length) return "Not enough data";
    return keys
      .sort((a, b) => Number(obj[b] || 0) - Number(obj[a] || 0))
      .slice(0, 3)
      .map((key) => capitalize(key) + " (" + formatInt(obj[key] || 0) + ")")
      .join(", ");
  }

  function formatRecentSos(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return "No recent emergency records.";
    return rows.map((row) => {
      const who = String(row.reporter_name || "Unknown User");
      const status = capitalize(String(row.status || "active"));
      return who + " - " + status;
    }).join("; ");
  }

  function capitalize(value) {
    const txt = String(value || "").replace(/_/g, " ");
    if (!txt) return "";
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function formatInt(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }

  function formatNullable(value, suffix) {
    if (value === null || value === undefined || value === "") return "N/A";
    const n = Number(value);
    if (!Number.isFinite(n)) return "N/A";
    return n.toFixed(2).replace(/\.00$/, "") + suffix;
  }

  function relativeTime(dateTime) {
    if (!dateTime) return "Just now";
    const now = Date.now();
    const parsed = Date.parse(String(dateTime).replace(" ", "T"));
    if (!Number.isFinite(parsed)) return String(dateTime);
    const diff = Math.max(0, now - parsed);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + " min" + (mins > 1 ? "s" : "") + " ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + " hour" + (hours > 1 ? "s" : "") + " ago";
    const days = Math.floor(hours / 24);
    if (days < 7) return days + " day" + (days > 1 ? "s" : "") + " ago";
    const weeks = Math.floor(days / 7);
    return weeks + " week" + (weeks > 1 ? "s" : "") + " ago";
  }

  function isValidLatLng(point) {
    return (
      point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lng) <= 180
    );
  }

  function setText(node, text) {
    if (node) node.textContent = String(text);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}());
