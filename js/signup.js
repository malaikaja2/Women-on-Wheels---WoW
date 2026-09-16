function showForm(role) {
  const passenger = document.getElementById('passenger-form');
  const driver = document.getElementById('driver-form');
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

const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

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

function evaluateStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z\d]/.test(password)) score += 1;

  if (!password) return { label: 'Weak', cls: 'weak' };
  if (score <= 2) return { label: 'Weak', cls: 'weak' };
  if (score === 3) return { label: 'Medium', cls: 'medium' };
  return { label: 'Strong', cls: 'strong' };
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

function attachStrengthUI(form) {
  const passwordInput = form.querySelector('input[name="password"]');
  if (!passwordInput || passwordInput.dataset.strengthReady === '1') return;

  const strength = document.createElement('div');
  strength.className = 'strength-wrap';
  strength.innerHTML = '<div class="strength-label">Strength: <b class="weak">Weak</b></div><div class="strength-bar"><span class="strength-fill weak"></span></div>';
  const passwordWrap = passwordInput.closest('.password-wrap');
  (passwordWrap || passwordInput).insertAdjacentElement('afterend', strength);

  const label = strength.querySelector('b');
  const fill = strength.querySelector('.strength-fill');

  const update = () => {
    const state = evaluateStrength(passwordInput.value);
    label.textContent = state.label;
    label.className = state.cls;
    fill.className = `strength-fill ${state.cls}`;
  };

  passwordInput.addEventListener('input', update);
  update();
  passwordInput.dataset.strengthReady = '1';
}

function applyRoleFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'driver' || role === 'passenger') {
    showForm(role);
  } else {
    showForm('passenger');
  }
}

function showMessageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return;

  const map = {
    missing_fields: 'Please complete all required fields.',
    password_mismatch: 'Passwords do not match.',
    weak_password: 'Password is too weak. Please use a stronger password.',
    invalid_cnic: 'Please enter CNIC in format 12345-1234567-1.',
    invalid_file_type: 'Invalid image type. Use JPG, PNG, or WebP.',
    invalid_image_content: 'The selected file is not a readable image.',
    image_too_large: 'Image is too large. Choose a clearer smaller image.',
    image_optimize_failed: 'Image optimization failed. Choose another image.',
    invalid_profile_photo: 'Invalid profile photo type. Use jpg, jpeg or png.',
    cnic_upload_required: 'CNIC upload is required for driver signup.',
    cnic_upload_failed: 'CNIC upload failed. Please try again.',
    licence_upload_failed: 'Driving licence upload failed. Please try again.',
    missing_documents: 'Upload CNIC front, CNIC back, and your driving licence.',
    duplicate_cnic: 'This CNIC is already registered.',
    duplicate_vehicle: 'This vehicle number is already registered.',
    duplicate_licence: 'This driving licence is already registered.',
    profile_photo_upload_failed: 'Profile photo upload failed. Please try again.',
    female_driver_required: 'WomenOnWheels driver applications are open to female drivers only.',
    email_exists: 'This email is already registered. Please login.',
    invalid_email: 'Please enter a valid email address.',
    firebase_quota_exceeded: 'Firebase read quota is currently exhausted. Please try signup again after a short while.',
    firebase_unavailable: 'Firebase is temporarily unreachable. Please check your connection and retry.',
    firebase_server_config: 'Firebase server credentials are not configured correctly. Please contact admin support.',
    firebase_permission_denied: 'Firebase rejected this signup request. Please contact admin support.',
    server_error: 'Signup server returned an error. Please retry after checking the highlighted fields.',
    invalid_server_response: 'Signup server returned an unreadable response. Please retry.',
    auth_not_enabled: 'Email/password login is not enabled in Firebase Authentication.',
    invalid_role: 'Invalid signup role.'
  };
  setAuthMessage(map[error] || 'Signup failed. Please try again.');
}

