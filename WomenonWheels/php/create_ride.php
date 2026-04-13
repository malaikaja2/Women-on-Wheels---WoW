<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_rides_table($conn)) {
    fare_json(['ok' => false, 'error' => 'rides_table_create_failed'], 500);
}

$input = fare_input();
$passengerId = fare_resolve_user_id($conn, 'passenger', $input);
if ($passengerId <= 0) {
    fare_json(['ok' => false, 'error' => 'passenger_required'], 422);
}

$rideCode = fare_get_string($input, 'ride_code', '');
if ($rideCode === '') {
    $rideCode = 'WOW-' . date('YmdHis') . '-' . random_int(100, 999);
}

$pickup = fare_get_string($input, 'pickup', fare_get_string($input, 'pickup_location', ''));
$dropoff = fare_get_string($input, 'drop', fare_get_string($input, 'drop_location', ''));
if ($pickup === '' || $dropoff === '') {
    fare_json(['ok' => false, 'error' => 'pickup_drop_required'], 422);
}

$driverId = fare_resolve_user_id($conn, 'driver', [
    'user_id' => $input['driver_id'] ?? 0,
    'email' => $input['driver_email'] ?? '',
    'user_email' => $input['driver_email'] ?? ''
]);
if ($driverId <= 0) $driverId = null;

$pickupLat = fare_get_float($input, 'pickup_lat');
$pickupLng = fare_get_float($input, 'pickup_lng');
$dropLat = fare_get_float($input, 'drop_lat');
$dropLng = fare_get_float($input, 'drop_lng');
$distanceKm = (float)(fare_get_float($input, 'distance_km') ?? 0.0);
$durationMin = (float)(fare_get_float($input, 'duration_min') ?? 0.0);

if ($distanceKm <= 0 || $durationMin <= 0) {
    $distanceData = fare_distance_duration($input);
    $distanceKm = (float)$distanceData['distance_km'];
    $durationMin = (float)$distanceData['duration_min'];
}

$vehicleType = fare_normalize_vehicle(fare_get_string($input, 'vehicle_type', 'car'));
$trafficLevel = fare_normalize_traffic(fare_get_string($input, 'traffic_level', ''));
$timeOfDay = fare_normalize_time_of_day(fare_get_string($input, 'time_of_day', ''));

$offeredFare = fare_get_float($input, 'offered_fare');
$fare = fare_get_float($input, 'fare');
if ($fare === null || $fare <= 0) {
    $estimated = fare_estimate($distanceKm, $durationMin, $vehicleType, $trafficLevel, $timeOfDay);
    $fare = (float)$estimated['estimated_fare'];
}
$fare = round(max(1, $fare), 2);
$offeredFare = $offeredFare !== null ? round(max(0, $offeredFare), 2) : null;

$status = strtolower(fare_get_string($input, 'status', 'requested'));
if ($status === '') $status = 'requested';

$sql = 'INSERT INTO rides (
    ride_code, passenger_id, driver_id, pickup, dropoff, pickup_lat, pickup_lng, drop_lat, drop_lng,
    distance_km, duration_min, vehicle_type, traffic_level, time_of_day, fare, offered_fare, status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

$stmt = $conn->prepare($sql);
if (!$stmt) {
    fare_json(['ok' => false, 'error' => 'query_prepare_failed'], 500);
}

$stmt->bind_param(
    'siissddddddsssdds',
    $rideCode,
    $passengerId,
    $driverId,
    $pickup,
    $dropoff,
    $pickupLat,
    $pickupLng,
    $dropLat,
    $dropLng,
    $distanceKm,
    $durationMin,
    $vehicleType,
    $trafficLevel,
    $timeOfDay,
    $fare,
    $offeredFare,
    $status
);

if (!$stmt->execute()) {
    fare_json(['ok' => false, 'error' => 'insert_failed', 'message' => $stmt->error], 500);
}

fare_json([
    'ok' => true,
    'ride_id' => (int)$stmt->insert_id,
    'ride_code' => $rideCode,
    'wow_code' => $rideCode,
    'status' => $status,
    'fare' => $fare,
    'offered_fare' => $offeredFare,
    'distance_km' => round($distanceKm, 3),
    'duration_min' => round($durationMin, 2)
]);
