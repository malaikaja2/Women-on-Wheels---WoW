<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

$input = array_merge($_GET, $_POST, sos_input());
sos_json(['ok' => false, 'error' => 'admin_only'], 403);

$view = strtolower(trim((string)($input['view'] ?? 'mine')));
$status = strtolower(trim((string)($input['status'] ?? 'active')));
if (!in_array($status, ['active', 'resolved', 'all'], true)) $status = 'active';
$limit = (int)($input['limit'] ?? 30);
if ($limit < 1 || $limit > 200) $limit = 30;

$docs = wow_firestore()->collection('sosAlerts')->limit($limit)->documents();
$alerts = [];
foreach ($docs as $doc) {
    if (!$doc->exists()) continue;
    $data = $doc->data();
    if ($status !== 'all' && strtolower((string)($data['status'] ?? 'active')) !== $status) continue;
    if ($user['role'] === 'driver' && in_array($view, ['active', 'all'], true)) {
        $driverId = (string)($data['driverId'] ?? '');
        if ($driverId !== '' && $driverId !== $user['uid']) continue;
    } elseif ((string)($data['userUid'] ?? $data['passengerId'] ?? '') !== $user['uid']) {
        continue;
    }
    $alerts[] = [
        'id' => $doc->id(),
        'alert_id' => (string)($data['alertId'] ?? $doc->id()),
        'user_id' => (string)($data['userUid'] ?? ''),
        'passenger_id' => (string)($data['passengerId'] ?? ''),
        'passenger_name' => (string)($data['passengerName'] ?? $data['reporterName'] ?? ''),
        'passenger_phone' => (string)($data['passengerPhone'] ?? ''),
        'driver_id' => (string)($data['driverId'] ?? ''),
        'driver_name' => (string)($data['driverName'] ?? ''),
        'role' => (string)($data['role'] ?? ''),
        'ride_id' => (string)($data['rideId'] ?? ''),
        'ride_code' => (string)($data['rideCode'] ?? ''),
        'location' => (string)($data['currentLocationText'] ?? $data['location'] ?? ''),
        'pickup' => (string)($data['pickupLocation'] ?? ''),
        'dropoff' => (string)($data['dropoffLocation'] ?? ''),
        'priority' => (string)($data['priority'] ?? 'high'),
        'status' => (string)($data['status'] ?? ''),
        'created_at' => wow_timestamp_to_string($data['createdAt'] ?? ''),
    ];
}
sos_json(['ok' => true, 'alerts' => $alerts]);
