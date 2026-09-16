<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';
require_once __DIR__ . '/../admin/financial_service.php';

$input = array_merge($_GET, $_POST, fare_input());
$driverUid = fare_resolve_user_id($conn, 'driver', $input);
if ($driverUid === '') fare_json(['ok' => false, 'error' => 'driver_required'], 422);

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

$hasPresenceInput = array_key_exists('online', $input) || array_key_exists('available', $input);
$online = in_array(strtolower((string)($input['online'] ?? '1')), ['1', 'true', 'yes', 'online'], true);
$available = in_array(strtolower((string)($input['available'] ?? '1')), ['1', 'true', 'yes', 'available'], true);
$lat = fare_get_float($input, 'lat');
$lng = fare_get_float($input, 'lng');

$timestampMillis = static function ($value): int {
    if ($value instanceof \Google\Cloud\Core\Timestamp) return $value->get()->getTimestamp() * 1000;
    if ($value instanceof \DateTimeInterface) return $value->getTimestamp() * 1000;
    if (is_numeric($value)) {
        $number = (int)$value;
        return $number > 20000000000 ? $number : $number * 1000;
    }
    if (is_string($value) && trim($value) !== '') {
        $seconds = strtotime($value);
        return $seconds === false ? 0 : $seconds * 1000;
    }
    return 0;
};

$queryRows = static function (string $collection, string $field, string $value, int $limit = 120): array {
    $value = trim($value);
    if ($value === '') return [];
    $rows = [];
    foreach (wow_firestore()->collection($collection)->where($field, '=', $value)->limit($limit)->documents() as $document) {
        if (!$document->exists()) continue;
        $row = $document->data();
        $row['uid'] = $document->id();
        $rows[] = $row;
    }
    return $rows;
};

$mergeRows = static function (array &$target, array $rows): void {
    foreach ($rows as $row) {
        $key = (string)($row['uid'] ?? $row['rideId'] ?? $row['rideCode'] ?? '');
        if ($key !== '') $target[$key] = $row;
    }
};

