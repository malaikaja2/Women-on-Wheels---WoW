<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

$input = array_merge($_GET, $_POST, fare_input());
$passengerUid = fare_resolve_user_id($conn, 'passenger', $input);
if ($passengerUid === '') {
    fare_json(['ok' => false, 'error' => 'passenger_required'], 422);
}

$limit = (int)($input['limit'] ?? 30);
if ($limit < 1 || $limit > 200) $limit = 30;

try {
    $docs = wow_firestore()
        ->collection('rides')
        ->where('passengerUid', '=', $passengerUid)
        ->limit($limit)
        ->documents();

    $rows = [];
    $driverCache = [];
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $ride = $doc->data();
        $driverName = (string)($ride['driverName'] ?? $ride['acceptedDriverName'] ?? '');
        $driverUid = (string)($ride['driverUid'] ?? $ride['driverId'] ?? $ride['assignedDriverId'] ?? '');
        if ($driverName === '' && $driverUid !== '') {
            if (!array_key_exists($driverUid, $driverCache)) {
                $driverCache[$driverUid] = wow_doc_data('drivers', $driverUid);
            }
            $driverName = (string)($driverCache[$driverUid]['name'] ?? '');
        }
        $rows[] = [
            'id' => $doc->id(),
            'ride_id' => $doc->id(),
            'ride_code' => (string)($ride['rideCode'] ?? ''),
            'pickup' => (string)($ride['pickup'] ?? ''),
            'dropoff' => (string)($ride['dropoff'] ?? ''),
            'distance_km' => $ride['distanceKm'] ?? 0,
            'duration_min' => $ride['durationMin'] ?? 0,
            'vehicle_type' => (string)($ride['vehicleType'] ?? ''),
            'payment_method' => (string)($ride['paymentMethod'] ?? ''),
            'payment_label' => (string)($ride['paymentLabel'] ?? ''),
            'fare' => $ride['fare'] ?? 0,
            'offered_fare' => $ride['offeredFare'] ?? null,
            'status' => (string)($ride['status'] ?? 'pending'),
            'created_at' => wow_timestamp_to_string($ride['createdAt'] ?? ''),
            'updated_at' => wow_timestamp_to_string($ride['updatedAt'] ?? ''),
            'completed_at' => wow_timestamp_to_string($ride['completedAt'] ?? ''),
            'driver_name' => $driverName,
        ];
    }

    usort($rows, static fn(array $a, array $b): int => strcmp((string)$b['created_at'], (string)$a['created_at']));
    fare_json(['ok' => true, 'passenger_id' => $passengerUid, 'rides' => $rows]);
} catch (Throwable $exception) {
    error_log('Firestore passenger rides failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'rides_fetch_failed'], 500);
}
