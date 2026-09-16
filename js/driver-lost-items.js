(async function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const queryRideId = new URLSearchParams(location.search).get("rideId") || "";
  const terminal = new Set(["closed", "cancelled", "canceled", "rejected", "resolved"]);
  const callStatuses = new Set(["open", "reported", "driver_contacted", "passenger_contacted", "driver_responded", "item_found", "found", "return_arranged", "return_scheduled"]);
  let allCases = [];
  let activeFilter = "pending";
  let unsubscribeCases = null;
  let serverFallbackLoaded = false;

  const normalize = value => String(value || "Reported").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const dateValue = value => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const dateTime = value => {
    const date = dateValue(value);
    return date ? date.toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Not available";
  };
  const dateOnly = value => {
    const date = dateValue(value);
    return date ? date.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "Not available";
  };
  const safe = (value, fallback = "Not available") => {
    if (value && typeof value === "object") return safe(value.formattedAddress || value.address || value.name, fallback);
    const text = String(value ?? "").trim();
    return !text || /^(null|undefined|\[object object\])$/i.test(text) ? fallback : text;
  };
  const shortId = value => {
    const id = safe(value, "Unavailable");
    return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-7)}` : id;
  };
  function statusInfo(raw) {
    const value = normalize(raw);
    if (["reported", "open"].includes(value)) return { label: "Pending", tone: "pending" };
    if (["driver_contacted", "passenger_contacted", "driver_responded"].includes(value)) return { label: value === "passenger_contacted" ? "Passenger Contacted" : "Driver Responded", tone: "contacted" };
    if (["item_found", "found"].includes(value)) return { label: "Driver Found Item", tone: "found" };
    if (["return_arranged", "return_scheduled"].includes(value)) return { label: "Meeting Scheduled", tone: "meeting" };
    if (value === "returned") return { label: "Returned", tone: "returned" };
    if (["cancelled", "canceled", "rejected"].includes(value)) return { label: "Cancelled", tone: "cancelled" };
    if (["closed", "resolved"].includes(value)) return { label: "Closed", tone: "closed" };
    if (value === "item_not_found") return { label: "Pending", tone: "pending" };
    return { label: safe(raw, "Pending"), tone: "pending" };
  }
  function bucket(c) {
    const value = normalize(c.status);
    if (terminal.has(value)) return "closed";
    if (value === "returned" || ["return_arranged", "return_scheduled"].includes(value)) return "returned";
    if (["item_found", "found"].includes(value)) return "found";
    return "pending";
  }
  function icon(label) {
    const paths = {
      Passenger: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/>',
      "Ride date": '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/>',
      Pickup: '<circle cx="12" cy="10" r="3"/><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/>',
      "Drop-off": '<path d="m12 3 8 8-8 10-8-10 8-8Z"/><circle cx="12" cy="11" r="2"/>',
      Response: '<path d="M20 6 9 17l-5-5"/>',
      Reported: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      Contact: '<path d="M7 4h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-5l-5 4v-4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"/>'
    };
    return `<svg class="lf-meta-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[label] || '<circle cx="12" cy="12" r="4"/>'}</svg>`;
  }
  function meta(label, value) {
    return `<div><span>${icon(label)}${esc(label)}</span><strong>${esc(safe(value))}</strong></div>`;
  }
  function counts() {
    const values = { pending: 0, found: 0, returned: 0, closed: 0 };
    allCases.forEach(c => values[bucket(c)]++);
    document.querySelectorAll("[data-count]").forEach(node => node.textContent = String(values[node.dataset.count] || 0));
    $("lfPendingCount").textContent = String(values.pending);
    $("lfClosedCount").textContent = String(values.closed);
    $("lfActiveCount").textContent = String(values.pending + values.found + values.returned);
  }
  function meetingMarkup(c) {
    const meeting = c.returnMeeting || {};
    const location = meeting.location || c.returnLocation;
    const meetingDate = meeting.date || c.returnDate;
    const meetingTime = meeting.time || c.returnTime;
    if (!location && !meetingDate && !meetingTime) return "";
    return `<section class="lf-meeting"><h3>Return meeting</h3>
      <div><span>Date &amp; time</span><strong>${esc(safe([meetingDate, meetingTime].filter(Boolean).join(" · "), "Not arranged"))}</strong></div>
      <div><span>Location</span><strong>${esc(safe(location, "Not arranged"))}</strong></div>
      <div><span>Passenger confirmation</span><strong>${meeting.passengerConfirmed ? "Confirmed" : "Awaiting confirmation"}</strong></div>
      <div><span>Driver confirmation</span><strong>${meeting.driverConfirmed === false ? "Awaiting confirmation" : "Confirmed"}</strong></div>
      <div><span>Return status</span><strong>${esc(safe(meeting.status, "Meeting proposed"))}</strong></div>
    </section>`;
  }
  function renderCase(c) {
    const info = statusInfo(c.status);
    const value = normalize(c.status);
    const meeting = c.returnMeeting || {};
    const callAllowed = callStatuses.has(value);
    const canRespond = !terminal.has(value) && value !== "returned";
    const canMarkFound = ["reported", "open", "driver_contacted", "passenger_contacted", "driver_responded", "item_not_found"].includes(value);
    const canSchedule = ["item_found", "found", "driver_responded"].includes(value);
    const canConfirmMeeting = Boolean(meeting.location && meeting.date && meeting.time && meeting.driverConfirmed !== true);
    const bothConfirmed = meeting.driverConfirmed === true && meeting.passengerConfirmed === true;
    const canReturn = ["return_arranged", "return_scheduled"].includes(value) && bothConfirmed;
    const canClose = value === "returned";
    const conversationHref = `lost-found-chat.html?caseId=${encodeURIComponent(c.id)}&rideId=${encodeURIComponent(c.rideId || "")}`;
    const summaryHref = `ride-details.html?rideId=${encodeURIComponent(c.rideId || "")}`;
    return `<article class="lf-case">
      <div class="lf-case-head">
        <div class="lf-item-title"><small>${esc(safe(c.category, "Uncategorized item"))}</small><h2>${esc(safe(c.itemName, "Lost item"))}</h2></div>
        <span class="lf-badge" data-status="${info.tone}">${esc(info.label)}</span>
      </div>
      <div class="lf-case-ids">
        <span class="lf-id-chip" title="${esc(safe(c.caseId || c.id))}">Case <b>${esc(shortId(c.caseId || c.id))}</b></span>
        <span class="lf-id-chip" title="${esc(safe(c.rideId))}">Ride <b>${esc(shortId(c.rideId))}</b></span>
      </div>
      <div class="lf-meta">
        ${meta("Passenger", c.passengerName)}
        ${meta("Ride date", dateOnly(c.rideDate))}
        ${meta("Response", c.driverResponse || "Response required")}
        ${meta("Reported", dateTime(c.createdAt))}
        ${meta("Pickup", c.ridePickup || c.pickupAddress)}
        ${meta("Drop-off", c.rideDropoff || c.dropoffAddress)}
        ${meta("Contact", c.passengerContactedAt || c.lastMessageAt ? "Conversation started" : "Not contacted")}
      </div>
      ${c.description ? `<p class="lf-note">${esc(safe(c.description))}</p>` : ""}
      ${meetingMarkup(c)}
      <div class="lf-actions">
        <a class="lf-btn" href="${conversationHref}">Open Lost &amp; Found Chat</a>
        <button class="lf-btn secondary" type="button" data-lf-call data-case-id="${esc(c.id)}" data-ride-id="${esc(c.rideId)}" ${callAllowed ? "" : "disabled"}>Call Passenger</button>
        ${canMarkFound ? `<button class="lf-btn soft" type="button" data-action="mark_found" data-case="${esc(c.id)}">Mark Item Found</button>` : ""}
        ${canRespond ? `<button class="lf-btn soft" type="button" data-action="respond" data-case="${esc(c.id)}">Update Response</button>` : ""}
        ${canSchedule ? `<button class="lf-btn soft" type="button" data-action="schedule" data-case="${esc(c.id)}">Schedule Return</button>` : ""}
        ${canConfirmMeeting ? `<button class="lf-btn soft" type="button" data-action="confirm_meeting" data-case="${esc(c.id)}">Confirm Meeting</button>` : ""}
        ${canReturn ? `<button class="lf-btn" type="button" data-action="returned" data-case="${esc(c.id)}">Mark Returned</button>` : ""}
        ${canClose ? `<button class="lf-btn danger" type="button" data-action="close" data-case="${esc(c.id)}">Close Case</button>` : ""}
        <a class="lf-btn secondary" href="${summaryHref}">View Ride Summary</a>
      </div>
    </article>`;
  }
  function draw() {
    counts();
    const rows = allCases.filter(c => bucket(c) === activeFilter);
    $("driverCases").innerHTML = rows.length ? rows.map(renderCase).join("") : `<div class="lf-empty"><div><div class="lf-empty-illustration" aria-hidden="true"><svg viewBox="0 0 180 130"><defs><linearGradient id="lfEmptyGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8d43e8"/><stop offset="1" stop-color="#e64d99"/></linearGradient></defs><path d="M42 42h96v65H42z" fill="#fff" stroke="#d9cbe5" stroke-width="4"/><path d="M64 42a26 26 0 0 1 52 0" fill="none" stroke="url(#lfEmptyGradient)" stroke-width="8" stroke-linecap="round"/><path d="M42 62h96" stroke="#eee6f3" stroke-width="4"/><circle cx="125" cy="93" r="24" fill="#fff" stroke="url(#lfEmptyGradient)" stroke-width="6"/><path d="m142 110 16 15" stroke="#8d43e8" stroke-width="7" stroke-linecap="round"/><path d="M72 80h28M72 93h18" stroke="#cdbbd9" stroke-width="5" stroke-linecap="round"/></svg></div><h2>No Lost &amp; Found Cases</h2><p>Completed ride cases with reported lost items will appear here.</p><a class="lf-btn" href="driver-dashboard.html">Back to Dashboard</a></div></div>`;
  }
  function openModal(id) {
    $("caseModalBackdrop").hidden = false;
    $(id).hidden = false;
    document.body.style.overflow = "hidden";
    $(id).querySelector("input:not([type=hidden]),select,button")?.focus();
  }
  function closeModals() {
    $("caseModalBackdrop").hidden = true;
    ["responseModal", "returnModal"].forEach(id => $(id).hidden = true);
    document.body.style.overflow = "";
  }
  async function withBusy(button, operation) {
    if (!button || button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    try { await operation(); }
    catch (error) { window.alert(error?.message || "This case could not be updated."); }
    finally { button.disabled = false; button.textContent = label; }
  }

  $("driverReportCard").hidden = !queryRideId;
  $("foundRideId").value = queryRideId;
  const { uid } = await WowFirestore.ready();
  async function loadServerCases() {
    if (serverFallbackLoaded) return;
    serverFallbackLoaded = true;
    try {
      const response = await fetch("php/get_driver_dashboard_data.php", { credentials:"same-origin", headers:{ Accept:"application/json" } });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !Array.isArray(payload.lost_found_cases)) return;
      const merged = new Map(allCases.map(item => [String(item.id), item]));
      payload.lost_found_cases.forEach(item => merged.set(String(item.id), { ...(merged.get(String(item.id)) || {}), ...item }));
      allCases = [...merged.values()];
      draw();
    } catch (error) { console.warn("[WOW Lost & Found] server fallback unavailable", error?.message); }
  }
  unsubscribeCases = WowLostFound.watchDriver(uid, cases => { allCases = cases; draw(); if (!cases.length) loadServerCases(); }, error => {
    console.error("[WOW Lost & Found] Driver cases unavailable", error);
    loadServerCases();
  });

  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    draw();
  }));

  $("driverReportForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("foundSubmit");
    $("foundError").textContent = "";
    await withBusy(button, async () => {
      await WowLostFound.reportFound(queryRideId, {
        category: $("foundCategory").value, itemName: $("foundName").value,
        description: $("foundDescription").value, color: $("foundColor").value,
        imageUrl: await imageData($("foundPhoto").files[0]), additionalNotes: $("foundNotes").value
      });
      event.target.reset();
      $("driverReportCard").hidden = true;
    });
  });

  $("driverCases").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const caseId = button.dataset.case;
    if (action === "respond") { $("driverCaseId").value = caseId; openModal("responseModal"); }
    if (action === "mark_found" && window.confirm("Confirm that you found the reported item?")) {
      withBusy(button, () => WowLostFound.driverRespond(caseId, "item_found", {}));
    }
    if (action === "schedule") {
      const current = allCases.find(c => c.id === caseId) || {};
      const meeting = current.returnMeeting || {};
      $("returnCaseId").value = caseId;
      $("returnDate").value = meeting.date || "";
      $("returnClock").value = meeting.time || "";
      $("returnLocation").value = meeting.location || current.returnLocation || "";
      openModal("returnModal");
    }
    if (action === "confirm_meeting" && window.confirm("Confirm that you can attend this return meeting?")) {
      withBusy(button, () => WowLostFound.confirmReturnMeeting(caseId));
    }
    if (action === "returned" && window.confirm("Confirm that the item was handed back to the passenger?")) {
      withBusy(button, () => WowLostFound.markReturned(caseId));
    }
    if (action === "close" && window.confirm("Close this returned-item case?")) {
      withBusy(button, () => WowLostFound.closeCase(caseId));
    }
  });

  $("driverResponseForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("driverError").textContent = "";
    await withBusy($("responseSubmit"), async () => {
      await WowLostFound.driverRespond($("driverCaseId").value, $("driverResponse").value, {
        imageUrl: await imageData($("driverPhoto").files[0]), notes: $("driverNotes").value
      });
      event.target.reset();
      closeModals();
    });
  });
  $("returnMeetingForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("returnError").textContent = "";
    await withBusy($("returnSubmit"), async () => {
      await WowLostFound.scheduleReturn($("returnCaseId").value, {
        date: $("returnDate").value, time: $("returnClock").value, location: $("returnLocation").value
      });
      closeModals();
    });
  });
  document.querySelectorAll("[data-close-modal],#closeResponse").forEach(button => button.addEventListener("click", closeModals));
  $("caseModalBackdrop").addEventListener("click", closeModals);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
  window.addEventListener("pagehide", () => unsubscribeCases?.(), { once: true });

  function imageData(file) {
    if (!file) return Promise.resolve("");
    if (file.size > 350000) return Promise.reject(new Error("Photo must be smaller than 350 KB."));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Photo could not be read."));
      reader.readAsDataURL(file);
    });
  }
})().catch(error => {
  console.error("[WOW Lost & Found] Driver page failed", error);
  const target = document.getElementById("driverCases");
  if (target) target.innerHTML = '<div class="lf-empty"><div><h2>Please sign in again</h2><p>Your driver session could not be verified.</p><a class="lf-btn" href="login.html">Sign In</a></div></div>';
});
