<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');

$cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'wow_available_drivers_cache.json';
$cacheTtlSeconds = 15;
if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) < $cacheTtlSeconds) {
    $cachedPayload = json_decode((string)@file_get_contents($cacheFile), true);
    if (is_array($cachedPayload) && !empty($cachedPayload['ok']) && isset($cachedPayload['drivers'])) {
        echo json_encode($cachedPayload);
        exit;
    }
}

try {
    $documents = wow_firestore()
        ->collection('drivers')
        ->where('isOnline', '=', true)
        ->where('isAvailable', '=', true)
        ->limit(100)
        ->documents();

    $rows = [];
    foreach ($documents as $document) {
        if (!$document->exists()) continue;
        $row = $document->data();
        $uid = $document->id();
        // This is a read-heavy endpoint called while a passenger is matching.
        // Never run legacy-profile write-backs here: one request could otherwise
        // perform a remote Firestore write for every online driver.
        $row = wow_normalize_driver_profile($uid, $row, false) ?: [];
        if (!wow_driver_is_approved($row)) continue;
        $gender = strtolower((string)($row['gender'] ?? ''));
        if ($gender !== '' && $gender !== 'female') continue;
        $rating = $row['rating'] ?? 4.8;
        $rows[] = [
            'id' => $uid,
            'uid' => $uid,
            'db_id' => $uid,
            'name' => (string)($row['name'] ?? 'Driver'),
            'phone' => (string)($row['phone'] ?? ''),
            'vehicle_type' => (string)($row['vehicleType'] ?? $row['vehicle_type'] ?? 'car'),
            'vehicle_number' => (string)($row['vehicleNumber'] ?? $row['vehicle_number'] ?? ''),
            'rating' => (string)$rating,
            'trips' => (string)($row['totalRides'] ?? 0),
            'eta_min' => 4,
            'distance_km' => null,
        ];
    }

    $payload = [
        'ok' => true,
        'drivers' => $rows,
        'count' => count($rows),
        'debug' => [
            'drivers_found' => count($rows),
            'driver_names' => array_map(static fn(array $driver): string => $driver['name'], $rows),
        ],
    ];
    @file_put_contents($cacheFile, json_encode($payload), LOCK_EX);
    echo json_encode($payload);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'firestore_query_failed',
        'message' => 'Unable to fetch available drivers.',
    ]);
}
