<?php
require_once 'sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$contactId = (int)($input['id'] ?? 0);
if ($contactId <= 0) sos_json(['ok' => false, 'error' => 'invalid_contact_id'], 422);

$stmt = $conn->prepare('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?');
if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->bind_param('ii', $contactId, $user['user_id']);
$stmt->execute();

sos_json(['ok' => true, 'deleted' => $stmt->affected_rows > 0]);
