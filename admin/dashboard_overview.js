(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { latest: null, timer: null, loading: false, revenueLoading: false, revenueRequest: null };
  let resolvingSos = null;
  const routes = {
    pending_drivers: "drivers.php?filter=pending",
    active_sos: "sos_monitoring.php",
    open_lost_found: "lost_found.php",
    pending_payments: "payments.php?filter=pending",
    unresolved_reports: "ratings_reviews.php"
  };
  const labels = {
    pending_drivers: "Pending driver verifications",
    active_sos: "Active SOS alerts",
    open_lost_found: "Open Lost and Found cases",
    pending_payments: "Pending payment issues",
    unresolved_reports: "Unresolved reports"
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindHeader();
    bindSosActions();
    load();
    state.timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
  });
  window.addEventListener("pagehide", () => state.timer && clearInterval(state.timer));

  function bindHeader() {
    $("refreshNow")?.addEventListener("click", load);
    $("financialDateFilter")?.addEventListener("change", () => {
      const root = $("revenueOverview");
      if (root) root.innerHTML = '<div class="v2-skeleton rows"></div>';
      loadRevenue();
    });
    const search = $("dashboardSearch");
    search?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const query = clean(search.value);
      if (query) window.location.assign("rides.php?search=" + encodeURIComponent(query));
    });
    document.querySelectorAll("[data-menu-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const target = document.getElementById(button.dataset.menuToggle);
        document.querySelectorAll(".v2-dropdown.is-open").forEach((menu) => menu !== target && menu.classList.remove("is-open"));
        target?.classList.toggle("is-open");
      });
    });
    document.addEventListener("click", () => document.querySelectorAll(".v2-dropdown.is-open").forEach((menu) => menu.classList.remove("is-open")));
  }

  async function loadRevenue() {
    if (state.revenueLoading && state.revenueRequest) state.revenueRequest.abort();
    const controller = new AbortController();
    state.revenueRequest = controller;
    state.revenueLoading = true;
    try {
      const filter = $("financialDateFilter")?.value || "all";
      const response = await fetch("dashboard_data.php?mode=revenue&financial_filter=" + encodeURIComponent(filter), {
        headers: { Accept: "application/json" }, credentials: "same-origin", signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.message || "Revenue unavailable");
      if (state.latest) state.latest.revenue = payload.revenue;
      renderRevenue(payload.revenue || {});
      text("statEarnings", money(payload.revenue?.wow_commission_earnings || 0));
    } catch (error) {
      if (error.name !== "AbortError") {
        showMessage("Revenue data could not be refreshed. Please try again.");
        renderRevenue(state.latest?.revenue || {});
      }
    } finally {
      if (state.revenueRequest === controller) {
        state.revenueLoading = false;
        state.revenueRequest = null;
      }
    }
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      const filter = $("financialDateFilter")?.value || "all";
      const response = await fetch("dashboard_data.php?financial_filter=" + encodeURIComponent(filter), { headers: { Accept: "application/json" }, credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(payload.message || "Dashboard unavailable");
      state.latest = payload;
      render(payload);
      window.dispatchEvent(new CustomEvent("wow-admin-dashboard-data", { detail: payload }));
      window.dispatchEvent(new CustomEvent("wow-admin-dashboard-refreshed"));
      setUpdated(payload.generated_at);
      showMessage("");
    } catch (error) {
      showMessage("Live dashboard data could not be refreshed. Existing values are retained.");
      removeLoading();
    } finally {
      state.loading = false;
    }
  }

  function render(data) {
    renderCore(data);
    renderAttention(data.attention || {});
    renderRevenue(data.revenue || {});
    renderActivity(data.recent_activity || []);
    renderDrivers(data.pending_drivers || []);
    renderSos(data.sos_alerts || []);
    renderLostFound(data.lost_found || {});
    removeLoading();
  }

  function renderCore(data) {
    const stats = data.stats || {};
    text("statTotalUsers", integer(stats.total_users));
    text("statTotalDrivers", integer(stats.total_drivers));
    text("statActiveRides", integer(stats.active_rides));
    text("statPendingDriverApplications", integer(stats.pending_driver_applications));
    text("statActiveSosAlerts", integer(stats.sos_alerts));
    const commissionValue = data.revenue?.wow_commission_earnings ?? state.latest?.revenue?.wow_commission_earnings;
    if (commissionValue !== undefined) text("statEarnings", money(commissionValue));
    text("notifyCount", integer(stats.sos_alerts));
    text("sidebarSosCount", integer(stats.sos_alerts));
    text("opActiveRides", integer(stats.active_rides));
    text("opOnlineDrivers", integer(stats.active_drivers));
    text("opWaitingRides", integer(stats.pending_rides || stats.searching_rides));
    text("opScheduledRides", integer(stats.scheduled_rides));
    text("opEmergencyRides", integer(stats.emergency_rides));
    renderRideSummary(stats);
    renderInsights(data.analytics || {}, data.quick_stats || {});
  }

  function renderAttention(items) {
    const root = $("attentionList");
    if (!root) return;
    root.innerHTML = Object.keys(labels).map((key) =>
      '<div class="v2-attention-row"><span><i></i>' + esc(labels[key]) + '</span><strong>' + integer(items[key]) +
      '</strong><a href="' + esc(routes[key]) + '">View</a></div>'
    ).join("");
  }

  function renderRideSummary(stats) {
    const root = $("rideSummary");
    if (!root) return;
    const values = [
      ["Completed", stats.completed_rides, "done"],
      ["Cancelled", stats.cancelled_rides, "cancel"],
      ["Scheduled", stats.scheduled_rides, "scheduled"],
      ["Carpool", stats.carpool_rides, "carpool"],
      ["Today requests", stats.today_rides, "today"]
    ];
    const max = Math.max(1, ...values.map((item) => Number(item[1] || 0)));
    root.innerHTML = values.map(([label, value, cls]) =>
      '<div class="v2-summary-row"><span>' + esc(label) + '</span><div><i class="' + cls + '" style="width:' +
      Math.max(5, Math.round((Number(value || 0) / max) * 100)) + '%"></i></div><strong>' + integer(value) + "</strong></div>"
    ).join("");
  }

  function renderRevenue(revenue) {
    const root = $("revenueOverview");
    if (!root) return;
    const rows = [
      ["Gross Ride Revenue", money(revenue.gross_ride_revenue), "Completed and confirmed payments only"],
      ["WOW Commission Earnings", money(revenue.wow_commission_earnings), "30% platform commission"],
      ["Driver Earnings", money(revenue.driver_earnings), "70% driver share"],
      ["Pending Online Payments", money(revenue.pending_online_payments), "Completed rides awaiting confirmation"],
      ["Refunded Amount", money(revenue.refunded_amount), "Confirmed refunds and reversals"]
    ];
    root.innerHTML = rows.map(([label, value, sub]) => '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(sub) + "</small></div>").join("");
  }

  function renderActivity(rows) {
    const body = $("recentActivityBody");
    if (!body) return;
    body.innerHTML = rows.length ? rows.slice(0, 5).map((row) =>
      "<tr><td><strong>" + esc(safe(row.type, "Activity")) + "</strong></td><td>" + esc(safe(row.user, "User unavailable")) +
      "</td><td>" + esc(safe(row.details, "Details unavailable")) + '</td><td><span class="v2-badge ' + statusClass(row.status) + '">' +
      esc(label(row.status)) + "</span></td><td>" + esc(relative(row.time)) + '</td><td><a class="v2-row-action" href="' +
      esc(safe(row.route, "rides.php")) + '">View</a></td></tr>'
    ).join("") : emptyRow(6, "No recent activity exists yet.");
  }

  function renderDrivers(rows) {
    const root = $("pendingDriversList");
    if (!root) return;
    const pending = rows.filter((row) => String(row.status || "").toLowerCase() === "pending").slice(0, 3);
    root.innerHTML = pending.length ? pending.map((row) =>
      '<div class="v2-list-row"><span class="v2-avatar">' + esc(initials(row.name)) + '</span><div><strong>' +
      esc(safe(row.name, "Driver unavailable")) + '</strong><span>' + esc(label(row.vehicle)) + " · " +
      esc(relative(row.created_at)) + '</span></div><a href="drivers.php?driver=' + encodeURIComponent(safe(row.id, row.application_id)) +
      '">View Profile</a></div>'
    ).join("") : emptyBlock("No pending driver verifications.");
  }

  function renderSos(rows) {
    const root = $("activeSosList");
    if (!root) return;
    const active = rows.filter((row) => !["resolved", "false_alarm", "closed"].includes(String(row.status || "").toLowerCase())).slice(0, 3);
    root.innerHTML = active.length ? active.map((row) =>
      '<article class="v2-sos-row" data-sos-id="' + esc(safe(row.id, "")) + '">' +
      '<div class="v2-sos-identity">' + sosAvatar(row) + '<div><strong title="' + esc(safe(row.reporter_name, "User unavailable")) + '">' +
      esc(safe(row.reporter_name, "User unavailable")) + '</strong><span class="v2-sos-role">' + esc(label(row.role || "passenger")) +
      '</span><small title="' + esc(safe(row.ride_code || row.ride_id, "Unavailable")) + '">Ride ' +
      esc(safe(row.ride_code || row.ride_id, "Unavailable")) + '</small></div></div>' +
      '<div class="v2-sos-route"><span title="' + esc(safe(row.pickup, "Pickup unavailable")) + '"><b>Pickup</b> ' +
      esc(safe(row.pickup, "Pickup unavailable")) + '</span><span title="' + esc(safe(row.dropoff, "Drop-off unavailable")) +
      '"><b>Drop-off</b> ' + esc(safe(row.dropoff, "Drop-off unavailable")) + '</span><small>Triggered ' +
      esc(relative(row.created_at)) + ' | ' + esc(row.location_available ? "Live location available" : "Location unavailable") +
      '</small></div><div class="v2-sos-actions"><span class="v2-badge ' + statusClass(row.status) + '">' +
      esc(label(row.status || "active")) + '</span><div><a class="v2-sos-track' + (row.location_available ? "" : " disabled") +
      '" ' + (row.location_available ? 'href="sos_monitoring.php?incident=' + encodeURIComponent(safe(row.id, "")) + '&track=1"' : 'aria-disabled="true"') +
      ' title="View live location"><span aria-hidden="true">&#9906;</span> Track</a><button class="v2-sos-resolve" type="button" data-resolve-sos="' +
      esc(safe(row.id, "")) + '"><span aria-hidden="true">&#10003;</span> Resolve</button></div></div></article>'
    ).join("") : emptyBlock("No active SOS alerts.");
  }

  function sosAvatar(row) {
    const name = safe(row.reporter_name, "User");
    if (row.profile_image) return '<img class="v2-sos-avatar" src="' + esc(row.profile_image) + '" alt="" loading="lazy" decoding="async">';
    return '<span class="v2-sos-avatar initials">' + esc(initials(name)) + "</span>";
  }

  function bindSosActions() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-resolve-sos]");
      if (!button) return;
      const row = (state.latest?.sos_alerts || []).find((item) => String(item.id) === String(button.dataset.resolveSos));
      if (row) openResolveSos(row, button);
    });
  }

  function ensureResolveModal() {
    if ($("dashboardSosResolve")) return;
    document.body.insertAdjacentHTML("beforeend", '<div class="v2-modal-backdrop" id="dashboardSosResolve" hidden><section class="v2-modal" role="dialog" aria-modal="true" aria-labelledby="dashboardSosResolveTitle"><button class="v2-modal-close" type="button" data-close-sos-modal aria-label="Close">&times;</button><p class="v2-eyebrow danger">Safety action</p><h2 id="dashboardSosResolveTitle">Resolve SOS Alert</h2><div id="dashboardSosResolveFacts" class="v2-modal-facts"></div><label for="dashboardSosResolutionNote">Resolution note<textarea id="dashboardSosResolutionNote" maxlength="500" required placeholder="Briefly describe how this alert was resolved"></textarea></label><p class="v2-modal-error" id="dashboardSosResolveError" role="alert"></p><div class="v2-modal-actions"><button class="v2-button" type="button" data-close-sos-modal>Cancel</button><button class="v2-button danger" id="dashboardSosResolveConfirm" type="button">Confirm Resolve</button></div></section></div>');
    const modal = $("dashboardSosResolve");
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-sos-modal]")) closeResolveSos();
    });
    $("dashboardSosResolveConfirm").addEventListener("click", confirmResolveSos);
  }

  function openResolveSos(row, trigger) {
    ensureResolveModal();
    resolvingSos = { row, trigger };
    $("dashboardSosResolveFacts").innerHTML = '<div><span>User</span><strong>' + esc(safe(row.reporter_name, "User unavailable")) +
      '</strong></div><div><span>Ride</span><strong>' + esc(safe(row.ride_code || row.ride_id, "Unavailable")) +
      '</strong></div><div><span>Triggered</span><strong>' + esc(relative(row.created_at)) + "</strong></div>";
    $("dashboardSosResolutionNote").value = "";
    $("dashboardSosResolveError").textContent = "";
    $("dashboardSosResolve").hidden = false;
    document.body.classList.add("v2-modal-open");
    $("dashboardSosResolutionNote").focus();
  }

  function closeResolveSos() {
    const modal = $("dashboardSosResolve");
    if (!modal || $("dashboardSosResolveConfirm")?.disabled) return;
    modal.hidden = true;
    document.body.classList.remove("v2-modal-open");
    resolvingSos?.trigger?.focus();
    resolvingSos = null;
  }

  async function confirmResolveSos() {
    if (!resolvingSos) return;
    const note = $("dashboardSosResolutionNote").value.trim();
    if (!note) {
      $("dashboardSosResolveError").textContent = "Please enter a short resolution note.";
      return;
    }
    const button = $("dashboardSosResolveConfirm");
    button.disabled = true;
    button.textContent = "Resolving...";
    try {
      const response = await fetch("sos_api.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "status", id: resolvingSos.row.id, status: "resolved", resolutionNote: note })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "Unable to resolve this SOS alert.");
      state.latest.sos_alerts = (state.latest.sos_alerts || []).filter((item) => item.id !== resolvingSos.row.id);
      if (state.latest.stats) state.latest.stats.sos_alerts = Math.max(0, Number(state.latest.stats.sos_alerts || 0) - 1);
      renderSos(state.latest.sos_alerts);
      renderCore(state.latest);
      button.disabled = false;
      closeResolveSos();
      showMessage("SOS alert resolved successfully.");
    } catch (error) {
      $("dashboardSosResolveError").textContent = error.message || "Unable to resolve this SOS alert.";
    } finally {
      button.disabled = false;
      button.textContent = "Confirm Resolve";
    }
  }

  function renderLostFound(data) {
    const counts = data.counts || {};
    const countRoot = $("lostFoundCounts");
    if (countRoot) countRoot.innerHTML = [
      ["Open", counts.open], ["Item found", counts.item_found], ["Return arranged", counts.return_arranged], ["Resolved", counts.resolved]
    ].map(([name, value]) => '<div><span>' + esc(name) + '</span><strong>' + integer(value) + "</strong></div>").join("");
    const body = $("lostFoundBody");
    const rows = Array.isArray(data.cases) ? data.cases.slice(0, 3) : [];
    if (body) body.innerHTML = rows.length ? rows.map((row) =>
      "<tr><td><strong>" + esc(safe(row.item_name, "Item unavailable")) + "</strong></td><td>" + esc(safe(row.ride_id, "Unavailable")) +
      "</td><td>" + esc(safe(row.passenger, "Passenger unavailable")) + "</td><td>" + esc(safe(row.driver, "Driver unavailable")) +
      '</td><td><span class="v2-badge ' + statusClass(row.status) + '">' + esc(label(row.status)) +
      '</span></td><td><a class="v2-row-action" href="lost_found.php?case=' + encodeURIComponent(safe(row.id, "")) + '">View Case</a></td></tr>'
    ).join("") : emptyRow(6, "No Lost and Found cases.");
  }

  function renderInsights(analytics, quick) {
    const root = $("aiInsights");
    if (!root) return;
    const pickup = Array.isArray(analytics.top_pickups) && analytics.top_pickups[0] ? analytics.top_pickups[0].label : "Not enough data";
    root.innerHTML = [
      ["Most requested pickup area", pickup],
      ["Peak ride request time", safe(quick.peak_hours || analytics.summary?.peak_hour_label, "Not enough data")],
      ["Cancellation rate", Number(quick.cancellation_rate || 0).toFixed(1) + "%"]
    ].map(([name, value]) => '<div><span>' + esc(name) + '</span><strong>' + esc(safe(value, "Not enough data")) + "</strong></div>").join("");
  }

  function removeLoading() { document.querySelectorAll(".is-loading").forEach((node) => node.classList.remove("is-loading")); }
  function setUpdated(value) { text("dashboardUpdated", "Live data · Updated " + relative(value || new Date().toISOString())); }
  function showMessage(message) { const box = $("dashboardMessage"); if (!box) return; box.hidden = !message; box.textContent = message; }
  function text(id, value) { const node = $(id); if (node) node.textContent = value; }
  function integer(value) { return new Intl.NumberFormat("en-PK").format(Number(value || 0)); }
  function money(value) { return "Rs. " + new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function safe(value, fallback) { const text = clean(value); return !text || ["null", "undefined", "[object Object]"].includes(text) ? fallback : text; }
  function label(value) { return safe(value, "Unavailable").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
  function statusClass(value) { const status = String(value || "").toLowerCase(); return /resolved|completed|approved|paid|returned/.test(status) ? "success" : /cancel|reject|sos|active/.test(status) ? "danger" : "warning"; }
  function initials(value) { return safe(value, "D").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
  function relative(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "Time unavailable";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    return date.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
  }
  function emptyRow(cols, message) { return '<tr><td colspan="' + cols + '" class="v2-empty">' + esc(message) + "</td></tr>"; }
  function emptyBlock(message) { return '<div class="v2-empty">' + esc(message) + "</div>"; }
  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
})();
