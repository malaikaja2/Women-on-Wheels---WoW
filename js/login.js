function showLoginForm(role) {
  const passenger = document.getElementById('passenger-login');
  const driver = document.getElementById('driver-login');
  const roleButtons = document.querySelectorAll('.role-buttons .role-btn');

  passenger.classList.remove('active');
  driver.classList.remove('active');
  roleButtons.forEach((button) => button.classList.remove('active'));

  if (role === 'passenger') {
    passenger.classList.add('active');
  } else {
    driver.classList.add('active');
  }

  roleButtons.forEach((button) => {
    if (button.dataset.role === role) {
      button.classList.add('active');
    }
  });

  setAuthMessage('');
}

function setAuthMessage(text, type = 'error') {
  const messageBox = document.getElementById('authMessage');
  if (!messageBox) return;
  messageBox.classList.remove('is-error', 'is-success');
  if (!text) {
    messageBox.textContent = '';
    messageBox.style.display = 'none';
    return;
  }
  messageBox.textContent = text;
  messageBox.classList.add(type === 'success' ? 'is-success' : 'is-error');
  messageBox.style.display = 'block';
}

function applyRoleFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'driver' || role === 'passenger') {
    showLoginForm(role);
  } else {
    showLoginForm('passenger');
  }
}

function showMessageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const signup = params.get('signup');

  if (signup === 'success') {
    if (params.get('role') === 'driver') {
      setAuthMessage('Driver application submitted. Please login after admin approval.', 'success');
    } else {
      setAuthMessage('Signup successful. Please login.', 'success');
    }
    return;
  }

  if (!error) return;
  const map = {
    invalid_credentials: 'Invalid email or password',
    firebase_quota_exceeded: 'Firebase usage quota is currently exhausted. Your credentials may be correct; please try again after service is restored.',
    firebase_unavailable: 'Firebase is temporarily unreachable. Your credentials were not rejected; please try again shortly.',
    login_service_unavailable: 'The login service is temporarily unavailable. Your credentials were not rejected; please try again shortly.',
    missing_fields: 'Please enter email and password.',
    invalid_role: 'Invalid login role.',
    driver_pending: 'Your driver account is under admin verification. You will be able to receive rides after approval.',
    driver_rejected: 'Your driver application was rejected. Please contact admin support.',
    female_driver_required: 'WomenOnWheels active driver accounts are for female drivers only.'
  };
  setAuthMessage(map[error] || 'Unable to login. Please try again.');
}

function addPasswordToggle(input) {
  if (!input || input.dataset.toggleReady === '1') return;
  const wrap = document.createElement('div');
  wrap.className = 'password-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const icons = {
    show: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="2.75"/></svg>',
    hide: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 10.6a2.75 2.75 0 0 0 3.8 3.8"/><path d="M9.9 5.6A9.6 9.6 0 0 1 12 5.25C18 5.25 21.75 12 21.75 12a17.3 17.3 0 0 1-2.18 2.95"/><path d="M6.55 6.55C3.84 8.37 2.25 12 2.25 12S6 18.75 12 18.75a9.7 9.7 0 0 0 3.43-.63"/></svg>'
  };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toggle-password';
  btn.setAttribute('aria-label', 'Show password');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = icons.show;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.innerHTML = show ? icons.hide : icons.show;
  });
  wrap.appendChild(btn);
  input.dataset.toggleReady = '1';
}

function bindFormValidation(form) {
  if (!form) return;

  const validate = () => {
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    if (!email?.value.trim() || !password?.value) {
      setAuthMessage('Please enter email and password.');
      return false;
    }
    return true;
  };

  form.addEventListener('submit', async (e) => {
    setAuthMessage('');
    if (!validate()) e.preventDefault();
    if (e.defaultPrevented || form.dataset.firebaseAuthenticated === '1') return;
    e.preventDefault();
    const email = form.querySelector('input[name="email"]')?.value.trim() || '';
    const password = form.querySelector('input[name="password"]')?.value || '';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }
    try {
      const auth = await ensureFirebaseAuth();
      await auth.signInWithEmailAndPassword(email, password);
      form.dataset.firebaseAuthenticated = '1';
      form.submit();
    } catch (error) {
      const code = String(error?.code || '').toLowerCase();
      setAuthMessage(code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
        ? 'Invalid email or password'
        : 'Unable to establish a secure Firebase session. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  });

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      setAuthMessage('');
      if (!validate()) e.preventDefault();
    });
  }

  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      const box = document.getElementById('authMessage');
      if (box && box.classList.contains('is-error')) setAuthMessage('');
    });
  });
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",
  authDomain: "women-on-wheels-f8970.firebaseapp.com",
  projectId: "women-on-wheels-f8970",
  storageBucket: "women-on-wheels-f8970.firebasestorage.app"
};

async function ensureFirebaseAuth() {
  if (!window.firebase || !firebase.auth) throw new Error('firebase_unavailable');
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  if (auth.setPersistence && firebase.auth.Auth?.Persistence?.SESSION) {
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  }
  return auth;
}