function bindSignupValidation(form) {
  if (!form) return;

  const passwordInput = form.querySelector('input[name="password"]');
  const confirmInput = form.querySelector('input[name="confirm_password"]');
  const roleInput = form.querySelector('input[name="role"]');

  addPasswordToggle(passwordInput);
  addPasswordToggle(confirmInput);
  attachStrengthUI(form);

  const fieldMessage = (input, message = '') => {
    if (!input) return;
    const anchor = input.closest('.password-wrap') || input;
    let error = anchor.nextElementSibling;
    if (!error?.classList.contains('field-error')) {
      error = document.createElement('span');
      error.className = 'field-error';
      anchor.insertAdjacentElement('afterend', error);
    }
    error.textContent = message;
    input.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  };

  const requiredMessage = {
    name: 'Full name is required.',
    email: 'Email address is required.',
    phone: 'Phone number is required.',
    gender: 'Please select gender.',
    vehicle_type: 'Vehicle type is required.',
    vehicle_number: 'Vehicle number is required.',
    cnic: 'CNIC number is required.',
    license_number: 'Driving licence number is required.',
    cnic_upload: 'Upload CNIC front image.',
    cnic_back: 'Upload CNIC back image.',
    licence_upload: 'Upload driving licence image.',
    password: 'Create a password.',
    confirm_password: 'Confirm your password.'
  };

  const validateField = (input) => {
    if (!input || input.type === 'hidden') return true;
    const name = input.name;
    const value = String(input.value || '').trim();
    let message = '';
    if (input.required && (input.type === 'file' ? !input.files?.length : !value)) {
      message = requiredMessage[name] || 'This field is required.';
    } else if (name === 'name' && value.length < 2) {
      message = 'Enter your full name.';
    } else if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      message = 'Enter a valid email address.';
    } else if (name === 'phone' && !/^(?:\+92|0)?3\d{9}$/.test(value.replace(/[\s-]/g, ''))) {
      message = 'Enter a valid Pakistani mobile number, e.g. 03XXXXXXXXX.';
    } else if (name === 'vehicle_type' && !['car', 'bike', 'scooty'].includes(value.toLowerCase())) {
      message = 'Vehicle type must be Car, Bike, or Scooty.';
    } else if (name === 'vehicle_number' && !/^[A-Za-z0-9 -]{4,15}$/.test(value)) {
      message = 'Enter a valid vehicle number.';
    } else if (name === 'cnic' && !/^\d{5}-\d{7}-\d$/.test(value)) {
      message = 'Use CNIC format 12345-1234567-1.';
    } else if (name === 'license_number' && !/^[A-Za-z0-9 -]{5,25}$/.test(value)) {
      message = 'Enter a valid driving licence number.';
    } else if (input.type === 'file' && input.files?.length) {
      const file = input.files[0];
      const ext = String(file.name || '').split('.').pop().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) message = 'Use a JPG, PNG, or WebP image.';
      else if (file.size > 10 * 1024 * 1024) message = 'Image must be smaller than 10 MB before optimization.';
    } else if (name === 'password' && !passwordRule.test(input.value)) {
      message = 'Use 8+ characters with uppercase, lowercase, number, and symbol.';
    } else if (name === 'confirm_password' && input.value !== passwordInput.value) {
      message = 'Passwords do not match.';
    }
    fieldMessage(input, message);
    return !message;
  };

  const validate = () => {
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';
    let valid = true;
    form.querySelectorAll('input, select').forEach((input) => {
      if (!validateField(input)) valid = false;
    });

    if (roleInput?.value === 'driver') {
      const gender = String(form.querySelector('[name="gender"]')?.value || '').trim().toLowerCase();
      if (gender !== 'female') {
        fieldMessage(form.querySelector('[name="gender"]'), 'WomenOnWheels driver applications are open to female drivers only.');
        valid = false;
      }
    }
    if (!passwordRule.test(password) || password !== confirmPassword) valid = false;
    if (!valid) {
      setAuthMessage('Please correct the highlighted fields. Your entered information has been kept.');
      form.querySelector('.is-invalid')?.focus();
    }
    return valid;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthMessage('');
    if (!validate()) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = roleInput?.value === 'driver' ? 'Submitting Application...' : 'Creating Account...';
    try {
      if (roleInput?.value === 'driver' && window.WowImageUpload) {
        setAuthMessage('Optimizing selected images before upload...', 'success');
        await window.WowImageUpload.optimizeForm(form, {
          onItem: (input) => setAuthMessage(`Optimizing ${input.previousElementSibling?.textContent?.replace('*', '').trim() || 'image'}...`, 'success')
        });
      }
      if (window.WowImageUpload?.submitFormWithProgress) {
        await window.WowImageUpload.submitFormWithProgress(form, (progress) => {
          setAuthMessage(`Uploading verification documents... ${progress}%`, 'success');
        });
      } else {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
        });
        const text = await response.text();
        let result = {};
        try {
          result = text ? JSON.parse(text) : {};
        } catch (_) {
          throw new Error(response.ok ? 'invalid_server_response' : 'server_error');
        }
        if (!response.ok || !result.ok) throw new Error(result.error || 'signup_failed');
      }
      window.location.href = `login.html?signup=success&role=${encodeURIComponent(roleInput?.value || 'passenger')}`;
    } catch (error) {
      const code = String(error.message || 'signup_failed');
      const map = {
        email_exists: ['email', 'This email is already registered. Please login.'],
        invalid_email: ['email', 'Enter a valid email address.'],
        duplicate_cnic: ['cnic', 'This CNIC is already registered.'],
        duplicate_vehicle: ['vehicle_number', 'This vehicle number is already registered.'],
        duplicate_licence: ['license_number', 'This driving licence is already registered.'],
        missing_documents: ['cnic_upload', 'Upload all mandatory driver documents.'],
        cnic_upload_failed: ['cnic_upload', 'CNIC upload failed. Choose the image again.'],
        licence_upload_failed: ['licence_upload', 'Driving licence upload failed. Choose the image again.'],
        profile_photo_upload_failed: ['profile_photo', 'Profile photo upload failed. Choose the image again.'],
        invalid_file_type: [null, 'Use JPG, PNG, or WebP images only.'],
        invalid_image_content: [null, 'One selected file is not a readable image.'],
        image_too_large: [null, 'One selected image is too large after optimization. Choose a smaller image.'],
        image_optimize_failed: [null, 'One selected image could not be optimized. Choose another image.'],
        weak_password: ['password', 'Use 8+ characters with uppercase, lowercase, number, and symbol.'],
        firebase_quota_exceeded: [null, 'Firebase read quota is currently exhausted. Please try signup again after a short while.'],
        firebase_unavailable: [null, 'Firebase is temporarily unreachable. Please check your connection and retry.'],
        firebase_server_config: [null, 'Firebase server credentials are not configured correctly. Please contact admin support.'],
        firebase_permission_denied: [null, 'Firebase rejected this signup request. Please contact admin support.'],
        server_error: [null, 'Signup server returned an error. Please retry after checking the highlighted fields.'],
        invalid_server_response: [null, 'Signup server returned an unreadable response. Please retry.'],
        signup_failed: [null, 'Signup could not be completed. Please check the fields and retry.']
      };
      const mapped = map[code];
      if (mapped?.[0]) fieldMessage(form.querySelector(`[name="${mapped[0]}"]`), mapped[1]);
      setAuthMessage(mapped?.[1] || 'Signup could not be completed. Your information is still here; please correct the issue and retry.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = roleInput?.value === 'driver' ? 'Submit Driver Application' : 'Sign Up';
    }
  });

  form.querySelectorAll('input, select').forEach((input) => {
    const eventName = input.type === 'file' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => validateField(input));
    input.addEventListener('blur', () => validateField(input));
  });
}

bindSignupValidation(document.getElementById('passenger-form'));
bindSignupValidation(document.getElementById('driver-form'));
applyRoleFromQuery();
showMessageFromQuery();
