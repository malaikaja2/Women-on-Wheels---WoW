<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

$input = fare_input();

$passengerUid = fare_resolve_user_id($conn, 'passenger', $input);
if ($passengerUid === '') {
    fare_json(['ok' => false, 'error' => 'passenger_required'], 422);
}

$rideCode = fare_get_string($input, 'ride_code', '');
if ($rideCode === '') {
    $rideCode = 'WOW-' . date('YmdHis') . '-' . random_int(100, 999);
}

$pickup = fare_get_string($input, 'pickup', fare_get_string($input, 'pickup_location', ''));
$dropoff = fare_get_string($input, 'drop', fare_get_string($input, 'drop_location', ''));
if ($pickup === '' || $dropoff === '') {
    fare_json(['ok' => false, 'error' => 'pickup_drop_required'], 422);
}
$pickupAddress = fare_get_string($input, 'pickup_address', $pickup);
$dropoffAddress = fare_get_string($input, 'drop_address', $dropoff);
$pickupPlaceName = fare_get_string($input, 'pickup_place_name', $pickup);
$dropoffPlaceName = fare_get_string($input, 'dropoff_place_name', $dropoff);
$pickupMapboxId = fare_get_string($input, 'pickup_mapbox_id', '');
$dropoffMapboxId = fare_get_string($input, 'dropoff_mapbox_id', '');
$pickupPlaceType = fare_get_string($input, 'pickup_place_type', '');
$dropoffPlaceType = fare_get_string($input, 'dropoff_place_type', '');

$driverUid = null;
$targetDriverUid = null;

$pickupLat = fare_get_float($input, 'pickup_lat');
$pickupLng = fare_get_float($input, 'pickup_lng');
$dropLat = fare_get_float($input, 'drop_lat');
$dropLng = fare_get_float($input, 'drop_lng');
if ($pickupLat === null || $pickupLng === null) {
    $point = fare_point_from_text($pickup);
    $pickupLat = (float)$point['lat'];
    $pickupLng = (float)$point['lng'];
}
if ($dropLat === null || $dropLng === null) {
    $point = fare_point_from_text($dropoff);
    $dropLat = (float)$point['lat'];
    $dropLng = (float)$point['lng'];
}

$distanceKm = (float)(fare_get_float($input, 'distance_km') ?? 0.0);
$durationMin = (float)(fare_get_float($input, 'duration_min') ?? 0.0);
if ($distanceKm <= 0 || $durationMin <= 0) {
    $distanceData = fare_distance_duration($input);
    $distanceKm = (float)$distanceData['distance_km'];
    $durationMin = (float)$distanceData['duration_min'];
}

$vehicleType = fare_normalize_vehicle(fare_get_string($input, 'vehicle_type', 'car'));
$trafficLevel = fare_normalize_traffic(fare_get_string($input, 'traffic_level', ''));
$timeOfDay = fare_normalize_time_of_day(fare_get_string($input, 'time_of_day', ''));
$paymentMethod = strtolower(fare_get_string($input, 'payment_method', 'online'));
if (!in_array($paymentMethod, ['cash', 'easypaisa', 'jazzcash', 'nayapay', 'online'], true)) $paymentMethod = 'online';
$paymentLabel = fare_get_string($input, 'payment_label', ucfirst($paymentMethod));

$fare = fare_get_float($input, 'fare');
if ($fare === null || $fare <= 0) {
    $estimated = fare_estimate($distanceKm, $durationMin, $vehicleType, $trafficLevel, $timeOfDay);
    $fare = (float)$estimated['estimated_fare'];
}
$fare = round(max(1, $fare), 2);
$offeredFare = fare_get_float($input, 'offered_fare');
$offeredFare = $offeredFare !== null ? round(max(0, $offeredFare), 2) : $fare;

$rideType = 'single';
$totalSeatsHint = (int)($input['total_seats'] ?? 0);
if (strtolower((string)($input['ride_type'] ?? '')) === 'carpool' || $totalSeatsHint > 1) {
    $rideType = 'carpool';
}

$scheduledDate = fare_get_string($input, 'scheduled_date', '');
$scheduledAtRaw = fare_get_string($input, 'scheduled_at', '');
$scheduledAt = null;
if ($scheduledDate !== '') {
    $scheduledDateObj = DateTimeImmutable::createFromFormat('!Y-m-d', $scheduledDate);
    if (!$scheduledDateObj || $scheduledDateObj->format('Y-m-d') !== $scheduledDate) {
        fare_json(['ok' => false, 'error' => 'invalid_scheduled_date'], 422);
    }
} elseif ($scheduledAtRaw !== '') {
    try {
        $scheduledAt = new DateTimeImmutable($scheduledAtRaw);
        $scheduledDate = $scheduledAt->format('Y-m-d');
        $scheduledDateObj = DateTimeImmutable::createFromFormat('!Y-m-d', $scheduledDate);
    } catch (Throwable $exception) {
        fare_json(['ok' => false, 'error' => 'invalid_scheduled_date'], 422);
    }
} else {
    $scheduledDateObj = null;
}

