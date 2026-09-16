(function wowChangePassword(global) {
  "use strict";
  if (global.WowChangePassword) return;
  const CONFIG = {
    apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
    authDomain: "women-on-wheels-f8970.firebaseapp.com",
    projectId: "women-on-wheels-f8970",
    storageBucket: "women-on-wheels-f8970.firebasestorage.app"
  };
  let trigger = null, returnFocus = null, busy = false, auth = null;
  const requirements = {
    length: value => value.length >= 8,
    upper: value => /[A-Z]/.test(value),
    lower: value => /[a-z]/.test(value),
    number: value => /\d/.test(value),
    special: value => /[^A-Za-z0-9\s]/.test(value)
  };

  function ensureMarkup() {
    if (document.getElementById("wowCpOverlay")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="wow-cp-overlay" id="wowCpOverlay" hidden aria-hidden="true"><section class="wow-cp-modal" role="dialog" aria-modal="true" aria-labelledby="wowCpTitle" aria-describedby="wowCpIntro"><button class="wow-cp-close" id="wowCpClose" type="button" aria-label="Close change password dialog">&times;</button><div class="wow-cp-icon" aria-hidden="true">&#128274;</div><h2 id="wowCpTitle">Change Password</h2><p class="wow-cp-intro" id="wowCpIntro">Verify your current password, then choose a strong new password.</p><form class="wow-cp-form" id="wowCpForm" novalidate><div class="wow-cp-fields">${field("wowCpCurrent","Current Password","current-password")}${field("wowCpNew","New Password","new-password")}${field("wowCpConfirm","Confirm New Password","new-password")}</div><div class="wow-cp-requirements" aria-label="Password requirements"><span class="wow-cp-requirement" data-requirement="length">8 or more characters</span><span class="wow-cp-requirement" data-requirement="upper">One uppercase letter</span><span class="wow-cp-requirement" data-requirement="lower">One lowercase letter</span><span class="wow-cp-requirement" data-requirement="number">One number</span><span class="wow-cp-requirement" data-requirement="special">One special character</span></div><div class="wow-cp-message" id="wowCpMessage" role="alert" aria-live="polite"></div><button class="wow-cp-forgot" id="wowCpForgot" type="button">Forgot your current password?</button><div class="wow-cp-actions"><button class="wow-cp-button" id="wowCpCancel" type="button">Cancel</button><button class="wow-cp-button primary" id="wowCpSubmit" type="submit">Update Password</button></div></form><div class="wow-cp-provider" id="wowCpProvider" hidden><p>Your account uses Google Sign-In. Password changes are managed through your Google account.</p><button class="wow-cp-button" id="wowCpProviderClose" type="button">Close</button></div><div class="wow-cp-success" id="wowCpSuccess" hidden><h2>Password Updated Successfully</h2><p>Your password has been changed successfully.</p><button class="wow-cp-button primary" id="wowCpSignIn" type="button">Sign In Again</button></div></section></div>`);
    document.querySelectorAll("[data-wow-cp-toggle]").forEach(button => button.addEventListener("click", () => togglePassword(button)));
    document.getElementById("wowCpNew").addEventListener("input", updateRequirements);
    document.getElementById("wowCpForm").addEventListener("submit", submit);
    ["wowCpClose","wowCpCancel","wowCpProviderClose"].forEach(id => document.getElementById(id).addEventListener("click", close));
    document.getElementById("wowCpSignIn").addEventListener("click", redirectToLogin);
    document.getElementById("wowCpForgot").addEventListener("click", forgotCurrentPassword);
    document.getElementById("wowCpOverlay").addEventListener("click", event => { if (event.target.id === "wowCpOverlay") close(); });
    document.addEventListener("keydown", trapFocus);
  }

  function field(id, label, autocomplete) {
    return `<label class="wow-cp-label" for="${id}">${label}<span class="wow-cp-input-wrap"><input class="wow-cp-input" id="${id}" type="password" autocomplete="${autocomplete}" required aria-invalid="false"><button class="wow-cp-toggle" type="button" data-wow-cp-toggle="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">Show</button></span></label>`;
  }

  async function authReady(activeTrigger) {
    if (!global.firebase?.auth) throw new Error("firebase_unavailable");
    if (!firebase.apps.length) firebase.initializeApp(CONFIG);
    if (global.WowFirestore) {
      const context = await WowFirestore.ready();
      return context.auth;
    }
    const instance = firebase.auth();
    if (!instance.currentUser && activeTrigger?.dataset.tokenUrl) {
      const response = await fetch(activeTrigger.dataset.tokenUrl, { credentials:"same-origin", cache:"no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.token) throw new Error("session_expired");
      await instance.signInWithCustomToken(data.token);
    }
    return instance;
  }

  async function open(activeTrigger) {
    ensureMarkup();
    trigger = activeTrigger;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    clearPasswords();
    setMessage("");
    setView("form");
    const overlay = document.getElementById("wowCpOverlay");
    overlay.hidden = false; overlay.setAttribute("aria-hidden","false"); document.body.classList.add("wow-cp-open");
    try {
      auth = await authReady(trigger);
      const user = auth.currentUser;
      if (!user) throw new Error("session_expired");
      const providers = (user.providerData || []).map(item => String(item?.providerId || ""));
      if (providers.includes("google.com") && !providers.includes("password")) {
        setView("provider");
        document.getElementById("wowCpProviderClose").focus();
        return;
      }
      if (!user.email) throw new Error("password_provider_unavailable");
      document.getElementById("wowCpCurrent").focus();
    } catch {
      setMessage("Your secure session has expired. Please sign in again.", "error");
      document.getElementById("wowCpSubmit").disabled = true;
    }
  }

  function setView(view) {
    document.getElementById("wowCpForm").hidden = view !== "form";
    document.getElementById("wowCpProvider").hidden = view !== "provider";
    document.getElementById("wowCpSuccess").hidden = view !== "success";
  }
  function setMessage(text, type = "error") {
    const node = document.getElementById("wowCpMessage");
    node.textContent = text || ""; node.className = `wow-cp-message${text ? ` is-${type}` : ""}`;
  }
  function clearPasswords() {
    ["wowCpCurrent","wowCpNew","wowCpConfirm"].forEach(id => { const input=document.getElementById(id); if(input){input.value="";input.type="password";input.setAttribute("aria-invalid","false");} });
    document.querySelectorAll("[data-wow-cp-toggle]").forEach(button => { button.textContent="Show";button.setAttribute("aria-pressed","false"); });
    updateRequirements();
  }
  function updateRequirements() {
    const value = document.getElementById("wowCpNew")?.value || "";
    Object.entries(requirements).forEach(([key,test]) => document.querySelector(`[data-requirement="${key}"]`)?.classList.toggle("is-valid", test(value)));
  }
  function togglePassword(button) {
    const input=document.getElementById(button.dataset.wowCpToggle);if(!input)return;const show=input.type==="password";input.type=show?"text":"password";button.textContent=show?"Hide":"Show";button.setAttribute("aria-pressed",String(show));button.setAttribute("aria-label",`${show?"Hide":"Show"} ${input.id==="wowCpCurrent"?"current password":"new password"}`);
  }

  async function submit(event) {
    event.preventDefault(); if (busy) return;
    let currentPassword=document.getElementById("wowCpCurrent").value;
    let newPassword=document.getElementById("wowCpNew").value;
    let confirmPassword=document.getElementById("wowCpConfirm").value;
    const inputs=["wowCpCurrent","wowCpNew","wowCpConfirm"].map(id=>document.getElementById(id));
    inputs.forEach(input=>input.setAttribute("aria-invalid","false"));
    if (!currentPassword || !newPassword || !confirmPassword) return fail("Please complete all password fields.", inputs.find(input=>!input.value));
    if (!Object.values(requirements).every(test=>test(newPassword)) || !newPassword.trim()) return fail("Your new password does not meet the security requirements.", inputs[1]);
    if (newPassword === currentPassword) return fail("Your new password must be different from your current password.", inputs[1]);
    if (newPassword !== confirmPassword) return fail("New password and confirm password do not match.", inputs[2]);
    const user=auth?.currentUser;if(!user?.email)return fail("Your secure session has expired. Please sign in again.");
    busy=true;const button=document.getElementById("wowCpSubmit");button.disabled=true;button.textContent="Updating...";setMessage("");
    try {
      const credential=firebase.auth.EmailAuthProvider.credential(user.email,currentPassword);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPassword);
      clearPasswords(); currentPassword="";newPassword="";confirmPassword="";
      await secureSignOut();
      setView("success");
      document.getElementById("wowCpSignIn").focus();
    } catch(error) {
      const code=String(error?.code||error?.message||"").toLowerCase();
      if(/wrong-password|invalid-credential/.test(code)) fail("Current password is incorrect.",inputs[0]);
      else if(/weak-password/.test(code)) fail("Your new password does not meet the security requirements.",inputs[1]);
      else if(/requires-recent-login/.test(code)) fail("For security, please verify your current password again.",inputs[0]);
      else if(/network-request-failed/.test(code)) fail("Please check your internet connection and try again.");
      else if(/too-many-requests/.test(code)) fail("Too many attempts. Please wait and try again.");
      else fail("We could not update your password. Please try again.");
    } finally {
      inputs[0].value="";
      currentPassword="";newPassword="";confirmPassword="";busy=false;button.disabled=false;button.textContent="Update Password";
    }
  }
  function fail(message,input){setMessage(message,"error");if(input){input.setAttribute("aria-invalid","true");input.focus();}}

  async function secureSignOut() {
    try { await auth?.signOut(); } catch {}
    const logoutUrl=trigger?.dataset.logoutUrl;
    if (logoutUrl) {
      try { await fetch(logoutUrl,{method:trigger?.dataset.logoutMethod||"POST",credentials:"same-origin",cache:"no-store"}); } catch {}
    }
    ["wow_logged_in","wow_user_id","wow_user_name","wow_user_email","wow_user_role","wow_driver_role","wow_driver_verification_status","wow_driver_is_approved"].forEach(key=>localStorage.removeItem(key));
  }
  async function forgotCurrentPassword(){if(busy)return;await secureSignOut();redirectToLogin(true);}
  function redirectToLogin(openForgot=false){const url=trigger?.dataset.loginUrl||"login.html";location.replace(url+(openForgot?(url.includes("?")?"&forgot=1":"?forgot=1"):""));}
  function close(){if(busy)return;const overlay=document.getElementById("wowCpOverlay");if(!overlay)return;overlay.hidden=true;overlay.setAttribute("aria-hidden","true");document.body.classList.remove("wow-cp-open");clearPasswords();setMessage("");document.getElementById("wowCpSubmit").disabled=false;const target=returnFocus;returnFocus=null;trigger=null;auth=null;if(target&&document.contains(target))requestAnimationFrame(()=>target.focus());}
  function trapFocus(event){const overlay=document.getElementById("wowCpOverlay");if(!overlay||overlay.hidden)return;if(event.key==="Escape"){event.preventDefault();close();return;}if(event.key!=="Tab")return;const nodes=Array.from(overlay.querySelectorAll("button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])")).filter(node=>node.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  function init(){ensureMarkup();document.querySelectorAll("[data-wow-change-password]").forEach(button=>{if(button.dataset.wowCpBound==="1")return;button.dataset.wowCpBound="1";button.addEventListener("click",event=>{event.preventDefault();open(button);});});}
  global.WowChangePassword={init,open};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})(window);
