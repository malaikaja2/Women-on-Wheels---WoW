(async function passengerActivity() {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const time = value => value?.toMillis?.() || Number(value?.seconds || 0) * 1000 || Date.parse(String(value || "")) || 0;
  const date = value => {
    const valueMillis = time(value);
    return valueMillis ? new Date(valueMillis).toLocaleString([], {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    }) : "";
  };
  const statusLabel = value => String(value || "update").replaceAll("_", " ");
  let unsubscribes = [], rides = [], cases = [], started = false;

  function show(name) {
    $("activityLoading").hidden = name !== "loading";
    $("activityError").hidden = name !== "error";
    $("activityEmpty").hidden = name !== "empty";
    $("activityList").hidden = name !== "ready";
  }

  function render() {
    const items = [
      ...rides.map(ride => {
        const status = String(ride.status || "updated").toLowerCase();
        const payment = String(ride.paymentStatus || "pending");
        const created = ride.completedAt || ride.cancelledAt || ride.updatedAt || ride.scheduledAt || ride.createdAt;
        const title = status.includes("cancel")
          ? "Ride cancelled"
          : status.includes("complete")
            ? (Number(ride.passengerRating || 0) > 0 ? "Ride completed and reviewed" : "Ride completed")
            : status === "scheduled" ? "Scheduled ride" : `Ride ${statusLabel(status)}`;
        return {
          kind: "ride", id: ride.id, title, created, status, payment,
          pickup: ride.pickupAddress || ride.pickupName || "",
          drop: ride.destinationAddress || ride.dropoffAddress || "",
          icon: status.includes("cancel") ? "\u00d7" : status.includes("complete") ? "\u2713" : status === "scheduled" ? "\u25b7" : "\u2194",
          href: `ride-details.html?rideId=${encodeURIComponent(ride.id)}`
        };
      }),
      ...cases.map(item => ({
        kind: "case", id: item.id, title: `Lost & Found: ${item.itemName || "Item"}`,
        created: item.updatedAt || item.createdAt, status: item.status || "Reported",
        payment: "", pickup: item.ridePickup || "", drop: item.rideDropoff || "",
        icon: "\u2315", href: "lost-found.html"
      }))
    ].sort((a, b) => time(b.created) - time(a.created));

    if (!items.length) {
      show("empty");
      return;
    }
    $("activityList").innerHTML = items.map(item =>
      `<a class="activity-card" href="${esc(item.href)}"><span class="activity-icon">${esc(item.icon)}</span><div class="activity-copy"><h2>${esc(item.title)}</h2><span class="ride-id">${item.kind === "ride" ? "Ride" : "Case"} ${esc(item.id)}</span><p>${esc(item.pickup || "Pickup unavailable")} &rarr; ${esc(item.drop || "Drop-off unavailable")}</p><div class="activity-meta"><span class="activity-pill">${esc(statusLabel(item.status))}</span>${item.payment ? `<span class="activity-pill">${esc(statusLabel(item.payment))}</span>` : ""}<span class="activity-date">${esc(date(item.created))}</span></div></div><span class="activity-arrow">&rsaquo;</span></a>`
    ).join("");
    show("ready");
  }

  function fail() {
    show(rides.length || cases.length ? "ready" : "error");
  }

  async function start(force = false) {
    if (started && !force) return;
    unsubscribes.splice(0).forEach(unsubscribe => {
      try { unsubscribe(); } catch {}
    });
    started = true;
    if (!rides.length && !cases.length) show("loading");
    try {
      const { db, uid } = await WowFirestore.ready();
      if (!uid) throw new Error("auth");
      const rideSnapshot = await db.collection("rides").where("passengerId", "==", uid)
        .orderBy("createdAt", "desc").limit(40).get();
      rides = rideSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      try {
        const caseSnapshot = await db.collection("lost_found_cases").where("passengerId", "==", uid)
          .orderBy("createdAt", "desc").limit(20).get();
        cases = caseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        cases = [];
        console.warn("[Activity] optional Lost & Found feed unavailable", error?.code || error?.message);
      }
      render();
    } catch {
      fail();
    }
  }

  $("activityRefresh").addEventListener("click", () => start(true));
  $("activityRetry").addEventListener("click", () => start(true));
  window.addEventListener("pagehide", () => unsubscribes.splice(0).forEach(unsubscribe => {
    try { unsubscribe(); } catch {}
  }));
  start();
})();
