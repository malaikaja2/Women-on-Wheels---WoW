<?php
require_once 'sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$stmt = $conn->prepare('SELECT id, name, phone_number, created_at FROM emergency_contacts WHERE user_id = ? ORDER BY id DESC');
if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->bind_param('i', $user['user_id']);
$stmt->execute();
$result = $stmt->get_result();

$rows = [];
if ($result) {
    while ($row = $result->fetch_assoc()) $rows[] = $row;
}

sos_json(['ok' => true, 'contacts' => $rows]);
