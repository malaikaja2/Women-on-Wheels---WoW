<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename=fare_training_data_' . date('Ymd_His') . '.csv');
echo "id,user_uid,pickup_lat,pickup_lng,drop_lat,drop_lng,distance_km,duration_min,vehicle_type,traffic_level,time_of_day,fare,created_at\n";

$docs = wow_firestore()->collection('fareTrainingData')->limit(5000)->documents();
foreach ($docs as $doc) {
    if (!$doc->exists()) continue;
    $d = $doc->data();
    $row = [
        $doc->id(),
        (string)($d['userUid'] ?? ''),
        (string)($d['pickupLat'] ?? ''),
        (string)($d['pickupLng'] ?? ''),
        (string)($d['dropLat'] ?? ''),
        (string)($d['dropLng'] ?? ''),
        (string)($d['distanceKm'] ?? ''),
        (string)($d['durationMin'] ?? ''),
        (string)($d['vehicleType'] ?? ''),
        (string)($d['trafficLevel'] ?? ''),
        (string)($d['timeOfDay'] ?? ''),
        (string)($d['fare'] ?? ''),
        wow_timestamp_to_string($d['createdAt'] ?? ''),
    ];
    echo implode(',', array_map(static fn(string $v): string => '"' . str_replace('"', '""', $v) . '"', $row)) . "\n";
}
