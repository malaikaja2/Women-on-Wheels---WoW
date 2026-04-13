<?php
require_once 'sos_common.php';

$input = array_merge($_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$rideId = trim((string)($input['ride_id'] ?? ''));
$location = trim((string)($input['location'] ?? ''));
$status = strtolower(trim((string)($input['status'] ?? 'active')));
if ($status !== 'resolved') $status = 'active';

if ($rideId === '') {
    sos_json(['ok' => false, 'error' => 'active_ride_required', 'message' => 'SOS is available during active ride only.'], 422);
}

if ($location === '') {
    $pickup = trim((string)($input['pickup'] ?? ''));
    $drop = trim((string)($input['drop'] ?? ''));
    if ($pickup !== '' || $drop !== '') {
        $location = "Pickup: {$pickup} | Drop-off: {$drop}";
    } else {
        $location = 'Location unavailable';
    }
}

$stmt = $conn->prepare('INSERT INTO sos_alerts (user_id, role, ride_id, location, status) VALUES (?, ?, ?, ?, ?)');
if (!$stmt) sos_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
$stmt->bind_param('issss', $user['user_id'], $user['role'], $rideId, $location, $status);
$ok = $stmt->execute();
if (!$ok) sos_json(['ok' => false, 'error' => 'insert_failed'], 500);

$targets = [];
$notifiedCount = 0;
$destination = 'driver_safety_system';

if ($user['role'] === 'passenger') {
    $destination = 'emergency_contacts';
    $contactStmt = $conn->prepare('SELECT id, name, phone_number FROM emergency_contacts WHERE user_id = ? ORDER BY id DESC');
    if ($contactStmt) {
        $contactStmt->bind_param('i', $user['user_id']);
        $contactStmt->execute();
        $result = $contactStmt->get_result();
        if ($result) {
            while ($row = $result->fetch_assoc()) {
                $targets[] = [
                    'id' => (int)$row['id'],
                    'name' => (string)$row['name'],
                    'phone_number' => (string)$row['phone_number']
                ];
            }
        }
    }
    $notifiedCount = count($targets);
}

sos_json([
    'ok' => true,
    'message' => 'Alert Sent Successfully',
    'destination' => $destination,
    'notified_count' => $notifiedCount,
    'targets' => $targets,
    'alert' => [
        'id' => $stmt->insert_id,
        'role' => $user['role'],
        'ride_id' => $rideId,
        'location' => $location,
        'status' => $status,
        'created_at' => date('Y-m-d H:i:s')
    ]
]);