function passengerPostLoginRedirect() {
  const postLogin = localStorage.getItem('wow_post_login_redirect');
  const postLoginSource = localStorage.getItem('wow_post_login_source');
  const postLoginSetAt = Number(localStorage.getItem('wow_post_login_set_at') || '0');
  const isFreshBookIntent = Number.isFinite(postLoginSetAt) && postLoginSetAt > 0 && (Date.now() - postLoginSetAt) <= 600000;
  const isAllowedPostLogin = postLoginSource === 'book_ride' && isFreshBookIntent && postLogin === 'dashboard.html';
  localStorage.removeItem('wow_post_login_redirect');
  localStorage.removeItem('wow_post_login_source');
  localStorage.removeItem('wow_post_login_set_at');
  return isAllowedPostLogin ? postLogin : 'app-home.html';
}

async function ensurePassengerGoogleProfile(user) {
  if (!user || !user.uid) throw new Error('google_user_missing');
  if (!firebase.firestore) throw new Error('firestore_unavailable');
  const db = firebase.firestore();
  const driverSnapshot = await db.collection('drivers').doc(user.uid).get();
  if (driverSnapshot.exists) {
    const driver = driverSnapshot.data() || {};
    const driverRole = String(driver.role || '').toLowerCase();
    if (!driverRole || driverRole === 'driver' || driverRole === 'driver_applicant') {
      throw new Error('driver_account_not_allowed');
    }
  }
  const passengerRef = db.collection('passengers').doc(user.uid);
  const passengerSnapshot = await passengerRef.get();
  const current = passengerSnapshot.exists ? (passengerSnapshot.data() || {}) : {};
  const displayName = String(user.displayName || current.name || current.fullName || (user.email || '').split('@')[0] || 'Passenger').trim();
  const email = String(user.email || current.email || '').trim().toLowerCase();
  const now = firebase.firestore.FieldValue.serverTimestamp();
  await passengerRef.set({
    uid: user.uid,
    name: displayName,
    fullName: displayName,
    displayName,
    email,
    phone: String(current.phone || current.phoneNumber || user.phoneNumber || ''),
    role: 'passenger',
    authProvider: 'google',
    emailVerified: user.emailVerified === true,
    profileImage: user.photoURL || current.profileImage || '',
    photoURL: user.photoURL || current.photoURL || '',
    lastLoginAt: now,
    updatedAt: now,
    ...(passengerSnapshot.exists ? {} : { createdAt: now })
  }, { merge: true });
  return { displayName, email };
}

function storePassengerSession(user, profile) {
  localStorage.setItem('wow_logged_in', 'true');
  localStorage.setItem('wow_user_id', user.uid);
  localStorage.setItem('wow_user_name', profile.displayName || user.displayName || 'Passenger');
  localStorage.setItem('wow_user_email', profile.email || user.email || '');
  localStorage.setItem('wow_user_role', 'passenger');
  localStorage.setItem('wow_driver_role', '');
  localStorage.setItem('wow_driver_verification_status', '');
  localStorage.setItem('wow_driver_is_approved', 'false');
}

function googleErrorMessage(error) {
  const code = String(error?.code || error?.message || '').toLowerCase();
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'Google sign-in was cancelled.';
  if (code.includes('popup-blocked')) return 'Popup blocked. Please allow popups and try again.';
  if (code.includes('operation-not-allowed')) return 'Google login is not enabled in Firebase Authentication.';
  if (code.includes('account-exists-with-different-credential')) return 'This email already uses password login. Please login with email and password.';
  if (code.includes('driver_account_not_allowed')) return 'This Google account belongs to a driver account. Please use Driver Login.';
  return 'Google login failed. Please try again.';
}

async function handlePassengerGoogleLogin() {
  const button = document.getElementById('passengerGoogleLogin');
  if (!button || button.disabled) return;
  setAuthMessage('');
  button.disabled = true;
  const originalHtml = button.innerHTML;
  button.innerHTML = '<span class="google-mark" aria-hidden="true">G</span><span>Connecting...</span>';
  try {
    const auth = await ensureFirebaseAuth();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await auth.signInWithPopup(provider);
    const user = result.user || auth.currentUser;
    const profile = await ensurePassengerGoogleProfile(user);
    storePassengerSession(user, profile);
    window.location.href = passengerPostLoginRedirect();
  } catch (error) {
    console.error('[WOW Login] Google passenger login failed', error);
    try { await firebase.auth().signOut(); } catch (_) {}
    setAuthMessage(googleErrorMessage(error));
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

document.querySelectorAll('#passenger-login input[type="password"], #driver-login input[type="password"]')
  .forEach(addPasswordToggle);
bindFormValidation(document.getElementById('passenger-login'));
bindFormValidation(document.getElementById('driver-login'));
document.getElementById('passengerGoogleLogin')?.addEventListener('click', handlePassengerGoogleLogin);
applyRoleFromQuery();
showMessageFromQuery();
