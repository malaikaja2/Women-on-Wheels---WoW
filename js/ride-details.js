(async function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const rideId = String(params.get("rideId") || "").trim();
  const body = document.getElementById("rideDetailBody");
  const error = document.getElementById("rideDetailError");
  const loading = document.getElementById("rideDetailLoading");
  const content = document.getElementById("rideDetailContent");

  const text = (value, fallback = "Not available") => {
    if (value === null || value === undefined || typeof value === "object") return fallback;
    const clean = String(value).trim();
    return clean && clean !== "[object Object]" ? clean : fallback;
  };
  const locationText = (value) => {
    if (typeof value === "string") return text(value);
    if (!value || typeof value !== "object") return "Location unavailable";
    return text(value.address || value.formattedAddress || value.name || value.label, "Location unavailable");
  };
  const dateValue = (value) => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const numeric = Number(value);
    const date = Number.isFinite(numeric) ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const dateTime = value => {
    const date = dateValue(value);
    return date ? date.toLocaleString("en-PK", { day:"numeric", month:"long", year:"numeric", hour:"numeric", minute:"2-digit" }) : "Not available";
  };
  const title = value => text(value, "Unknown").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const fareNumber = value => {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
    if (typeof value !== "string") return null;
    const clean = value.replace(/(?:Rs\.?|PKR)/gi, "").replaceAll(",", "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
    const amount = Number(clean);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  };
  const selectedFare = ride => {
    for (const key of ["finalFare", "acceptedFare", "agreedFare", "totalFare", "fare"]) {
      const amount = fareNumber(ride[key]);
      if (amount !== null) return amount;
    }
    return null;
  };
  const money = amount => amount === null ? "Fare unavailable" : `Rs. ${amount.toLocaleString("en-PK", { maximumFractionDigits:2 })}`;
  const row = (label, value, wide = false) => {
    const item = document.createElement("div");
    item.className = `ride-detail-item${wide ? " wide" : ""}`;
    const caption = document.createElement("span");
    const strong = document.createElement("strong");
    caption.textContent = label;
    strong.textContent = value;
    item.append(caption, strong);
    return item;
  };

  try {
    if (!rideId) throw new Error("Ride Not Found");
    const { db, uid } = await WowFirestore.ready();
    const snapshot = await db.collection("rides").doc(rideId).get();
    if (!snapshot.exists) throw new Error("Ride Not Found");
    const ride = snapshot.data() || {};
    const passengerId = String(ride.passengerId || ride.passengerUid || "");
    const driverId = String(ride.acceptedDriverId || ride.assignedDriverId || ride.driverId || ride.driverUid || "");
    const role = uid === passengerId ? "passenger" : uid === driverId ? "driver" : "";
    if (!role) throw new Error("Ride Not Found");

    // The ride may only contain a driver id. Load the current driver profile
    // so passenger-side details show the real driver rating and identity.
    let driverProfile = {};
    if (driverId) {
      try {
        const driverSnapshot = await db.collection("drivers").doc(driverId).get();
        if (driverSnapshot.exists) driverProfile = driverSnapshot.data() || {};
      } catch (profileError) {
        console.warn("[Ride Details] driver profile unavailable", profileError?.code || profileError?.message);
      }
    }
    const status = String(ride.status || "unknown").toLowerCase();
    document.getElementById("rideDetailPublicId").textContent = text(ride.rideCode || ride.rideId || rideId);
    document.getElementById("rideDetailStatus").textContent = title(status);
    document.getElementById("rideDetailStatus").dataset.status = status;

    const pickup = locationText(ride.pickupAddress || ride.pickupName || ride.pickupLocation || ride.pickup);
    const dropoff = locationText(ride.destinationAddress || ride.dropoffAddress || ride.destinationName || ride.dropoffLocation || ride.dropoff);
    const scheduled = ride.scheduledAt || ride.scheduledDateTime || ride.scheduleAt;
    const fields = [
      ["Booking Type", title(ride.bookingType || ride.rideType || (scheduled ? "scheduled" : "instant"))],
      ["Vehicle", title(ride.driverVehicleName || ride.vehicleModel || ride.requestedVehicleType || ride.vehicleType || "Not available")],
      ["Pickup", pickup, true],
      ["Drop-off", dropoff, true],
      ["Passenger", text(ride.passengerName, "Passenger")],
      ["Driver", text(ride.driverName || ride.assignedDriverName || ride.acceptedDriverName || driverProfile.fullName || driverProfile.name || driverProfile.displayName, "Not assigned")],
      ["Vehicle Number", text(ride.driverVehicleNumber || ride.vehicleNumber || ride.registrationNumber || driverProfile.vehicleNumber || driverProfile.vehicleNo || driverProfile.registrationNumber)],
      ["Payment Method", title(ride.paymentMethod || ride.payment_method || "Not selected")],
      ["Agreed / Final Fare", money(selectedFare(ride))],
      ["Requested", dateTime(ride.requestedAt || ride.createdAt)],
      ["Scheduled", dateTime(scheduled)],
      ["Accepted", dateTime(ride.acceptedAt || ride.driverAcceptedAt)],
      ["Started", dateTime(ride.startedAt || ride.rideStartedAt)],
      ["Completed", dateTime(ride.completedAt || ride.rideCompletedAt)],
      ["Driver Rating", (() => {
        const rating = Number(ride.driverRating ?? ride.driver_rating ?? driverProfile.rating ?? driverProfile.averageRating ?? driverProfile.avgRating ?? driverProfile.driverRating);
        return Number.isFinite(rating) && rating > 0 ? `${rating.toFixed(1)} / 5` : "Not available";
      })()]
    ];
    body.replaceChildren(...fields.map(item => row(...item)));
    if (["completed", "ride_completed"].includes(status)) {
      document.getElementById("rideDetailActions").innerHTML = role === "passenger"
        ? `<a class="ride-detail-primary" href="lost-found.html?rideId=${encodeURIComponent(rideId)}">Report Lost Item</a>`
        : `<a class="ride-detail-primary" href="driver-lost-items.html?rideId=${encodeURIComponent(rideId)}">Report Item Found</a>`;
    }
    loading.hidden = true;
    content.hidden = false;
  } catch (caught) {
    loading.hidden = true;
    error.hidden = false;
    error.querySelector("p").textContent = caught?.message === "Ride Not Found"
      ? "This ride is unavailable or you no longer have access to it."
      : "We could not load this ride. Please check your connection and try again.";
  }
})();
