<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_once dirname(__DIR__) . '/php/auth_audit_service.php';

if (admin_is_authenticated()) {
    header('Location: dashboard.php');
    exit();
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function log_admin_attempt(?string $adminId, string $email, string $status, ?string $reason = null): void
{
    wow_auth_audit_log(['userId'=>$adminId??'','email'=>$email,'role'=>'admin','eventType'=>strtoupper($status)==='SUCCESS'?'login_success':'login_failed','status'=>strtoupper($status)==='SUCCESS'?'successful':'failed','authProvider'=>'password','sourcePlatform'=>'admin_website','failureReasonCode'=>$reason??'','isSuspicious'=>in_array($reason,['invalid_admin_role','inactive_account'],true),'riskReason'=>$reason==='invalid_admin_role'?'Admin route access attempted by a non-admin account':($reason==='inactive_account'?'Disabled account login attempt':'')]);
    try {
        wow_firestore()->collection('adminLoginAudit')->add([
            'adminUid' => $adminId,
            'emailEntered' => $email,
            'ipAddress' => substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45),
            'userAgent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 255),
            'attemptStatus' => $status,
            'failureReason' => $reason,
            'attemptedAt' => wow_now(),
        ]);
    } catch (Throwable $exception) {
        error_log('Admin audit write failed: ' . $exception->getMessage());
    }
}

$email = '';
$errors = [];
$successMessage = '';

$queryError = $_GET['error'] ?? '';
if ($queryError === 'auth_required') {
    $errors[] = 'Please login to continue.';
} elseif ($queryError === 'session_expired') {
    $errors[] = 'Session validation failed. Please login again.';
} elseif ($queryError === 'session_timeout') {
    $errors[] = 'Session timed out due to inactivity. Please login again.';
}

