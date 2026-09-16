<?php
declare(strict_types=1);

require_once __DIR__ . '/sos_common.php';
require_once __DIR__ . '/driver_documents.php';

$input = array_merge($_GET, $_POST, sos_input());
$user = cp_marketplace_user($conn, $input);
if (!$user['ok'] || $user['role'] !== 'passenger') {
    sos_json(['ok' => false, 'error' => 'authentication_required', 'message' => 'Please sign in again.'], 401);
}

$action = strtolower(trim((string)($input['action'] ?? 'list')));

try {
    if ($action === 'list') {
        $rides = [];
        foreach (cp_marketplace_open_ride_candidates() as $ride) {
            if (!cp_marketplace_is_joinable($ride)) continue;
            if (cp_marketplace_user_in_ride($ride, (string)$user['uid'])) continue;
            $rides[] = cp_marketplace_public_ride($ride);
        }
        usort($rides, static fn(array $a, array $b): int => ($b['createdMs'] ?? 0) <=> ($a['createdMs'] ?? 0));
        $rides = array_slice($rides, 0, 30);
        sos_json(['ok' => true, 'rides' => $rides]);
    }

    if ($action === 'detail') {
        $rideId = trim((string)($input['ride_id'] ?? ''));
        $ride = $rideId !== '' ? wow_doc_data('rides', $rideId) : null;
        if (!$ride || !cp_marketplace_is_carpool($ride)) {
            sos_json(['ok' => false, 'error' => 'carpool_not_found', 'message' => 'Carpool ride is unavailable.'], 404);
        }
        if (!cp_marketplace_user_in_ride($ride, (string)$user['uid']) && (string)($ride['assignedDriverId'] ?? '') !== (string)$user['uid']) {
            sos_json(['ok' => false, 'error' => 'not_authorized', 'message' => 'You are not part of this carpool.'], 403);
        }
        sos_json(['ok' => true, 'ride' => cp_marketplace_public_ride($ride, true)]);
    }

    if ($action === 'join') {
        $rideId = trim((string)($input['ride_id'] ?? ''));
        $ride = $rideId !== '' ? wow_doc_data('rides', $rideId) : null;
        if (!$ride || !cp_marketplace_is_joinable($ride)) {
            sos_json(['ok' => false, 'error' => 'carpool_unavailable', 'message' => 'This carpool is no longer available.'], 409);
        }
        if (cp_marketplace_user_in_ride($ride, (string)$user['uid'])) {
            sos_json(['ok' => false, 'error' => 'already_joined', 'message' => 'You are already part of this carpool.'], 409);
        }

        $seatsRequired = max(1, min(3, (int)($input['seats_required'] ?? 1)));
        $availableSeats = cp_marketplace_available_seats($ride);
        if ($availableSeats < $seatsRequired) {
            sos_json(['ok' => false, 'error' => 'not_enough_seats', 'message' => 'Not enough seats are available now.'], 409);
        }

        $passenger = wow_doc_data('passengers', (string)$user['uid']) ?: [];
        $passengerName = cp_marketplace_first_string($passenger, ['name', 'fullName', 'displayName'], 'Passenger');
        $passengerPhone = cp_marketplace_first_string($passenger, ['phone', 'phoneNumber', 'mobile'], '');
        $passengerPhoto = cp_marketplace_first_string($passenger, ['photoUrl', 'profilePhotoUrl', 'profileImage', 'photoURL'], '');
        $ids = cp_marketplace_passenger_ids($ride);
        $ids[] = (string)$user['uid'];
        $ids = array_values(array_unique(array_filter($ids)));
        $passengers = cp_marketplace_passengers($ride);
        $passengers[] = [
            'userId' => (string)$user['uid'],
            'name' => $passengerName,
            'phone' => $passengerPhone,
            'photo' => $passengerPhoto,
            'pickup' => (string)($ride['pickupAddress'] ?? $ride['pickup'] ?? ''),
            'destination' => (string)($ride['dropoffAddress'] ?? $ride['dropoff'] ?? $ride['destinationAddress'] ?? ''),
            'pickupStatus' => 'waiting',
            'seatsRequired' => $seatsRequired,
            'joinedAt' => wow_now(),
        ];

        $totalSeats = max(cp_marketplace_total_seats($ride), count($ids));
        $nextAvailableSeats = max(0, $availableSeats - $seatsRequired);
        $carpool = is_array($ride['carpool'] ?? null) ? $ride['carpool'] : [];
        $carpool['enabled'] = true;
        $carpool['matchStatus'] = 'matched';
        $carpool['totalSeats'] = $totalSeats;
        $carpool['availableSeats'] = $nextAvailableSeats;
        $carpool['passengerUids'] = $ids;
        $carpool['matchedPassengerIds'] = array_values(array_filter($ids, static fn(string $id): bool => $id !== (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '')));

        $isScheduled = strtolower((string)($ride['status'] ?? '')) === 'scheduled' || strtolower((string)($ride['requestStatus'] ?? '')) === 'scheduled';
        $updates = [
            'rideType' => 'carpool',
            'isCarpool' => true,
            'creatorId' => cp_marketplace_creator_id($ride),
            'passengerIds' => $ids,
            'passengers' => $passengers,
            'totalSeats' => $totalSeats,
            'availableSeats' => $nextAvailableSeats,
            'occupiedSeats' => max(0, $totalSeats - $nextAvailableSeats),
            'carpoolStatus' => $nextAvailableSeats > 0 ? 'active' : 'full',
            'matchStatus' => 'matched',
            'carpool' => $carpool,
            'status' => $isScheduled ? 'scheduled' : 'searching',
            'requestStatus' => $isScheduled ? 'scheduled' : 'open',
            'assignmentStatus' => $isScheduled ? (string)($ride['assignmentStatus'] ?? 'pending') : 'searching',
            'updatedAt' => wow_now(),
        ];
        wow_set_doc('rides', $rideId, $updates, true);

        $creatorId = cp_marketplace_creator_id($ride);
        if ($creatorId !== '' && $creatorId !== (string)$user['uid']) {
            $noticeId = preg_replace('/[^A-Za-z0-9_-]/', '_', $rideId . '_joined_' . (string)$user['uid']);
            wow_set_doc('notifications', $noticeId, [
                'notificationId' => $noticeId,
                'type' => 'carpool_joined',
                'rideId' => $rideId,
                'receiverUid' => $creatorId,
                'receiverRole' => 'passenger',
                'senderId' => (string)$user['uid'],
                'senderRole' => 'passenger',
                'title' => 'A passenger joined your carpool',
                'body' => $passengerName . ' joined your shared ride.',
                'read' => false,
                'isRead' => false,
                'createdAt' => wow_now(),
            ], true);
        }

        $fresh = wow_doc_data('rides', $rideId) ?: array_merge($ride, $updates);
        sos_json(['ok' => true, 'ride' => cp_marketplace_public_ride($fresh, true)]);
    }

    sos_json(['ok' => false, 'error' => 'unsupported_action'], 422);
} catch (Throwable $exception) {
    error_log('Carpool marketplace failed: ' . $exception->getMessage());
    sos_json(['ok' => false, 'error' => 'carpool_marketplace_failed', 'message' => 'Carpool service is unavailable right now.'], 500);
}

