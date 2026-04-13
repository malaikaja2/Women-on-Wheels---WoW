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
    setAuthMessage('Signup successful. Please login.', 'success');
    return;
  }

  if (!error) return;
  const map = {
    invalid_credentials: 'Invalid email or password',
    missing_fields: 'Please enter email and password.',
    invalid_role: 'Invalid login role.'
  };
  setAuthMessage(map[error] || 'Unable to login. Please try again.');
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

document.querySelectorAll('#passenger-login input[type="password"], #driver-login input[type="password"]')
  .forEach(addPasswordToggle);
bindFormValidation(document.getElementById('passenger-login'));
bindFormValidation(document.getElementById('driver-login'));
applyRoleFromQuery();
showMessageFromQuery();
