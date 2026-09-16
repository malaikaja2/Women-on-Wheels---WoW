(async function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rideId = new URLSearchParams(location.search).get("rideId") || "";
  $("lfRideId").value = rideId;
  $("reportCard").hidden = !rideId;
  const friendlyError = error => {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (code.includes("permission-denied") || message.toLowerCase().includes("insufficient permissions")) {
      return "We could not verify access to this ride. Please sign in again and retry.";
    }
    return message || "Lost & Found is temporarily unavailable. Please try again.";
  };

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

  const { uid } = await WowFirestore.ready();
  WowLostFound.watchPassenger(uid, (cases) => {
    $("passengerCases").innerHTML = cases.length ? cases.map(render).join("") : '<div class="lf-empty">No Lost &amp; Found reports yet. Open a completed ride to report an item.</div>';
  }, (error) => { $("passengerCases").innerHTML = `<div class="lf-error">${esc(friendlyError(error))}</div>`; });

  $("lostForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("lfSubmit");
    button.disabled = true;
    $("lfError").textContent = "";
    try {
      await WowLostFound.report(rideId, {
        category: $("lfCategory").value, itemName: $("lfName").value,
        description: $("lfDescription").value, color: $("lfColor").value,
        lastSeenLocation: $("lfLocation").value,
        imageUrl: await imageData($("lfPhoto").files[0]), additionalNotes: $("lfNotes").value
      });
      $("lostForm").reset();
      $("lfRideId").value = rideId;
      $("reportCard").hidden = true;
    } catch (error) { $("lfError").textContent = friendlyError(error); }
    finally { button.disabled = false; }
  });

  $("passengerCases").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try { await WowLostFound.passengerAction(button.dataset.case, button.dataset.action); }
    catch (error) { alert(friendlyError(error)); }
    finally { button.disabled = false; }
  });

  function render(c) {
    const status = String(c.status || "Reported");
    const callAllowed = ["open", "reported", "driver_contacted", "driver_responded", "item_found", "return_arranged", "return_scheduled"].includes(status.trim().toLowerCase().replace(/\s+/g, "_"));
    const actions = `
      <a class="lf-btn secondary" href="lost-found-chat.html?caseId=${encodeURIComponent(c.id)}&rideId=${encodeURIComponent(c.rideId)}">Open Lost &amp; Found Chat</a>
      <button class="lf-btn secondary" type="button" data-lf-call data-case-id="${esc(c.id)}" data-ride-id="${esc(c.rideId)}" ${callAllowed ? "" : "disabled"}>Call Driver</button>
      ${["Item Found", "Driver Responded", "Return Arranged"].includes(status) ? `<button class="lf-btn" type="button" data-action="accept_return" data-case="${esc(c.id)}">Confirm Return Meeting</button>` : ""}
      ${status === "Return Scheduled" ? `<button class="lf-btn" type="button" data-action="item_received" data-case="${esc(c.id)}">Item Received</button>` : ""}
      ${status === "Returned" ? `<button class="lf-btn" type="button" data-action="close" data-case="${esc(c.id)}">Close Case</button>` : ""}`;
    return `<article class="lf-case"><div class="lf-case-head"><strong>${esc(c.itemName)} &middot; ${esc(c.category)}</strong><span class="lf-badge">${esc(status)}</span></div>
      <div class="lf-meta"><span>Case ID<strong>${esc(c.caseId)}</strong></span><span>Date<strong>${esc(c.createdAt?.toDate?.().toLocaleDateString() || "--")}</strong></span><span>Ride<strong>${esc(c.rideId)}</strong></span><span>Driver Response<strong>${esc(c.driverResponse || "Awaiting response")}</strong></span><span>Return Location<strong>${esc(c.returnLocation || "Not arranged")}</strong></span><span>Return Time<strong>${esc(c.returnTime || "Not arranged")}</strong></span></div>
      ${c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="${esc(c.itemName)}" style="max-width:180px;border-radius:14px">` : ""}
      <p class="lf-note">${esc(c.description)}</p><details><summary>View Case Details</summary><p>${esc(c.lastSeenLocation || "Last seen location not provided")}</p><p>${esc(c.driverNotes || "No driver notes yet")}</p></details>
      <div class="lf-actions">${status === "Closed" ? "" : actions}</div></article>`;
  }
})().catch((error) => { console.error(error); document.getElementById("passengerCases").innerHTML = '<div class="lf-empty">Please sign in again.</div>'; });
