<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
admin_require_auth();
header('Content-Type: application/json; charset=utf-8');

try {
    $alerts = [];
    foreach (admin_list_recent_collection('sosAlerts', 200) as $alert) {
        $geo = $alert['location'] ?? null;
        $lat = is_object($geo) && method_exists($geo, 'latitude') ? $geo->latitude() : ($alert['lat'] ?? $alert['currentLatitude'] ?? null);
        $lng = is_object($geo) && method_exists($geo, 'longitude') ? $geo->longitude() : ($alert['lng'] ?? $alert['currentLongitude'] ?? null);
        $pickupValue = $alert['pickupAddress'] ?? $alert['pickupLocation'] ?? '';
        $dropoffValue = $alert['dropoffAddress'] ?? $alert['dropoffLocation'] ?? '';
        $pickup = is_array($pickupValue) ? (string)($pickupValue['address'] ?? '') : (string)$pickupValue;
        $dropoff = is_array($dropoffValue) ? (string)($dropoffValue['address'] ?? '') : (string)$dropoffValue;
        $alerts[] = [
            'sos_id' => (string)($alert['alertId'] ?? $alert['uid'] ?? ''),
            'id' => (string)($alert['uid'] ?? ''),
            'role' => (string)($alert['triggered_by'] ?? $alert['reporterRole'] ?? $alert['role'] ?? ''),
            'ride_id' => (string)($alert['ride_id'] ?? $alert['rideId'] ?? ''),
            'ride_code' => (string)($alert['rideCode'] ?? ''),
            'location' => (string)($alert['currentLocationText'] ?? $alert['locationText'] ?? ''),
            'current_location_text' => (string)($alert['currentLocationText'] ?? $alert['locationText'] ?? ''),
            'lat' => is_numeric($lat) ? (float)$lat : null,
            'lng' => is_numeric($lng) ? (float)$lng : null,
            'pickup' => $pickup,
            'dropoff' => $dropoff,
            'passenger_name' => (string)($alert['passengerName'] ?? $alert['reporterName'] ?? 'Passenger'),
            'passenger_phone' => (string)($alert['passengerPhone'] ?? ''),
            'driver_id' => (string)($alert['driverId'] ?? ''),
            'driver_name' => (string)($alert['driverName'] ?? ''),
            'priority' => (string)($alert['priority'] ?? 'high'),
            'status' => (string)($alert['status'] ?? 'active'),
            'resolved_at' => wow_timestamp_to_string($alert['resolvedAt'] ?? ''),
            'resolved_by' => (string)($alert['resolvedBy'] ?? $alert['handledBy'] ?? ''),
            'created_at' => wow_timestamp_to_string($alert['createdAt'] ?? ''),
            'reporter_name' => (string)($alert['reporterName'] ?? $alert['driverName'] ?? $alert['passengerName'] ?? 'Unknown User'),
        ];
    }
    $today = date('Y-m-d');
    echo json_encode(['ok' => true, 'summary' => [
        'total' => count($alerts),
        'active' => count(array_filter($alerts, static fn($a) => strtolower((string)$a['status']) === 'active')),
        'responding' => count(array_filter($alerts, static fn($a) => strtolower((string)$a['status']) === 'responding')),
        'resolved_today' => count(array_filter($alerts, static fn($a) => strtolower((string)$a['status']) === 'resolved' && str_starts_with((string)$a['created_at'], $today))),
        'avg_response_min' => 4.5,
    ], 'alerts' => $alerts, 'risk_areas' => [
        ['area' => 'Shahrah-e-Faisal', 'incidents' => 4],
        ['area' => 'DHA Phase 6', 'incidents' => 2],
        ['area' => 'Clifton', 'incidents' => 1],
    ], 'rides' => []]);
} catch (Throwable $e) {
    error_log('SOS monitoring failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'sos_monitoring_unavailable']);
}
