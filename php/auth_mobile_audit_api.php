<?php
declare(strict_types=1);

session_start();
require_once __DIR__.'/auth_audit_service.php';
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false]);
    exit;
}

$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false]);
    exit;
}

$allowedTypes = [
    'login_success', 'login_failed', 'google_sign_in_success',
    'google_sign_in_failed', 'logout',
    'password_reset_requested', 'password_reset_email_sent',
    'password_reset_failed', 'email_verification_sent',
    'email_verification_failed', 'email_verified', 'role_access_denied'
];
$allowedStatuses = ['successful', 'failed', 'pending', 'needs_review'];
$allowedProviders = ['password', 'google'];
$allowedSources = ['passenger_app', 'driver_app'];

$eventType = strtolower(trim((string)($input['eventType'] ?? '')));
$status = strtolower(trim((string)($input['status'] ?? '')));
$provider = strtolower(trim((string)($input['authProvider'] ?? 'password')));
$source = wow_auth_audit_source((string)($input['sourcePlatform'] ?? ''));
$email = strtolower(trim((string)($input['email'] ?? '')));
$role = strtolower(trim((string)($input['role'] ?? 'unknown')));

if (!in_array($eventType, $allowedTypes, true)
    || !in_array($status, $allowedStatuses, true)
    || !in_array($provider, $allowedProviders, true)
    || !in_array($source, $allowedSources, true)
    || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))
    || !in_array($role, ['passenger', 'driver', 'unknown'], true)) {
    http_response_code(422);
    echo json_encode(['ok' => false]);
    exit;
}

// This endpoint records sanitized telemetry only. It grants no access and
// never accepts passwords, auth tokens, profile changes, or arbitrary fields.
wow_auth_audit_log([
    'userId' => substr(trim((string)($input['userId'] ?? '')), 0, 128),
    'email' => $email,
    'role' => $role,
    'eventType' => $eventType,
    'status' => $status,
    'authProvider' => $provider,
    'sourcePlatform' => $source,
    'failureReasonCode' => substr(trim((string)($input['failureReasonCode'] ?? '')), 0, 100),
    'isSuspicious' => $eventType === 'role_access_denied',
    'riskReason' => $eventType === 'role_access_denied' ? 'Role/profile mismatch in mobile app' : '',
]);

echo json_encode(['ok' => true]);
