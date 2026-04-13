<?php
session_start();
include 'db.php';

function sos_json($payload, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit();
}

function sos_input() {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) return $json;
    return [];
}

function map_user_id($role, $rawId) {
    $id = (int)$rawId;
    if ($role === 'driver') return 1000000 + $id;
    return $id;
}

function resolve_user_context($conn, $source = []) {
    $role = strtolower(trim((string)($source['role'] ?? $source['user_role'] ?? $_SESSION['role'] ?? '')));
    if ($role !== 'driver') $role = 'passenger';

    $email = trim((string)($source['email'] ?? $source['user_email'] ?? $_SESSION['user_email'] ?? ''));
    $sessionUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    if ($sessionUserId > 0 && isset($_SESSION['role']) && $_SESSION['role'] === $role) {
        return [
            'ok' => true,
            'role' => $role,
            'raw_user_id' => $sessionUserId,
            'user_id' => map_user_id($role, $sessionUserId),
            'email' => $email
        ];
    }

    if ($email === '') {
        return ['ok' => false, 'error' => 'missing_user_context'];
    }

    $table = $role === 'driver' ? 'drivers' : 'passengers';
    $stmt = $conn->prepare("SELECT id FROM {$table} WHERE email = ? LIMIT 1");
    if (!$stmt) return ['ok' => false, 'error' => 'query_prepare_failed'];
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    if (!$row) return ['ok' => false, 'error' => 'user_not_found'];

    $rawUserId = (int)$row['id'];
    $_SESSION['role'] = $role;
    $_SESSION['user_id'] = $rawUserId;
    if ($email !== '') $_SESSION['user_email'] = $email;

    return [
        'ok' => true,
        'role' => $role,
        'raw_user_id' => $rawUserId,
        'user_id' => map_user_id($role, $rawUserId),
        'email' => $email
    ];
}
