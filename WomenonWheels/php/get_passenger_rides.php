<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_rides_table($conn)) {
    fare_json(['ok' => false, 'error' => 'rides_table_create_failed'], 500);
}

$input = array_merge($_GET, $_POST, fare_input());
$passengerId = fare_resolve_user_id($conn, 'passenger', $input);
if ($passengerId <= 0) {
    fare_json(['ok' => false, 'error' => 'passenger_required'], 422);
}

$limit = (int)($input['limit'] ?? 30);
if ($limit < 1 || $limit > 200) $limit = 30;

$sql = "SELECT r.id, r.ride_code, r.pickup, r.dropoff, r.distance_km, r.duration_min, r.vehicle_type, r.fare, r.offered_fare,
               r.status, r.created_at, r.updated_at, r.completed_at, d.name AS driver_name
        FROM rides r
        LEFT JOIN drivers d ON d.id = r.driver_id
        WHERE r.passenger_id = ?
        ORDER BY r.id DESC
        LIMIT ?";
$stmt = $conn->prepare($sql);
if (!$stmt) {
    fare_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
}
$stmt->bind_param('ii', $passengerId, $limit);
$stmt->execute();
$result = $stmt->get_result();

$rows = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
}

fare_json([
    'ok' => true,
    'passenger_id' => $passengerId,
    'rides' => $rows
]);

