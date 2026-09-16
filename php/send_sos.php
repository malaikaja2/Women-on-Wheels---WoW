<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';

use Google\Cloud\Core\GeoPoint;

$input = array_merge($_POST, sos_input());
$user = resolve_user_context($conn, $input);
if (!$user['ok']) sos_json(['ok' => false, 'error' => $user['error']], 400);

$rideId = trim((string)($input['ride_id'] ?? ''));
$rideCode = trim((string)($input['ride_code'] ?? ''));
$location = trim((string)($input['location'] ?? ''));
$currentLocationText = trim((string)($input['current_location_text'] ?? $location));
$status = strtolower(trim((string)($input['status'] ?? 'active')));
$lat = is_numeric($input['lat'] ?? null) ? (float)$input['lat'] : null;
$lng = is_numeric($input['lng'] ?? null) ? (float)$input['lng'] : null;
if ($status !== 'resolved') $status = 'active';
if ($rideId === '') sos_json(['ok' => false, 'error' => 'active_ride_required', 'message' => 'SOS is available during active ride only.'], 422);
if ($location === '') {
    $pickup = trim((string)($input['pickup'] ?? ''));
    $drop = trim((string)($input['drop'] ?? ''));
    $location = ($pickup !== '' || $drop !== '') ? "Pickup: {$pickup} | Drop-off: {$drop}" : 'Location unavailable';
}
if ($currentLocationText === '') $currentLocationText = $location;

$profile = wow_doc_data($user['role'] . 's', $user['uid']);
$ride = wow_doc_data('rides', $rideId);
if (!$ride && $rideCode !== '') {
    $docs = wow_firestore()->collection('rides')->where('rideCode', '=', $rideCode)->limit(1)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $ride = $doc->data();
        $rideId = $doc->id();
        break;
    }
}
if (!$ride) sos_json(['ok' => false, 'error' => 'ride_not_found'], 404);
$rideStatus = strtolower((string)($ride['status'] ?? ''));
if (!in_array($rideStatus, ['driver_assigned', 'driver_arriving', 'arrived', 'started', 'ongoing', 'in_progress', 'on_trip'], true)) {
    sos_json(['ok' => false, 'error' => 'active_ride_required', 'message' => 'SOS is available during an active ride only.'], 422);
}
$passengerUid = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '');
$assignedDriverUid = (string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? '');
$participantUid = $user['role'] === 'driver' ? $assignedDriverUid : $passengerUid;
if ($participantUid === '' || !hash_equals($participantUid, $user['uid'])) {
    sos_json(['ok' => false, 'error' => 'not_assigned_to_ride'], 403);
}

