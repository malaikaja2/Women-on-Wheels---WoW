<?php

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function fare_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit();
}

function fare_input(): array
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return array_merge($_REQUEST, $json);
    }
    return $_REQUEST;
}

function fare_get_string(array $input, string $key, string $fallback = ''): string
{
    if (!isset($input[$key])) {
        return $fallback;
    }
    return trim((string)$input[$key]);
}

function fare_get_float(array $input, string $key): ?float
{
    if (!isset($input[$key])) {
        return null;
    }
    $value = trim((string)$input[$key]);
    if ($value === '' || !is_numeric($value)) {
        return null;
    }
    return (float)$value;
}

function fare_normalize_vehicle(string $vehicleType): string
{
    $value = strtolower(trim($vehicleType));
    if (strpos($value, 'bike') !== false) return 'bike';
    if (strpos($value, 'scooty') !== false || strpos($value, 'scooter') !== false) return 'scooty';
    return 'car';
}

function fare_normalize_traffic(string $trafficLevel): string
{
    $value = strtolower(trim($trafficLevel));
    if ($value === 'high' || $value === 'medium' || $value === 'low') {
        return $value;
    }
    $hour = (int)date('G');
    if (($hour >= 7 && $hour <= 10) || ($hour >= 17 && $hour <= 20)) return 'high';
    if ($hour >= 11 && $hour <= 16) return 'medium';
    return 'low';
}

function fare_normalize_time_of_day(string $timeOfDay): string
{
    $value = strtolower(trim($timeOfDay));
    if ($value === 'day' || $value === 'night') {
        return $value;
    }
    $hour = (int)date('G');
    return ($hour >= 6 && $hour < 22) ? 'day' : 'night';
}

function fare_haversine_km(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $earthRadius = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) * sin($dLat / 2)
        + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) * sin($dLng / 2);
    $c = 2 * atan2(sqrt($a), sqrt(max(0.0, 1 - $a)));
    return max(0.1, $earthRadius * $c);
}

function fare_point_from_text(string $text): array
{
    $centerLat = 24.8607;
    $centerLng = 67.0011;
    $sum = 0;
    $chars = str_split($text);
    foreach ($chars as $char) {
        $sum += ord($char);
    }
    return [
        'lat' => $centerLat + ((($sum % 17) - 8) * 0.0042),
        'lng' => $centerLng + ((((int)($sum / 4) % 17) - 8) * 0.0042),
    ];
}

function fare_google_maps_key(array $input): string
{
    $inlineKey = fare_get_string($input, 'google_maps_api_key', '');
    if ($inlineKey !== '') return $inlineKey;
    $envKey = getenv('GOOGLE_MAPS_API_KEY');
    return $envKey !== false ? trim((string)$envKey) : '';
}

function fare_distance_duration(array $input): array
{
    $pickupLat = fare_get_float($input, 'pickup_lat');
    $pickupLng = fare_get_float($input, 'pickup_lng');
    $dropLat = fare_get_float($input, 'drop_lat');
    $dropLng = fare_get_float($input, 'drop_lng');
    $pickupText = fare_get_string($input, 'pickup', fare_get_string($input, 'pickup_location', ''));
    $dropText = fare_get_string($input, 'drop', fare_get_string($input, 'drop_location', ''));

    $distanceFromInput = fare_get_float($input, 'distance_km');
    $durationFromInput = fare_get_float($input, 'duration_min');
    if ($distanceFromInput !== null && $durationFromInput !== null) {
        return [
            'distance_km' => max(0.1, $distanceFromInput),
            'duration_min' => max(1.0, $durationFromInput),
            'distance_source' => 'provided'
        ];
    }

    $key = fare_google_maps_key($input);
    $origin = null;
    $destination = null;
    if ($pickupLat !== null && $pickupLng !== null) $origin = $pickupLat . ',' . $pickupLng;
    if ($dropLat !== null && $dropLng !== null) $destination = $dropLat . ',' . $dropLng;
    if ($origin === null && $pickupText !== '') $origin = $pickupText;
    if ($destination === null && $dropText !== '') $destination = $dropText;

    if ($key !== '' && $origin !== null && $destination !== null) {
        $url = 'https://maps.googleapis.com/maps/api/directions/json?origin=' . urlencode($origin)
            . '&destination=' . urlencode($destination)
            . '&mode=driving&departure_time=now&key=' . urlencode($key);
        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 5
            ]
        ]);
        $response = @file_get_contents($url, false, $ctx);
        if ($response !== false) {
            $json = json_decode($response, true);
            if (is_array($json)
                && isset($json['status']) && $json['status'] === 'OK'
                && isset($json['routes'][0]['legs'][0])) {
                $leg = $json['routes'][0]['legs'][0];
                $meters = isset($leg['distance']['value']) ? (float)$leg['distance']['value'] : 0.0;
                $seconds = 0.0;
                if (isset($leg['duration_in_traffic']['value'])) {
                    $seconds = (float)$leg['duration_in_traffic']['value'];
                } elseif (isset($leg['duration']['value'])) {
                    $seconds = (float)$leg['duration']['value'];
                }
                if ($meters > 0 && $seconds > 0) {
                    return [
                        'distance_km' => round(max(0.1, $meters / 1000), 3),
                        'duration_min' => round(max(1.0, $seconds / 60), 2),
                        'distance_source' => 'google_directions'
                    ];
                }
            }
        }
    }

    if ($pickupLat === null || $pickupLng === null || $dropLat === null || $dropLng === null) {
        $from = fare_point_from_text($pickupText !== '' ? $pickupText : 'Pickup Karachi');
        $to = fare_point_from_text($dropText !== '' ? $dropText : 'Drop Karachi');
        $pickupLat = $from['lat'];
        $pickupLng = $from['lng'];
        $dropLat = $to['lat'];
        $dropLng = $to['lng'];
    }

    $distanceKm = fare_haversine_km($pickupLat, $pickupLng, $dropLat, $dropLng);
    $durationMin = max(1.0, ($distanceKm / 28.0) * 60.0);
    return [
        'distance_km' => round($distanceKm, 3),
        'duration_min' => round($durationMin, 2),
        'distance_source' => 'haversine_fallback'
    ];
}

