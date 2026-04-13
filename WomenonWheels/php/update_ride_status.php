<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_rides_table($conn)) {
    fare_json(['ok' => false, 'error' => 'rides_table_create_failed'], 500);
}

$input = fare_input();
$rideCode = fare_get_string($input, 'ride_code', '');
$rideId = (int)($input['ride_id'] ?? 0);
if ($rideCode === '' && $rideId <= 0) {
    fare_json(['ok' => false, 'error' => 'ride_identifier_required'], 422);
}

$status = strtolower(fare_get_string($input, 'status', 'in_progress'));
if ($status === '') $status = 'in_progress';
$allowedStatuses = ['requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'];
if (!in_array($status, $allowedStatuses, true)) {
    fare_json(['ok' => false, 'error' => 'invalid_status'], 422);
}

$driverId = fare_resolve_user_id($conn, 'driver', $input);
$distanceKm = fare_get_float($input, 'distance_km');
$durationMin = fare_get_float($input, 'duration_min');
$vehicleType = fare_get_string($input, 'vehicle_type', '');
$trafficLevel = fare_get_string($input, 'traffic_level', '');
$timeOfDay = fare_get_string($input, 'time_of_day', '');

$whereSql = $rideId > 0 ? 'id = ?' : 'ride_code = ?';
$lookupSql = "SELECT id, ride_code, passenger_id, driver_id, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, duration_min, vehicle_type, traffic_level, time_of_day, fare, status
              FROM rides WHERE {$whereSql} LIMIT 1";
$lookupStmt = $conn->prepare($lookupSql);
if (!$lookupStmt) fare_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
if ($rideId > 0) {
    $lookupStmt->bind_param('i', $rideId);
} else {
    $lookupStmt->bind_param('s', $rideCode);
}
$lookupStmt->execute();
$ride = $lookupStmt->get_result()->fetch_assoc();
if (!$ride) fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);

$currentStatus = strtolower((string)$ride['status']);
$transitions = [
    'requested' => ['accepted', 'cancelled'],
    'accepted' => ['arrived', 'cancelled'],
    'arrived' => ['in_progress', 'cancelled'],
    'in_progress' => ['completed', 'cancelled'],
    'completed' => [],
    'cancelled' => []
];
if ($status !== $currentStatus) {
    $nextAllowed = $transitions[$currentStatus] ?? [];
    if (!in_array($status, $nextAllowed, true)) {
        fare_json([
            'ok' => false,
            'error' => 'invalid_status_transition',
            'from' => $currentStatus,
            'to' => $status
        ], 409);
    }
}

$finalFare = (float)$ride['fare'];
$finalDistance = $distanceKm !== null ? max(0.0, $distanceKm) : (float)$ride['distance_km'];
$finalDuration = $durationMin !== null ? max(0.0, $durationMin) : (float)$ride['duration_min'];
$finalVehicle = $vehicleType !== '' ? fare_normalize_vehicle($vehicleType) : fare_normalize_vehicle((string)$ride['vehicle_type']);
$finalTraffic = $trafficLevel !== '' ? fare_normalize_traffic($trafficLevel) : fare_normalize_traffic((string)$ride['traffic_level']);
$finalTimeOfDay = $timeOfDay !== '' ? fare_normalize_time_of_day($timeOfDay) : fare_normalize_time_of_day((string)$ride['time_of_day']);
$finalDriverId = $driverId > 0 ? $driverId : (int)$ride['driver_id'];
if (in_array($status, ['accepted', 'arrived', 'in_progress', 'completed'], true) && $finalDriverId <= 0) {
    fare_json(['ok' => false, 'error' => 'driver_required_for_status'], 422);
}

$completedAt = null;
if ($status === 'completed') {
    $completedAt = date('Y-m-d H:i:s');
}

$updateSql = "UPDATE rides SET driver_id = ?, distance_km = ?, duration_min = ?, vehicle_type = ?, traffic_level = ?, time_of_day = ?, fare = ?, status = ?, completed_at = ?
              WHERE id = ?";
$updateStmt = $conn->prepare($updateSql);
if (!$updateStmt) fare_json(['ok' => false, 'error' => 'update_prepare_failed'], 500);
$rideRowId = (int)$ride['id'];
$updateStmt->bind_param(
    'iddsssdssi',
    $finalDriverId,
    $finalDistance,
    $finalDuration,
    $finalVehicle,
    $finalTraffic,
    $finalTimeOfDay,
    $finalFare,
    $status,
    $completedAt,
    $rideRowId
);

if (!$updateStmt->execute()) {
    fare_json(['ok' => false, 'error' => 'update_failed', 'message' => $updateStmt->error], 500);
}

fare_json([
    'ok' => true,
    'ride_id' => (int)$ride['id'],
    'ride_code' => (string)$ride['ride_code'],
    'status' => $status,
    'fare' => $finalFare
]);
