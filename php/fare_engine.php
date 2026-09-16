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

function fare_debug_enabled(): bool
{
    if (isset($_REQUEST['debug']) && (string)$_REQUEST['debug'] === '1') return true;
    $env = getenv('WOW_DEBUG');
    return $env !== false && trim((string)$env) === '1';
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

function fare_mapbox_access_token(array $input): string
{
    $inlineKey = fare_get_string($input, 'mapbox_access_token', '');
    if ($inlineKey !== '') return $inlineKey;
    $envKey = getenv('MAPBOX_ACCESS_TOKEN');
    if ($envKey !== false && trim((string)$envKey) !== '') return trim((string)$envKey);
    $envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (is_readable($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            if (preg_match('/^\s*MAPBOX_ACCESS_TOKEN\s*=\s*(.*)\s*$/', $line, $match)) {
                return trim($match[1], " \t\n\r\0\x0B\"'");
            }
        }
    }
    return '';
}

/**
 * Fare settings change infrequently, while estimates can be requested several
 * times during a single booking. Keep a short local cache so a Firestore round
 * trip never holds up the passenger UI for every estimate.
 */
function fare_rate_settings(): array
{
    static $settings = null;
    if (is_array($settings)) return $settings;

    $cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'wow_fare_settings_cache.json';
    $cached = null;
    if (is_file($cacheFile)) {
        $decoded = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($decoded)) $cached = $decoded;
        if (is_array($cached) && (time() - (int)@filemtime($cacheFile)) < 60) {
            return $settings = $cached;
        }
    }

    try {
        $profile = function_exists('wow_doc_data') ? (wow_doc_data('appSettings', 'global') ?: []) : [];
        $settings = is_array($profile['fareSettings'] ?? null) ? $profile['fareSettings'] : [];
        @file_put_contents($cacheFile, json_encode($settings), LOCK_EX);
        return $settings;
    } catch (Throwable) {
        // Serving a slightly stale configuration is preferable to making the
        // booking flow wait for an unavailable remote settings document.
        return $settings = (is_array($cached) ? $cached : []);
    }
}

function fare_http_json(string $url): ?array
{
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5
        ]
    ]);
    $response = @file_get_contents($url, false, $ctx);
    if ($response === false) return null;
    $json = json_decode($response, true);
    return is_array($json) ? $json : null;
}

function fare_mapbox_geocode(string $query, string $token): ?array
{
    $text = trim($query);
    if ($text === '' || $token === '') return null;
    $url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' . rawurlencode($text)
        . '.json?country=pk&language=en&autocomplete=true&fuzzyMatch=true&limit=1&bbox=66.65,24.65,67.45,25.25&proximity=67.0011,24.8607&access_token=' . rawurlencode($token);
    $json = fare_http_json($url);
    if (!is_array($json) || !isset($json['features'][0]['center']) || !is_array($json['features'][0]['center'])) {
        return null;
    }
    return [
        'lat' => (float)$json['features'][0]['center'][1],
        'lng' => (float)$json['features'][0]['center'][0],
    ];
}

