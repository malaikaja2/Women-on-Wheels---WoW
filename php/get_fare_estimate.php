<?php
require_once 'db.php';
require_once 'fare_engine.php';

$input = fare_input();
$pickup = fare_get_string($input, 'pickup', fare_get_string($input, 'pickup_location', ''));
$drop = fare_get_string($input, 'drop', fare_get_string($input, 'drop_location', ''));

if ($pickup === '' && fare_get_float($input, 'pickup_lat') === null) {
    fare_json(['ok' => false, 'error' => 'pickup_required'], 422);
}
if ($drop === '' && fare_get_float($input, 'drop_lat') === null) {
    fare_json(['ok' => false, 'error' => 'drop_required'], 422);
}

$distanceData = fare_distance_duration($input);
$vehicleType = fare_get_string($input, 'vehicle_type', 'car');
$trafficLevel = fare_get_string($input, 'traffic_level', '');
$timeOfDay = fare_get_string($input, 'time_of_day', '');
$fareData = fare_estimate(
    (float)$distanceData['distance_km'],
    (float)$distanceData['duration_min'],
    $vehicleType,
    $trafficLevel,
    $timeOfDay
);

fare_json([
    'ok' => true,
    'distance_km' => round((float)$distanceData['distance_km'], 3),
    'duration_min' => round((float)$distanceData['duration_min'], 2),
    'estimated_fare' => (int)$fareData['estimated_fare'],
    'distance_source' => $distanceData['distance_source'],
    'vehicle_type' => $fareData['vehicle_type'],
    'traffic_level' => $fareData['traffic_level'],
    'time_of_day' => $fareData['time_of_day'],
    'formula' => $fareData['formula']
]);