function cp_marketplace_user($conn, array $input): array
{
    $bearerUid = wow_firebase_uid_from_bearer();
    if ($bearerUid !== '') {
        $passenger = wow_doc_data('passengers', $bearerUid);
        if ($passenger) {
            return ['ok' => true, 'role' => 'passenger', 'uid' => $bearerUid, 'user_id' => $bearerUid, 'raw_user_id' => $bearerUid, 'email' => (string)($passenger['email'] ?? '')];
        }
    }
    return resolve_user_context($conn, $input);
}

function cp_marketplace_open_ride_candidates(): array
{
    $rides = [];
    $seen = [];
    $queriesFailed = false;
    $queries = [
        wow_firestore()->collection('rides')
            ->where('isCarpool', '=', true)
            ->where('status', '=', 'searching')
            ->where('requestStatus', '=', 'open')
            ->limit(30),
        wow_firestore()->collection('rides')
            ->where('isCarpool', '=', true)
            ->where('status', '=', 'scheduled')
            ->where('requestStatus', '=', 'scheduled')
            ->limit(30),
    ];

    foreach ($queries as $query) {
        try {
            foreach ($query->documents() as $document) {
                cp_marketplace_add_candidate($rides, $seen, $document);
            }
        } catch (Throwable $exception) {
            $queriesFailed = true;
            error_log('Carpool marketplace filtered query failed: ' . $exception->getMessage());
        }
    }

    if (!$rides && $queriesFailed) {
        try {
            foreach (wow_firestore()->collection('rides')->where('isCarpool', '=', true)->limit(60)->documents() as $document) {
                cp_marketplace_add_candidate($rides, $seen, $document);
            }
        } catch (Throwable $exception) {
            error_log('Carpool marketplace fallback query failed: ' . $exception->getMessage());
        }
    }

    return $rides;
}

