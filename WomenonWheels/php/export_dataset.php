<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_training_table($conn)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Failed to ensure fare_training_data table exists.';
    exit();
}

$filename = 'fare_training_data_' . date('Ymd_His') . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$out = fopen('php://output', 'w');
fputcsv($out, [
    'id',
    'user_id',
    'pickup_lat',
    'pickup_lng',
    'drop_lat',
    'drop_lng',
    'distance_km',
    'duration_min',
    'vehicle_type',
    'traffic_level',
    'time_of_day',
    'fare',
    'created_at'
]);

$sql = 'SELECT id, user_id, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, duration_min, vehicle_type, traffic_level, time_of_day, fare, created_at
        FROM fare_training_data
        ORDER BY id ASC';

$result = $conn->query($sql);
if ($result) {
    while ($row = $result->fetch_assoc()) {
        fputcsv($out, [
            $row['id'],
            $row['user_id'],
            $row['pickup_lat'],
            $row['pickup_lng'],
            $row['drop_lat'],
            $row['drop_lng'],
            $row['distance_km'],
            $row['duration_min'],
            $row['vehicle_type'],
            $row['traffic_level'],
            $row['time_of_day'],
            $row['fare'],
            $row['created_at']
        ]);
    }
}

fclose($out);
exit();

