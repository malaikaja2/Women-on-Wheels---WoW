<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

$input = array_merge($_POST, $_GET, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$alertId = trim((string)($input['id'] ?? ''));
$status = strtolower(trim((string)($input['status'] ?? 'resolved')));
if (!in_array($status, ['active', 'resolved'], true)) sos_json(['ok' => false, 'error' => 'invalid_status'], 422);
if ($alertId === '') sos_json(['ok' => false, 'error' => 'invalid_alert_id'], 422);

wow_firestore()->collection('sosAlerts')->document($alertId)->set(['status' => $status, 'updatedAt' => wow_now()], ['merge' => true]);
sos_json(['ok' => true, 'updated' => true]);
