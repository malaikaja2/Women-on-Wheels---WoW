(function () {
  const role = (localStorage.getItem("wow_user_role") || "passenger").toLowerCase();
  const file = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const driverFiles = new Set(["driver-dashboard.html", "driver-ride.html", "driver-earnings.html", "driver-history.html", "driver-profile.html", "driver-help.html"]);

  if (role === "driver" && driverFiles.has(file)) {
    const verificationStatus = (localStorage.getItem("wow_driver_verification_status") || "").toLowerCase();
    const isApproved = (localStorage.getItem("wow_driver_is_approved") || "") === "true";
    const driverRole = (localStorage.getItem("wow_driver_role") || "").toLowerCase();
    const approvedStatuses = new Set(["approved", "verified", "active"]);
    const hasApprovedCache = driverRole === "driver" && (isApproved || approvedStatuses.has(verificationStatus));
    if (verificationStatus === "rejected") {
      window.location.replace("driver-verification.html");
      return;
    }
    // Do not redirect on missing/stale localStorage. Firebase is the source of
    // truth, and a first load or a sleeping tab may not have cache yet.
    window.addEventListener("load", async () => {
      try {
        if (!window.WowFirestore) throw new Error("Firestore helper unavailable");
        const { db, uid } = await window.WowFirestore.ready();
        const snapshot = await db.collection("drivers").doc(uid).get({ source: "server" });
        if (!snapshot.exists) {
          if (!hasApprovedCache) window.location.replace("driver-verification.html");
          return;
        }
        const data = snapshot.data() || {};
        const latestStatus = String(data.verificationStatus || data.accountStatus || "").toLowerCase();
        const latestRole = String(data.role || "").toLowerCase();
        const latestApproved = data.isApproved !== false && approvedStatuses.has(latestStatus);
        if (latestRole === "driver" && latestApproved) {
          localStorage.setItem("wow_driver_role", "driver");
          localStorage.setItem("wow_driver_verification_status", latestStatus);
          localStorage.setItem("wow_driver_is_approved", "true");
          return;
        }
        if (latestStatus === "rejected" || data.isRejected === true || (latestRole && latestRole !== "driver") || (!latestApproved && !hasApprovedCache)) {
          window.location.replace("driver-verification.html");
        }
      } catch (_) {
        // A temporary Firebase/auth/network failure must not log out an already
        // approved driver or create a verification redirect loop.
        if (!hasApprovedCache) console.warn("[WOW Role Guard] verification check deferred");
      }
    }, { once: true });
  }

  const passengerRide = Boolean(localStorage.getItem("wow_ride_code") || localStorage.getItem("wow_ride_pickup"));

  const redirects = {
    driver: {
      "app-home.html": "driver-dashboard.html",
      "dashboard.html": "driver-dashboard.html",
      "passenger-ride.html": "driver-ride.html",
      "profile.html": "driver-profile.html",
      "help.html": "driver-help.html"
    },
    passenger: {
      "driver-dashboard.html": "app-home.html",
      "driver-ride.html": passengerRide ? "passenger-ride.html" : "dashboard.html",
      "driver-earnings.html": "app-home.html",
      "driver-history.html": "app-home.html",
      "driver-profile.html": "profile.html",
      "driver-help.html": "help.html"
    }
  };

  const target = redirects[role] && redirects[role][file];
  if (target && target !== file) {
    window.location.replace(target);
  }
})();
