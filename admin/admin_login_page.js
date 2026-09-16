(function adminLoginPage() {
  "use strict";
  const form = document.getElementById("admin-login-form");
  if (!form) return;
  const icons = {
    show: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="2.75"/></svg>',
    hide: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 10.6a2.75 2.75 0 0 0 3.8 3.8"/><path d="M9.9 5.6A9.6 9.6 0 0 1 12 5.25C18 5.25 21.75 12 21.75 12a17.3 17.3 0 0 1-2.18 2.95"/><path d="M6.55 6.55C3.84 8.37 2.25 12 2.25 12S6 18.75 12 18.75a9.7 9.7 0 0 0 3.43-.63"/></svg>'
  };
  document.querySelectorAll(".toggle-password").forEach(button => {
    button.innerHTML = icons.show;
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target || "");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(show));
      button.setAttribute("title", show ? "Hide password" : "Show password");
      button.innerHTML = show ? icons.hide : icons.show;
    });
  });
  form.addEventListener("submit", event => {
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    if (email?.value.trim() && password?.value) return;
    event.preventDefault();
    let message = document.getElementById("adminClientError");
    if (!message) {
      message = document.createElement("div");
      message.id = "adminClientError";
      message.className = "alert error";
      message.setAttribute("role", "alert");
      form.prepend(message);
    }
    message.textContent = "Please enter both email and password.";
  });
})();
