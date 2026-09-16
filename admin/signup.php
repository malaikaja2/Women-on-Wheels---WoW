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

function admin_password_is_strong(string $password): bool
{
    return preg_match('/^(?=.*[A-Za-z])(?=.*\d).{8,}$/', $password) === 1;
}

function admin_firebase_auth_error_code(Throwable $exception): string
{
    if (preg_match('/Firebase Authentication error:\s*([A-Z0-9_:]+)/', $exception->getMessage(), $matches) === 1) {
        return $matches[1];
    }
    return '';
}

$errors = [];
$name = '';
$email = '';
$phone = '';
$role = 'admin';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim((string)($_POST['full_name'] ?? ''));
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $phone = trim((string)($_POST['phone'] ?? ''));
    $password = (string)($_POST['password'] ?? '');
    $confirmPassword = (string)($_POST['confirm_password'] ?? '');
    $role = trim((string)($_POST['role'] ?? 'admin'));
    $csrfToken = (string)($_POST['csrf_token'] ?? '');

    if (!admin_verify_csrf_token($csrfToken)) {
        $errors[] = 'Invalid request token. Please refresh and try again.';
    }
    if ($name === '' || $email === '' || $phone === '' || $role === '' || $password === '' || $confirmPassword === '') {
        $errors[] = 'Please fill all required fields.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Please enter a valid email address.';
    }
    if (!admin_password_is_strong($password)) {
        $errors[] = 'Password must be at least 8 characters and include letters and numbers.';
    }
    if ($password !== $confirmPassword) {
        $errors[] = 'Password and confirm password do not match.';
    }
    if (!preg_match('/^\+?[0-9\s\-\(\)]{7,20}$/', $phone)) {
        $errors[] = 'Phone number format is invalid.';
    }
    if ($role === '') {
        $role = 'admin';
    }
    if ($role !== 'admin') {
        $errors[] = 'Invalid role selected.';
    }

    if (empty($errors)) {
        try {
            if (wow_find_profile_by_email('admin', $email)) {
                $errors[] = 'An admin with this email already exists.';
            } else {
                $auth = wow_auth_create_user($email, $password, $name);
                $uid = (string)($auth['localId'] ?? '');
                if ($uid === '') {
                    throw new RuntimeException('Firebase did not return a uid.');
                }

                wow_create_profile('admin', $uid, [
                    'fullName' => $name,
                    'email' => $email,
                    'phone' => $phone,
                    'role' => $role,
                    'isActive' => true,
                    'failedLoginAttempts' => 0,
                    'lockedUntil' => null,
                    'lastLoginAt' => null,
                    'emailVerified' => false,
                    'legacyMysqlId' => null,
                ]);

                try {
                    wow_auth_send_email_verification((string)($auth['idToken'] ?? ''));
                    wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>'admin','eventType'=>'email_verification_sent','status'=>'successful','authProvider'=>'password','sourcePlatform'=>'admin_website']);
                } catch (Throwable $verificationError) {
                    error_log('Admin verification email could not be sent: '.$verificationError->getMessage());
                    wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>'admin','eventType'=>'email_verification_failed','status'=>'failed','authProvider'=>'password','sourcePlatform'=>'admin_website','failureReasonCode'=>wow_auth_failure_code($verificationError)]);
                }

                header('Location: login.php?signup=success');
                exit();
            }
        } catch (Throwable $exception) {
            error_log('Admin Firebase signup failed: ' . $exception->getMessage());
            $firebaseError = admin_firebase_auth_error_code($exception);
            if ($firebaseError === 'EMAIL_EXISTS') {
                $errors[] = 'An account with this email already exists. Please login.';
            } elseif ($firebaseError === 'INVALID_EMAIL') {
                $errors[] = 'Please enter a valid email address.';
            } elseif ($firebaseError === 'OPERATION_NOT_ALLOWED') {
                $errors[] = 'Email/password login is not enabled in Firebase Authentication.';
            } else {
                $errors[] = 'Unable to create admin account right now. Please try again.';
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
    <title>Admin Signup - Women on Wheels</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: linear-gradient(to right, #ff758c, #8e44ad);
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 16px;
        }
        .card {
            width: min(100%, 460px);
            background: #fff;
            border-radius: 15px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
            padding: 24px;
        }
        .logo {
            width: 120px;
            display: block;
            margin: 0 auto 12px;
        }
        h1 {
            margin: 0 0 6px;
            color: #8e44ad;
            text-align: center;
            font-size: 28px;
        }
        p.subtitle {
            margin: 0 0 18px;
            text-align: center;
            color: #5f4a6f;
            font-size: 14px;
        }
        .alert {
            margin-bottom: 12px;
            padding: 10px 12px;
            border-radius: 10px;
            font-size: 13px;
            line-height: 1.4;
            border: 1px solid transparent;
        }
        .alert.error {
            color: #a1264f;
            background: #ffe8f0;
            border-color: #f3b5cb;
        }
        label {
            display: block;
            font-size: 13px;
            color: #5c476c;
            margin: 0 0 6px;
            text-align: left;
        }
        .field {
            margin-bottom: 12px;
        }
        input, select {
            width: 100%;
            box-sizing: border-box;
            padding: 11px 12px;
            border: 1px solid #d8c7e2;
            border-radius: 8px;
            font-size: 14px;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #8e44ad;
            box-shadow: 0 0 0 3px rgba(142, 68, 173, 0.14);
        }
        .password-wrap {
            position: relative;
            width: 100%;
            margin: 0;
            max-width: 100%;
            overflow: hidden;
        }
        .password-wrap input {
            padding-right: 44px;
            margin: 0;
            display: block;
        }
        .toggle-password {
            all: unset;
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            width: 34px !important;
            min-width: 34px !important;
            max-width: 34px !important;
            height: 34px !important;
            border-radius: 50%;
            border: 0 !important;
            background: transparent !important;
            color: #8e44ad !important;
            display: grid !important;
            place-items: center;
            cursor: pointer;
            z-index: 2;
            box-sizing: border-box;
            -webkit-appearance: none;
            appearance: none;
            padding: 0 !important;
        }
        .toggle-password svg {
            width: 18px;
            height: 18px;
            stroke: currentColor;
            stroke-width: 1.9;
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .toggle-password:hover {
            background: rgba(142, 68, 173, 0.08) !important;
        }
        .role-chip {
            display: inline-block;
            padding: 8px 14px;
            border-radius: 999px;
            background: #f4e9fb;
            color: #7a3499;
            font-weight: 700;
            font-size: 12px;
            margin-bottom: 12px;
        }
        .hint {
            margin: -4px 0 8px;
            font-size: 12px;
            color: #6e5b7c;
        }
        button {
            width: 100%;
            border: 0;
            border-radius: 25px;
            background: #8e44ad;
            color: #fff;
            font-weight: 700;
            font-size: 15px;
            padding: 12px;
            cursor: pointer;
        }
        button:hover {
            background: #732d91;
        }
        .links {
            text-align: center;
            margin-top: 14px;
            font-size: 14px;
            color: #5f4a6f;
        }
        .links a {
            color: #8e44ad;
            text-decoration: none;
            font-weight: 700;
        }
        .links a:hover {
            text-decoration: underline;
        }
        @media (max-width: 480px) {
            .card {
                padding: 16px 14px;
                border-radius: 12px;
            }
        }
    </style>
</head>
<body>
<main class="card">
    <img src="../images/logo.png" alt="Women on Wheels" class="logo">
    <h1>Admin Signup</h1>
    <p class="subtitle">Create secure administrator access</p>

    <?php foreach ($errors as $error): ?>
        <div class="alert error"><?php echo h($error); ?></div>
    <?php endforeach; ?>

    <form method="post" action="signup.php" novalidate id="admin-signup-form">
        <input type="hidden" name="csrf_token" value="<?php echo h(admin_csrf_token()); ?>">

        <div class="field">
            <label for="full_name">Full Name</label>
            <input id="full_name" type="text" name="full_name" required value="<?php echo h($name); ?>" autocomplete="name">
        </div>

        <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" required value="<?php echo h($email); ?>" autocomplete="email">
        </div>

        <div class="field">
            <label for="phone">Phone Number</label>
            <input id="phone" type="text" name="phone" required value="<?php echo h($phone); ?>" autocomplete="tel">
        </div>

        <div class="field">
            <label for="role">Admin Role</label>
            <select id="role" name="role" required>
                <option value="admin" <?php echo $role === 'admin' ? 'selected' : ''; ?>>Admin</option>
            </select>
        </div>

        <div class="field">
            <label for="password">Password</label>
            <div class="password-wrap"><input id="password" type="password" name="password" required autocomplete="new-password"><button type="button" class="toggle-password" data-target="password" aria-label="Show password">👁</button></div>
            <p class="hint">Minimum 8 characters and must include letters and numbers.</p>
        </div>

        <div class="field">
            <label for="confirm_password">Confirm Password</label>
            <div class="password-wrap"><input id="confirm_password" type="password" name="confirm_password" required autocomplete="new-password"><button type="button" class="toggle-password" data-target="confirm_password" aria-label="Show confirm password">👁</button></div>
        </div>

        <button type="submit">Create Admin Account</button>
    </form>

    <div class="links">
        Already registered? <a href="login.php">Login</a>
    </div>
</main>

<script>
    (function () {
        const form = document.getElementById('admin-signup-form');
        if (!form) return;

        const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        const phonePattern = /^\+?[0-9\s\-\(\)]{7,20}$/;
        const icons = {
            show: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="2.75"/></svg>',
            hide: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18"/><path d="M10.6 10.6a2.75 2.75 0 0 0 3.8 3.8"/><path d="M9.9 5.6A9.6 9.6 0 0 1 12 5.25C18 5.25 21.75 12 21.75 12a17.3 17.3 0 0 1-2.18 2.95"/><path d="M6.55 6.55C3.84 8.37 2.25 12 2.25 12S6 18.75 12 18.75a9.7 9.7 0 0 0 3.43-.63"/></svg>'
        };

        document.querySelectorAll('.toggle-password').forEach(function (btn) {
            btn.innerHTML = icons.show;
            btn.setAttribute('aria-label', 'Show password');
            btn.setAttribute('aria-pressed', 'false');
            btn.addEventListener('click', function () {
                const input = document.getElementById(btn.getAttribute('data-target'));
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
                btn.setAttribute('aria-pressed', show ? 'true' : 'false');
                btn.innerHTML = show ? icons.hide : icons.show;
            });
        });

        form.addEventListener('submit', function (event) {
            const fullName = form.querySelector('input[name="full_name"]').value.trim();
            const email = form.querySelector('input[name="email"]').value.trim();
            const phone = form.querySelector('input[name="phone"]').value.trim();
            const role = form.querySelector('select[name="role"]').value.trim();
            const password = form.querySelector('input[name="password"]').value;
            const confirmPassword = form.querySelector('input[name="confirm_password"]').value;

            if (!fullName || !email || !phone || !role || !password || !confirmPassword) {
                event.preventDefault();
                window.alert('Please fill all required fields.');
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                event.preventDefault();
                window.alert('Please enter a valid email address.');
                return;
            }
            if (!phonePattern.test(phone)) {
                event.preventDefault();
                window.alert('Please enter a valid phone number.');
                return;
            }

            if (!passwordPattern.test(password)) {
                event.preventDefault();
                window.alert('Password must be at least 8 characters and include letters and numbers.');
                return;
            }

            if (password !== confirmPassword) {
                event.preventDefault();
                window.alert('Password and confirm password do not match.');
            }
        });
    }());
</script>
</body>
</html>






