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

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toggle-password';
  btn.setAttribute('aria-label', 'Show password');
  btn.textContent = '👁️';
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.textContent = show ? '🙈' : '👁️';
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
  passwordInput.insertAdjacentElement('afterend', strength);

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
    invalid_file_type: 'Invalid CNIC file type. Use jpg, jpeg, png or pdf.',
    cnic_upload_required: 'CNIC upload is required for driver signup.',
    cnic_upload_failed: 'CNIC upload failed. Please try again.',
    email_exists: 'This email is already registered. Please login.',
    invalid_role: 'Invalid signup role.'
  };
  setAuthMessage(map[error] || 'Signup failed. Please try again.');
}

function bindSignupValidation(form) {
  if (!form) return;

  const passwordInput = form.querySelector('input[name="password"]');
  const confirmInput = form.querySelector('input[name="confirm_password"]');

  addPasswordToggle(passwordInput);
  addPasswordToggle(confirmInput);
  attachStrengthUI(form);

  const validate = () => {
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (!passwordRule.test(password)) {
      setAuthMessage('Password is too weak. Please use a stronger password.');
      return false;
    }

    if (password !== confirmPassword) {
      setAuthMessage('Passwords do not match.');
      return false;
    }

    return true;
  };

  form.addEventListener('submit', (e) => {
    setAuthMessage('');
    if (!validate()) e.preventDefault();
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

bindSignupValidation(document.getElementById('passenger-form'));
bindSignupValidation(document.getElementById('driver-form'));
applyRoleFromQuery();
showMessageFromQuery();
