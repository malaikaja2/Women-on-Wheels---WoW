<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$contactId = trim((string)($input['id'] ?? ''));
if ($contactId === '') sos_json(['ok' => false, 'error' => 'invalid_contact_id'], 422);

wow_firestore()->collection($user['role'] . 's')->document($user['uid'])->collection('emergencyContacts')->document($contactId)->delete();
sos_json(['ok' => true, 'deleted' => true]);
