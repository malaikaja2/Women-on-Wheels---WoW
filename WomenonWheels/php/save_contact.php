<?php
require_once 'sos_common.php';

$input = array_merge($_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$name = trim((string)($input['name'] ?? ''));
$phone = trim((string)($input['phone_number'] ?? $input['phone'] ?? ''));
if ($name === '' || $phone === '') {
    sos_json(['ok' => false, 'error' => 'missing_fields'], 422);
}

$stmt = $conn->prepare('INSERT INTO emergency_contacts (user_id, name, phone_number) VALUES (?, ?, ?)');
if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->bind_param('iss', $user['user_id'], $name, $phone);
$ok = $stmt->execute();

if (!$ok) sos_json(['ok' => false, 'error' => 'insert_failed'], 500);

sos_json([
    'ok' => true,
    'contact' => [
        'id' => $stmt->insert_id,
        'name' => $name,
        'phone_number' => $phone
    ]
]);
