<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/db.php';

function sos_json($payload, $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit();
}

function sos_input(): array
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

function resolve_user_context($conn, $source = []): array
{
    $role = strtolower(trim((string)($_SESSION['role'] ?? '')));
    if ($role !== 'driver') $role = 'passenger';

    $uid = trim((string)($_SESSION['firebase_uid'] ?? ''));
    $email = trim((string)($_SESSION['user_email'] ?? ''));
    if ($uid === '' && $email !== '') {
        $profile = wow_find_profile_by_email($role, $email);
        $uid = (string)($profile['uid'] ?? '');
    }
    if ($uid === '') return ['ok' => false, 'error' => 'missing_user_context'];

    return ['ok' => true, 'role' => $role, 'raw_user_id' => $uid, 'user_id' => $uid, 'uid' => $uid, 'email' => $email];
}
