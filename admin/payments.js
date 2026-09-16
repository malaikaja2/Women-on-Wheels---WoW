(function () {
  "use strict";

  const API = "payments_data.php";
  const S = { rows: [], chart: [], selected: null, dialog: null };
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    ["payStatus", "payMethod", "payDate", "payType"].forEach((id) => {
      $(id).addEventListener("change", id === "payDate" ? load : render);
    });
    let searchTimer;
    $("paySearch").addEventListener("input", () => {
      clearTimeout(searchTimer);
      $("payClear").hidden = !$("paySearch").value;
      searchTimer = setTimeout(render, 250);
    });
    $("payClear").onclick = () => {
      $("paySearch").value = "";
      $("payClear").hidden = true;
      render();
    };
    $("payRefresh").onclick = load;
    $("payRetry").onclick = load;
    $("payExport").onclick = exportCsv;
    $("payRows").addEventListener("click", rowAction);
    $("payClose").onclick = close;
    $("payBackdrop").onclick = (event) => {
      if (event.target === event.currentTarget) close();
    };
    $("payModalActions").addEventListener("click", modalAction);
    $("payDialogClose").onclick = closeDialog;
    $("payDialogCancel").onclick = closeDialog;
    $("payDialogForm").addEventListener("submit", submitDialog);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") S.dialog ? closeDialog() : close();
    });
    await load();
  }

  async function api(body = { action: "list", date: $("payDate")?.value || "all" }) {
    const response = await fetch(API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw Error(json.message || "Payment request failed.");
    return json;
  }

  async function load() {
    try {
      $("payError").hidden = true;
      const json = await api();
      S.rows = json.transactions || [];
      S.chart = json.chart || [];
      summary(json.summary || {});
      chart();
      render();
    } catch (error) {
      $("payError").hidden = false;
      $("payRows").innerHTML = "";
      toast(error.message, true);
    }
  }

  function summary(data) {
    set("payGross", money(data.gross_ride_revenue));
    set("payCommission", money(data.wow_commission));
    set("payDrivers", money(data.driver_earnings));
    set("payPending", money(data.pending_online));
    set("payRefunded", money(data.refunded_amount));
  }

  function filtered() {
    const query = $("paySearch").value.trim().toLowerCase();
    const status = $("payStatus").value;
    const method = $("payMethod").value;
    const type = $("payType").value;
    const dateFilter = $("payDate").value;
    const now = Date.now();
    return S.rows.filter((row) => {
      if (status !== "all" && row.status !== status && !(status === "refunded" && row.status === "partially_refunded")) return false;
      if (method !== "all" && row.method !== method) return false;
      if (type !== "all" && row.ride_type !== type) return false;
      const time = Date.parse(row.date_time || "");
      if (dateFilter === "today" && (!time || new Date(time).toDateString() !== new Date().toDateString())) return false;
      if (dateFilter === "7d" && (!time || now - time > 6048e5)) return false;
      if (dateFilter === "30d" && (!time || now - time > 2592e6)) return false;
      if (dateFilter === "month" && (!time || new Date(time).getMonth() !== new Date().getMonth())) return false;
      if (dateFilter === "year" && (!time || new Date(time).getFullYear() !== new Date().getFullYear())) return false;
      return !query || [
        row.payment_id,
        row.transaction_id,
        row.ride_code,
        row.passenger_name,
        row.passenger_email,
        row.driver_name,
        row.driver_email
      ].join(" ").toLowerCase().includes(query);
    });
  }

  function render() {
    const rows = filtered();
    set("payCount", rows.length + " payment records");
    $("payRows").innerHTML = rows.length
      ? rows.map(rowHtml).join("")
      : '<tr><td colspan="9"><div class="pay-empty"><strong>No payments match the selected filters.</strong><p>Clear filters or refresh data.</p></div></td></tr>';
  }

  function rowHtml(row) {
    const commissionPercent = percent(row.commission_percent || 30);
    const driverPercent = percent(100 - Number(row.commission_percent || 30));
    return '<tr><td><strong>' + esc(displayPay(row)) + '</strong><small>' + label(row.status) + (row.has_payment_record ? "" : " - record pending") + '</small></td>'
      + '<td><strong>' + esc(row.ride_code) + '</strong><small>' + label(row.ride_type) + ' Ride</small></td>'
      + '<td>' + person(row.passenger_name, "Passenger") + '</td>'
      + '<td>' + person(row.driver_name, "Driver") + '</td>'
      + '<td><div class="pay-break"><span>Gross <b>' + money(row.gross_fare) + '</b></span><span>WOW ' + commissionPercent + ' <b>' + money(row.wow_commission) + '</b></span><span>Driver ' + driverPercent + ' <b>' + money(row.driver_share) + '</b></span></div></td>'
      + '<td><span class="pay-method">' + esc(row.method) + '</span></td>'
      + '<td><span class="pay-status ' + esc(row.status) + '">' + label(row.status) + '</span><small>Commission: ' + label(row.commission_status) + '</small></td>'
      + '<td title="' + exact(row.date_time) + '">' + date(row.date_time) + '<small>' + time(row.date_time) + '</small></td>'
      + '<td><div class="pay-actions"><button class="pay-btn primary" data-view="' + esc(row.id) + '">View</button><button class="pay-more" data-menu="' + esc(row.id) + '">...</button><div class="pay-menu" data-for="' + esc(row.id) + '" hidden>' + menu(row) + '</div></div></td></tr>';
  }

  function menu(row) {
    let html = '<button data-view="' + esc(row.id) + '">View Payment Details</button><a href="rides.php?open=' + encodeURIComponent(row.ride_id) + '">Open Ride</a>';
    if (row.has_payment_record && row.status === "pending" && row.method !== "Cash") html += '<button data-confirm="' + esc(row.id) + '">Confirm Payment</button>';
    if (row.has_payment_record && (row.status === "paid" || row.status === "partially_refunded")) html += '<button data-refund="' + esc(row.id) + '">Process Refund</button>';
    return html;
  }

  function rowAction(event) {
    const menuButton = event.target.closest("[data-menu]");
    if (menuButton) {
      document.querySelectorAll(".pay-menu").forEach((menuEl) => {
        menuEl.hidden = menuEl.dataset.for !== menuButton.dataset.menu || !menuEl.hidden;
      });
      return;
    }
    const view = event.target.closest("[data-view]");
    if (view) return open(view.dataset.view);
    const confirm = event.target.closest("[data-confirm]");
    if (confirm) return confirmDialog(find(confirm.dataset.confirm));
    const refund = event.target.closest("[data-refund]");
    if (refund) return refundDialog(find(refund.dataset.refund));
  }

  function open(id) {
    const row = find(id);
    if (!row) return;
    S.selected = row;
    $("payBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
    set("payModalTitle", displayPay(row));
    $("payModalBadges").innerHTML = '<span class="pay-status ' + esc(row.status) + '">' + label(row.status) + '</span> <span class="pay-method">' + esc(row.method) + '</span>';
    $("payRideInfo").innerHTML = facts([
      ["Ride ID", row.ride_code],
      ["Ride Type", label(row.ride_type)],
      ["Ride Status", label(row.ride_status)],
      ["Completed Date", exact(row.date_time)],
      ["Pickup", row.pickup || "Not available"],
      ["Drop-off", row.dropoff || "Not available"]
    ]);
    $("payPeople").innerHTML = profile("Passenger", row.passenger_name, row.passenger_email) + profile("Driver", row.driver_name, row.driver_email);
    $("payFareInfo").innerHTML = facts([
      ["Gross Fare", money(row.gross_fare)],
      ["WOW Commission " + percent(row.commission_percent || 30), money(row.wow_commission)],
      ["Driver Share " + percent(100 - Number(row.commission_percent || 30)), money(row.driver_share)],
      ["Refunded Amount", money(row.refunded_amount)],
      ["Net Confirmed Amount", money(row.net_confirmed)]
    ]);
    $("payPaymentInfo").innerHTML = facts([
      ["Payment Method", row.method],
      ["Payment Status", label(row.status)],
      ["Transaction ID", row.transaction_id || "Not available"],
      ["Record Source", row.has_payment_record ? "Payment document" : "Completed ride fallback"],
      ["Created At", exact(row.created_at)],
      ["Paid At", exact(row.paid_at)],
      ["Confirmed At", exact(row.confirmed_at)]
    ]);
    $("payRefundSection").hidden = !row.refunded_amount;
    $("payRefundInfo").innerHTML = facts([
      ["Refund Status", label(row.refund_status)],
      ["Refunded Amount", money(row.refunded_amount)],
      ["Refund Reason", row.refund_reason || "Not available"],
      ["Refunded At", exact(row.refunded_at)]
    ]);
    actions(row);
  }

  function actions(row) {
    let html = '<a class="pay-btn secondary" href="rides.php?open=' + encodeURIComponent(row.ride_id) + '">Open Ride</a>';
    if (row.has_payment_record && row.status === "pending" && row.method !== "Cash") html += '<button class="pay-btn primary" data-modal-confirm>Confirm Payment</button>';
    if (row.has_payment_record && (row.status === "paid" || row.status === "partially_refunded")) html += '<button class="pay-btn danger" data-modal-refund>Process Refund</button>';
    html += '<button class="pay-btn secondary" data-close>Close</button>';
    $("payModalActions").innerHTML = html;
  }

  function modalAction(event) {
    if (event.target.closest("[data-close]")) return close();
    if (event.target.closest("[data-modal-confirm]")) confirmDialog(S.selected);
    if (event.target.closest("[data-modal-refund]")) refundDialog(S.selected);
  }

  function confirmDialog(row) {
    if (!row) return;
    dialog("Confirm Online Payment", '<div class="pay-confirm"><strong>' + esc(row.ride_code) + '</strong><span>' + esc(row.passenger_name) + ' - ' + money(row.gross_fare) + ' - ' + esc(row.method) + '</span><p>Confirm that this online payment was received.</p></div>', { action: "confirm", id: row.id });
  }

  function refundDialog(row) {
    if (!row) return;
    const max = Math.max(0, row.gross_fare - row.refunded_amount);
    dialog("Process Refund", '<label>Refund Type<select id="payRefundType"><option value="full">Full Refund</option><option value="partial">Partial Refund</option></select></label><label>Refund Amount<input name="amount" type="number" min="0.01" max="' + max + '" step="0.01" value="' + max + '" required></label><label>Refund Reason<textarea name="reason" required></textarea></label><label>Admin Notes<textarea name="notes"></textarea></label>', { action: "refund", id: row.id });
  }

  function dialog(title, body, payload) {
    S.dialog = payload;
    set("payDialogTitle", title);
    $("payDialogBody").innerHTML = body;
    $("payDialogBackdrop").hidden = false;
  }

  async function submitDialog(event) {
    event.preventDefault();
    try {
      await api({ ...S.dialog, ...Object.fromEntries(new FormData(event.target).entries()) });
      closeDialog();
      close();
      toast("Payment updated successfully.");
      await load();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function close() {
    $("payBackdrop").hidden = true;
    document.body.style.overflow = "";
    S.selected = null;
  }

  function closeDialog() {
    $("payDialogBackdrop").hidden = true;
    S.dialog = null;
    $("payDialogForm").reset();
  }

  function chart() {
    const root = $("payChart");
    if (!S.chart.length) {
      root.innerHTML = '<div class="pay-empty">No payment activity for the selected period.</div>';
      return;
    }
    const max = Math.max(...S.chart.map((item) => item.value), 1);
    root.innerHTML = '<div class="pay-bars">' + S.chart.slice(-14).map((item) => '<div><span title="' + money(item.value) + '" style="height:' + Math.max(8, item.value / max * 210) + 'px"></span><small>' + new Date(item.date).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) + '</small><strong>' + money(item.value) + '</strong></div>').join("") + '</div>';
  }

  function exportCsv() {
    const header = ["Payment ID", "Transaction ID", "Ride ID", "Ride Type", "Passenger", "Driver", "Gross Fare", "WOW Commission", "Driver Share", "Payment Method", "Payment Status", "Commission Status", "Refunded Amount", "Record Source", "Created At", "Paid At", "Confirmed At", "Refunded At"];
    const rows = filtered().map((row) => [displayPay(row), row.transaction_id, row.ride_code, row.ride_type, row.passenger_name, row.driver_name, row.gross_fare, row.wow_commission, row.driver_share, row.method, row.status, row.commission_status, row.refunded_amount, row.source, row.created_at, row.paid_at, row.confirmed_at, row.refunded_at]);
    download([header, ...rows].map((line) => line.map(csv).join(",")).join("\r\n"));
  }

  function find(id) { return S.rows.find((row) => row.id === id); }
  function displayPay(row) { return row.transaction_id || ("PAY-" + String(row.payment_id || "").slice(-6).toUpperCase()); }
  function person(name, subtitle) { return '<div class="pay-person"><span>' + initials(name) + '</span><div><strong>' + esc(name) + '</strong><small>' + subtitle + '</small></div></div>'; }
  function profile(title, name, email) { return '<article><strong>' + title + '</strong><span>' + esc(name) + '</span><small>' + esc(email || "Contact unavailable") + '</small></article>'; }
  function facts(items) { return items.map((item) => '<div><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong></div>').join(""); }
  function money(value) { return "Rs. " + Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 }); }
  function percent(value) { return Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 }) + "%"; }
  function initials(value) { return String(value || "?").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase(); }
  function date(value) {
    const parsed = new Date(value);
    return isNaN(parsed) ? "Date unavailable" : parsed.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  }
  function time(value) {
    const parsed = new Date(value);
    return isNaN(parsed) ? "" : parsed.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });
  }
  function exact(value) {
    const parsed = new Date(value);
    return isNaN(parsed) ? "Date unavailable" : parsed.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  }
  function label(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
  function set(id, value) { $(id).textContent = String(value); }
  function toast(message, bad) {
    const node = $("payToast");
    node.textContent = message;
    node.classList.toggle("bad", Boolean(bad));
    node.hidden = false;
    setTimeout(() => { node.hidden = true; }, 3200);
  }
  function csv(value) { return '"' + String(value ?? "").replace(/"/g, '""') + '"'; }
  function download(text) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    link.download = "wow-payments.csv";
    link.click();
  }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }
})();
