<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

$input = array_merge($_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$name = trim((string)($input['name'] ?? ''));
$phone = trim((string)($input['phone_number'] ?? $input['phone'] ?? ''));
if ($name === '' || $phone === '') sos_json(['ok' => false, 'error' => 'missing_fields'], 422);

$ref = wow_firestore()->collection($user['role'] . 's')->document($user['uid'])->collection('emergencyContacts')->newDocument();
$ref->set(['name' => $name, 'phoneNumber' => $phone, 'createdAt' => wow_now(), 'updatedAt' => wow_now()]);
sos_json(['ok' => true, 'contact' => ['id' => $ref->id(), 'name' => $name, 'phone_number' => $phone]]);