if ($scheduledDateObj instanceof DateTimeImmutable && $scheduledDateObj < new DateTimeImmutable('today')) {
    fare_json(['ok' => false, 'error' => 'scheduled_date_in_past'], 422);
}

if ($scheduledAtRaw !== '' && !$scheduledAt instanceof DateTimeImmutable) {
    try {
        $scheduledAt = new DateTimeImmutable($scheduledAtRaw);
    } catch (Throwable $exception) {
        fare_json(['ok' => false, 'error' => 'invalid_scheduled_date'], 422);
    }
}
if ($scheduledAt instanceof DateTimeImmutable && $scheduledAt <= new DateTimeImmutable('now')) {
    fare_json(['ok' => false, 'error' => 'scheduled_time_in_past'], 422);
}
if ($rideType === 'carpool' && stripos($vehicleType, 'car') === false) {
    fare_json(['ok' => false, 'error' => 'carpool_requires_car'], 422);
}

try {
    $now = new DateTimeImmutable('now');
    $expiresAt = $scheduledAt instanceof DateTimeImmutable ? $scheduledAt->modify('+10 minutes') : $now->modify('+10 minutes');
    // All clients must publish into the same live queue.  The web driver app
    // listens to `rides`; older mobile/PHP code used `rideRequests`, which made
    // otherwise valid requests invisible across clients.
    $rideRef = wow_firestore()->collection('rides')->newDocument();
    $rideId = $rideRef->id();
    $ride = [
        'rideCode' => $rideCode,
        'rideId' => $rideId,
        'passengerId' => $passengerUid,
        'passengerID' => $passengerUid,
        'passengerUid' => $passengerUid,
        'passengerName' => fare_get_string($input, 'passenger_name', (string)($_SESSION['user_name'] ?? 'Passenger')),
        'passengerPhone' => fare_get_string($input, 'passenger_phone', ''),
        'driverId' => null,
        'driverID' => null,
        'driverUid' => null,
        'assignedDriverId' => null,
        'targetDriverUid' => null,
        'targetDriverName' => '',
        'pickupLocation' => $pickup,
        'dropoffLocation' => $dropoff,
        'pickup' => $pickup,
        'dropoff' => $dropoff,
        'pickupAddress' => $pickupAddress,
        'dropoffAddress' => $dropoffAddress,
        'pickupName' => $pickupPlaceName,
        'dropoffName' => $dropoffPlaceName,
        'destinationName' => $dropoffPlaceName,
        'destinationAddress' => $dropoffAddress,
        'pickupMapboxId' => $pickupMapboxId,
        'dropoffMapboxId' => $dropoffMapboxId,
        'destinationMapboxId' => $dropoffMapboxId,
        'pickupPlaceType' => $pickupPlaceType,
        'dropoffPlaceType' => $dropoffPlaceType,
        'pickupLat' => $pickupLat,
        'pickupLng' => $pickupLng,
        'pickupLatitude' => $pickupLat,
        'pickupLongitude' => $pickupLng,
        'dropLat' => $dropLat,
        'dropLng' => $dropLng,
        'dropoffLat' => $dropLat,
        'dropoffLng' => $dropLng,
        'dropoffLatitude' => $dropLat,
        'dropoffLongitude' => $dropLng,
        'destinationLatitude' => $dropLat,
        'destinationLongitude' => $dropLng,
        'distance' => round($distanceKm, 3),
        'distanceKm' => round($distanceKm, 3),
        'durationMin' => round($durationMin, 2),
        'durationMinutes' => round($durationMin, 2),
        'vehicleType' => $vehicleType,
        'requestedVehicleType' => $vehicleType,
        'trafficLevel' => $trafficLevel,
        'timeOfDay' => $timeOfDay,
        'paymentMethod' => $paymentMethod,
        'paymentLabel' => $paymentLabel,
        'paymentStatus' => $paymentMethod === 'cash' ? 'cash_pending' : 'unpaid',
        'estimatedFare' => $fare,
        'passengerOfferFare' => $offeredFare,
        'passengerOffer' => $offeredFare,
        'passengerOfferPrice' => $offeredFare,
        'offerPrice' => $offeredFare,
        'fare' => $fare,
        'offeredFare' => $offeredFare,
        'status' => $scheduledAt instanceof DateTimeImmutable ? 'scheduled' : 'searching',
        'requestStatus' => $scheduledAt instanceof DateTimeImmutable ? 'scheduled' : 'open',
        'driverAssigned' => false,
        'assignmentStatus' => $scheduledAt instanceof DateTimeImmutable ? 'pending' : 'searching',
        'rideType' => $rideType,
        'isScheduled' => $scheduledAt instanceof DateTimeImmutable,
        'isCarpool' => $rideType === 'carpool',
        'counterOffer' => null,
        'passengerAccepted' => false,
        'driverAccepted' => false,
        'passengerDecision' => 'pending',
        'driverDecision' => 'pending',
        'createdFrom' => 'passenger_website',
        'sourcePlatform' => 'passenger_website',
        'lastUpdatedFrom' => 'passenger_website',
        'requestedAt' => new \Google\Cloud\Core\Timestamp($now),
        'requestCreatedAt' => new \Google\Cloud\Core\Timestamp($now),
        'clientCreatedAt' => $now->format(DATE_ATOM),
        'createdAtMs' => ((int)$now->format('U')) * 1000,
        'requestedAtMs' => ((int)$now->format('U')) * 1000,
        'expiresAt' => new \Google\Cloud\Core\Timestamp($expiresAt),
        'expiresAtMs' => ((int)$expiresAt->format('U')) * 1000,
        'createdAt' => wow_now(),
        'updatedAt' => wow_now(),
        'acceptedAt' => null,
        'startedAt' => null,
        'completedAt' => null,
    ];
    if ($scheduledDate !== '') {
        $ride['scheduledDate'] = $scheduledDate;
        if ($scheduledAt instanceof DateTimeImmutable) {
            $ride['scheduledAt'] = new \Google\Cloud\Core\Timestamp($scheduledAt);
            $ride['assignmentStartsAt'] = new \Google\Cloud\Core\Timestamp($scheduledAt->modify('-30 minutes'));
            $ride['assignmentAttempt'] = 0;
            $ride['searchRadiusKm'] = 5;
        }
    }
    if ($rideType === 'carpool') {
        $originalFare = (float)($input['original_fare'] ?? $fare);
        $sharedFare = (float)($input['fare_per_person'] ?? $offeredFare);
        $savings = max(0.0, $originalFare - $sharedFare);
        $seatsRequired = max(1, (int)($input['passenger_count'] ?? $input['seats_required'] ?? 1));
        $totalSeats = max($seatsRequired, max(1, min(9, (int)($input['total_seats'] ?? 4))));
        $availableSeats = max(0, (int)($input['available_seats'] ?? ($totalSeats - $seatsRequired)));
        $ride['originalFare'] = $originalFare;
        $ride['sharedFare'] = $sharedFare;
        $ride['savings'] = $savings;
        $ride['estimatedSavings'] = $savings;
        $ride['seatsRequired'] = $seatsRequired;
        $ride['creatorId'] = $passengerUid;
        $ride['passengerIds'] = [$passengerUid];
        $ride['passengers'] = [[
            'userId' => $passengerUid,
            'name' => $ride['passengerName'],
            'phone' => $ride['passengerPhone'],
            'photo' => '',
            'pickup' => $pickupAddress,
            'destination' => $dropoffAddress,
            'pickupStatus' => 'waiting',
            'seatsRequired' => $seatsRequired,
            'joinedAt' => wow_now(),
        ]];
        $ride['totalSeats'] = $totalSeats;
        $ride['availableSeats'] = $availableSeats;
        $ride['occupiedSeats'] = max(0, $totalSeats - $availableSeats);
        $ride['carpoolStatus'] = $availableSeats > 0 ? 'active' : 'full';
        $ride['matchStatus'] = 'searching';
        $ride['maxAllowedDetour'] = 35;
        $ride['carpool'] = [
            'enabled' => true,
            'matchStatus' => 'searching',
            'totalSeats' => $totalSeats,
            'availableSeats' => $availableSeats,
            'farePerPerson' => $sharedFare,
            'sharedFare' => $sharedFare,
            'originalFare' => $originalFare,
            'savings' => $savings,
            'seatsRequired' => $seatsRequired,
            'matchedPassengerIds' => [],
            'discountPercentage' => (float)($input['discount_percentage'] ?? 0),
            'passengerUids' => [$passengerUid],
        ];
    }
    $rideRef->set($ride);

    fare_json([
        'ok' => true,
        'ride_id' => $rideId,
        'ride_code' => $rideCode,
        'wow_code' => $rideCode,
        'status' => $scheduledAt instanceof DateTimeImmutable ? 'scheduled' : 'searching_driver',
        'message' => $scheduledAt instanceof DateTimeImmutable
            ? 'Your ride has been scheduled successfully. A driver will be assigned closer to your selected pickup time.'
            : 'Searching for a driver.',
        'ride_type' => $rideType,
        'carpool_id' => $rideType === 'carpool' ? $rideId : 0,
        'fare' => $fare,
        'offered_fare' => $offeredFare,
        'payment_method' => $paymentMethod,
        'payment_label' => $paymentLabel,
        'distance_km' => round($distanceKm, 3),
        'duration_min' => round($durationMin, 2),
    ]);
} catch (Throwable $exception) {
    error_log('Firestore ride create failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'insert_failed', 'message' => 'Unable to create ride.'], 500);
}