function cp_marketplace_add_candidate(array &$rides, array &$seen, $document): void
{
    if (!$document->exists()) return;
    $id = $document->id();
    if (isset($seen[$id])) return;
    $data = $document->data();
    $data['uid'] = $id;
    $rides[] = $data;
    $seen[$id] = true;
}

function cp_marketplace_is_carpool(array $ride): bool
{
    return !empty($ride['isCarpool']) || strtolower((string)($ride['rideType'] ?? '')) === 'carpool';
}

function cp_marketplace_is_joinable(array $ride): bool
{
    if (!cp_marketplace_is_carpool($ride)) return false;
    $status = strtolower((string)($ride['status'] ?? ''));
    $requestStatus = strtolower((string)($ride['requestStatus'] ?? ''));
    $assignedDriverId = trim((string)($ride['assignedDriverId'] ?? $ride['driverId'] ?? ''));
    return in_array($status, ['searching', 'available', 'scheduled'], true)
        && in_array($requestStatus, ['', 'open', 'scheduled'], true)
        && $assignedDriverId === ''
        && cp_marketplace_available_seats($ride) > 0;
}

function cp_marketplace_creator_id(array $ride): string
{
    return (string)($ride['creatorId'] ?? $ride['passengerId'] ?? $ride['passengerUid'] ?? '');
}

function cp_marketplace_user_in_ride(array $ride, string $uid): bool
{
    if ($uid === '') return false;
    if (in_array($uid, [cp_marketplace_creator_id($ride), (string)($ride['passengerId'] ?? ''), (string)($ride['passengerUid'] ?? '')], true)) return true;
    return in_array($uid, cp_marketplace_passenger_ids($ride), true);
}

function cp_marketplace_passenger_ids(array $ride): array
{
    $ids = [];
    foreach (['passengerIds', 'passengerUids'] as $key) {
        if (is_array($ride[$key] ?? null)) $ids = array_merge($ids, array_map('strval', $ride[$key]));
    }
    if (is_array($ride['carpool'] ?? null)) {
        foreach (['passengerUids', 'matchedPassengerIds'] as $key) {
            if (is_array($ride['carpool'][$key] ?? null)) $ids = array_merge($ids, array_map('strval', $ride['carpool'][$key]));
        }
    }
    $creator = cp_marketplace_creator_id($ride);
    if ($creator !== '') $ids[] = $creator;
    return array_values(array_unique(array_filter($ids)));
}

function cp_marketplace_total_seats(array $ride): int
{
    $carpool = is_array($ride['carpool'] ?? null) ? $ride['carpool'] : [];
    foreach ([$ride['totalSeats'] ?? null, $ride['vehicleCapacity'] ?? null, $carpool['totalSeats'] ?? null] as $value) {
        if (is_numeric($value) && (int)$value > 0) return (int)$value;
    }
    return 4;
}

function cp_marketplace_available_seats(array $ride): int
{
    $carpool = is_array($ride['carpool'] ?? null) ? $ride['carpool'] : [];
    foreach ([$ride['availableSeats'] ?? null, $carpool['availableSeats'] ?? null] as $value) {
        if (is_numeric($value)) return max(0, (int)$value);
    }
    $totalSeats = cp_marketplace_total_seats($ride);
    $usedSeats = max(1, (int)($ride['seatsRequired'] ?? 1));
    if (is_array($ride['passengers'] ?? null)) {
        $usedSeats = 0;
        foreach ($ride['passengers'] as $passenger) {
            $usedSeats += max(1, (int)($passenger['seatsRequired'] ?? 1));
        }
    }
    return max(0, $totalSeats - $usedSeats);
}

