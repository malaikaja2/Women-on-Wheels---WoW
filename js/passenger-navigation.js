(function passengerNavigation(global) {
  "use strict";

  const items = [
    ["home", "app-home.html", "Home", "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"],
    ["book", "dashboard.html", "Book", "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a2 2 0 1 1-4 0H11a2 2 0 1 1-4 0H6a1 1 0 0 1-1-1Z"],
    ["activity", "activity.html", "Activity", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h8V6H8Zm0 5h8v-2H8Zm0 5h6v-2H8Z"],
    ["alerts", "notifications.html", "Alerts", "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-6v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1Z"],
    ["help", "help.html", "Help", "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 16h-2v-2h2Zm1.8-7.7-.9.8a2.5 2.5 0 0 0-.9 1.9h-2a4 4 0 0 1 1.4-3.2l1.1-1a1.7 1.7 0 1 0-2.8-1.3h-2a3.7 3.7 0 1 1 6.1 2.8Z"],
    ["profile", "app-home.html", "Profile", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4v2h16v-2c0-2-3.58-4-8-4Z"],
  ];

  function currentItem() {
    const page = location.pathname.split("/").pop().toLowerCase() || "app-home.html";
    const section = new URLSearchParams(location.search).get("section");
    if (page === "dashboard.html") return "book";
    if (page === "help.html") return "help";
    if (page === "profile.html") return "profile";
    if (page === "activity.html") return "activity";
    if (page === "notifications.html") return "alerts";
    if (page === "app-home.html" && ["activity", "alerts"].includes(section)) return section;
    return "home";
  }

  function render() {
    if (!document.getElementById("passengerUnreadBadgeStyle")) {
      const style = document.createElement("style");
      style.id = "passengerUnreadBadgeStyle";
      style.textContent = '.driver-bottom-nav .nav-item.has-unread{position:relative}.driver-bottom-nav .nav-item.has-unread::after{content:attr(data-unread);position:absolute;top:5px;left:calc(50% + 8px);z-index:2;display:grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border:2px solid #fff;border-radius:999px;background:#ef2a5f;color:#fff;font-size:9px;font-weight:800;line-height:1}';
      document.head.appendChild(style);
    }
    const existing = document.querySelectorAll("nav.bottom-nav[aria-label='Passenger navigation']");
    if (!existing.length) return;
    const active = currentItem();
    const html = items.map(([key, href, label, path]) => (
      `<a class="nav-item${key === active ? " active" : ""}" href="${href}"` +
      `${key === active ? ' aria-current="page"' : ""} data-passenger-nav="${key}">` +
      `<svg viewBox="0 0 24 24" aria-hidden="true" class="nav-icon"><path d="${path}"></path></svg>` +
      `<span>${label}</span></a>`
    )).join("");
    existing.forEach(nav => {
      nav.classList.add("driver-bottom-nav");
      nav.innerHTML = html;
      updateUnreadBadge(nav);
      nav.querySelector('[data-passenger-nav="profile"]')?.addEventListener("click", event => {
        if (location.pathname.toLowerCase().endsWith("app-home.html")) {
          event.preventDefault();
          document.getElementById("openProfile")?.click();
          return;
        }
        localStorage.setItem("wow_open_profile", "1");
      });
      nav.querySelector('[data-passenger-nav="alerts"]')?.addEventListener("click", event => {
        event.preventDefault();
        if (location.pathname.toLowerCase().endsWith("app-home.html")) {
          document.getElementById("openNotifications")?.click();
          return;
        }
        localStorage.setItem("wow_open_notifications", "1");
        location.href = "app-home.html";
      });
    });
  }

  function updateUnreadBadge(root = document) {
    const stored = Number(localStorage.getItem("wow_passenger_unread_notifications") || 0);
    const count = Number.isFinite(stored) ? Math.max(0, Math.floor(stored)) : 0;
    root.querySelectorAll('[data-passenger-nav="alerts"]').forEach(item => {
      item.classList.toggle("has-unread", count > 0);
      item.dataset.unread = count > 99 ? "99+" : String(count);
      item.setAttribute("aria-label", count ? `Alerts, ${count} unread` : "Alerts");
    });
  }

  global.addEventListener("storage", event => {
    if (event.key === "wow_passenger_unread_notifications") updateUnreadBadge();
  });
  global.addEventListener("wow:passenger-unread", () => updateUnreadBadge());

  async function startNotificationBridge() {
    if (global.__wowPassengerNotificationBridge) return;
    global.__wowPassengerNotificationBridge = true;
    updateUnreadBadge();
  }

  function openDirectSection() {
    if (!location.pathname.toLowerCase().endsWith("app-home.html")) return;
    const section = new URLSearchParams(location.search).get("section");
    if (section === "activity") {
      document.getElementById("viewAllRecentRides")?.click();
    } else if (section === "alerts") {
      document.getElementById("openNotifications")?.click();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    startNotificationBridge();
    global.setTimeout(openDirectSection, 250);
    if (location.pathname.toLowerCase().endsWith("dashboard.html") &&
        new URLSearchParams(location.search).get("section") === "schedule") {
      global.setTimeout(() => document.getElementById("scheduleBtn")?.click(), 350);
    }
  });
})(window);
// Keep the shared WOW Assistant available on every authenticated passenger page.
(function loadPassengerAssistant() {
  if (!document.querySelector('link[href*="passenger-chatbot.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'css/passenger-chatbot.css?v=20260731-ai1';
    document.head.appendChild(stylesheet);
  }
  if (document.querySelector('script[src*="passenger-chatbot.js"]')) return;
  const script = document.createElement('script');
  script.src = 'js/passenger-chatbot.js?v=20260731-ai1';
  script.defer = true;
  script.dataset.wowPassengerAssistant = 'true';
  document.head.appendChild(script);
})();
