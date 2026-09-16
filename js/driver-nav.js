(function () {
  function getFileName() {
    return window.location.pathname.split("/").pop() || "driver-dashboard.html";
  }

  function getActivePage() {
    const bodyPage = document.body.dataset.driverPage;
    if (bodyPage) return bodyPage;
    const file = getFileName();
    if (file === "driver-dashboard.html") return "home";
    if (file === "driver-ride.html") return "rides";
    if (file === "driver-earnings.html") return "earnings";
    if (file === "driver-history.html") return "rides";
    if (file === "driver-lost-items.html") return "lostfound";
    if (file === "driver-profile.html") return "profile";
    if (file === "driver-help.html") return "support";
    return "";
  }

  function getRoutes() {
    return [
      { page: "home", href: "driver-dashboard.html", label: "Home", icon: "M3 11.2 12 3l9 8.2V21h-6v-6H9v6H3v-9.8Z" },
      { page: "rides", href: "driver-history.html", label: "Rides", icon: "M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5.2 6l1.5-3h10.6l1.5 3H21v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6h2.2Zm2.7-1-1 2h10.2l-1-2H7.9ZM5 9v5h14V9H5Z" },
      { page: "lostfound", href: "driver-lost-items.html", label: "Lost & Found", icon: "M7 7V5a5 5 0 0 1 10 0v2h3a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2h3Zm2 0h6V5a3 3 0 0 0-6 0v2Zm3 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm3.7 7.3 2.5 2.5-1.4 1.4-2.5-2.5 1.4-1.4Z" },
      { page: "earnings", href: "driver-earnings.html", label: "Earnings", icon: "M4 5h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 4v9h16v-3h-5a3 3 0 0 1 0-6h5V7H4v2Zm11 2a1 1 0 1 0 0 2h5v-2h-5Z" },
      { page: "support", href: "driver-help.html", label: "Support", icon: "M12 2a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h2v-8H5a7 7 0 0 1 14 0h-3v8h3a3 3 0 0 1-3 3h-3v-2h3a1 1 0 0 0 1-1h-3v-8h3a5 5 0 0 0-10 0h3v8H6a1 1 0 0 1-1-1v-5a7 7 0 0 1 7-7Z" },
      { page: "profile", href: "driver-profile.html", label: "Profile", icon: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14Z" }
    ];
  }

  function buildNav(activePage) {
    const routes = getRoutes();
    return `
      <nav class="driver-bottom-nav" aria-label="Driver navigation">
        ${routes.map(route => `
          <a class="nav-item${route.page === activePage ? " active" : ""}" href="${route.href}" data-page="${route.page}" ${route.page === activePage ? 'aria-current="page"' : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${route.icon}"></path></svg>
            <span>${route.label}</span>
          </a>
        `).join("")}
      </nav>
    `;
  }

  function mount() {
    const mountPoint = document.querySelector("[data-driver-nav-mount]");
    const activePage = getActivePage();
    document.body.classList.add("has-driver-nav");
    const existing = document.querySelector(".bottom-nav, .ride-footer, .driver-nav");
    if (existing) {
      existing.outerHTML = buildNav(activePage);
      return;
    }
    if (mountPoint) {
      mountPoint.innerHTML = buildNav(activePage);
      return;
    }
    const nav = document.createElement("div");
    nav.innerHTML = buildNav(activePage);
    document.body.appendChild(nav.firstElementChild);
  }

  function bindBackButtons() {
    document.querySelectorAll("[data-driver-back]").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        const current = getFileName();
        const last = sessionStorage.getItem("wow_driver_last_page");
        const ref = document.referrer;
        const fallback = btn.dataset.fallback || "driver-dashboard.html";
        if (last && last !== current) {
          window.location.href = last;
          return;
        }
        if (ref) {
          try {
            const refUrl = new URL(ref, window.location.href);
            if (refUrl.origin === window.location.origin && refUrl.pathname !== window.location.pathname) {
              window.location.href = refUrl.href;
              return;
            }
          } catch {
            // Ignore malformed referrers and use history/fallback instead.
          }
        }
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        window.location.href = fallback;
      });
    });
  }

  async function doDriverLogout(event) {
    if (event) event.preventDefault();
    try {
      await fetch("php/logout.php", { method: "POST", credentials: "same-origin" });
    } catch {
      // Continue with client-side cleanup + redirect even if request fails.
    }
    try {
      localStorage.removeItem("wow_user_id");
      localStorage.removeItem("wow_user_email");
      localStorage.removeItem("wow_user_name");
      localStorage.removeItem("wow_user_role");
      localStorage.removeItem("wow_ride_code");
      localStorage.removeItem("wow_ride_status");
      localStorage.removeItem("wow_ride_started");
      sessionStorage.removeItem("wow_driver_current_page");
      sessionStorage.removeItem("wow_driver_last_page");
    } catch {
      // Ignore storage cleanup errors.
    }
    window.location.href = "login.html";
  }

  function bindLogoutButtons() {
    document.querySelectorAll("[data-driver-logout]").forEach((btn) => {
      btn.addEventListener("click", doDriverLogout);
    });
  }

  function rememberPage() {
    const current = getFileName();
    const previous = sessionStorage.getItem("wow_driver_current_page");
    if (previous && previous !== current) {
      sessionStorage.setItem("wow_driver_last_page", previous);
    }
    sessionStorage.setItem("wow_driver_current_page", current);
  }

  function applyDriverName(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName || /^(driver|user)$/i.test(cleanName)) return;
    localStorage.setItem("wow_user_name", cleanName);
    [
      "headerDriverName",
      "profileName",
      "profileNamePanel",
      "reviewDriverName",
      "driverRideName"
    ].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.textContent = cleanName;
    });
    const initial = cleanName.charAt(0).toUpperCase();
    ["profileInitial", "profileInitialPanel"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.textContent = initial;
    });
  }

  async function syncDriverIdentity() {
    const storedName = localStorage.getItem("wow_user_name") || "";
    applyDriverName(storedName);
    const query = new URLSearchParams({
      role: "driver",
      email: localStorage.getItem("wow_user_email") || "",
      user_id: localStorage.getItem("wow_user_id") || ""
    });
    try {
      const response = await fetch(`php/get_driver_dashboard_data.php?${query}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      const driver = data.driver || {};
      applyDriverName(driver.name || driver.fullName || driver.displayName || driver.full_name);
    } catch {
      // Keep the locally stored identity when the profile service is unavailable.
    }
  }

  rememberPage();
  document.addEventListener("DOMContentLoaded", mount);
  document.addEventListener("DOMContentLoaded", bindBackButtons);
  document.addEventListener("DOMContentLoaded", bindLogoutButtons);
  document.addEventListener("DOMContentLoaded", syncDriverIdentity);
})();
// Load the shared, role-aware WOW Assistant on authenticated driver pages.
(function loadDriverAssistant() {
  if (document.querySelector('script[data-wow-driver-assistant]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/passenger-chatbot.css?v=20260731-ai1';
  stylesheet.dataset.wowDriverAssistant = 'true';
  document.head.appendChild(stylesheet);
  const script = document.createElement('script');
  script.src = 'js/passenger-chatbot.js?v=20260731-ai1';
  script.defer = true;
  script.dataset.wowDriverAssistant = 'true';
  document.head.appendChild(script);
})();
