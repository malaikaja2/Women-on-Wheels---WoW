<?php
require_once 'sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$view = strtolower(trim((string)($input['view'] ?? 'mine')));
$status = strtolower(trim((string)($input['status'] ?? 'active')));
if (!in_array($status, ['active', 'resolved', 'all'], true)) $status = 'active';
$limit = (int)($input['limit'] ?? 30);
if ($limit < 1 || $limit > 200) $limit = 30;

if ($user['role'] === 'driver' && in_array($view, ['active', 'all'], true)) {
    if ($status === 'all') {
        $sql = 'SELECT id, user_id, role, ride_id, location, status, created_at FROM sos_alerts WHERE role = ? ORDER BY id DESC LIMIT ?';
        $stmt = $conn->prepare($sql);
        $driverRole = 'driver';
        $stmt->bind_param('si', $driverRole, $limit);
    } else {
        $sql = 'SELECT id, user_id, role, ride_id, location, status, created_at FROM sos_alerts WHERE role = ? AND status = ? ORDER BY id DESC LIMIT ?';
        $stmt = $conn->prepare($sql);
        $driverRole = 'driver';
        $stmt->bind_param('ssi', $driverRole, $status, $limit);
    }
} else {
    if ($status === 'all') {
        $sql = 'SELECT id, user_id, role, ride_id, location, status, created_at FROM sos_alerts WHERE user_id = ? AND role = ? ORDER BY id DESC LIMIT ?';
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('isi', $user['user_id'], $user['role'], $limit);
    } else {
        $sql = 'SELECT id, user_id, role, ride_id, location, status, created_at FROM sos_alerts WHERE user_id = ? AND role = ? AND status = ? ORDER BY id DESC LIMIT ?';
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('issi', $user['user_id'], $user['role'], $status, $limit);
    }
}

if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->execute();
$result = $stmt->get_result();
$alerts = [];
if ($result) {
    while ($row = $result->fetch_assoc()) $alerts[] = $row;
}

sos_json(['ok' => true, 'alerts' => $alerts]);
