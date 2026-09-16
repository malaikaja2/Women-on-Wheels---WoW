const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
  authDomain: "women-on-wheels-f8970.firebaseapp.com",
  projectId: "women-on-wheels-f8970",
  storageBucket: "women-on-wheels-f8970.firebasestorage.app"
};

function setAuthMessage(text, type = "error") {
  const messageBox = document.getElementById("authMessage");
  if (!messageBox) return;
  messageBox.classList.remove("is-error", "is-success");
  if (!text) {
    messageBox.textContent = "";
    messageBox.style.display = "none";
    return;
  }
  messageBox.textContent = text;
  messageBox.classList.add(type === "success" ? "is-success" : "is-error");
  messageBox.style.display = "block";
}

function ensureFirebaseAuth() {
  if (!window.firebase || !firebase.auth) throw new Error("firebase_unavailable");
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  return firebase.auth();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function sendResetEmail(event) {
  event.preventDefault();
  const form = document.getElementById("forgotPasswordForm");
  const emailInput = form?.querySelector('input[name="email"]');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const email = String(emailInput?.value || "").trim();

  if (!email) {
    setAuthMessage("Please enter your registered email.");
    return;
  }
  if (!isValidEmail(email)) {
    setAuthMessage("Please enter a valid email address.");
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
  }

  try {
    await ensureFirebaseAuth().sendPasswordResetEmail(email);
    setAuthMessage("If an account exists for this email, a password reset link has been sent. Please check your inbox and spam folder.", "success");
  } catch (error) {
    const code = String(error?.code || "").toLowerCase();
    if (code.includes("user-not-found")) {
      setAuthMessage("If an account exists for this email, a password reset link has been sent. Please check your inbox and spam folder.", "success");
    } else if (code.includes("invalid-email")) {
      setAuthMessage("Please enter a valid email address.");
    } else {
      setAuthMessage("Unable to send reset link. Please try again.");
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Reset Link";
    }
  }
}

document.getElementById("forgotPasswordForm")?.addEventListener("submit", sendResetEmail);