// Browser geolocation may be slow, denied, or unavailable. Prefer the last
// continuously-synchronised ride location so the admin still receives useful
// coordinates immediately.
if ($lat === null || $lng === null) {
    $locationRole = $user['role'] === 'driver' ? 'driver' : 'passenger';
    $liveSnapshot = wow_firestore()->collection('rides')->document($rideId)
        ->collection('liveLocations')->document($locationRole)->snapshot();
    $live = $liveSnapshot->exists() ? $liveSnapshot->data() : [];
    $ridePoint = $ride[$locationRole . '_location'] ?? $ride[$locationRole . 'Location'] ?? [];
    $fallbackLat = $live['latitude'] ?? $live['lat'] ?? $ridePoint['latitude'] ?? $ridePoint['lat']
        ?? $ride[$locationRole . 'Latitude'] ?? null;
    $fallbackLng = $live['longitude'] ?? $live['lng'] ?? $ridePoint['longitude'] ?? $ridePoint['lng']
        ?? $ride[$locationRole . 'Longitude'] ?? null;
    if (is_numeric($fallbackLat) && is_numeric($fallbackLng)) {
        $lat = (float)$fallbackLat;
        $lng = (float)$fallbackLng;
        $location = "Lat " . number_format($lat, 6, '.', '') . ", Lng " . number_format($lng, 6, '.', '');
        $currentLocationText = $location;
    }
}
$pickup = trim((string)($input['pickup'] ?? $ride['pickup'] ?? $ride['pickupLocation'] ?? ''));
$drop = trim((string)($input['drop'] ?? $ride['dropoff'] ?? $ride['dropoffLocation'] ?? ''));
$driverId = trim((string)($input['driver_id'] ?? $ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? $ride['driverID'] ?? ''));
$driverName = trim((string)($input['driver_name'] ?? $ride['driverName'] ?? $ride['targetDriverName'] ?? ''));
$passengerName = trim((string)($input['passenger_name'] ?? $profile['name'] ?? $profile['fullName'] ?? $ride['passengerName'] ?? 'Passenger'));
$passengerPhone = trim((string)($input['passenger_phone'] ?? $profile['phone'] ?? $ride['passengerPhone'] ?? ''));
$driverProfile = $driverId !== '' ? (wow_doc_data('drivers', $driverId) ?: []) : [];
$driverPhone = trim((string)($input['driver_phone'] ?? $ride['driverPhone'] ?? $driverProfile['phone'] ?? $driverProfile['phoneNumber'] ?? ''));
$message = trim((string)($input['message'] ?? $input['emergency_message'] ?? 'Emergency SOS triggered'));
$ref = wow_firestore()->collection('sosAlerts')->newDocument();
$alertId = $ref->id();
$alert = [
    'alert_id' => $alertId,
    'alertId' => $alertId,
    'passengerId' => $user['role'] === 'passenger' ? $user['uid'] : (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? ''),
    'passengerName' => $passengerName,
    'passengerPhone' => $passengerPhone,
    'driverId' => $driverId,
    'driverName' => $driverName,
    'driverPhone' => $driverPhone,
    'vehicleType' => (string)($ride['vehicleType'] ?? $driverProfile['vehicleType'] ?? $driverProfile['vehicleModel'] ?? ''),
    'vehicleNumber' => (string)($ride['vehicleNumber'] ?? $driverProfile['vehicleNumber'] ?? ''),
    'rideStatus' => $rideStatus,
    'carpoolRideId' => (string)($ride['carpoolRideId'] ?? ''),
    'carpoolBookingId' => (string)($ride['carpoolBookingId'] ?? ''),
    'isCarpool' => !empty($ride['isCarpool']),
    'emergencyMessage' => $message,
    'currentLocationText' => $currentLocationText,
    'lat' => $lat,
    'lng' => $lng,
    'pickupLocation' => $pickup,
    'dropoffLocation' => $drop,
    'priority' => 'high',
    'resolvedAt' => null,
    'userUid' => $user['uid'],
    'user_id' => $user['uid'],
    'reporterUid' => $user['uid'],
    'triggered_by' => $user['role'],
    'role' => $user['role'],
    'reporterRole' => $user['role'],
    'triggeredByLabel' => strtoupper($user['role']) . ' SOS',
    'source' => 'website_' . $user['role'],
    'platform' => 'website',
    'rideId' => $rideId,
    'ride_id' => $rideId,
    'rideCode' => $rideCode,
    'location' => ($lat !== null && $lng !== null) ? new GeoPoint($lat, $lng) : null,
    'locationText' => $location,
    'location_is_stale' => $lat === null || $lng === null,
    'status' => $status,
    'reporterName' => $user['role'] === 'driver' ? $driverName : $passengerName,
    'createdAt' => wow_now(),
    'created_at' => wow_now(),
    'resolved_at' => null,
    'resolved_by' => null,
    'updatedAt' => wow_now(),
];
$ref->set($alert);
$ref->collection('activityLog')->newDocument()->set(['type' => 'sos_triggered', 'message' => 'SOS triggered by ' . $user['role'], 'actorId' => $user['uid'], 'actorRole' => $user['role'], 'createdAt' => wow_now()]);
$ref->collection('activityLog')->newDocument()->set(['type' => 'admin_notified', 'message' => 'Admin safety dashboard notified in real time', 'actorRole' => 'system', 'createdAt' => wow_now()]);

wow_set_doc('rides', $rideId, [
    'sosActive' => true,
    'sosAlertId' => $alertId,
    'activeEmergencyAlertId' => $alertId,
    'sosTriggeredAt' => wow_now(),
    'updatedAt' => wow_now(),
], true);

$targets = [];
if ($user['role'] === 'passenger') {
    $docs = wow_firestore()->collection('passengers')->document($user['uid'])->collection('emergencyContacts')->limit(20)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $data = $doc->data();
        $targets[] = ['id' => $doc->id(), 'name' => (string)($data['name'] ?? ''), 'phone_number' => (string)($data['phoneNumber'] ?? '')];
    }
}

sos_json([
    'ok' => true,
    'message' => 'Alert Sent Successfully',
    'destination' => 'admin_safety_monitoring',
    'notified_count' => 1,
    'targets' => [],
    'alert' => ['id' => $alertId, 'alert_id' => $alertId, 'role' => $user['role'], 'ride_id' => $rideId, 'location' => $location, 'status' => $status, 'created_at' => date('Y-m-d H:i:s')],
]);
