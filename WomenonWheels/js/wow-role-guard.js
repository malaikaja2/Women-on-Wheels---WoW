(function () {
  const role = (localStorage.getItem("wow_user_role") || "passenger").toLowerCase();
  const file = (window.location.pathname.split("/").pop() || "").toLowerCase();

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
