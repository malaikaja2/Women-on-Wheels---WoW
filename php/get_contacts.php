<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$rows = [];
$docs = wow_firestore()->collection($user['role'] . 's')->document($user['uid'])->collection('emergencyContacts')->limit(20)->documents();
foreach ($docs as $doc) {
    if (!$doc->exists()) continue;
    $data = $doc->data();
    $rows[] = [
        'id' => $doc->id(),
        'name' => (string)($data['name'] ?? ''),
        'phone_number' => (string)($data['phoneNumber'] ?? ''),
        'created_at' => wow_timestamp_to_string($data['createdAt'] ?? ''),
    ];
}
sos_json(['ok' => true, 'contacts' => $rows]);
