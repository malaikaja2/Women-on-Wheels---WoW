<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

function ride_payment_number($value): ?float
{
    if (is_int($value) || is_float($value)) {
        $number = (float)$value;
    } elseif (is_string($value)) {
        $text = trim($value);
        if ($text === '' || preg_match('/^(?:nan|infinity|null|undefined|\[object object\])$/i', $text)) return null;
        $text = preg_replace('/^\s*(?:rs\.?|pkr)\s*/i', '', $text);
        $text = str_replace([',', ' '], '', (string)$text);
        if (!preg_match('/^\d+(?:\.\d+)?$/', $text)) return null;
        $number = (float)$text;
    } else {
        return null;
    }
    return is_finite($number) && $number >= 0 ? round($number, 2) : null;
}

function ride_payment_text(array $row, array $keys, string $fallback = ''): string
{
    foreach ($keys as $key) {
        $value = $row[$key] ?? null;
        if (is_scalar($value) && trim((string)$value) !== '') return trim((string)$value);
    }
    return $fallback;
}

function ride_commission_rate(): float
{
    try {
        $settings = wow_doc_data('appSettings', 'global') ?: [];
        $fareSettings = is_array($settings['fareSettings'] ?? null) ? $settings['fareSettings'] : [];
        $rawRate = ride_payment_number($fareSettings['platformCommissionPercent'] ?? null);
        if ($rawRate !== null) {
            if ($rawRate > 1 && $rawRate <= 100) $rawRate /= 100;
            if ($rawRate > 0 && $rawRate < 1) return $rawRate;
        }
    } catch (Throwable $error) {
        error_log('Ride commission setting unavailable; using 30%. ' . $error->getMessage());
    }
    return 0.30;
}

function ride_revenue_split(float $fare): array
{
    $rate = ride_commission_rate();
    $commission = round(max(0, $fare) * $rate, 2);
    $driverShare = round(max(0, $fare) - $commission, 2);
    $percent = round($rate * 100, 2);
    return [
        'commissionRate' => $percent,
        'commissionPercent' => $percent,
        'platformCommission' => $commission,
        'adminCommission' => $commission,
        'wowCommission' => $commission,
        'driverEarning' => $driverShare,
        'driverShare' => $driverShare,
    ];
}

function ride_successful_payment_status(string $status): bool
{
    return in_array(strtolower(trim($status)), [
        'paid', 'completed', 'success', 'successful', 'confirmed',
        'cash_collected', 'collected', 'received'
    ], true);
}

function ride_completed_fare(array $ride, array $updates = []): float
{
    foreach ([$updates, $ride] as $row) {
        foreach (['finalFare', 'acceptedFare', 'agreedFare', 'totalFare', 'fare', 'passengerOffer'] as $field) {
            $value = ride_payment_number($row[$field] ?? null);
            if ($value !== null && $value > 0) return $value;
        }
    }
    return 0.0;
}

