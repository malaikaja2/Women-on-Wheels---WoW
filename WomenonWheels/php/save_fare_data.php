<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_training_table($conn)) {
    fare_json(['ok' => false, 'error' => 'table_create_failed'], 500);
}

$input = fare_input();
$userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
if ($userId <= 0) {
    $userId = (int)fare_get_float($input, 'user_id');
}
if ($userId <= 0) {
    $email = fare_get_string($input, 'email', fare_get_string($input, 'user_email', ''));
    $role = strtolower(fare_get_string($input, 'role', fare_get_string($input, 'user_role', 'passenger')));
    if ($role !== 'driver') {
        $role = 'passenger';
    }
    if ($email !== '') {
        $table = $role === 'driver' ? 'drivers' : 'passengers';
        $lookup = $conn->prepare("SELECT id FROM {$table} WHERE email = ? LIMIT 1");
        if ($lookup) {
            $lookup->bind_param('s', $email);
            $lookup->execute();
            $result = $lookup->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            if ($row && isset($row['id'])) {
                $userId = (int)$row['id'];
            }
        }
    }
}
if ($userId <= 0) {
    fare_json(['ok' => false, 'error' => 'user_id_required'], 422);
}

$distanceData = fare_distance_duration($input);
$distanceKm = (float)$distanceData['distance_km'];
$durationMin = (float)$distanceData['duration_min'];

$vehicleType = fare_normalize_vehicle(fare_get_string($input, 'vehicle_type', 'car'));
$trafficLevel = fare_normalize_traffic(fare_get_string($input, 'traffic_level', ''));
$timeOfDay = fare_normalize_time_of_day(fare_get_string($input, 'time_of_day', ''));

$fareInput = fare_get_float($input, 'fare');
if ($fareInput === null) {
    $estimated = fare_estimate($distanceKm, $durationMin, $vehicleType, $trafficLevel, $timeOfDay);
    $fareInput = (float)$estimated['estimated_fare'];
}
$fare = round(max(0, $fareInput), 2);

$pickupLat = fare_get_float($input, 'pickup_lat');
$pickupLng = fare_get_float($input, 'pickup_lng');
$dropLat = fare_get_float($input, 'drop_lat');
$dropLng = fare_get_float($input, 'drop_lng');

$sql = 'INSERT INTO fare_training_data (
    user_id, pickup_lat, pickup_lng, drop_lat, drop_lng,
    distance_km, duration_min, vehicle_type, traffic_level, time_of_day, fare
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

$stmt = $conn->prepare($sql);
if (!$stmt) {
    fare_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
}

$stmt->bind_param(
    'iddddddsssd',
    $userId,
    $pickupLat,
    $pickupLng,
    $dropLat,
    $dropLng,
    $distanceKm,
    $durationMin,
    $vehicleType,
    $trafficLevel,
    $timeOfDay,
    $fare
);

if (!$stmt->execute()) {
    fare_json(['ok' => false, 'error' => 'insert_failed'], 500);
}

fare_json([
    'ok' => true,
    'id' => (int)$stmt->insert_id,
    'message' => 'Fare training data saved',
    'row' => [
        'user_id' => $userId,
        'distance_km' => round($distanceKm, 3),
        'duration_min' => round($durationMin, 2),
        'vehicle_type' => $vehicleType,
        'traffic_level' => $trafficLevel,
        'time_of_day' => $timeOfDay,
        'fare' => $fare
    ]
]);