if (isset($_GET['signup']) && $_GET['signup'] === 'success') {
    $successMessage = 'Signup successful. Please login with your new account.';
}
if (isset($_GET['logout']) && $_GET['logout'] === 'success') {
    $successMessage = 'You have been logged out securely.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $password = (string)($_POST['password'] ?? '');
    $csrfToken = (string)($_POST['csrf_token'] ?? '');

    if (!admin_verify_csrf_token($csrfToken)) {
        $errors[] = 'Invalid request token. Please refresh and try again.';
    }
    if ($email === '' || $password === '') {
        $errors[] = 'Email and password are required.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please enter a valid email address.';
    }

    if (empty($errors)) {
        try {
            $auth = wow_auth_login($email, $password);
            $uid = (string)($auth['localId'] ?? '');
            $admin = $uid !== '' ? wow_get_profile('admin', $uid) : null;

            if (!$admin) {
                log_admin_attempt(null, $email, 'FAILED', 'missing_admin_profile');
                $errors[] = 'This Firebase user is not registered as an admin.';
            } elseif (!in_array(strtolower((string)($admin['role'] ?? '')), ['admin', 'super_admin', 'owner'], true)) {
                log_admin_attempt($uid, $email, 'FAILED', 'invalid_admin_role');
                $errors[] = 'This Firebase user is not registered as an admin.';
            } elseif ((bool)($admin['isActive'] ?? false) !== true) {
                log_admin_attempt($uid, $email, 'FAILED', 'inactive_account');
                $errors[] = 'This admin account is inactive.';
            } else {
                $authEmailVerified = filter_var($auth['emailVerified'] ?? false, FILTER_VALIDATE_BOOLEAN);
                $profileEmailVerified = filter_var($admin['emailVerified'] ?? false, FILTER_VALIDATE_BOOLEAN);
                if ($authEmailVerified && !$profileEmailVerified) {
                    wow_set_doc('admins', $uid, ['emailVerified'=>true,'emailVerifiedAt'=>wow_now()], true);
                    wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>'admin','eventType'=>'email_verified','status'=>'successful','authProvider'=>'password','sourcePlatform'=>'admin_website']);
                }
                wow_set_doc('admins', $uid, [
                    'failedLoginAttempts' => 0,
                    'lockedUntil' => null,
                    'lastLoginAt' => wow_now(),
                ]);
                log_admin_attempt($uid, $email, 'SUCCESS');
                $admin['uid'] = $uid;
                $admin['id'] = $uid;
                $admin['full_name'] = (string)($admin['fullName'] ?? '');
                admin_establish_login($admin);

                header('Location: dashboard.php');
                exit();
            }
        } catch (Throwable $exception) {
            error_log('Admin Firebase login failed: ' . $exception->getMessage());
            if (wow_auth_is_credentials_failure($exception)) {
                log_admin_attempt(null, $email, 'FAILED', 'invalid_credentials');
                $errors[] = 'Invalid email or password.';
            } else {
                $errors[] = wow_auth_failure_code($exception) === 'firebase_quota_exceeded'
                    ? 'Firebase usage quota is currently exhausted. Your credentials may be correct; please try again after the quota resets or billing/quota is restored.'
                    : 'The login service is temporarily unavailable. Your credentials were not rejected; please try again shortly.';
            }
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#9a48ff">
    <title>Admin Login - Women on Wheels</title>
    <link rel="stylesheet" href="../css/wow-forgot-password.css?v=20260730-1">
    <style>
        body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(to right,#ff758c,#8e44ad);min-height:100vh;display:grid;place-items:center;padding:16px}.card{width:min(100%,420px);background:#fff;border-radius:15px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:24px}.logo{width:120px;display:block;margin:0 auto 12px}h1{margin:0 0 6px;color:#8e44ad;text-align:center;font-size:28px}p.subtitle{margin:0 0 18px;text-align:center;color:#5f4a6f;font-size:14px}.alert{margin-bottom:12px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.4;border:1px solid transparent}.alert.error{color:#a1264f;background:#ffe8f0;border-color:#f3b5cb}.alert.success{color:#1d7a50;background:#e9f8f0;border-color:#b8e8cf}label{display:block;font-size:13px;color:#5c476c;margin:0 0 6px;text-align:left}.field{margin-bottom:12px}input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d8c7e2;border-radius:8px;font-size:14px}input:focus{outline:none;border-color:#8e44ad;box-shadow:0 0 0 3px rgba(142,68,173,.14)}.password-wrap{position:relative;width:100%;margin:0;max-width:100%;overflow:hidden}.password-wrap input{padding-right:44px;margin:0;display:block}.toggle-password{all:unset;position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px!important;min-width:34px!important;max-width:34px!important;height:34px!important;border:0!important;border-radius:50%!important;background:transparent!important;color:#8e44ad!important;padding:0!important;display:grid!important;place-items:center;cursor:pointer;z-index:2;box-sizing:border-box;-webkit-appearance:none;appearance:none}.toggle-password svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round}.toggle-password:hover{background:rgba(142,68,173,.08)!important}button{width:100%;border:0;border-radius:25px;background:#8e44ad;color:#fff;font-weight:700;font-size:15px;padding:12px;cursor:pointer}button:hover{background:#732d91}.links{text-align:center;margin-top:14px;font-size:14px;color:#5f4a6f}.links a{color:#8e44ad;text-decoration:none;font-weight:700}.links a:hover{text-decoration:underline}.forgot-password-btn{all:unset;display:block;margin:-2px 0 12px auto;color:#8e44ad;font-size:13px;font-weight:700;cursor:pointer}.forgot-password-btn:hover{text-decoration:underline}.reset-overlay{position:fixed;inset:0;z-index:50;display:none;place-items:center;padding:16px;background:rgba(29,18,38,.42)}.reset-overlay.is-open{display:grid}.reset-modal{position:relative;width:min(100%,390px);background:#fff;border-radius:15px;box-shadow:0 18px 44px rgba(0,0,0,.18);padding:22px;text-align:left}.reset-modal h2{margin:0 0 6px;color:#8e44ad;text-align:center;font-size:22px}.reset-modal p{margin:0 0 14px;color:#6e5b7c;font-size:14px;line-height:1.4;text-align:center}.reset-close{all:unset;position:absolute;right:12px;top:10px;width:32px;height:32px;display:grid;place-items:center;border-radius:50%;color:#8e44ad;cursor:pointer;font-size:24px;line-height:1}.reset-close:hover{background:rgba(142,68,173,.08)}
    </style>
</head>
<body>
<main class="card">
    <img src="../images/logo.png" alt="Women on Wheels" class="logo">
    <h1>Admin Login</h1>
    <p class="subtitle">Secure access for Women on Wheels administrators</p>
    <?php if ($successMessage !== ''): ?><div class="alert success"><?php echo h($successMessage); ?></div><?php endif; ?>
    <?php foreach ($errors as $error): ?><div class="alert error"><?php echo h($error); ?></div><?php endforeach; ?>
    <form method="post" action="login.php" novalidate id="admin-login-form">
        <input type="hidden" name="csrf_token" value="<?php echo h(admin_csrf_token()); ?>">
        <div class="field"><label for="email">Email</label><input id="email" type="email" name="email" required value="<?php echo h($email); ?>" autocomplete="email"></div>
        <div class="field"><label for="password">Password</label><div class="password-wrap"><input id="password" type="password" name="password" required autocomplete="current-password"><button type="button" class="toggle-password" data-target="password" aria-label="Show password" aria-pressed="false" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="2.75"/></svg></button></div></div>
        <button type="button" class="wow-forgot-link" id="adminForgotPasswordShared" data-wow-forgot-password data-email-selector="#email" data-return-label="Return to Admin Login">Forgot Password?</button>
        <button type="submit">Login</button>
    </form>
    <div class="links">No admin account yet? <a href="signup.php">Create one</a></div>
</main>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>
<script type="application/x-legacy-disabled">
  (function(){const form=document.getElementById('admin-login-form');if(!form)return;const firebaseConfig={apiKey:"AIzaSyB0YdbIDXWqg18_6fFSPo_A_gkHpgLfHHI",authDomain:"women-on-wheels-f8970.firebaseapp.com",projectId:"women-on-wheels-f8970",storageBucket:"women-on-wheels-f8970.firebasestorage.app"};const icons={show:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="2.75"/></svg>',hide:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 10.6a2.75 2.75 0 0 0 3.8 3.8"/><path d="M9.9 5.6A9.6 9.6 0 0 1 12 5.25C18 5.25 21.75 12 21.75 12a17.3 17.3 0 0 1-2.18 2.95"/><path d="M6.55 6.55C3.84 8.37 2.25 12 2.25 12S6 18.75 12 18.75a9.7 9.7 0 0 0 3.43-.63"/></svg>'};function ensureAuth(){if(!window.firebase||!firebase.auth)throw new Error('firebase_unavailable');if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);return firebase.auth();}function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim());}function setResetMessage(text,type){const box=document.getElementById('resetMessage');if(!box)return;box.className='alert '+(type==='success'?'success':'error');if(!text){box.textContent='';box.style.display='none';return;}box.textContent=text;box.style.display='block';}function openReset(){const overlay=document.getElementById('resetOverlay');const input=document.getElementById('resetEmail');if(!overlay||!input)return;input.value=String(document.getElementById('email')?.value||'').trim();setResetMessage('');overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');setTimeout(function(){input.focus();},0);}function closeReset(){const overlay=document.getElementById('resetOverlay');if(!overlay)return;overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');setResetMessage('');}async function sendReset(){const input=document.getElementById('resetEmail');const btn=document.getElementById('sendResetLink');const email=String(input?.value||'').trim();if(!email){setResetMessage('Please enter your registered email.');return;}if(!validEmail(email)){setResetMessage('Please enter a valid email address.');return;}if(btn){btn.disabled=true;btn.textContent='Sending...';}try{await ensureAuth().sendPasswordResetEmail(email);setResetMessage('Password reset link has been sent to your email.','success');}catch(error){const code=String(error&&error.code||'').toLowerCase();if(code.indexOf('user-not-found')!==-1)setResetMessage('No account found with this email.');else if(code.indexOf('invalid-email')!==-1)setResetMessage('Please enter a valid email address.');else setResetMessage('Unable to send reset link. Please try again.');}finally{if(btn){btn.disabled=false;btn.textContent='Send Reset Link';}}}document.querySelectorAll('.toggle-password').forEach(function(btn){btn.innerHTML=icons.show;btn.addEventListener('click',function(){const input=document.getElementById(btn.getAttribute('data-target'));if(!input)return;const show=input.type==='password';input.type=show?'text':'password';btn.setAttribute('aria-label',show?'Hide password':'Show password');btn.setAttribute('aria-pressed',show?'true':'false');btn.innerHTML=show?icons.hide:icons.show;});});form.addEventListener('submit',function(event){const email=form.querySelector('input[name="email"]');const password=form.querySelector('input[name="password"]');if(!email.value.trim()||!password.value){event.preventDefault();window.alert('Please enter both email and password.');}});document.getElementById('adminForgotPassword')?.addEventListener('click',openReset);document.getElementById('resetClose')?.addEventListener('click',closeReset);document.getElementById('resetOverlay')?.addEventListener('click',function(event){if(event.target&&event.target.id==='resetOverlay')closeReset();});document.getElementById('sendResetLink')?.addEventListener('click',sendReset);document.getElementById('resetEmail')?.addEventListener('keydown',function(event){if(event.key==='Enter')sendReset();if(event.key==='Escape')closeReset();});}());
</script>
<script src="admin_login_page.js?v=20260905-eye1"></script>
<script src="../js/wow-forgot-password.js?v=20260730-1"></script>
</body>
</html>