function ride_sync_completed_payment(string $collectionName, string $docId, array $ride, array $updates = []): void
{
    if ($collectionName !== 'rides' || $docId === '') return;
    $mergedRide = array_merge($ride, $updates);
    $fare = ride_completed_fare($ride, $updates);
    if ($fare <= 0) return;

    $driverId = ride_payment_text($mergedRide, ['assignedDriverId', 'driverUid', 'driverId', 'driverID']);
    $passengerId = ride_payment_text($mergedRide, ['passengerId', 'passengerUid', 'userId']);
    if ($driverId === '' || $passengerId === '') return;

    $existing = wow_doc_data('payments', $docId) ?: [];
    $method = strtolower(ride_payment_text($existing, ['paymentMethod'], ride_payment_text($mergedRide, ['paymentMethod'], 'cash')));
    $method = $method !== '' ? $method : 'cash';
    $existingStatus = strtolower(ride_payment_text($existing, ['paymentStatus', 'status']));
    $rideStatus = strtolower(ride_payment_text($mergedRide, ['paymentStatus'], 'pending'));
    $paymentStatus = ride_successful_payment_status($existingStatus) ? 'paid' : (ride_successful_payment_status($rideStatus) ? 'paid' : 'pending');
    $split = ride_revenue_split($fare);
    $commissionStatus = ride_payment_text($existing, ['commissionStatus']);
    if ($commissionStatus === '') $commissionStatus = $paymentStatus === 'paid' && $method !== 'cash' ? 'collected' : 'pending';

    $record = array_merge([
        'paymentId' => $docId,
        'rideId' => $docId,
        'rideCode' => ride_payment_text($mergedRide, ['rideCode', 'bookingCode']),
        'passengerId' => $passengerId,
        'driverId' => $driverId,
        'passengerName' => ride_payment_text($mergedRide, ['passengerName', 'userName'], 'Passenger'),
        'driverName' => ride_payment_text($mergedRide, ['driverName', 'targetDriverName'], 'Driver'),
        'amount' => $fare,
        'finalFare' => $fare,
        'currency' => 'PKR',
        'paymentMethod' => $method,
        'paymentProvider' => $method === 'cash' ? 'cash' : $method,
        'paymentStatus' => $paymentStatus,
        'attemptStatus' => ride_payment_text($existing, ['attemptStatus'], $paymentStatus === 'paid' ? 'succeeded' : 'awaiting_payment'),
        'rideStatus' => 'completed',
        'commissionStatus' => $commissionStatus,
        'commissionCalculatedAt' => $existing['commissionCalculatedAt'] ?? wow_now(),
        'sourcePlatform' => ride_payment_text($mergedRide, ['lastUpdatedFrom'], 'driver_website'),
    ], $split);
    if (!empty($existing['transactionId'])) $record['transactionId'] = $existing['transactionId'];
    if ($paymentStatus === 'paid') {
        $record['paidAt'] = $existing['paidAt'] ?? wow_now();
    }
    wow_set_doc('payments', $docId, $record, true);
}

$input = fare_input();
$rideCode = fare_get_string($input, 'ride_code', '');
$rideId = trim((string)($input['ride_id'] ?? ''));
if ($rideCode === '' && $rideId === '') {
    fare_json(['ok' => false, 'error' => 'ride_identifier_required'], 422);
}

$requestedStatus = fare_get_string($input, 'status', 'in_progress');
$status = fare_normalize_ride_status($requestedStatus);
if (strtolower(trim($requestedStatus)) === 'driver_assigned') $status = 'accepted';
$allowedStatuses = ['pending', 'driver_selected', 'accepted', 'driver_arriving', 'arrived', 'ride_started', 'completed', 'cancelled'];
if (!in_array($status, $allowedStatuses, true)) {
    fare_json(['ok' => false, 'error' => 'invalid_status'], 422);
}