function cp_marketplace_passengers(array $ride): array
{
    $passengers = is_array($ride['passengers'] ?? null) ? array_values($ride['passengers']) : [];
    if ($passengers) return $passengers;
    $creator = cp_marketplace_creator_id($ride);
    if ($creator === '') return [];
    return [[
        'userId' => $creator,
        'name' => (string)($ride['passengerName'] ?? 'Passenger'),
        'phone' => (string)($ride['passengerPhone'] ?? ''),
        'photo' => (string)($ride['passengerProfileImage'] ?? ''),
        'pickup' => (string)($ride['pickupAddress'] ?? $ride['pickup'] ?? ''),
        'destination' => (string)($ride['dropoffAddress'] ?? $ride['dropoff'] ?? $ride['destinationAddress'] ?? ''),
        'pickupStatus' => 'waiting',
        'seatsRequired' => max(1, (int)($ride['seatsRequired'] ?? 1)),
        'joinedAt' => $ride['createdAt'] ?? '',
    ]];
}

function cp_marketplace_public_ride(array $ride, bool $includePassengers = false): array
{
    $public = [
        'id' => (string)($ride['uid'] ?? $ride['rideId'] ?? ''),
        'rideId' => (string)($ride['rideId'] ?? $ride['uid'] ?? ''),
        'pickup' => (string)($ride['pickupAddress'] ?? $ride['pickup'] ?? 'Pickup'),
        'dropoff' => (string)($ride['dropoffAddress'] ?? $ride['dropoff'] ?? $ride['destinationAddress'] ?? 'Destination'),
        'scheduledAt' => cp_marketplace_time_string($ride['scheduledAt'] ?? null),
        'createdMs' => cp_marketplace_time_ms($ride['createdAt'] ?? null),
        'status' => (string)($ride['status'] ?? 'searching'),
        'requestStatus' => (string)($ride['requestStatus'] ?? 'open'),
        'sharedFare' => (float)($ride['sharedFare'] ?? $ride['fare'] ?? $ride['estimatedFare'] ?? 0),
        'fare' => (float)($ride['fare'] ?? $ride['estimatedFare'] ?? $ride['sharedFare'] ?? 0),
        'originalFare' => (float)($ride['originalFare'] ?? $ride['estimatedFare'] ?? 0),
        'savings' => (float)($ride['savings'] ?? $ride['estimatedSavings'] ?? 0),
        'availableSeats' => cp_marketplace_available_seats($ride),
        'totalSeats' => cp_marketplace_total_seats($ride),
        'passengerCount' => count(cp_marketplace_passenger_ids($ride)),
        'passengerName' => (string)($ride['passengerName'] ?? 'Verified passenger'),
        'assignedDriverId' => (string)($ride['assignedDriverId'] ?? ''),
        'driverName' => (string)($ride['driverName'] ?? ''),
        'driverVehicleNumber' => (string)($ride['driverVehicleNumber'] ?? $ride['vehicleNumber'] ?? ''),
        'vehicleNumber' => (string)($ride['vehicleNumber'] ?? ''),
    ];
    if ($includePassengers) {
        $public['passengers'] = array_map(static fn(array $passenger): array => [
            'userId' => (string)($passenger['userId'] ?? ''),
            'name' => (string)($passenger['name'] ?? 'Passenger'),
            'pickup' => (string)($passenger['pickup'] ?? ''),
            'destination' => (string)($passenger['destination'] ?? ''),
            'pickupStatus' => (string)($passenger['pickupStatus'] ?? 'waiting'),
            'seatsRequired' => max(1, (int)($passenger['seatsRequired'] ?? 1)),
        ], cp_marketplace_passengers($ride));
    }
    return $public;
}

function cp_marketplace_time_string($value): string
{
    return $value ? wow_timestamp_to_string($value) : '';
}

function cp_marketplace_time_ms($value): int
{
    if ($value instanceof Google\Cloud\Core\Timestamp) return $value->get()->getTimestamp() * 1000;
    if ($value instanceof DateTimeInterface) return $value->getTimestamp() * 1000;
    $parsed = strtotime((string)$value);
    return $parsed ? $parsed * 1000 : 0;
}

function cp_marketplace_first_string(array $source, array $keys, string $fallback): string
{
    foreach ($keys as $key) {
        $value = trim((string)($source[$key] ?? ''));
        if ($value !== '') return $value;
    }
    return $fallback;
}