function fare_mapbox_directions(array $origin, array $destination, string $token): ?array
{
    if ($token === '') return null;
    $coords = $origin['lng'] . ',' . $origin['lat'] . ';' . $destination['lng'] . ',' . $destination['lat'];
    $url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' . $coords
        . '?alternatives=false&geometries=geojson&overview=false&steps=false&access_token=' . rawurlencode($token);
    $json = fare_http_json($url);
    if (!is_array($json) || !isset($json['routes'][0])) return null;
    $route = $json['routes'][0];
    $meters = isset($route['distance']) ? (float)$route['distance'] : 0.0;
    $seconds = isset($route['duration']) ? (float)$route['duration'] : 0.0;
    if ($meters <= 0 || $seconds <= 0) return null;
    return [
        'distance_km' => round(max(0.1, $meters / 1000), 3),
        'duration_min' => round(max(1.0, $seconds / 60), 2),
        'distance_source' => 'mapbox_directions'
    ];
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

    $token = fare_mapbox_access_token($input);
    if ($pickupLat === null || $pickupLng === null) {
        $point = fare_mapbox_geocode($pickupText, $token);
        if ($point !== null) {
            $pickupLat = $point['lat'];
            $pickupLng = $point['lng'];
        }
    }
    if ($dropLat === null || $dropLng === null) {
        $point = fare_mapbox_geocode($dropText, $token);
        if ($point !== null) {
            $dropLat = $point['lat'];
            $dropLng = $point['lng'];
        }
    }
    if ($pickupLat !== null && $pickupLng !== null && $dropLat !== null && $dropLng !== null) {
        $directionsData = fare_mapbox_directions(
            ['lat' => $pickupLat, 'lng' => $pickupLng],
            ['lat' => $dropLat, 'lng' => $dropLng],
            $token
        );
        if ($directionsData !== null) return $directionsData;
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

    $rates = [
        'bike' => ['base' => 80.0, 'per_km' => 24.0, 'per_min' => 3.0],
        'scooty' => ['base' => 90.0, 'per_km' => 28.0, 'per_min' => 3.5],
        'car' => ['base' => 140.0, 'per_km' => 38.0, 'per_min' => 5.0],
    ];
    try {
        if (function_exists('wow_doc_data')) {
            $fareSettings = fare_rate_settings();
            $globalPerKm = isset($fareSettings['perKmCharge']) ? (float)$fareSettings['perKmCharge'] : null;
            $globalMinimum = isset($fareSettings['minimumFare']) ? (float)$fareSettings['minimumFare'] : null;
            $vehicleRates = is_array($fareSettings['vehicles'][$vehicle] ?? null) ? $fareSettings['vehicles'][$vehicle] : [];
            if ($globalPerKm !== null && $globalPerKm > 0) {
                foreach ($rates as $key => $rate) $rates[$key]['per_km'] = $globalPerKm;
            }
            if ($globalMinimum !== null && $globalMinimum > 0) {
                foreach ($rates as $key => $rate) $rates[$key]['base'] = max($rate['base'], $globalMinimum);
            }
            if (isset($vehicleRates['baseFare']) && (float)$vehicleRates['baseFare'] > 0) $rates[$vehicle]['base'] = (float)$vehicleRates['baseFare'];
            if (isset($vehicleRates['perKmRate']) && (float)$vehicleRates['perKmRate'] > 0) $rates[$vehicle]['per_km'] = (float)$vehicleRates['perKmRate'];
            if (isset($vehicleRates['perMinRate']) && (float)$vehicleRates['perMinRate'] > 0) $rates[$vehicle]['per_min'] = (float)$vehicleRates['perMinRate'];
        }
    } catch (Throwable) {
        // Keep fare estimates available if settings cannot be read.
    }
    $rate = $rates[$vehicle] ?? $rates['car'];
    $baseFare = $rate['base'];
    $perKmRate = $rate['per_km'];
    $perMinRate = $rate['per_min'];
    $vehicleMultiplier = 1.0;
    $trafficMultiplier = 1.0;
    $timeMultiplier = 1.0;

    $rawFare = $baseFare + ($distanceKm * $perKmRate) + ($durationMin * $perMinRate);
    $estimated = max($baseFare, round($rawFare / 10.0) * 10);

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

function fare_ensure_training_table($conn = null): bool
{
    return true;
}

function fare_ensure_rides_table($conn = null): bool
{
    return true;
}

function fare_ensure_rides_column($conn, string $column, string $alterSql): void
{
}

function fare_ensure_carpool_tables($conn = null): bool
{
    return true;
}

function fare_ensure_driver_presence_table($conn = null): bool
{
    return true;
}

function fare_ensure_drivers_online_column($conn = null): bool
{
    return true;
}

function fare_ensure_driver_presence_column($conn, string $column, string $alterSql): void
{
}

function fare_normalize_ride_status(string $status): string
{
    $value = strtolower(trim($status));
    if (in_array($value, ['requested', 'searching_driver', 'finding_driver', 'searching'], true)) return 'pending';
    if (in_array($value, ['driver_en_route', 'arriving'], true)) return 'driver_arriving';
    if (in_array($value, ['arrived', 'driver_arrived', 'driver_reached_pickup'], true)) return 'arrived';
    if (in_array($value, ['started', 'on_trip', 'in_progress'], true)) return 'ride_started';
    if (in_array($value, ['rejected', 'declined', 'canceled', 'cancelled_by_passenger', 'cancelled_by_driver', 'passenger_cancelled', 'driver_cancelled'], true)) return 'cancelled';
    if ($value === '') return 'pending';
    return $value;
}

function fare_resolve_user_id($conn, string $role, array $input): string
{
    $normalizedRole = strtolower(trim($role)) === 'driver' ? 'driver' : 'passenger';
    $sessionRole = isset($_SESSION['role']) ? strtolower((string)$_SESSION['role']) : '';
    $sessionUid = (string)($_SESSION['firebase_uid'] ?? '');
    if ($sessionUid !== '' && $sessionRole === $normalizedRole) {
        return $sessionUid;
    }

    foreach (['firebase_uid', 'uid', 'user_id'] as $key) {
        $incomingUserId = trim((string)($input[$key] ?? ''));
        if ($incomingUserId !== '') {
            return $incomingUserId;
        }
    }

    $email = fare_get_string($input, 'email', fare_get_string($input, 'user_email', ''));
    if ($email === '') {
        return '';
    }

    if (function_exists('wow_find_profile_by_email')) {
        $profile = wow_find_profile_by_email($normalizedRole, $email);
        return (string)($profile['uid'] ?? '');
    }

    return '';
}
