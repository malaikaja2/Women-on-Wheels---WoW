<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_audit_service.php';

function redirect_login_error(string $code, string $role = 'passenger'): void
{
    $safeRole = $role === 'driver' ? 'driver' : 'passenger';
    header('Location: ../login.html?error=' . urlencode($code) . '&role=' . urlencode($safeRole));
    exit();
}

$email = strtolower(trim((string)($_POST['email'] ?? '')));
$password = (string)($_POST['password'] ?? '');
$role = (string)($_POST['role'] ?? '');

if ($email === '' || $password === '' || $role === '') redirect_login_error('missing_fields', $role);
if (!in_array($role, ['passenger', 'driver'], true)) redirect_login_error('invalid_role', 'passenger');

try {
    $auth = wow_auth_login($email, $password);
    $uid = (string)($auth['localId'] ?? '');
    if ($uid === '') redirect_login_error('invalid_credentials', $role);

    $profile = $role === 'driver' ? wow_get_driver_profile($uid, true) : wow_get_profile($role, $uid);
    $profileRole = strtolower((string)($profile['role'] ?? ''));
    if (!$profile || ($role === 'passenger' && $profileRole !== 'passenger')) {
        wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>$role,'eventType'=>'role_access_denied','status'=>'needs_review','authProvider'=>'password','sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website','failureReasonCode'=>'invalid_role','isSuspicious'=>true,'riskReason'=>'Role/profile mismatch']);
        redirect_login_error('invalid_role', $role);
    }
    if ($role === 'driver' && !in_array($profileRole, ['driver', 'driver_applicant'], true)) {
        wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>$role,'eventType'=>'role_access_denied','status'=>'needs_review','authProvider'=>'password','sourcePlatform'=>'driver_website','failureReasonCode'=>'invalid_role','isSuspicious'=>true,'riskReason'=>'Role/profile mismatch']);
        redirect_login_error('invalid_role', $role);
    }

    if ($role === 'driver') {
        $gender = strtolower((string)($profile['gender'] ?? ''));
        $verificationStatus = strtolower((string)($profile['verificationStatus'] ?? 'approved'));
        $isApproved = wow_driver_is_approved($profile);

        if ($gender !== '' && $gender !== 'female') {
            wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>$role,'eventType'=>'role_access_denied','status'=>'needs_review','authProvider'=>'password','sourcePlatform'=>'driver_website','failureReasonCode'=>'female_driver_required','isSuspicious'=>true,'riskReason'=>'Driver access policy mismatch']);
            redirect_login_error('female_driver_required', $role);
        }
        $driverAccess = $verificationStatus === 'rejected' || !empty($profile['isRejected'])
            ? 'rejected'
            : (($profileRole === 'driver' && $verificationStatus === 'approved' && $isApproved) ? 'approved' : 'pending');
    }

    $_SESSION['firebase_uid'] = $uid;
    $_SESSION['firebase_id_token'] = (string)($auth['idToken'] ?? '');
    $_SESSION['user_id'] = $uid;
    $_SESSION['user_name'] = trim((string)(
        $profile['name']
        ?? $profile['fullName']
        ?? $profile['displayName']
        ?? $profile['full_name']
        ?? ''
    ));
    if ($_SESSION['user_name'] === '') {
        $_SESSION['user_name'] = (string)strstr($email, '@', true) ?: 'User';
    }
    $_SESSION['user_email'] = (string)($profile['email'] ?? $email);
    $_SESSION['role'] = $role;
    $authEmailVerified = filter_var($auth['emailVerified'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $profileEmailVerified = filter_var($profile['emailVerified'] ?? false, FILTER_VALIDATE_BOOLEAN);
    if ($authEmailVerified && !$profileEmailVerified) {
        wow_set_doc($role === 'driver' ? 'drivers' : 'passengers', $uid, ['emailVerified'=>true,'emailVerifiedAt'=>wow_now(),'updatedAt'=>wow_now()], true);
        wow_sync_user_profile($uid, $role, array_merge($profile, ['emailVerified' => true, 'emailVerifiedAt' => wow_now()]));
        wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>$role,'eventType'=>'email_verified','status'=>'successful','authProvider'=>'password','sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website']);
    }
    wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>$role,'eventType'=>'login_success','status'=>'successful','authProvider'=>'password','sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website']);

    if ($role === 'driver' && ($driverAccess ?? '') === 'approved') {
        $activeRideId = wow_driver_active_ride_id($uid, $profile);
        wow_set_doc('drivers', $uid, [
            'isOnline' => true,
            'isAvailable' => $activeRideId === '',
            'currentRideId' => $activeRideId !== '' ? $activeRideId : null,
            'status' => $activeRideId === '' ? 'online' : 'busy',
            'role' => 'driver',
            'verificationStatus' => 'approved',
            'isApproved' => true,
            'lastLoginAt' => wow_now(),
        ]);
    }

    $redirect = $role === 'driver'
      ? ((($driverAccess ?? '') === 'approved') ? '../driver-dashboard.html' : '../driver-verification.html')
      : '../app-home.html';
    echo "<script>
      localStorage.setItem('wow_logged_in','true');
      localStorage.setItem('wow_user_id'," . json_encode($uid) . ");
      localStorage.setItem('wow_user_name'," . json_encode($_SESSION['user_name']) . ");
      localStorage.setItem('wow_user_email'," . json_encode($_SESSION['user_email']) . ");
      localStorage.setItem('wow_user_role'," . json_encode($role) . ");
      localStorage.setItem('wow_driver_role'," . json_encode($role === 'driver' ? strtolower((string)($profile['role'] ?? 'driver')) : '') . ");
      localStorage.setItem('wow_driver_verification_status'," . json_encode($role === 'driver' ? strtolower((string)($profile['verificationStatus'] ?? 'approved')) : '') . ");
      localStorage.setItem('wow_driver_is_approved'," . json_encode($role === 'driver' && ($driverAccess ?? '') === 'approved' ? 'true' : 'false') . ");
      const postLogin = localStorage.getItem('wow_post_login_redirect');
      const postLoginSource = localStorage.getItem('wow_post_login_source');
      const postLoginSetAt = Number(localStorage.getItem('wow_post_login_set_at') || '0');
      const isFreshBookIntent = Number.isFinite(postLoginSetAt) && postLoginSetAt > 0 && (Date.now() - postLoginSetAt) <= 600000;
      const isAllowedPostLogin = " . json_encode($role === 'passenger') . " && postLoginSource === 'book_ride' && isFreshBookIntent && postLogin === 'dashboard.html';
      localStorage.removeItem('wow_post_login_redirect');
      localStorage.removeItem('wow_post_login_source');
      localStorage.removeItem('wow_post_login_set_at');
      window.location.href = isAllowedPostLogin ? postLogin : " . json_encode($redirect) . ";
    </script>";
    exit();
} catch (Throwable $exception) {
    error_log('Firebase login failed: ' . $exception->getMessage());
    wow_auth_audit_log(['email'=>$email,'role'=>$role,'eventType'=>'login_failed','status'=>'failed','authProvider'=>'password','sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website','failureReasonCode'=>wow_auth_is_credentials_failure($exception)?'invalid_credentials':wow_auth_failure_code($exception)]);
    redirect_login_error(
        wow_auth_is_credentials_failure($exception) ? 'invalid_credentials' : wow_auth_failure_code($exception),
        $role
    );
}
