(function () {
  function getFileName() {
    return window.location.pathname.split("/").pop() || "driver-dashboard.html";
  }

  function getActivePage() {
    const bodyPage = document.body.dataset.driverPage;
    if (bodyPage) return bodyPage;
    const file = getFileName();
    if (file === "driver-dashboard.html") return "dashboard";
    if (file === "driver-ride.html") return "rides";
    if (file === "driver-earnings.html") return "earnings";
    if (file === "driver-history.html") return "history";
    if (file === "driver-profile.html") return "profile";
    if (file === "driver-help.html") return "help";
    return "";
  }

  function getRoutes() {
    return [
      { page: "dashboard", href: "driver-dashboard.html", label: "Dashboard", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" },
      { page: "rides", href: "driver-ride.html", label: "Rides", icon: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a2 2 0 1 1-4 0H11a2 2 0 1 1-4 0H6a1 1 0 0 1-1-1v-6Z" },
      { page: "history", href: "driver-history.html", label: "History", icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 .9-1.5-3.9-2.3Z" },
      { page: "earnings", href: "driver-earnings.html", label: "Earnings", icon: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm1 14.5h-2v-1h-2v-2h2v-1h-2v-2h2v-1h2v1h2v2h-2v1h2v2h-2Z" },
      { page: "help", href: "driver-help.html", label: "Help", icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 15a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm2.2-7.4-.7.6a2.7 2.7 0 0 0-.9 2.1v.2h-1.8v-.4a3.8 3.8 0 0 1 1.3-2.9l.9-.8a1.8 1.8 0 1 0-3.1-1.3H7.9a3.6 3.6 0 1 1 6.3 2.5Z" },
      { page: "profile", href: "driver-profile.html", label: "Profile", icon: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4v2h16v-2c0-2-3.58-4-8-4Z" }
    ];
  }

  function buildNav(activePage) {
    const routes = getRoutes();
    return `
      <nav class="driver-bottom-nav" aria-label="Driver navigation">
        ${routes.map(route => `
          <a class="nav-item${route.page === activePage ? " active" : ""}" href="${route.href}" data-page="${route.page}">
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

  function rememberPage() {
    const current = getFileName();
    const previous = sessionStorage.getItem("wow_driver_current_page");
    if (previous && previous !== current) {
      sessionStorage.setItem("wow_driver_last_page", previous);
    }
    sessionStorage.setItem("wow_driver_current_page", current);
  }

  rememberPage();
  document.addEventListener("DOMContentLoaded", mount);
  document.addEventListener("DOMContentLoaded", bindBackButtons);
})();
