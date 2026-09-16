(function () {
  const API_URL = "php/profile_api.php";
  const LOGOUT_URL = "php/logout.php";
  const state = {
    user: null,
    settings: null,
    payments: [],
    rides: [],
    logoutInProgress: false
  };

  const E = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheEls();
    bindEvents();
    hydrateFromLocal();
    loadProfile();
  }

  function cacheEls() {
    [
      "profileAvatar", "profileName", "profileEmail", "profileRole", "memberSince",
      "fullNameInput", "phoneInput", "emailInput",
      "historyList", "historyEmpty",
      "paymentMethodType", "paymentAccountTitle", "paymentAccountNumber", "paymentSetDefault", "paymentList",
      "rideUpdatesToggle", "promotionsToggle", "preferredPaymentSelect",
      "safetyAlertsToggle", "emergencyNameInput", "emergencyPhoneInput",
      "currentPasswordInput", "newPasswordInput", "confirmPasswordInput",
      "toast", "topLogoutBtn", "mainLogoutBtn",
      "personalForm", "paymentForm", "settingsForm", "safetyForm", "passwordForm"
    ].forEach((id) => {
      E[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".profile-shortcuts button").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-target");
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    E.personalForm.addEventListener("submit", onSavePersonal);
    E.paymentForm.addEventListener("submit", onSavePayment);
    E.settingsForm.addEventListener("submit", onSaveSettings);
    E.safetyForm.addEventListener("submit", onSaveSafety);
    E.passwordForm.addEventListener("submit", onChangePassword);
    E.topLogoutBtn.addEventListener("click", logout);
    E.mainLogoutBtn.addEventListener("click", logout);

    E.paymentList.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const method = btn.getAttribute("data-method");
      if (!method) return;

      if (action === "default") {
        await api("set_default_payment", { method_type: method });
        showToast("Default payment updated.");
        await loadProfile();
        return;
      }

      if (action === "delete") {
        await api("delete_payment", { method_type: method });
        showToast("Payment method removed.");
        await loadProfile();
      }
    });
  }

  function hydrateFromLocal() {
    const name = localStorage.getItem("wow_user_name") || "Guest";
    const email = localStorage.getItem("wow_user_email") || "guest@wow.com";
    E.profileName.textContent = name;
    E.profileEmail.textContent = email;
    E.profileAvatar.textContent = initial(name || email);
    E.emailInput.value = email;
    E.fullNameInput.value = name;
  }

  async function loadProfile() {
    try {
      const data = await api("get");
      if (!data || !data.ok) return;

      state.user = data.user || {};
      state.settings = data.settings || {};
      state.payments = Array.isArray(data.payment_methods) ? data.payment_methods : [];
      state.rides = Array.isArray(data.rides) ? data.rides : [];

      renderUser();
      renderSettings();
      renderPayments();
      renderHistory();
    } catch {
      showToast("Could not fetch latest profile data.");
    }
  }

  function renderUser() {
    const user = state.user || {};
    const name = user.name || "Guest";
    const email = user.email || localStorage.getItem("wow_user_email") || "guest@wow.com";
    const createdAt = user.member_since ? new Date(user.member_since) : null;
    const memberSince = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString("en-US", { year: "numeric", month: "short" })
      : "--";

    E.profileName.textContent = name;
    E.profileEmail.textContent = email;
    const profileImage = String(user.profile_image || "").trim();
    E.profileAvatar.textContent = profileImage ? "" : initial(name || email);
    E.profileAvatar.style.backgroundImage = profileImage
      ? `url("${profileImage.replaceAll('"', '%22')}")`
      : "linear-gradient(120deg, #8f43ff 0%, #ef65a7 100%)";
    E.profileAvatar.style.backgroundSize = "cover";
    E.profileAvatar.style.backgroundPosition = "center";
    E.profileRole.textContent = "Passenger";
    E.memberSince.textContent = "Member since " + memberSince;

    E.fullNameInput.value = name;
    E.phoneInput.value = user.phone || "";
    E.emailInput.value = email;

    localStorage.setItem("wow_user_name", name);
    localStorage.setItem("wow_user_email", email);
    if (user.id) localStorage.setItem("wow_user_id", String(user.id));
  }

  function renderSettings() {
    const settings = state.settings || {};
    E.rideUpdatesToggle.checked = !!settings.notifications_ride_updates;
    E.promotionsToggle.checked = !!settings.notifications_promotions;
    E.safetyAlertsToggle.checked = !!settings.safety_alerts_enabled;
    E.emergencyNameInput.value = settings.emergency_contact_name || "";
    E.emergencyPhoneInput.value = settings.emergency_contact_phone || "";
    E.preferredPaymentSelect.value = settings.preferred_payment_method || "cash";
  }

  function renderPayments() {
    const preferred = (state.settings && state.settings.preferred_payment_method) || "cash";
    const cards = [];

    cards.push(`
      <article class="payment-item">
        <div class="line-1">
          <strong>Cash</strong>
          <span class="status-chip">${preferred === "cash" ? "Default" : "Available"}</span>
        </div>
        <div class="line-2">Pay directly to driver</div>
        ${preferred !== "cash" ? '<div class="payment-actions"><button class="btn-outline" data-action="default" data-method="cash">Set Default</button></div>' : ""}
      </article>
    `);

    state.payments.forEach((item) => {
      const methodLabel = item.method_type === "easypaisa" ? "EasyPaisa" : "JazzCash";
      const masked = maskAccount(item.account_number || "");
      cards.push(`
        <article class="payment-item">
          <div class="line-1">
            <strong>${esc(methodLabel)}</strong>
            <span class="status-chip">${item.is_default ? "Default" : "Saved"}</span>
          </div>
          <div class="line-2">${esc(item.account_title || "")} • ${esc(masked)}</div>
          <div class="payment-actions">
            ${item.is_default ? "" : `<button class="btn-outline" data-action="default" data-method="${esc(item.method_type)}">Set Default</button>`}
            <button class="btn-danger" data-action="delete" data-method="${esc(item.method_type)}">Remove</button>
          </div>
        </article>
      `);
    });

    E.paymentList.innerHTML = cards.join("");
  }

  function renderHistory() {
    if (!state.rides.length) {
      E.historyList.innerHTML = "";
      E.historyEmpty.style.display = "block";
      return;
    }

    E.historyEmpty.style.display = "none";
    E.historyList.innerHTML = state.rides.map((ride) => {
      const status = normalizeStatus(ride.status);
      const dateSource = ride.completed_at || ride.created_at || new Date().toISOString();
      const date = new Date(dateSource);
      const dateText = Number.isNaN(date.getTime())
        ? "Unknown date"
        : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const fare = Number(ride.fare || 0).toLocaleString("en-PK");
      const lostItemAction = ["completed", "ride_completed"].includes(String(ride.status || "").toLowerCase())
        ? `<a class="save-btn" href="ride-details.html?rideId=${encodeURIComponent(ride.ride_id || ride.uid || ride.id || "")}" style="display:inline-flex;margin-top:10px;text-decoration:none">Ride Details</a>`
        : "";
      return `
        <article class="history-item">
          <div class="line-1">
            <strong>${esc(ride.pickup || "--")} → ${esc(ride.dropoff || "--")}</strong>
            <span class="status-chip">${esc(status)}</span>
          </div>
          <div class="line-2">Fare: Rs. ${fare}</div>
          ${lostItemAction}
          <div class="line-2">${esc(dateText)} • ${esc(ride.driver_name || "Driver pending")}</div>
        </article>
      `;
    }).join("");
  }

  async function onSavePersonal(event) {
    event.preventDefault();
    const name = E.fullNameInput.value.trim();
    const phone = E.phoneInput.value.trim();
    if (!name) {
      showToast("Name is required.");
      return;
    }
    if (phone && !/^\+?[0-9\-\s]{10,16}$/.test(phone)) {
      showToast("Enter a valid phone number.");
      return;
    }
    await api("update_personal", { name, phone });
    showToast("Personal information saved.");
    await loadProfile();
  }

  async function onSavePayment(event) {
    event.preventDefault();
    const methodType = E.paymentMethodType.value;
    const accountTitle = E.paymentAccountTitle.value.trim();
    const rawAccount = E.paymentAccountNumber.value.trim();
    const accountNumber = rawAccount.replace(/\D+/g, "");
    const setDefault = E.paymentSetDefault.checked;

    if (!methodType) {
      showToast("Select EasyPaisa or JazzCash.");
      return;
    }
    if (!accountTitle) {
      showToast("Account title is required.");
      return;
    }
    if (accountNumber.length < 10 || accountNumber.length > 13) {
      showToast("Enter a valid account number.");
      return;
    }

    await api("save_payment", {
      method_type: methodType,
      account_title: accountTitle,
      account_number: accountNumber,
      set_default: setDefault ? 1 : 0
    });

    E.paymentMethodType.value = "";
    E.paymentAccountTitle.value = "";
    E.paymentAccountNumber.value = "";
    E.paymentSetDefault.checked = true;
    showToast("Payment method saved.");
    await loadProfile();
  }

  async function onSaveSettings(event) {
    event.preventDefault();
    const rideUpdates = E.rideUpdatesToggle.checked;
    const promotions = E.promotionsToggle.checked;
    const safetyAlerts = E.safetyAlertsToggle.checked;
    const preferredPayment = E.preferredPaymentSelect.value || "cash";

    await api("update_notifications", {
      notifications_ride_updates: rideUpdates ? 1 : 0,
      notifications_promotions: promotions ? 1 : 0,
      safety_alerts_enabled: safetyAlerts ? 1 : 0
    });

    await api("set_default_payment", {
      method_type: preferredPayment
    });

    showToast("Settings updated.");
    await loadProfile();
  }

  async function onSaveSafety(event) {
    event.preventDefault();
    const emergencyName = E.emergencyNameInput.value.trim();
    const emergencyPhone = E.emergencyPhoneInput.value.trim();
    const safetyAlerts = E.safetyAlertsToggle.checked;

    if (emergencyPhone && !/^\+?[0-9\-\s]{10,16}$/.test(emergencyPhone)) {
      showToast("Enter a valid emergency phone.");
      return;
    }

    await api("update_notifications", {
      notifications_ride_updates: E.rideUpdatesToggle.checked ? 1 : 0,
      notifications_promotions: E.promotionsToggle.checked ? 1 : 0,
      safety_alerts_enabled: safetyAlerts ? 1 : 0
    });

    await api("update_safety", {
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone
    });

    showToast("Safety settings saved.");
    await loadProfile();
  }

  async function onChangePassword(event) {
    event.preventDefault();
    const currentPassword = E.currentPasswordInput.value;
    const newPassword = E.newPasswordInput.value;
    const confirmPassword = E.confirmPasswordInput.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Fill all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(newPassword)) {
      showToast("Use 8+ chars with upper, lower, number, and symbol.");
      return;
    }

    await api("change_password", {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    });

    E.currentPasswordInput.value = "";
    E.newPasswordInput.value = "";
    E.confirmPasswordInput.value = "";
    showToast("Password updated.");
  }

  async function logout() {
    if (state.logoutInProgress) return;
    state.logoutInProgress = true;
    [E.topLogoutBtn, E.mainLogoutBtn].forEach((button) => {
      if (!button) return;
      button.disabled = true;
      button.classList.add("is-logging-out");
      button.setAttribute("aria-busy", "true");
      button.textContent = "Logging out...";
    });
    const serverLogout = fetch(LOGOUT_URL, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true
    }).catch(() => null);
    const firebaseLogout = (() => {
      try {
        return window.firebase?.auth?.().signOut?.().catch(() => null) || Promise.resolve();
      } catch {
        return Promise.resolve();
      }
    })();
    await Promise.race([
      Promise.allSettled([serverLogout, firebaseLogout]),
      new Promise((resolve) => setTimeout(resolve, 1200))
    ]);

    [
      "wow_logged_in",
      "wow_user_id",
      "wow_user_name",
      "wow_user_email",
      "wow_user_role",
      "wow_open_profile",
      "wow_post_login_redirect",
      "wow_post_login_source",
      "wow_post_login_set_at"
    ].forEach((key) => localStorage.removeItem(key));

    window.location.replace("login.html");
  }

  async function api(action, payload = {}) {
    const body = {
      action,
      role: "passenger",
      email: localStorage.getItem("wow_user_email") || "",
      user_id: localStorage.getItem("wow_user_id") || "",
      ...payload
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data || data.ok !== true) {
      const err = data && data.error ? String(data.error) : "request_failed";
      showToast(prettyError(err));
      throw new Error(err);
    }
    return data;
  }

  function prettyError(code) {
    const map = {
      passenger_required: "Please login again as passenger.",
      invalid_current_password: "Current password is incorrect.",
      weak_password: "Password is too weak.",
      invalid_phone: "Phone number format is invalid.",
      invalid_emergency_phone: "Emergency phone format is invalid.",
      invalid_account_number: "Account number is invalid.",
      payment_method_not_found: "Saved payment method not found."
    };
    return map[code] || "Unable to save right now. Please try again.";
  }

  function normalizeStatus(status) {
    const value = String(status || "").toLowerCase();
    if (value === "completed") return "Completed";
    if (value === "cancelled") return "Cancelled";
    if (value === "in_progress") return "In Progress";
    if (value === "accepted") return "Accepted";
    return "Pending";
  }

  function initial(text) {
    return (text || "G").trim().charAt(0).toUpperCase() || "G";
  }

  function maskAccount(account) {
    const digits = String(account || "").replace(/\D+/g, "");
    if (digits.length <= 4) return digits || "--";
    return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }

  function showToast(message) {
    E.toast.textContent = message;
    E.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => E.toast.classList.remove("show"), 2300);
  }

  function esc(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
