<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_audit_service.php';

function wow_forgot_redirect(string $query): void
{
    header('Location: ../forgot-password.html?' . $query);
    exit();
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || ($_POST['action'] ?? '') !== 'request_reset') {
    wow_forgot_redirect('error=invalid_request');
}

$email = strtolower(trim((string)($_POST['email'] ?? '')));
if ($email === '') wow_forgot_redirect('error=missing_email');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) wow_forgot_redirect('error=invalid_email');

try {
    $account = wow_find_profile_by_email('passenger', $email) ?: wow_find_profile_by_email('driver', $email);
    wow_auth_audit_log(['email'=>$email,'role'=>'passenger','eventType'=>'password_reset_requested','status'=>'pending','sourcePlatform'=>'passenger_website']);
    if ($account) wow_auth_send_password_reset($email);
    wow_auth_audit_log(['email'=>$email,'role'=>'passenger','eventType'=>'password_reset_email_sent','status'=>'successful','sourcePlatform'=>'passenger_website']);
    wow_forgot_redirect('status=sent');
} catch (Throwable $exception) {
    error_log('Firebase password reset failed: ' . $exception->getMessage());
    wow_forgot_redirect('error=email_send_failed');
}
