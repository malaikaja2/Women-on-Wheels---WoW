<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_audit_service.php';

$uid = (string)($_SESSION['firebase_uid'] ?? '');
$role = strtolower((string)($_SESSION['role'] ?? ''));
if($uid!=='')wow_auth_audit_log(['userId'=>$uid,'email'=>(string)($_SESSION['user_email']??''),'role'=>$role,'eventType'=>'logout','status'=>'successful','sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website']);

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}
session_destroy();

// Release the authenticated PHP session before the remote presence write.
// This prevents a slow Firestore request from blocking the logout redirect/login page.
if ($uid !== '' && $role === 'driver') {
    try {
        wow_set_doc('drivers', $uid, [
            'isOnline' => false,
            'isAvailable' => false,
        ]);
    } catch (Throwable $exception) {
        error_log('Driver logout presence update failed: ' . $exception->getMessage());
    }
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => true]);
