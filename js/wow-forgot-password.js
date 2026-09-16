(function wowForgotPassword(global) {
  "use strict";
  if (global.WowForgotPassword) return;

  const SUCCESS_MESSAGE = "If an account exists for this email, a password reset link has been sent. Please check your inbox and spam folder.";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
    authDomain: "women-on-wheels-f8970.firebaseapp.com",
    projectId: "women-on-wheels-f8970",
    storageBucket: "women-on-wheels-f8970.firebasestorage.app"
  };
  let returnFocus = null;
  let submitting = false;
  let currentTrigger = null;

  function ensureAuth() {
    if (!global.firebase?.auth) throw new Error("firebase_unavailable");
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.auth();
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function ensureModal() {
    if (document.getElementById("wowResetOverlay")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="wow-reset-overlay" id="wowResetOverlay" hidden aria-hidden="true">
        <section class="wow-reset-modal" id="wowResetModal" role="dialog" aria-modal="true" aria-labelledby="wowResetTitle" aria-describedby="wowResetSupport">
          <button class="wow-reset-close" id="wowResetClose" type="button" aria-label="Close password reset dialog">&times;</button>
          <div class="wow-reset-brand" aria-hidden="true">&#9993;</div>
          <h2 id="wowResetTitle">Reset Your Password</h2>
          <p class="wow-reset-support" id="wowResetSupport">Enter your registered email address. We will send you a secure password reset link.</p>
          <form id="wowResetForm" novalidate>
            <label class="wow-reset-label" for="wowResetEmail">Email address
              <input class="wow-reset-input" id="wowResetEmail" name="email" type="email" autocomplete="email" inputmode="email" required>
            </label>
            <div class="wow-reset-message" id="wowResetMessage" role="status" aria-live="polite"></div>
            <div class="wow-reset-actions">
              <button class="wow-reset-button" id="wowResetReturn" type="button">Return to Login</button>
              <button class="wow-reset-button primary" id="wowResetSubmit" type="submit">Send Reset Link</button>
            </div>
          </form>
        </section>
      </div>`);
    document.getElementById("wowResetClose").addEventListener("click", close);
    document.getElementById("wowResetReturn").addEventListener("click", close);
    document.getElementById("wowResetOverlay").addEventListener("click", event => {
      if (event.target.id === "wowResetOverlay") close();
    });
    document.getElementById("wowResetForm").addEventListener("submit", submit);
    document.addEventListener("keydown", trapKeyboard);
  }

  function setMessage(message, type = "error") {
    const node = document.getElementById("wowResetMessage");
    if (!node) return;
    node.textContent = message || "";
    node.className = `wow-reset-message${message ? ` is-${type}` : ""}`;
    node.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function open(trigger) {
    ensureModal();
    currentTrigger = trigger || null;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = trigger?.dataset.emailSelector || 'input[type="email"]';
    const source = document.querySelector(selector);
    const input = document.getElementById("wowResetEmail");
    const returnButton = document.getElementById("wowResetReturn");
    input.value = String(source?.value || "").trim();
    input.setAttribute("aria-invalid", "false");
    returnButton.textContent = trigger?.dataset.returnLabel || "Return to Login";
    setMessage("");
    const overlay = document.getElementById("wowResetOverlay");
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("wow-reset-open");
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    if (submitting) return;
    const overlay = document.getElementById("wowResetOverlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("wow-reset-open");
    setMessage("");
    const target = returnFocus;
    returnFocus = null;
    currentTrigger = null;
    if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const input = document.getElementById("wowResetEmail");
    const button = document.getElementById("wowResetSubmit");
    const email = String(input?.value || "").trim();
    if (!email) {
      input.setAttribute("aria-invalid", "true");
      setMessage("Please enter your registered email address.");
      input.focus();
      return;
    }
    if (!validEmail(email)) {
      input.setAttribute("aria-invalid", "true");
      setMessage("Please enter a valid email address.");
      input.focus();
      return;
    }
    input.setAttribute("aria-invalid", "false");
    submitting = true;
    button.disabled = true;
    button.textContent = "Sending...";
    setMessage("");
    try {
      const path = location.pathname.includes("/admin/") ? "../php/auth_reset_api.php" : "php/auth_reset_api.php";
      const hint = String(currentTrigger?.dataset.returnLabel || "").toLowerCase();
      const sourcePlatform = location.pathname.includes("/admin/") ? "admin_website" : (hint.includes("driver") ? "driver_website" : "passenger_website");
      const role = sourcePlatform.startsWith("driver") ? "driver" : (sourcePlatform.startsWith("admin") ? "admin" : "passenger");
      const response = await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email,sourcePlatform,role})});
      const data = await response.json();if(!response.ok||!data.ok)throw new Error(data.message||"reset_failed");
      setMessage(SUCCESS_MESSAGE, "success");
    } catch (error) {
      const code = String(error?.code || "").toLowerCase();
      if (code.includes("user-not-found")) {
        setMessage(SUCCESS_MESSAGE, "success");
      } else if (code.includes("invalid-email")) {
        input.setAttribute("aria-invalid", "true");
        setMessage("Please enter a valid email address.");
      } else if (code.includes("too-many-requests")) {
        setMessage("Too many requests were made. Please wait a moment and try again.");
      } else {
        setMessage("We could not send the reset link right now. Please check your connection and try again.");
      }
    } finally {
      submitting = false;
      button.disabled = false;
      button.textContent = "Send Reset Link";
    }
  }

  function trapKeyboard(event) {
    const overlay = document.getElementById("wowResetOverlay");
    if (!overlay || overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(overlay.querySelectorAll("button:not([disabled]),input:not([disabled])"));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function init() {
    ensureModal();
    const triggers = Array.from(document.querySelectorAll("[data-wow-forgot-password]"));
    triggers.forEach(item => {
      if (item.dataset.wowResetBound === "1") return;
      item.dataset.wowResetBound = "1";
      item.addEventListener("click", () => open(item));
    });
    const params = new URLSearchParams(location.search);
    if (params.get("forgot") === "1" && triggers.length) {
      const role = params.get("role");
      const selected = triggers.find(item => String(item.dataset.returnLabel || "").toLowerCase().includes(String(role || "").toLowerCase())) || triggers[0];
      history.replaceState(null, "", location.pathname + (role ? `?role=${encodeURIComponent(role)}` : ""));
      open(selected);
    }
  }

  global.WowForgotPassword = { init, open, close, successMessage: SUCCESS_MESSAGE };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
