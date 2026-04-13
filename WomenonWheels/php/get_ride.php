<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_rides_table($conn)) {
    fare_json(['ok' => false, 'error' => 'rides_table_create_failed'], 500);
}

$input = array_merge($_GET, $_POST, fare_input());
$rideCode = fare_get_string($input, 'ride_code', '');
$rideId = (int)($input['ride_id'] ?? 0);
if ($rideCode === '' && $rideId <= 0) {
    fare_json(['ok' => false, 'error' => 'ride_identifier_required'], 422);
}

$whereSql = $rideId > 0 ? 'r.id = ?' : 'r.ride_code = ?';
$sql = "SELECT r.id, r.ride_code, r.passenger_id, r.driver_id, r.pickup, r.dropoff, r.pickup_lat, r.pickup_lng,
               r.drop_lat, r.drop_lng, r.distance_km, r.duration_min, r.vehicle_type, r.traffic_level, r.time_of_day,
               r.fare, r.offered_fare, r.status, r.created_at, r.updated_at, r.completed_at,
               p.name AS passenger_name, p.phone AS passenger_phone,
               d.name AS driver_name, d.phone AS driver_phone
        FROM rides r
        INNER JOIN passengers p ON p.id = r.passenger_id
        LEFT JOIN drivers d ON d.id = r.driver_id
        WHERE {$whereSql}
        LIMIT 1";
$stmt = $conn->prepare($sql);
if (!$stmt) {
    fare_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
}
if ($rideId > 0) {
    $stmt->bind_param('i', $rideId);
} else {
    $stmt->bind_param('s', $rideCode);
}
$stmt->execute();
$ride = $stmt->get_result()->fetch_assoc();
if (!$ride) {
    fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);
}

$role = strtolower(fare_get_string($input, 'role', fare_get_string($input, 'user_role', '')));
if ($role === 'passenger') {
    $passengerId = fare_resolve_user_id($conn, 'passenger', $input);
    if ($passengerId > 0 && (int)$ride['passenger_id'] !== $passengerId) {
        fare_json(['ok' => false, 'error' => 'ride_access_denied'], 403);
    }
} elseif ($role === 'driver') {
    $driverId = fare_resolve_user_id($conn, 'driver', $input);
    if ($driverId > 0 && (int)$ride['driver_id'] !== $driverId) {
        fare_json(['ok' => false, 'error' => 'ride_access_denied'], 403);
    }
}

$ride['wow_code'] = (string)$ride['ride_code'];
fare_json([
    'ok' => true,
    'ride' => $ride
]);