try {
    $docId = $rideId;
    $collectionName = 'rides';
    $ride = null;
    if ($docId !== '') {
        $snapshot = wow_firestore()->collection($collectionName)->document($docId)->snapshot();
        if ($snapshot->exists()) {
            $ride = $snapshot->data();
        } else {
            $legacySnapshot = wow_firestore()->collection('rideRequests')->document($docId)->snapshot();
            if ($legacySnapshot->exists()) {
                $collectionName = 'rideRequests';
                $ride = $legacySnapshot->data();
            }
        }
    }
    if (!$ride && $rideCode !== '') {
        $docs = wow_firestore()->collection($collectionName)->where('rideCode', '=', $rideCode)->limit(1)->documents();
        foreach ($docs as $doc) {
            if ($doc->exists()) {
                $docId = $doc->id();
                $ride = $doc->data();
                break;
            }
        }
        if (!$ride) {
            $legacyDocs = wow_firestore()->collection('rideRequests')->where('rideCode', '=', $rideCode)->limit(1)->documents();
            foreach ($legacyDocs as $doc) {
                if ($doc->exists()) {
                    $collectionName = 'rideRequests';
                    $docId = $doc->id();
                    $ride = $doc->data();
                    break;
                }
            }
        }
    }
    if (!$ride) fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);

    $currentStatus = fare_normalize_ride_status((string)($ride['status'] ?? 'pending'));
    if ($currentStatus === 'driver_assigned') $currentStatus = 'accepted';
    if ($status === $currentStatus) {
        if ($status === 'completed') {
            $settledFare = ride_completed_fare($ride);
            if ($settledFare > 0) {
                $split = ride_revenue_split($settledFare);
                wow_firestore()->collection($collectionName)->document($docId)->set(array_merge([
                    'finalFare' => $settledFare,
                    'commissionStatus' => ride_payment_text($ride, ['commissionStatus'], 'pending'),
                    'commissionCalculatedAt' => $ride['commissionCalculatedAt'] ?? wow_now(),
                    'updatedAt' => wow_now(),
                ], $split), ['merge' => true]);
                ride_sync_completed_payment($collectionName, $docId, $ride, array_merge(['finalFare' => $settledFare], $split));
            }
        }
        // Idempotent retry: do not replace accepted/completed timestamps or
        // trigger downstream earnings/history work a second time.
        fare_json([
            'ok' => true,
            'idempotent' => true,
            'ride_id' => $docId,
            'ride_code' => (string)($ride['rideCode'] ?? ''),
            'driver_id' => (string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? ''),
            'status' => $status,
            'fare' => $ride['finalFare'] ?? $ride['fare'] ?? 0,
            'payment_method' => (string)($ride['paymentMethod'] ?? ''),
        ]);
    }
    $transitions = [
        'pending' => ['accepted', 'cancelled'],
        'driver_selected' => ['accepted', 'cancelled'],
        'accepted' => ['driver_arriving', 'arrived', 'ride_started', 'cancelled'],
        'driver_arriving' => ['arrived', 'ride_started', 'cancelled'],
        'arrived' => ['ride_started', 'cancelled'],
        'ride_started' => ['completed', 'cancelled'],
        'completed' => [],
        'cancelled' => [],
    ];
    if ($status !== $currentStatus && !in_array($status, $transitions[$currentStatus] ?? [], true)) {
        fare_json(['ok' => false, 'error' => 'invalid_status_transition', 'from' => $currentStatus, 'to' => $status], 409);
    }

    $actorRole = strtolower(fare_get_string($input, 'role', fare_get_string($input, 'user_role', '')));
    $driverUid = fare_resolve_user_id($conn, 'driver', $input);
    if ($driverUid === '') {
        $driverUid = trim((string)($input['driver_id'] ?? $input['driver_uid'] ?? ''));
    }

    if (in_array($status, ['accepted', 'driver_arriving', 'arrived', 'ride_started', 'completed'], true)) {
        if ($actorRole !== 'driver') {
            fare_json(['ok' => false, 'error' => 'driver_role_required'], 403);
        }
        if ($driverUid === '' && empty($ride['driverUid']) && empty($ride['assignedDriverId']) && empty($ride['targetDriverUid'])) {
            fare_json(['ok' => false, 'error' => 'driver_required_for_status'], 422);
        }
        $actingDriverUid = $driverUid !== '' ? $driverUid : (string)($ride['driverUid'] ?? $ride['assignedDriverId'] ?? $ride['targetDriverUid'] ?? '');
        if ($currentStatus === 'pending' && $status === 'accepted' && !empty($ride['targetDriverUid']) && $actingDriverUid !== (string)$ride['targetDriverUid']) {
            fare_json(['ok' => false, 'error' => 'ride_not_assigned_to_driver'], 403);
        }
        $existingDriverUid = (string)($ride['driverUid'] ?? $ride['assignedDriverId'] ?? '');
        if ($existingDriverUid !== '' && $actingDriverUid !== $existingDriverUid) {
            fare_json(['ok' => false, 'error' => 'ride_owned_by_other_driver'], 403);
        }
        $driverUid = $actingDriverUid;
    }

    if ($status === 'cancelled' && strtolower(trim((string)($input['cancel_mode'] ?? ''))) === 'remove_pending' && $currentStatus === 'pending') {
        wow_delete_doc($collectionName, $docId);
        fare_json(['ok' => true, 'ride_id' => $docId, 'ride_code' => (string)($ride['rideCode'] ?? ''), 'status' => 'cancelled', 'removed' => true]);
    }

    $updates = [
        'status' => $status,
        'updatedAt' => wow_now(),
    ];
    $updateSource = strtolower(fare_get_string($input, 'source_platform', fare_get_string($input, 'platform', '')));
    if ($updateSource !== '') $updates['lastUpdatedFrom'] = $updateSource;
    // Keep the mobile API vocabulary compatible with the canonical web queue.
    if ($collectionName === 'rides') {
        $canonicalStatuses = [
            'pending' => 'searching',
            'driver_selected' => 'driver_assigned',
            'accepted' => 'driver_assigned',
            'driver_arriving' => 'driver_arriving',
            'arrived' => 'arrived',
            'ride_started' => 'started',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
        ];
        $updates['status'] = $canonicalStatuses[$status] ?? $status;
        if (in_array($status, ['driver_selected', 'accepted'], true)) $updates['requestStatus'] = 'matched';
        if ($status === 'cancelled') $updates['requestStatus'] = 'closed';
    }
    if ($driverUid !== '') {
        $updates['driverID'] = $driverUid;
        $updates['driverUid'] = $driverUid;
        if ($collectionName === 'rides') $updates['assignedDriverId'] = $driverUid;
        $updates['targetDriverUid'] = $ride['targetDriverUid'] ?? $driverUid;
        $driver = wow_doc_data('drivers', $driverUid);
        $updates['targetDriverName'] = fare_get_string($input, 'target_driver_name', (string)($driver['name'] ?? $ride['targetDriverName'] ?? ''));
        $updates['driverName'] = fare_get_string($input, 'driver_name', (string)($driver['name'] ?? $updates['targetDriverName'] ?? 'Driver'));
        $updates['driverPhone'] = fare_get_string($input, 'driver_phone', (string)($driver['phone'] ?? ''));
        $updates['vehicleInfo'] = [
            'type' => (string)($driver['vehicleType'] ?? $ride['vehicleType'] ?? ''),
            'number' => (string)($driver['vehicleNumber'] ?? ''),
            'model' => (string)($driver['vehicleModel'] ?? $driver['vehicle'] ?? ''),
            'color' => (string)($driver['vehicleColor'] ?? ''),
        ];
    }
    foreach ([
        'fare' => 'fare',
        'offered_fare' => 'offeredFare',
        'distance_km' => 'distanceKm',
        'duration_min' => 'durationMin',
    ] as $inputKey => $field) {
        $value = fare_get_float($input, $inputKey);
        if ($value !== null) $updates[$field] = $value;
    }
    if (fare_get_string($input, 'vehicle_type', '') !== '') $updates['vehicleType'] = fare_normalize_vehicle(fare_get_string($input, 'vehicle_type', ''));
    if (fare_get_string($input, 'traffic_level', '') !== '') $updates['trafficLevel'] = fare_normalize_traffic(fare_get_string($input, 'traffic_level', ''));
    if (fare_get_string($input, 'time_of_day', '') !== '') $updates['timeOfDay'] = fare_normalize_time_of_day(fare_get_string($input, 'time_of_day', ''));
    if (fare_get_string($input, 'payment_method', '') !== '') $updates['paymentMethod'] = strtolower(fare_get_string($input, 'payment_method', ''));
    if (fare_get_string($input, 'payment_label', '') !== '') $updates['paymentLabel'] = fare_get_string($input, 'payment_label', '');
    if ($status === 'accepted') {
        $updates['acceptedAt'] = wow_now();
        $updates['acceptedTime'] = $updates['acceptedAt'];
    }
    if ($status === 'driver_arriving') {
        $updates['driverArrivingAt'] = wow_now();
        $updates['driverArrivingTime'] = $updates['driverArrivingAt'];
    }
    if ($status === 'arrived') {
        $updates['arrivedAt'] = wow_now();
        $updates['driverArrivedAt'] = $updates['arrivedAt'];
    }
    if ($status === 'ride_started') {
        $updates['startedAt'] = wow_now();
        $updates['startedTime'] = $updates['startedAt'];
    }
    if ($status === 'completed') {
        $updates['rideStatus'] = 'completed';
        $updates['completedAt'] = wow_now();
        $updates['completedTime'] = $updates['completedAt'];
        $settledFare = $ride['finalFare'] ?? $ride['acceptedFare'] ?? $ride['agreedFare'] ?? $ride['totalFare'] ?? $updates['fare'] ?? $ride['fare'] ?? 0;
        $updates['finalFare'] = max(0, round((float)$settledFare, 2));
        if ($updates['finalFare'] > 0) {
            $updates = array_merge($updates, ride_revenue_split((float)$updates['finalFare']));
            $updates['commissionStatus'] = ride_payment_text($ride, ['commissionStatus'], 'pending');
            $updates['commissionCalculatedAt'] = $ride['commissionCalculatedAt'] ?? wow_now();
        }
        if (strtolower((string)($ride['paymentStatus'] ?? '')) !== 'paid') {
            $updates['paymentStatus'] = 'pending';
            $updates['paymentUpdatedAt'] = wow_now();
        }
    }

    $driverPresenceUid = $driverUid !== '' ? $driverUid : wow_ride_driver_uid($ride);
    $driverUpdates = [];
    if ($collectionName === 'rides' && $driverPresenceUid !== '') {
        if (in_array($status, ['accepted', 'driver_arriving', 'arrived', 'ride_started'], true)) {
            $driverUpdates = [
                'currentRideId' => $docId,
                'isOnline' => true,
                'isAvailable' => false,
                'status' => 'busy',
                'updatedAt' => wow_now(),
            ];
        } elseif (in_array($status, ['completed', 'cancelled'], true)) {
            $driverProfile = wow_doc_data('drivers', $driverPresenceUid) ?: [];
            $currentRideId = trim((string)($driverProfile['currentRideId'] ?? ''));
            if ($currentRideId === '' || $currentRideId === $docId) {
                $driverOnline = filter_var($driverProfile['isOnline'] ?? true, FILTER_VALIDATE_BOOLEAN);
                $driverUpdates = [
                    'currentRideId' => null,
                    'isAvailable' => $driverOnline,
                    'status' => $driverOnline ? 'online' : 'offline',
                    'updatedAt' => wow_now(),
                ];
            }
        }
    }

    $writes = [[
        'path' => $collectionName . '/' . $docId,
        'data' => $updates,
        'merge' => true,
    ]];
    if ($driverUpdates) {
        $writes[] = [
            'path' => 'drivers/' . $driverPresenceUid,
            'data' => $driverUpdates,
            'merge' => true,
        ];
    }
    wow_firestore()->batchSetDocuments($writes);
    if ($status === 'completed') {
        ride_sync_completed_payment($collectionName, $docId, $ride, $updates);
    }

    fare_json([
        'ok' => true,
        'ride_id' => $docId,
        'ride_code' => (string)($ride['rideCode'] ?? ''),
        'driver_id' => $updates['driverUid'] ?? ($ride['driverUid'] ?? ''),
        'target_driver_id' => $updates['targetDriverUid'] ?? ($ride['targetDriverUid'] ?? ''),
        'target_driver_name' => $updates['targetDriverName'] ?? ($ride['targetDriverName'] ?? ''),
        'status' => $status,
        'fare' => $updates['fare'] ?? ($ride['fare'] ?? 0),
        'offered_fare' => $updates['offeredFare'] ?? ($ride['offeredFare'] ?? null),
        'payment_method' => $updates['paymentMethod'] ?? ($ride['paymentMethod'] ?? ''),
        'payment_label' => $updates['paymentLabel'] ?? ($ride['paymentLabel'] ?? ''),
    ]);
} catch (Throwable $exception) {
    error_log('Firestore ride update failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'update_failed'], 500);
}
