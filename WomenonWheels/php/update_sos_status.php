<?php
require_once 'sos_common.php';

$input = array_merge($_POST, $_GET, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$alertId = (int)($input['id'] ?? 0);
$status = strtolower(trim((string)($input['status'] ?? 'resolved')));
if (!in_array($status, ['active', 'resolved'], true)) {
    sos_json(['ok' => false, 'error' => 'invalid_status'], 422);
}
if ($alertId <= 0) sos_json(['ok' => false, 'error' => 'invalid_alert_id'], 422);

$stmt = $conn->prepare('UPDATE sos_alerts SET status = ? WHERE id = ? AND user_id = ? AND role = ?');
if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->bind_param('siis', $status, $alertId, $user['user_id'], $user['role']);

$stmt->execute();
sos_json(['ok' => true, 'updated' => $stmt->affected_rows > 0]);
