(function () {
  "use strict";

  const CACHE_TTL_MS = 2 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  const hasValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
  const clean = (value) => hasValue(value) ? String(value).trim() : "";
  const text = (value, fallback = "Pending") => clean(value) || fallback;
  const item = (label, value, fallback = "Pending") => `<div><span>${esc(label)}</span><strong>${esc(text(value, fallback))}</strong></div>`;
  const authUser = () => firebase.auth().currentUser || {};

  let profile = {};
  let application = {};
  let rides = [];
  let reviews = [];
  let payments = [];
  let driverRef = null;
  let driverUid = "";

  function cacheKey(uid) {
    return `wow_driver_profile_cache_${uid}`;
  }

  function pick(row, keys, fallback = "") {
    for (const key of keys) {
      const value = row && row[key];
      if (hasValue(value) && (typeof value !== "object" || value instanceof Date || value.toDate)) return value;
    }
    return fallback;
  }

  function objectOf(row, key) {
    const value = row && row[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function pickFrom(rows, keys, fallback = "") {
    for (const row of rows) {
      const value = pick(row, keys, "");
      if (hasValue(value)) return value;
    }
    return fallback;
  }

  function mergeProfiles(...sources) {
    const merged = {};
    sources.forEach((source) => {
      Object.entries(source || {}).forEach(([key, value]) => {
        if (hasValue(value)) merged[key] = value;
      });
    });
    return merged;
  }

  function date(value) {
    if (!hasValue(value)) return null;
    if (value && typeof value.toDate === "function") return value.toDate();
    if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function dateText(value, fallback = "Pending") {
    const parsed = date(value);
    return parsed ? parsed.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : text(value, fallback);
  }

  function status(value, fallback = "Pending") {
    return text(value, fallback).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeVehicle(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.includes("scooty") || raw.includes("scooter")) return "scooty";
    if (raw.includes("bike") || raw.includes("motorbike") || raw.includes("motorcycle")) return "bike";
    if (raw.includes("car") || raw.includes("auto")) return "car";
    return raw || "";
  }

  function vehicleLabel(type) {
    if (type === "car") return "Car";
    if (type === "bike") return "Bike";
    if (type === "scooty") return "Scooty";
    return status(type, "Car");
  }

  function fallbackVehicleModel(type) {
    if (type === "bike") return "WOW Bike";
    if (type === "scooty") return "WOW Scooty";
    return "WOW Car";
  }

  function vehicle(profileRow) {
    const info = objectOf(profileRow, "vehicleInfo");
    const details = objectOf(profileRow, "vehicleDetails");
    const vehicleObject = objectOf(profileRow, "vehicle");
    const type = normalizeVehicle(pickFrom([profileRow, info, details, vehicleObject], [
      "driverVehicleType", "driver_vehicle_type", "vehicleType", "vehicle_type", "type", "vehicleCategory", "vehicle_category", "vehicleClass", "vehicle_class"
    ], "car"));
    const label = vehicleLabel(type);
    return {
      type,
      label,
      company: pickFrom([profileRow, info, details, vehicleObject], ["vehicleCompany", "vehicle_company", "vehicleMake", "vehicle_make", "make", "company"], "WOW"),
      model: pickFrom([profileRow, info, details, vehicleObject], ["driverVehicleName", "driver_vehicle_name", "vehicleName", "vehicle_name", "vehicleModel", "vehicle_model", "carModel", "car_model", "model", "name", "vehicle"], fallbackVehicleModel(type)),
      color: pickFrom([profileRow, info, details, vehicleObject], ["vehicleColor", "vehicle_color", "color", "colour"], "Standard"),
      number: pickFrom([profileRow, info, details, vehicleObject], ["driverVehicleNumber", "driver_vehicle_number", "vehicleNumber", "vehicle_number", "vehicleNo", "vehicle_no", "numberPlate", "number_plate", "plateNumber", "plate_number", "registrationNumber", "registration_number", "number"], "Registration pending"),
      year: pickFrom([profileRow, info, details, vehicleObject], ["manufacturingYear", "manufacturing_year", "vehicleYear", "vehicle_year", "year"], "Current"),
      capacity: pickFrom([profileRow, info, details, vehicleObject], ["seatCapacity", "seat_capacity", "capacity", "seats"], type === "car" ? "4" : "1")
    };
  }

  function cnicText(profileRow) {
    const value = pick(profileRow, ["cnicNumber", "cnic_number", "cnic", "nationalId", "national_id", "maskedCnic", "masked_cnic"], "");
    if (hasValue(value)) return value;
    return pick(profileRow, ["cnicFrontUrl", "cnic_front_url", "cnicUploadUrl", "cnic_upload_url", "cnicFileUrl", "cnic_file_url", "cnicImageUrl", "cnic_image_url"], "") ? "CNIC document uploaded" : "Verification pending";
  }

  function licenceText(profileRow) {
    const value = pick(profileRow, ["licenceNumber", "licence_number", "licenseNumber", "license_number", "driverLicenseNumber", "driver_license_number"], "");
    if (hasValue(value)) return value;
    return pick(profileRow, ["licenceImageUrl", "licence_image_url", "licenseImageUrl", "license_image_url"], "") ? "Licence document uploaded" : "Verification pending";
  }

  function money(value) {
    const number = Number(String(value || 0).replace(/[^\d.-]/g, ""));
    return `Rs. ${(Number.isFinite(number) ? number : 0).toLocaleString("en-PK")}`;
  }

  function renderProfilePhoto(name, photo) {
    const avatar = $("profileInitial");
    if (!avatar) return;
    avatar.textContent = photo ? "" : text(name, "D").charAt(0).toUpperCase();
    avatar.style.backgroundImage = photo ? `url("${String(photo).replaceAll('"', "%22")}")` : "";
    avatar.style.backgroundSize = photo ? "cover" : "";
    avatar.style.backgroundPosition = photo ? "center" : "";
  }

  function readCache(uid) {
    try {
      const raw = sessionStorage.getItem(cacheKey(uid));
      if (!raw) return false;
      const cached = JSON.parse(raw);
      if (!cached || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL_MS) return false;
      profile = cached.profile || {};
      application = cached.application || {};
      rides = Array.isArray(cached.rides) ? cached.rides : [];
      payments = Array.isArray(cached.payments) ? cached.payments : [];
      reviews = Array.isArray(cached.reviews) ? cached.reviews : [];
      render();
      return true;
    } catch {
      return false;
    }
  }

  function writeCache(uid) {
    try {
      sessionStorage.setItem(cacheKey(uid), JSON.stringify({
        savedAt: Date.now(),
        profile,
        application,
        rides,
        payments,
        reviews
      }));
    } catch {}
  }

  function render() {
    const data = mergeProfiles(application, profile);
    profile = data;
    const user = authUser();
    const approved = data.isApproved === true
      || String(pick(data, ["verificationStatus", "status"], "")).toLowerCase() === "approved"
      || String(data.role || "").toLowerCase() === "driver";
    const vehicleInfo = vehicle(data);
    const vehicleRows = [data, objectOf(data, "vehicleInfo"), objectOf(data, "vehicleDetails"), objectOf(data, "vehicle")];
    const actualVehicleNumber = pickFrom(vehicleRows, ["driverVehicleNumber", "driver_vehicle_number", "vehicleNumber", "vehicle_number", "vehicleNo", "vehicle_no", "numberPlate", "number_plate", "plateNumber", "plate_number", "registrationNumber", "registration_number", "number"], "");
    const completed = rides.filter((ride) => ["completed", "ride_completed"].includes(String(ride.status || ride.rideStatus || "").toLowerCase()));
    const cancelled = rides.filter((ride) => ["cancelled", "canceled"].includes(String(ride.status || ride.rideStatus || "").toLowerCase()));
    const active = rides.filter((ride) => !["completed", "ride_completed", "cancelled", "canceled"].includes(String(ride.status || ride.rideStatus || "").toLowerCase()));
    const scheduled = rides.filter((ride) => hasValue(ride.scheduledAt || ride.scheduledDate || ride.scheduledDateTime));
    const carpool = rides.filter((ride) => ride.isCarpool === true || String(ride.rideType || "").toLowerCase().includes("carpool"));
    const paymentByRide = new Map();
    payments.forEach((payment) => paymentByRide.set(String(payment.rideId || payment.id || payment.rideCode || ""), payment));
    const paymentForRide = (ride) => paymentByRide.get(String(ride.id || ""))
      || paymentByRide.get(String(ride.rideId || ""))
      || paymentByRide.get(String(ride.rideCode || ""))
      || {};
    const paid = completed.filter((ride) => {
      const payment = paymentForRide(ride);
      return window.WowFinancial?.hasCommissionMetadata(ride, payment)
        && (window.WowFinancial?.isPaymentSuccessful(payment.paymentStatus || ride.paymentStatus)
          || ride.cashCollected === true
          || ride.cashConfirmed === true
          || ride.paymentConfirmed === true
          || ride.isPaid === true);
    });
    const earning = (ride) => {
      const payment = paymentForRide(ride);
      const stored = window.WowFinancial?.number(payment.driverEarning ?? payment.driverShare ?? ride.driverEarning ?? ride.driverShare);
      const selectedFare = window.WowFinancial?.selectedFare?.(ride)?.value || 0;
      return stored ?? window.WowFinancial?.split?.(selectedFare, 0.30)?.driverEarning ?? 0;
    };
    const rideTotal = paid.reduce((sum, ride) => sum + earning(ride), 0);
    const total = rideTotal || Number(pick(data, ["totalEarnings", "earnings", "driverEarnings"], 0));
    const now = new Date();
    const earned = (start) => paid.filter((ride) => (date(ride.completedAt || ride.updatedAt) || new Date(0)) >= start).reduce((sum, ride) => sum + earning(ride), 0);
    const reviewAverage = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : 0;
    const storedRating = Number(pick(data, ["averageRating", "rating", "driverRating"], 0));
    const ratingText = reviews.length ? `${reviewAverage.toFixed(1)}/5` : (storedRating > 0 ? `${storedRating.toFixed(1)}/5` : "New driver");
    const completedCount = completed.length || Number(pick(data, ["completedRides", "totalCompletedRides", "totalRides"], 0));
    const name = text(pick(data, ["fullName", "full_name", "name", "driverName", "driver_name", "displayName"], user.displayName), "Driver Profile");
    const email = text(pick(data, ["email", "emailAddress", "email_address"], user.email), "Profile email pending");
    const phone = text(pick(data, ["phoneNumber", "phone_number", "phone", "mobile", "contactNumber", "contact_number"], user.phoneNumber), "Contact pending");
    const photo = pick(data, ["profilePhotoUrl", "profile_photo_url", "profileImageUrl", "profile_image_url", "profileImage", "profile_image", "profilePhoto", "profile_photo", "photoURL", "photoUrl"], "");

    $("profileName").textContent = name;
    $("profileEmail").textContent = email;
    renderProfilePhoto(name, photo);
    $("driverId").textContent = driverUid || text(pick(data, ["uid", "driverId", "driverUid"], ""), "Driver profile");
    $("profilePhone").textContent = phone;
    $("profileStatus").textContent = data.isOnline || data.isAvailable ? "Online" : "Offline";
    $("approvalStatus").textContent = approved ? "Approved" : status(pick(data, ["accountStatus", "verificationStatus", "status"], "Pending"));
    $("verificationStatus").textContent = approved ? "Approved" : status(pick(data, ["verificationStatus", "status"], "Pending"));
    $("driverCnic").textContent = cnicText(data);
    $("driverType").textContent = vehicleInfo.label;
    $("driverVehicle").textContent = vehicleInfo.model;
    $("driverPlate").textContent = vehicleInfo.number;
    $("driverLicense").textContent = licenceText(data);
    $("profileRating").textContent = ratingText;
    $("completedRides").textContent = String(completedCount || 0);
    $("totalEarnings").textContent = money(total);

    $("personalInfo").innerHTML = item("Full name", name)
      + item("Email", email)
      + item("Phone", phone)
      + item("Date of birth", dateText(pick(data, ["dateOfBirth", "date_of_birth", "dob"], "")))
      + item("City", pick(data, ["city", "locationCity"], ""), "City pending")
      + item("Residential area", pick(data, ["residentialArea", "residential_area", "area", "address"], ""), "Area pending")
      + item("Emergency contact", pick(data, ["emergencyContact", "emergency_contact", "emergencyPhone", "emergency_phone", "emergencyContactNumber", "emergency_contact_number"], ""), "Emergency contact pending");

    $("verificationInfo").innerHTML = item("Account", approved ? "Approved" : status(pick(data, ["accountStatus", "verificationStatus", "status"], "Pending")))
      + item("CNIC", status(pick(data, ["cnicVerificationStatus", "cnic_verification_status", "documentStatus", "document_status"], pick(data, ["cnicFrontUrl", "cnic_front_url", "cnicUploadUrl", "cnic_upload_url"], "") ? "submitted" : "pending")))
      + item("Driving licence", status(pick(data, ["licenceVerificationStatus", "licence_verification_status", "licenseVerificationStatus", "license_verification_status"], pick(data, ["licenceImageUrl", "licence_image_url", "licenseImageUrl", "license_image_url"], "") ? "submitted" : "pending")))
      + item("Vehicle", status(pick(data, ["vehicleVerificationStatus", "vehicle_verification_status"], actualVehicleNumber ? "submitted" : "pending")))
      + item("Admin approval", approved ? "Approved" : "Pending")
      + item("Document expiry", pick(data, ["documentExpiryWarning"], ""), "No warning");
    const reason = pick(data, ["rejectionReason", "adminRejectionReason"], "");
    $("verificationReason").hidden = !reason;
    $("verificationReason").textContent = reason ? `Admin remarks: ${reason}` : "";

    $("vehicleInfo").innerHTML = item("Type", vehicleInfo.label)
      + item("Company", vehicleInfo.company)
      + item("Model", vehicleInfo.model)
      + item("Colour", vehicleInfo.color)
      + item("Registration", vehicleInfo.number)
      + item("Year", vehicleInfo.year)
      + item("Seat capacity", vehicleInfo.capacity)
      + item("Carpool eligible", vehicleInfo.type === "car" ? "Eligible" : data.carpoolEligible === true ? "Yes" : "No")
      + item("Verification", approved ? "Approved" : status(pick(data, ["vehicleVerificationStatus", "vehicle_verification_status"], "Pending")));
    $("pendingVehicleNotice").hidden = !data.pendingProfileChanges;

    const docs = [
      ["CNIC front", ["cnicFrontStatus", "cnic_front_status", "cnicStatus", "cnic_status"], ["cnicFrontUrl", "cnic_front_url", "cnicUploadUrl", "cnic_upload_url", "cnicFileUrl", "cnic_file_url", "cnicImageUrl", "cnic_image_url"]],
      ["CNIC back", ["cnicBackStatus", "cnic_back_status"], ["cnicBackUrl", "cnic_back_url"]],
      ["Driving licence", ["licenceStatus", "licence_status", "licenseStatus", "license_status"], ["licenceImageUrl", "licence_image_url", "licenseImageUrl", "license_image_url"]],
      ["Vehicle registration", ["vehicleRegistrationStatus", "vehicle_registration_status", "registrationStatus", "registration_status"], ["vehicleRegistrationUrl", "vehicle_registration_url", "registrationDocumentUrl", "registration_document_url"]],
      ["Vehicle image", ["vehicleImageStatus", "vehicle_image_status"], ["vehicleImageUrl", "vehicle_image_url"]],
      ["Profile photo", ["profilePhotoStatus", "profile_photo_status"], ["profilePhotoUrl", "profile_photo_url", "profileImageUrl", "profile_image_url"]]
    ];
    $("documentInfo").innerHTML = docs.map(([label, statusKeys, urlKeys]) => {
      const stored = pick(data.documentStatuses || {}, statusKeys, "") || pick(data, statusKeys, "");
      const uploaded = pick(data, urlKeys, "");
      return item(label, status(stored || (uploaded ? "Uploaded" : "Pending upload")));
    }).join("");

    const base = completedCount + active.length + Number(data.declinedRideCount || 0);
    const acceptance = base ? Math.round((completedCount + active.length) / base * 100) : 0;
    const completion = rides.length ? Math.round(completed.length / rides.length * 100) : 0;
    const cancellation = rides.length ? Math.round(cancelled.length / rides.length * 100) : 0;
    $("performanceInfo").innerHTML = item("Acceptance rate", `${acceptance}%`)
      + item("Completion rate", `${completion}%`)
      + item("Cancellation rate", `${cancellation}%`)
      + item("Completed", completedCount || 0)
      + item("Cancelled", cancelled.length)
      + item("Average rating", ratingText)
      + item("Total reviews", reviews.length)
      + item("Scheduled rides", scheduled.length)
      + item("Carpool rides", carpool.length)
      + item("Current active ride", active.length ? active[0].rideCode || active[0].id : "None")
      + item("On-time arrival", data.onTimeArrivalPercentage ? `${data.onTimeArrivalPercentage}%` : "Tracking pending")
      + item("Online hours", pick(data, ["totalOnlineHours"], 0));

    $("earningsInfo").innerHTML = item("Today", money(earned(new Date(now.getFullYear(), now.getMonth(), now.getDate()))))
      + item("This week", money(earned(new Date(now.getTime() - 604800000))))
      + item("This month", money(earned(new Date(now.getFullYear(), now.getMonth(), 1))))
      + item("Total", money(total));

    $("profileReviews").innerHTML = reviews.slice()
      .sort((a, b) => (date(b.createdAt)?.getTime() || 0) - (date(a.createdAt)?.getTime() || 0))
      .slice(0, 3)
      .map((review) => `<div class="mini-review"><strong>${Number(review.rating || 0).toFixed(1)}/5</strong><p>${esc(text(review.reviewText || review.review, "No written comment."))}</p></div>`)
      .join("") || "<p>No passenger reviews yet.</p>";

    $("paymentInfo").innerHTML = item("Preferred method", pick(data, ["preferredPaymentMethod", "paymentMethod"], "Cash"))
      + item("Wallet balance", money(pick(data, ["walletBalance"], 0)))
      + item("Pending payments", pick(data, ["pendingPayments"], 0))
      + item("Completed payments", pick(data, ["completedPayments"], completedCount || completed.length || 0));

    const settings = data.notificationSettings || {};
    document.querySelectorAll("[data-setting]").forEach((input) => {
      input.checked = settings[input.dataset.setting] !== false;
    });
  }

  document.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", async () => {
    if (!driverRef) return;
    const values = {};
    document.querySelectorAll("[data-setting]").forEach((node) => {
      values[node.dataset.setting] = node.checked;
    });
    const message = $("settingsMessage");
    try {
      await driverRef.set({ notificationSettings: values, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      profile.notificationSettings = values;
      writeCache(driverUid);
      message.textContent = "Notification settings saved.";
      message.hidden = false;
      if (values.chatMessages && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    } catch {
      message.textContent = "Unable to save notification settings.";
      message.hidden = false;
    }
  }));

  (async () => {
    try {
      const { db, uid } = await WowFirestore.ready();
      driverUid = uid;
      driverRef = db.collection("drivers").doc(uid);
      if (readCache(uid)) return;
      const safeDoc = async (ref) => {
        try {
          return await ref.get();
        } catch {
          return null;
        }
      };
      const limited = async (plainQuery, orderedQuery) => {
        try {
          return await orderedQuery.get();
        } catch {
          try {
            return await plainQuery.get();
          } catch {
            return { docs: [] };
          }
        }
      };
      const rideQuery = db.collection("rides").where("assignedDriverId", "==", uid);
      const paymentQuery = db.collection("payments").where("driverId", "==", uid);
      const reviewQuery = db.collection("rideReviews").where("driverUid", "==", uid);
      const [driverSnap, applicationSnap, rideSnap, paymentSnap, reviewSnap] = await Promise.all([
        safeDoc(driverRef),
        safeDoc(db.collection("driverApplications").doc(uid)),
        limited(rideQuery.limit(100), rideQuery.orderBy("createdAt", "desc").limit(100)),
        limited(paymentQuery.limit(100), paymentQuery.orderBy("createdAt", "desc").limit(100)),
        limited(reviewQuery.limit(50), reviewQuery.orderBy("createdAt", "desc").limit(50))
      ]);
      profile = driverSnap?.exists ? driverSnap.data() || {} : {};
      application = applicationSnap?.exists ? applicationSnap.data() || {} : {};
      rides = rideSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      payments = paymentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      reviews = reviewSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      writeCache(uid);
    } catch {
      $("profileSections").insertAdjacentHTML("afterbegin", "<p class='notice'>Unable to load profile data. Please sign in again.</p>");
    }
  })();
})();
