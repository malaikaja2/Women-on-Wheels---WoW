(async function () {
  "use strict";

  let unsubscribe = null;
  let navigated = false;
  let readyPromise = null;
  const $ = id => document.getElementById(id);

  const APPROVED_STATUSES = new Set(["approved", "verified", "active"]);

  function approvedDriver(data) {
    const status = String(data.verificationStatus || data.accountStatus || "").trim().toLowerCase();
    const role = String(data.role || "").trim().toLowerCase();
    const rejected = status === "rejected" || data.isRejected === true;
    return !rejected && role === "driver" && (APPROVED_STATUSES.has(status) || data.isApproved === true);
  }

  function toggleResubmit(show) {
    const box = $("resubmitBox");
    if (box) box.hidden = !show;
  }

  function render(data) {
    const status = String(data.verificationStatus || data.accountStatus || "pending").trim().toLowerCase();
    const rejected = status === "rejected" || data.isRejected === true;
    if (approvedDriver(data)) {
      $("statusTitle").textContent = "Application Approved";
      $("statusBadge").textContent = "Approved";
      $("statusMessage").textContent = "Your driver account has been approved. Opening the driver dashboard...";
      $("statusIcon").textContent = "OK";
      $("reasonBox").hidden = true;
      toggleResubmit(false);
      localStorage.setItem("wow_user_role", "driver");
      localStorage.setItem("wow_driver_verification_status", String(data.verificationStatus || data.accountStatus || "approved").trim().toLowerCase());
      localStorage.setItem("wow_driver_is_approved", "true");
      localStorage.setItem("wow_driver_role", "driver");
      if (!navigated) {
        navigated = true;
        window.setTimeout(() => location.replace("driver-dashboard.html"), 350);
      }
      return;
    }
    if (rejected) {
      $("statusTitle").textContent = "Application Rejected";
      $("statusBadge").textContent = "Rejected";
      $("statusIcon").textContent = "X";
      $("statusMessage").textContent = "Your application was not approved. Review the reason below.";
      $("reasonText").textContent = String(data.verificationRejectionReason || data.rejectionReason || "Contact support for details.");
      $("reasonBox").hidden = false;
      toggleResubmit(true);
      localStorage.setItem("wow_driver_verification_status", "rejected");
      return;
    }
    $("statusTitle").textContent = "Verification Pending";
    $("statusBadge").textContent = "Pending";
    $("statusIcon").textContent = "...";
    $("statusMessage").textContent = "Your driver account is still awaiting admin approval.";
    $("reasonBox").hidden = true;
    toggleResubmit(false);
  }

  async function renderFromServerSession() {
    const response = await fetch("php/driver_verification_status.php", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.driver) throw new Error(payload.error || "driver_auth_required");
    render(payload.driver);
  }

  async function logout() {
    const button = $("logoutBtn");
    button.disabled = true;
    button.textContent = "Logging out...";
    try { unsubscribe?.(); } catch {}
    await Promise.race([
      Promise.allSettled([
        fetch("php/logout.php", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => null),
        window.firebase?.auth?.().signOut?.().catch(() => null) || Promise.resolve()
      ]),
      new Promise(resolve => setTimeout(resolve, 1200))
    ]);
    ["wow_logged_in", "wow_user_id", "wow_user_name", "wow_user_email", "wow_user_role",
      "wow_driver_role", "wow_driver_verification_status", "wow_driver_is_approved"].forEach(key => localStorage.removeItem(key));
    location.replace("login.html?role=driver");
  }

  function uploadErrorMessage(error) {
    const code = String(error?.message || error || "upload-failed");
    const map = {
      invalid_file_type: "Use JPG, PNG, or WebP images only.",
      invalid_image_content: "One selected file is not a valid image.",
      invalid_file_size: "One selected file is too large.",
      image_too_large: "One selected image is too large after compression.",
      image_optimize_failed: "One selected image could not be optimized.",
      "not-authenticated": "Your session expired. Please sign in again."
    };
    return map[code] || "Upload failed. Please try again.";
  }

  async function optimizeInput(input, slot) {
    if (!input?.files?.length || !window.WowImageUpload?.optimizeFileInput) return;
    await window.WowImageUpload.optimizeFileInput(input, {
      mode: slot === "profile" ? "profile" : "document"
    });
  }

  function uploadSlot(input, slot, token, onProgress) {
    return new Promise((resolve, reject) => {
      if (!input?.files?.length) {
        resolve(null);
        return;
      }
      const form = new FormData();
      form.append("slot", slot);
      form.append("document", input.files[0]);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "php/driver_documents_upload.php", true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && typeof onProgress === "function") {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        const payload = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && payload.ok) {
          resolve(payload);
        } else {
          reject(new Error(payload.error || "upload-failed"));
        }
      };
      xhr.onerror = () => reject(new Error("upload-failed"));
      xhr.send(form);
    });
  }

  async function submitResubmission(event) {
    event.preventDefault();
    const slots = [
      { slot: "cnic_front", input: $("resubmitCnicFront"), label: "CNIC front" },
      { slot: "cnic_back", input: $("resubmitCnicBack"), label: "CNIC back" },
      { slot: "licence", input: $("resubmitLicence"), label: "Driving licence" },
      { slot: "profile", input: $("resubmitProfile"), label: "Profile photo" }
    ].filter(item => item.input?.files?.length);
    const status = $("resubmitStatus");
    const button = $("resubmitBtn");
    if (!slots.length) {
      status.textContent = "Choose at least one corrected image.";
      return;
    }
    button.disabled = true;
    try {
      await (readyPromise || window.WowFirestore.ready());
      const token = await window.firebase.auth().currentUser.getIdToken(true);
      for (const item of slots) {
        status.textContent = `Optimizing ${item.label}...`;
        await optimizeInput(item.input, item.slot);
        status.textContent = `Uploading ${item.label}...`;
        await uploadSlot(item.input, item.slot, token, percent => {
          status.textContent = `Uploading ${item.label}... ${percent}%`;
        });
      }
      status.textContent = "Documents submitted. Waiting for admin review.";
      $("resubmitForm").reset();
      render({ verificationStatus: "pending", role: "driver_applicant" });
    } catch (error) {
      status.textContent = uploadErrorMessage(error);
    } finally {
      button.disabled = false;
    }
  }

  $("logoutBtn").addEventListener("click", logout);
  $("resubmitForm")?.addEventListener("submit", submitResubmission);

  try {
    readyPromise = Promise.race([
      window.WowFirestore.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("firebase_auth_timeout")), 8000))
    ]);
    const { db, uid } = await readyPromise;
    unsubscribe = db.collection("drivers").doc(uid).onSnapshot(snapshot => {
      if (!snapshot.exists) {
        $("statusTitle").textContent = "Driver profile not found";
        $("statusBadge").textContent = "Retrying";
        $("statusMessage").textContent = "We are reconnecting your secure driver session...";
        return;
      }
      render(snapshot.data() || {});
    }, error => {
      console.error("[WOW Driver Verification] listener failed", error);
      $("statusTitle").textContent = "Connection temporarily unavailable";
      $("statusBadge").textContent = "Retrying";
      $("statusMessage").textContent = "Your session is still active. Rechecking your driver status automatically...";
      window.setTimeout(() => {
        if (navigated) return;
        try { unsubscribe?.(); } catch {}
        unsubscribe = null;
        window.location.reload();
      }, 5000);
    });
  } catch (error) {
    try {
      await renderFromServerSession();
    } catch {
      $("statusTitle").textContent = "Sign In Required";
      $("statusBadge").textContent = "Session Expired";
      $("statusIcon").textContent = "!";
      $("statusMessage").textContent = "Your secure driver session is not active. Log out and sign in again as a driver.";
      toggleResubmit(false);
    }
  }

  window.addEventListener("pagehide", () => unsubscribe?.(), { once: true });
})();
