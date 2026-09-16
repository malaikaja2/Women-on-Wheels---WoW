<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

$input = fare_input();
$role = strtolower(fare_get_string($input, 'role', 'passenger'));
$uid = fare_resolve_user_id($conn, $role === 'driver' ? 'driver' : 'passenger', $input);

try {
    $ref = wow_firestore()->collection('fareTrainingData')->newDocument();
    $ref->set([
        'userUid' => $uid !== '' ? $uid : null,
        'role' => $role === 'driver' ? 'driver' : 'passenger',
        'pickupLat' => fare_get_float($input, 'pickup_lat'),
        'pickupLng' => fare_get_float($input, 'pickup_lng'),
        'dropLat' => fare_get_float($input, 'drop_lat'),
        'dropLng' => fare_get_float($input, 'drop_lng'),
        'distanceKm' => (float)(fare_get_float($input, 'distance_km') ?? 0),
        'durationMin' => (float)(fare_get_float($input, 'duration_min') ?? 0),
        'vehicleType' => fare_normalize_vehicle(fare_get_string($input, 'vehicle_type', 'car')),
        'trafficLevel' => fare_normalize_traffic(fare_get_string($input, 'traffic_level', '')),
        'timeOfDay' => fare_normalize_time_of_day(fare_get_string($input, 'time_of_day', '')),
        'fare' => (float)(fare_get_float($input, 'fare') ?? 0),
        'createdAt' => wow_now(),
    ]);
    fare_json(['ok' => true, 'id' => $ref->id()]);
} catch (Throwable $exception) {
    error_log('Firestore fare data save failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'save_failed'], 500);
}