try {
    if ($hasPresenceInput) {
        wow_set_doc('drivers', $driverUid, [
            'isOnline' => $online,
            'isAvailable' => $available,
            'currentLocation' => ['lat' => $lat, 'lng' => $lng, 'latitude' => $lat, 'longitude' => $lng],
            'updatedAt' => wow_now(),
        ], true);
    }

    $driver = wow_doc_data('drivers', $driverUid) ?: $driverProfile;
    $staleCurrentRideId = trim((string)($driver['currentRideId'] ?? ''));
    if ($staleCurrentRideId !== '') {
        $currentRide = wow_doc_data('rides', $staleCurrentRideId);
        $currentStatus = strtolower(trim((string)($currentRide['status'] ?? '')));
        $futureScheduledAssignment = $currentRide
            && in_array($currentStatus, ['driver_assigned', 'accepted'], true)
            && $timestampMillis($currentRide['scheduledAt'] ?? null) > ((int)round(microtime(true) * 1000) + 30 * 60 * 1000);
        if (!$currentRide || $futureScheduledAssignment || in_array($currentStatus, [
            'completed', 'ride_completed', 'cancelled', 'canceled',
            'expired', 'rejected', 'no_driver_found'
        ], true)) {
            wow_set_doc('drivers', $driverUid, [
                'currentRideId' => null,
                'status' => $online ? 'online' : 'offline',
                'isAvailable' => $available,
                'updatedAt' => wow_now(),
            ], true);
            $driver['currentRideId'] = null;
            $driver['status'] = $online ? 'online' : 'offline';
            $driver['isAvailable'] = $available;
        }
    }
    $driverVehicleInfo = is_array($driver['vehicleInfo'] ?? null) ? $driver['vehicleInfo'] : [];
    $driverVehicleDetails = is_array($driver['vehicleDetails'] ?? null) ? $driver['vehicleDetails'] : [];
    $driverVehicleObject = is_array($driver['vehicle'] ?? null) ? $driver['vehicle'] : [];
    $driverVehicleCandidates = [
        $driver['driverVehicleType'] ?? null,
        $driver['vehicleType'] ?? null,
        $driver['vehicle_type'] ?? null,
        $driverVehicleInfo['type'] ?? null,
        $driverVehicleDetails['type'] ?? null,
        $driverVehicleObject['type'] ?? null,
        $driverProfile['driverVehicleType'] ?? null,
        $driverProfile['vehicleType'] ?? null,
        $driverProfile['vehicle_type'] ?? null,
    ];
    $driverVehicleRaw = 'car';
    foreach ($driverVehicleCandidates as $candidate) {
        if (is_scalar($candidate) && trim((string)$candidate) !== '') {
            $driverVehicleRaw = (string)$candidate;
            break;
        }
    }
    $driverVehicleType = fare_normalize_vehicle($driverVehicleRaw);
    // New web/mobile clients use `rides`; keep legacy requests visible too.
    // Keep this dashboard fallback targeted. Firestore listeners are primary,
    // so the PHP endpoint should not scan every ride/payment document whenever
    // a driver opens or wakes the dashboard.
    $ridesById = [];
    foreach (['rides', 'rideRequests'] as $collectionName) {
        foreach (['assignedDriverId', 'driverUid', 'driverId', 'targetDriverUid', 'targetDriverId'] as $field) {
            $mergeRows($ridesById, $queryRows($collectionName, $field, $driverUid, 120));
        }
    }
    foreach (['searching', 'requested', 'pending', 'finding_driver', 'searching_driver', 'scheduled'] as $openStatus) {
        $mergeRows($ridesById, $queryRows('rides', 'status', $openStatus, 80));
        $mergeRows($ridesById, $queryRows('rideRequests', 'status', $openStatus, 80));
    }
    $rides = array_values($ridesById);
    $requests = [];
    $history = [];
    $activeRide = null;
    $total = $today = $week = $month = 0.0;
    $completedCount = 0;
    $todayKey = date('Y-m-d');
    $weekKey = date('o-W');
    $monthKey = date('Y-m');

    foreach ($rides as $ride) {
        $rawStatus = strtolower(trim((string)($ride['status'] ?? '')));
        $scheduledAt = $ride['scheduledAt'] ?? null;
        // Keep scheduled requests scheduled until a driver accepts them. The
        // realtime listener already exposes matching future requests.
        $status = fare_normalize_ride_status((string)($ride['status'] ?? 'pending'));
        $target = (string)($ride['targetDriverUid'] ?? $ride['targetDriverId'] ?? '');
        $assigned = (string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? '');
        $matches = $assigned === $driverUid || $target === $driverUid || ($assigned === '' && $target === '');
        if (!$matches) continue;

        $row = [
            'id' => (string)($ride['uid'] ?? ''),
            'ride_code' => (string)($ride['rideCode'] ?? ''),
            'passenger_id' => (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? ''),
            'driver_id' => $assigned,
            'pickup' => (string)($ride['pickupName'] ?? $ride['pickupAddress'] ?? $ride['pickup'] ?? ''),
            'dropoff' => (string)($ride['destinationName'] ?? $ride['destinationAddress'] ?? $ride['dropoffAddress'] ?? $ride['dropoff'] ?? ''),
            'pickup_lat' => $ride['pickupLat'] ?? $ride['pickupLatitude'] ?? null,
            'pickup_lng' => $ride['pickupLng'] ?? $ride['pickupLongitude'] ?? null,
            'drop_lat' => $ride['dropLat'] ?? $ride['dropoffLatitude'] ?? null,
            'drop_lng' => $ride['dropLng'] ?? $ride['dropoffLongitude'] ?? null,
            'distance_km' => $ride['distanceKm'] ?? 0,
            'duration_min' => $ride['durationMinutes'] ?? $ride['durationMin'] ?? 0,
            'vehicle_type' => (string)($ride['requestedVehicleType'] ?? $ride['vehicleInfo']['type'] ?? $ride['vehicleType'] ?? $driver['vehicleType'] ?? 'car'),
            'fare' => $ride['finalFare'] ?? $ride['fare'] ?? 0,
            'offered_fare' => $ride['passengerOffer'] ?? $ride['offeredFare'] ?? null,
            'payment_method' => (string)($ride['paymentMethod'] ?? 'online'),
            'payment_label' => (string)($ride['paymentLabel'] ?? ''),
            'target_driver_id' => (string)($ride['targetDriverUid'] ?? ''),
            'target_driver_name' => (string)($ride['targetDriverName'] ?? ''),
            'status' => $status,
            'created_at' => wow_timestamp_to_string($ride['createdAt'] ?? ''),
            'updated_at' => wow_timestamp_to_string($ride['updatedAt'] ?? ''),
            'completed_at' => wow_timestamp_to_string($ride['completedAt'] ?? ''),
            'scheduled_at' => wow_timestamp_to_string($ride['scheduledAt'] ?? ''),
            'expires_at' => wow_timestamp_to_string($ride['expiresAt'] ?? ''),
            'passenger_name' => (string)($ride['passengerName'] ?? 'Passenger'),
            'passenger_phone' => '',
        ];

        $rideVehicleType = fare_normalize_vehicle((string)($ride['requestedVehicleType'] ?? $ride['vehicleInfo']['type'] ?? $ride['vehicleType'] ?? $driverVehicleType));
        $nowMs = (int)round(microtime(true) * 1000);
        $scheduledMs = $timestampMillis($ride['scheduledAt'] ?? null);
        $expiresMs = $timestampMillis($ride['expiresAt'] ?? null);
        $createdMs = $timestampMillis($ride['createdAt'] ?? $ride['requestedAt'] ?? null);
        $freshInstant = $expiresMs > 0 ? $expiresMs > $nowMs : ($createdMs > 0 && ($nowMs - $createdMs) <= 600000);
        $freshScheduled = $scheduledMs > 0 && ($scheduledMs + 600000) >= $nowMs;
        $actionable = $freshScheduled || $freshInstant;
        // Online status alone controls request visibility. `isAvailable` can
        // become stale after navigation/reload and must not hide open rides.
        if (in_array($status, ['pending', 'searching'], true) && $assigned === '' && $target === '' && $rideVehicleType === $driverVehicleType && $online && $actionable) $requests[] = $row;
        if (in_array($status, ['driver_assigned', 'accepted', 'driver_arriving', 'ride_started'], true) && $assigned === $driverUid) $activeRide = $row;
        if (in_array($status, ['completed', 'cancelled'], true) && $assigned === $driverUid) {
            $history[] = $row;
            if ($status === 'completed') {
                $completedCount++;
                $fare = (float)($ride['finalFare'] ?? $ride['fare'] ?? 0);
                $total += $fare;
                $completed = $ride['completedAt'] ?? $ride['updatedAt'] ?? null;
                if ($completed instanceof \Google\Cloud\Core\Timestamp) {
                    if ($completed->get()->format('Y-m-d') === $todayKey) $today += $fare;
                    if ($completed->get()->format('o-W') === $weekKey) $week += $fare;
                    if ($completed->get()->format('Y-m') === $monthKey) $month += $fare;
                }
            }
        }
    }

    // Calculate the driver's share from the authoritative completed ride.
    // A payment document verifies settlement when present; older records may
    // carry the confirmed payment status on the ride itself.
    $total = $today = $week = $month = 0.0;
    $configuredCommissionRate = wow_financial_commission_rate();
    $successfulPaymentStatuses = ['paid', 'completed', 'success', 'successful', 'confirmed', 'cash_collected', 'collected', 'received'];
    $paymentsByRide = [];
    foreach ($queryRows('payments', 'driverId', $driverUid, 200) as $payment) {
        if (wow_financial_is_test($payment)) continue;
        $paymentRideId = trim((string)($payment['rideId'] ?? $payment['uid'] ?? ''));
        if ($paymentRideId !== '') $paymentsByRide[$paymentRideId] = $payment;
    }
    $countedEarningRides = [];
    foreach ($rides as $ride) {
        $rideStatus = fare_normalize_ride_status((string)($ride['status'] ?? ''));
        if ($rideStatus !== 'completed' || wow_financial_is_test($ride)) continue;
        $assignedDriver = trim((string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? ''));
        if ($assignedDriver !== $driverUid) continue;
        $rideDocumentId = trim((string)($ride['uid'] ?? $ride['rideId'] ?? ''));
        if ($rideDocumentId === '' || isset($countedEarningRides[$rideDocumentId])) continue;
        $countedEarningRides[$rideDocumentId] = true;
        $rideId = trim((string)($ride['rideId'] ?? $rideDocumentId));
        $payment = $paymentsByRide[$rideDocumentId] ?? $paymentsByRide[$rideId] ?? [];
        $paymentDriver = trim((string)($payment['driverId'] ?? $payment['driverUid'] ?? $payment['assignedDriverId'] ?? ''));
        if ($payment && $paymentDriver !== '' && $paymentDriver !== $driverUid) continue;
        if (!wow_financial_has_commission_metadata($ride, $payment)) continue;
        $paymentStatus = wow_financial_normalize((string)($payment['paymentStatus'] ?? $payment['status'] ?? $ride['paymentStatus'] ?? ''));
        $cashConfirmed = ($ride['cashCollected'] ?? false) === true
            || ($ride['cashConfirmed'] ?? false) === true
            || ($ride['paymentConfirmed'] ?? false) === true
            || ($ride['isPaid'] ?? false) === true;
        if (!in_array($paymentStatus, $successfulPaymentStatuses, true) && !$cashConfirmed) continue;
        $fare = wow_financial_fare($ride);
        $paidFare = $fare['value'];
        if ($paidFare === null || $paidFare <= 0) continue;
        $earning = wow_financial_number($payment['driverEarning'] ?? $payment['driverShare'] ?? $ride['driverEarning'] ?? $ride['driverShare'] ?? null);
        if ($earning === null) $earning = round($paidFare * (1 - $configuredCommissionRate), 2);
        $total += $earning;
        $earnedAt = wow_financial_timestamp($ride['completedAt'] ?? $payment['paidAt'] ?? $payment['collectedAt'] ?? $ride['updatedAt'] ?? null);
        if ($earnedAt) {
            $localEarnedAt = $earnedAt->setTimezone(new DateTimeZone('Asia/Karachi'));
            if ($localEarnedAt->format('Y-m-d') === $todayKey) $today += $earning;
            if ($localEarnedAt->format('o-W') === $weekKey) $week += $earning;
            if ($localEarnedAt->format('Y-m') === $monthKey) $month += $earning;
        }
    }

    $reviews = [];
    $sum = 0;
    $reviewDocs = wow_firestore()->collection('rideReviews')->where('driverUid', '=', $driverUid)->limit(20)->documents();
    foreach ($reviewDocs as $doc) {
        if (!$doc->exists()) continue;
        $r = $doc->data();
        $rating = (int)($r['rating'] ?? 0);
        $sum += $rating;
        $reviews[] = [
            'id' => $doc->id(),
            'rating' => $rating,
            'review_text' => (string)($r['reviewText'] ?? ''),
            'created_at' => wow_timestamp_to_string($r['createdAt'] ?? ''),
            'passenger_name' => 'Passenger',
        ];
    }

    $lostFoundCases = [];
    $lostFoundById = [];
    foreach (['driverId', 'driverUid', 'assignedDriverId', 'driverID'] as $field) {
        $mergeRows($lostFoundById, $queryRows('lost_found_cases', $field, $driverUid, 100));
    }
    foreach (array_values($lostFoundById) as $case) {
        $caseDriver = trim((string)($case['driverId'] ?? $case['driverUid'] ?? $case['assignedDriverId'] ?? $case['driverID'] ?? ''));
        if ($caseDriver !== $driverUid) continue;
        $lostFoundCases[] = [
            'id' => (string)($case['uid'] ?? ''),
            'caseId' => (string)($case['caseId'] ?? $case['uid'] ?? ''),
            'rideId' => (string)($case['rideId'] ?? $case['completedRideId'] ?? ''),
            'passengerId' => (string)($case['passengerId'] ?? $case['passengerUid'] ?? ''),
            'driverId' => $driverUid,
            'passengerName' => (string)($case['passengerName'] ?? 'Passenger'),
            'itemName' => (string)($case['itemName'] ?? $case['item'] ?? 'Lost item'),
            'category' => (string)($case['category'] ?? $case['itemCategory'] ?? 'Other'),
            'description' => (string)($case['description'] ?? $case['itemDescription'] ?? ''),
            'status' => (string)($case['status'] ?? 'Reported'),
            'driverResponse' => (string)($case['driverResponse'] ?? ''),
            'rideDate' => wow_timestamp_to_string($case['rideDate'] ?? ''),
            'createdAt' => wow_timestamp_to_string($case['createdAt'] ?? ''),
            'updatedAt' => wow_timestamp_to_string($case['updatedAt'] ?? ''),
            'ridePickup' => (string)($case['ridePickup'] ?? $case['pickupAddress'] ?? ''),
            'rideDropoff' => (string)($case['rideDropoff'] ?? $case['dropoffAddress'] ?? ''),
            'returnMeeting' => (array)($case['returnMeeting'] ?? []),
            'returnLocation' => (string)($case['returnLocation'] ?? ''),
            'returnDate' => (string)($case['returnDate'] ?? ''),
            'returnTime' => (string)($case['returnTime'] ?? ''),
        ];
    }
    usort($lostFoundCases, static fn(array $a, array $b): int => strcmp($b['updatedAt'] ?: $b['createdAt'], $a['updatedAt'] ?: $a['createdAt']));

    fare_json([
        'ok' => true,
        'driver' => $driver,
        'requests' => $requests,
        'active_ride' => $activeRide,
        'history' => $history,
        'summary' => [
            'today' => round($today, 2),
            'week' => round($week, 2),
            'month' => round($month, 2),
            'total' => round($total, 2),
            'completed_count' => $completedCount,
        ],
        'rating_summary' => ['avg_rating' => count($reviews) ? round($sum / count($reviews), 2) : 0, 'total_reviews' => count($reviews)],
        'recent_reviews' => $reviews,
        'lost_found_cases' => $lostFoundCases,
        'lost_found_summary' => [
            'total' => count($lostFoundCases),
            'open' => count(array_filter($lostFoundCases, static fn(array $case): bool => !in_array(strtolower($case['status']), ['closed','resolved','cancelled','canceled','rejected'], true))),
        ],
    ]);
} catch (Throwable $exception) {
    error_log('Firestore driver dashboard failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'driver_dashboard_failed'], 500);
}