function fare_estimate(float $distanceKm, float $durationMin, string $vehicleType, string $trafficLevel, string $timeOfDay): array
{
    $vehicle = fare_normalize_vehicle($vehicleType);
    $traffic = fare_normalize_traffic($trafficLevel);
    $time = fare_normalize_time_of_day($timeOfDay);

    $baseFare = 90.0;
    $perKmRate = 24.0;
    $perMinRate = 2.4;

    $vehicleMultipliers = [
        'bike' => 0.85,
        'scooty' => 1.00,
        'car' => 1.25,
    ];

    $trafficMultipliers = [
        'low' => 1.00,
        'medium' => 1.15,
        'high' => 1.30,
    ];

    $timeMultipliers = [
        'day' => 1.00,
        'night' => 1.12,
    ];

    $vehicleMultiplier = $vehicleMultipliers[$vehicle];
    $trafficMultiplier = $trafficMultipliers[$traffic];
    $timeMultiplier = $timeMultipliers[$time];

    $core = $baseFare + ($distanceKm * $perKmRate) + ($durationMin * $perMinRate);
    $estimated = max(50, round($core * $vehicleMultiplier * $trafficMultiplier * $timeMultiplier));

    return [
        'estimated_fare' => $estimated,
        'formula' => [
            'base_fare' => $baseFare,
            'per_km_rate' => $perKmRate,
            'per_min_rate' => $perMinRate,
            'vehicle_multiplier' => $vehicleMultiplier,
            'traffic_multiplier' => $trafficMultiplier,
            'time_multiplier' => $timeMultiplier
        ],
        'vehicle_type' => $vehicle,
        'traffic_level' => $traffic,
        'time_of_day' => $time
    ];
}

function fare_ensure_training_table(mysqli $conn): bool
{
    $sql = "CREATE TABLE IF NOT EXISTS fare_training_data (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        pickup_lat DECIMAL(10,7) NULL,
        pickup_lng DECIMAL(10,7) NULL,
        drop_lat DECIMAL(10,7) NULL,
        drop_lng DECIMAL(10,7) NULL,
        distance_km DECIMAL(8,3) NOT NULL,
        duration_min DECIMAL(8,2) NOT NULL,
        vehicle_type VARCHAR(20) NOT NULL,
        traffic_level VARCHAR(10) NOT NULL,
        time_of_day VARCHAR(10) NOT NULL,
        fare DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fare_created_at (created_at),
        INDEX idx_fare_vehicle_time (vehicle_type, traffic_level, time_of_day),
        INDEX idx_fare_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    return (bool)$conn->query($sql);
}

function fare_ensure_rides_table(mysqli $conn): bool
{
    $sql = "CREATE TABLE IF NOT EXISTS rides (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        ride_code VARCHAR(64) NOT NULL UNIQUE,
        passenger_id INT NOT NULL,
        driver_id INT NULL,
        pickup VARCHAR(255) NOT NULL,
        dropoff VARCHAR(255) NOT NULL,
        pickup_lat DECIMAL(10,7) NULL,
        pickup_lng DECIMAL(10,7) NULL,
        drop_lat DECIMAL(10,7) NULL,
        drop_lng DECIMAL(10,7) NULL,
        distance_km DECIMAL(8,3) NOT NULL DEFAULT 0.000,
        duration_min DECIMAL(8,2) NOT NULL DEFAULT 0.00,
        vehicle_type VARCHAR(20) NOT NULL,
        traffic_level VARCHAR(10) NOT NULL,
        time_of_day VARCHAR(10) NOT NULL,
        fare DECIMAL(10,2) NOT NULL,
        offered_fare DECIMAL(10,2) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'requested',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_rides_passenger_created (passenger_id, created_at),
        INDEX idx_rides_driver_status (driver_id, status),
        INDEX idx_rides_status_updated (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    return (bool)$conn->query($sql);
}

function fare_resolve_user_id(mysqli $conn, string $role, array $input): int
{
    $normalizedRole = strtolower(trim($role)) === 'driver' ? 'driver' : 'passenger';
    $sessionRole = isset($_SESSION['role']) ? strtolower((string)$_SESSION['role']) : '';
    $sessionUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    if ($sessionUserId > 0 && $sessionRole === $normalizedRole) {
        return $sessionUserId;
    }

    $incomingUserId = (int)($input['user_id'] ?? 0);
    if ($incomingUserId > 0) {
        return $incomingUserId;
    }

    $email = fare_get_string($input, 'email', fare_get_string($input, 'user_email', ''));
    if ($email === '') {
        return 0;
    }

    $table = $normalizedRole === 'driver' ? 'drivers' : 'passengers';
    $stmt = $conn->prepare("SELECT id FROM {$table} WHERE email = ? LIMIT 1");
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    if (!$row || !isset($row['id'])) {
        return 0;
    }
    return (int)$row['id'];
}
