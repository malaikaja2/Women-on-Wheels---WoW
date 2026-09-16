<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

$input = fare_input();
$driverUid = fare_resolve_user_id($conn, 'driver', $input);
if ($driverUid === '') {
    fare_json(['ok' => false, 'error' => 'driver_required'], 422);
}

$driverProfile = wow_get_driver_profile($driverUid, true) ?: [];
$verificationStatus = strtolower((string)($driverProfile['verificationStatus'] ?? 'approved'));
$driverRole = strtolower((string)($driverProfile['role'] ?? ''));
$driverGender = strtolower((string)($driverProfile['gender'] ?? ''));
$isApproved = wow_driver_is_approved($driverProfile);
if ($driverGender !== '' && $driverGender !== 'female') {
    fare_json(['ok' => false, 'error' => 'female_driver_required'], 403);
}
if ($driverRole === 'driver_applicant' || !$isApproved) {
    $error = $verificationStatus === 'rejected' ? 'driver_rejected' : 'driver_pending';
    fare_json(['ok' => false, 'error' => $error], 403);
}

$rawOnline = $input['online'] ?? $input['is_online'] ?? null;
$isOnline = $rawOnline === null ? true : in_array(strtolower(trim((string)$rawOnline)), ['1', 'true', 'yes', 'online'], true);
$rawAvailable = $input['available'] ?? $input['is_available'] ?? null;
$isAvailable = $rawAvailable === null ? true : in_array(strtolower(trim((string)$rawAvailable)), ['1', 'true', 'yes', 'available'], true);
$lat = fare_get_float($input, 'lat');
$lng = fare_get_float($input, 'lng');

try {
    $hasKnownRide = trim((string)($driverProfile['currentRideId'] ?? '')) !== '';
    $activeRideId = ($isOnline || $hasKnownRide) ? wow_driver_active_ride_id($driverUid, $driverProfile) : '';
    if ($activeRideId !== '') {
        $isAvailable = false;
    }
    $driverStatus = $activeRideId !== '' ? 'busy' : ($isOnline ? ($isAvailable ? 'online' : 'busy') : 'offline');
    $update = [
        'isOnline' => $isOnline,
        'isAvailable' => $isAvailable,
        'currentRideId' => $activeRideId !== '' ? $activeRideId : null,
        'status' => $driverStatus,
        'currentLocation' => ['lat' => $lat, 'lng' => $lng, 'latitude' => $lat, 'longitude' => $lng],
        'lastLocationUpdate' => wow_now(),
    ];
    if ($isOnline) {
        $update['lastOnlineAt'] = wow_now();
    } else {
        $update['lastOfflineAt'] = wow_now();
    }
    wow_set_doc('drivers', $driverUid, $update);

    fare_json([
        'ok' => true,
        'driver_id' => $driverUid,
        'uid' => $driverUid,
        'is_online' => $isOnline,
        'is_available' => $isAvailable,
        'current_ride_id' => $activeRideId,
        'lat' => $lat,
        'lng' => $lng,
    ]);
} catch (Throwable $exception) {
    error_log('Firestore driver presence update failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'update_failed'], 500);
}
