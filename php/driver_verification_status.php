<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

$uid = trim((string)($_SESSION['firebase_uid'] ?? $_SESSION['user_id'] ?? ''));
$role = strtolower(trim((string)($_SESSION['role'] ?? '')));
if ($uid === '' || $role !== 'driver') {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'driver_auth_required']);
    exit;
}

try {
    $driver = wow_get_driver_profile($uid, true);
    if (!$driver) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'driver_not_found']);
        exit;
    }
    echo json_encode([
        'ok' => true,
        'driver' => [
            'role' => (string)($driver['role'] ?? ''),
            'verificationStatus' => (string)($driver['verificationStatus'] ?? ''),
            'accountStatus' => (string)($driver['accountStatus'] ?? ''),
            'isApproved' => !empty($driver['isApproved']),
            'isRejected' => !empty($driver['isRejected']),
            'verificationRejectionReason' => (string)($driver['verificationRejectionReason'] ?? ''),
            'rejectionReason' => (string)($driver['verificationRejectionReason'] ?? $driver['rejectionReason'] ?? ''),
        ],
    ]);
} catch (Throwable $exception) {
    error_log('Driver verification status failed: ' . $exception->getMessage());
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'verification_unavailable']);
}
