(function () {
  "use strict";
  const API = "auth_monitoring_data.php";
  const state = { page: 1, rows: [], tab: "all", pagination: {}, timer: null, selected: null };
  const el = {};
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const label = value => String(value || "").replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  const eventLabel = value => ({ login_success: "Login Successful", login_failed: "Login Failed", logout: "Logged Out", password_reset_requested: "Password Reset Requested", password_reset_email_sent: "Password Reset Email Sent", password_reset_failed: "Password Reset Failed", password_changed: "Password Changed", email_verification_sent: "Verification Email Sent", email_verification_failed: "Verification Email Failed", email_verified: "Email Verified", google_sign_in_success: "Google Sign-In Successful", google_sign_in_failed: "Google Sign-In Failed", role_access_denied: "Role Access Denied" }[value] || label(value));
  const initials = value => String(value || "?").split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || "";

  document.addEventListener("DOMContentLoaded", init, { once: true });
  function init() {
    ["amExport","amSuccess","amFailed","amResets","amUnverified","amSuspicious","amAllCount","amSearch","amClear","amRole","amStatus","amSource","amProvider","amDate","amRefresh","amBody","amCount","amPrev","amNext","amPage","amBackdrop","amClose","amModalTitle","amModalBadges","amUserInfo","amEventInfo","amTechnical","amModalActions","amToast"].forEach(id => { el[id] = $(id); });
    document.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => { state.tab = button.dataset.tab; document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("active", item === button)); load(1); });
    el.amSearch.oninput = () => { el.amClear.hidden = !el.amSearch.value; clearTimeout(state.timer); state.timer = setTimeout(() => load(1), 350); };
    el.amClear.onclick = () => { el.amSearch.value = ""; el.amClear.hidden = true; load(1); };
    [el.amRole, el.amStatus, el.amSource, el.amProvider, el.amDate].forEach(input => input.onchange = () => load(1));
    el.amRefresh.onclick = () => load(state.page);
    el.amExport.onclick = () => location.assign(`${API}?${params({ export: "csv" })}`);
    el.amPrev.onclick = () => load(state.page - 1);
    el.amNext.onclick = () => load(state.page + 1);
    el.amBody.onclick = event => { const view = event.target.closest("[data-view]"); if (view) open(view.dataset.view); };
    el.amModalActions.onclick = event => { if (event.target.closest("[data-close]")) close(); if (event.target.closest("[data-reviewed]")) markReviewed(); };
    el.amClose.onclick = close;
    el.amBackdrop.onclick = event => { if (event.target === el.amBackdrop) close(); };
    document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    load(1);
  }
  function params(extra = {}) { return new URLSearchParams({ page: String(state.page), page_size: "25", tab: state.tab, q: el.amSearch.value.trim(), role: el.amRole.value, status: el.amStatus.value, source: el.amSource.value, provider: el.amProvider.value, date: el.amDate.value, ...extra }); }
  async function load(page) {
    state.page = Math.max(1, page); el.amBody.innerHTML = '<tr><td colspan="9"><div class="am-skeleton"></div></td></tr>';
    try {
      const response = await fetch(`${API}?${params()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message);
      state.rows = data.rows || []; state.pagination = data.pagination || {}; renderSummary(data.summary || {}); renderRows(); renderPagination();
    } catch (error) {
      console.error("[Authentication Monitoring]", error);
      el.amBody.innerHTML = '<tr><td colspan="9" class="am-empty"><strong>Authentication activity could not be loaded.</strong><span>Check the connection or admin permissions and retry.</span><button class="am-btn secondary" data-retry>Retry</button></td></tr>';
      el.amBody.querySelector("[data-retry]").onclick = () => load(state.page);
    }
  }
  function renderSummary(summary) { set("amSuccess", summary.successful_today || 0); set("amFailed", summary.failed_today || 0); set("amResets", summary.resets_today || 0); set("amUnverified", summary.unverified_accounts || 0); set("amSuspicious", summary.suspicious || 0); set("amAllCount", state.pagination.total || 0); }
  function renderRows() {
    if (!state.rows.length) {
      const message = state.tab === "recovery" ? "No password reset activity has been recorded." : state.tab === "verification" ? "No email verification activity found." : state.tab === "security" ? "No suspicious authentication activity detected." : "No authentication activity found for the selected filters.";
      el.amBody.innerHTML = `<tr><td colspan="9" class="am-empty"><strong>${message}</strong><span>Clear filters or refresh the real audit data.</span><button class="am-btn secondary" data-clear>Clear Filters</button></td></tr>`;
      el.amBody.querySelector("[data-clear]").onclick = clearFilters; return;
    }
    el.amBody.innerHTML = state.rows.map(row => `<tr><td><div class="am-user"><span>${escapeHtml(initials(row.user_name))}</span><div><strong>${escapeHtml(row.user_name)}</strong><small>${escapeHtml(row.email || "Email unavailable")}</small></div></div></td><td><span class="am-role">${escapeHtml(label(row.role))}</span></td><td><strong>${escapeHtml(eventLabel(row.event_type))}</strong><small>${escapeHtml(row.failure_reason ? friendlyReason(row.failure_reason) : activityDescription(row))}</small></td><td>${escapeHtml(row.provider_label)}</td><td><span class="am-source">${escapeHtml(row.source_label)}</span></td><td><span class="am-badge ${escapeHtml(row.status)}">${escapeHtml(label(row.status))}</span></td><td title="${escapeHtml(row.created_at)}"><strong>${escapeHtml(dateOnly(row.created_at))}</strong><small>${escapeHtml(timeOnly(row.created_at))}</small></td><td><span class="am-risk ${row.is_suspicious ? "high" : row.status === "failed" ? "low" : "normal"}" title="${escapeHtml(row.risk_reason || riskText(row))}">${row.is_suspicious ? "High" : row.status === "failed" ? "Low" : "Normal"}</span></td><td><button class="am-view" data-view="${escapeHtml(row.id)}">View</button></td></tr>`).join("");
  }
  function open(id) {
    const row = state.rows.find(item => item.id === id); if (!row) return; state.selected = row;
    set("amModalTitle", eventLabel(row.event_type));
    el.amModalBadges.innerHTML = `<span class="am-badge ${escapeHtml(row.status)}">${escapeHtml(label(row.status))}</span><span class="am-source">${escapeHtml(row.source_label)}</span>`;
    el.amUserInfo.innerHTML = facts([["Name",row.user_name],["Email",row.email || "Unavailable"],["Role",label(row.role)],["User ID",shortId(row.user_id)],["Account Status",row.account_status],["Email Verification",row.email_verified === null ? "Unavailable" : row.email_verified ? "Verified" : "Not verified"]]);
    el.amEventInfo.innerHTML = facts([["Activity",eventLabel(row.event_type)],["Provider",row.provider_label],["Source Platform",row.source_label],["Date and Time",date(row.created_at)],["Status",label(row.status)],["Failure Reason",row.failure_reason ? friendlyReason(row.failure_reason) : "Not applicable"],["Risk Level",row.is_suspicious ? "High" : row.status === "failed" ? "Low" : "Normal"],["Risk Reason",row.risk_reason || riskText(row)]]);
    el.amTechnical.innerHTML = facts([["Event ID",shortId(row.id)],["Firebase Error Code",row.failure_reason || "Not available"],["Device Category",row.device],["Browser or App",safeClient(row.client)],["Reviewed",row.reviewed ? "Yes" : "No"],["Legacy Audit",row.legacy ? "Yes" : "No"]]);
    const profileLink = row.user_id ? `<a class="am-btn primary" href="${row.role === "driver" ? "drivers.php?open=" : row.role === "passenger" ? "dashboard.php?view=passengers&open=" : "settings.php?admin="}${encodeURIComponent(row.user_id)}">Open User Profile</a>` : "";
    const reviewButton = !row.legacy && !row.reviewed ? '<button class="am-btn secondary" data-reviewed>Mark Reviewed</button>' : "";
    el.amModalActions.innerHTML = `${profileLink}${reviewButton}<button class="am-btn secondary" data-close>Close</button>`;
    el.amBackdrop.hidden = false; document.body.classList.add("am-modal-open"); el.amClose.focus();
  }
  async function markReviewed() {
    if (!state.selected || state.selected.legacy || state.selected.reviewed) return;
    const button = el.amModalActions.querySelector("[data-reviewed]"); if (button) { button.disabled = true; button.textContent = "Saving..."; }
    try {
      const response = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "mark_reviewed", event_id: state.selected.id, csrf_token: csrf() }) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message);
      toast(data.message || "Event marked as reviewed."); close(); await load(state.page);
    } catch (error) { toast(error.message || "The event could not be updated.", true); if (button) { button.disabled = false; button.textContent = "Mark Reviewed"; } }
  }
  function facts(items) { return items.map(([key,value]) => `<article><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></article>`).join(""); }
  function renderPagination() { const page = state.pagination; set("amCount", `${page.total || 0} authentication events`); set("amPage", `Page ${page.page || 1} of ${page.total_pages || 1}`); el.amPrev.disabled = !page.has_prev; el.amNext.disabled = !page.has_next; }
  function clearFilters() { el.amSearch.value = ""; el.amClear.hidden = true; [el.amRole,el.amStatus,el.amSource,el.amProvider].forEach(input => { input.value = "all"; }); el.amDate.value = "7d"; load(1); }
  function close() { el.amBackdrop.hidden = true; document.body.classList.remove("am-modal-open"); state.selected = null; }
  function toast(message, error = false) { el.amToast.textContent = message; el.amToast.classList.toggle("error", error); el.amToast.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.amToast.hidden = true; }, 3500); }
  function date(value) { return value ? new Date(value).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "Not available"; }
  function dateOnly(value) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? "Date unavailable" : parsed.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }); }
  function timeOnly(value) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? "Time unavailable" : parsed.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" }); }
  function friendlyReason(value) { return String(value).replace(/^auth\//, "").replace(/_/g, " "); }
  function activityDescription(row) { return row.event_type === "login_success" ? "Account access completed" : row.event_type === "logout" ? "Session ended securely" : "Authentication event recorded"; }
  function riskText(row) { return row.status === "failed" ? "Single failed authentication attempt" : "No suspicious indicators"; }
  function safeClient(value) { const text = String(value || ""); return text.length > 100 ? `${text.slice(0,97)}...` : text; }
  function shortId(value) { const text = String(value || ""); return text.length > 16 ? `${text.slice(0,7)}...${text.slice(-5)}` : text || "Unavailable"; }
  function set(id, value) { if ($(id)) $(id).textContent = String(value); }
  window.addEventListener("pagehide", () => clearTimeout(state.timer), { once: true });
})();
