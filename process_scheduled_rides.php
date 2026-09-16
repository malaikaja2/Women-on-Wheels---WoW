<?php
declare(strict_types=1);

require_once __DIR__ . '/firebase/repositories.php';

$lock = fopen(sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'wow-scheduled-rides.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);

$now = new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi'));
$rides = wow_list_collection('rides', 500);

function wow_notify_scheduled_drivers(string $rideId, array $ride): void
{
    $requestedVehicle = strtolower(trim((string)($ride['requestedVehicleType'] ?? $ride['vehicleType'] ?? '')));
    foreach (wow_list_collection('drivers', 500) as $driver) {
        $driverUid = (string)($driver['uid'] ?? '');
        $driverVehicle = strtolower(trim((string)($driver['vehicleType'] ?? '')));
        if ($driverUid === ''
            || $driverVehicle !== $requestedVehicle
            || strtolower((string)($driver['role'] ?? '')) !== 'driver'
            || strtolower((string)($driver['verificationStatus'] ?? '')) !== 'approved'
            || ($driver['isApproved'] ?? false) !== true
            || ($driver['isOnline'] ?? false) !== true
            || ($driver['isAvailable'] ?? true) === false
            || ($driver['lostItemRestricted'] ?? false) === true) {
            continue;
        }
        $notificationId = $rideId . '_' . $driverUid . '_scheduled_available';
        wow_set_doc('notifications', $notificationId, [
            'notificationId' => $notificationId,
            'type' => 'scheduled_ride_available',
            'rideId' => $rideId,
            'driverUid' => $driverUid,
            'receiverUid' => $driverUid,
            'receiverRole' => 'driver',
            'requestedVehicleType' => $requestedVehicle,
            'title' => 'Scheduled ride available',
            'body' => 'A scheduled ride matching your vehicle is available. Open the dashboard to review it.',
            'read' => false,
            'createdAt' => wow_now(),
        ], false);
    }
}

foreach ($rides as $ride) {
    $id = (string)($ride['uid'] ?? $ride['rideId'] ?? '');
    if ($id === '') continue;
    $status = strtolower((string)($ride['status'] ?? ''));
    $scheduled = $ride['scheduledAt'] ?? null;
    if (!$scheduled instanceof \Google\Cloud\Core\Timestamp) continue;
    $scheduledAt = DateTimeImmutable::createFromInterface($scheduled->get())->setTimezone(new DateTimeZone('Asia/Karachi'));
    $activationAt = $scheduledAt->modify('-30 minutes');
    $matchingDeadline = $scheduledAt->modify('+10 minutes');

    // Recover rides closed by the legacy two-minutes-before-pickup cutoff.
    if ($status === 'no_driver_found'
        && ($ride['assignmentFailureReason'] ?? '') === 'no_driver_available'
        && $now < $matchingDeadline
        && empty($ride['assignedDriverId'])) {
        wow_set_doc('rides', $id, [
            'status' => 'searching',
            'requestStatus' => 'open',
            'assignmentStatus' => 'searching',
            'assignmentFailureReason' => null,
            'assignmentFailedAt' => null,
            'assignmentStartedAt' => wow_now(),
            'searchRadiusKm' => 15,
            'updatedAt' => wow_now(),
        ], true);
        wow_notify_scheduled_drivers($id, $ride);
        continue;
    }

    if ($status === 'scheduled' && $now >= $activationAt && empty($ride['assignedDriverId'])) {
        wow_set_doc('rides', $id, [
            'status' => 'searching',
            'requestStatus' => 'open',
            'assignmentStatus' => 'searching',
            'assignmentStartedAt' => wow_now(),
            'assignmentAttempt' => ((int)($ride['assignmentAttempt'] ?? 0)) + 1,
            'searchRadiusKm' => 5,
            'updatedAt' => wow_now(),
        ], true);
        wow_set_doc('notifications', $id . '_scheduled_search_started', [
            'notificationId' => $id . '_scheduled_search_started',
            'type' => 'scheduled_search_started', 'rideId' => $id,
            'passengerUid' => (string)($ride['passengerId'] ?? ''),
            'receiverUid' => (string)($ride['passengerId'] ?? ''),
            'receiverRole' => 'passenger',
            'title' => 'Searching for your driver',
            'body' => 'Driver matching has started for your scheduled ride.',
            'read' => false, 'createdAt' => wow_now(),
        ], false);
        wow_notify_scheduled_drivers($id, $ride);
        continue;
    }

    if ($status === 'searching' && ($ride['assignmentStatus'] ?? '') === 'searching' && empty($ride['assignedDriverId'])) {
        $started = $ride['assignmentStartedAt'] ?? null;
        $elapsed = $started instanceof \Google\Cloud\Core\Timestamp
            ? $now->getTimestamp() - $started->get()->getTimestamp() : 0;
        $radius = $elapsed >= 600 ? 15 : ($elapsed >= 300 ? 10 : 5);
        $updates = ['searchRadiusKm' => $radius, 'updatedAt' => wow_now()];
        if ($now >= $matchingDeadline && ($ride['assignmentStatus'] ?? '') !== 'failed') {
            $updates['status'] = 'no_driver_found';
            $updates['requestStatus'] = 'closed';
            $updates['assignmentStatus'] = 'failed';
            $updates['assignmentFailureReason'] = 'no_driver_available';
            $updates['assignmentFailedAt'] = wow_now();
            wow_set_doc('notifications', $id . '_scheduled_assignment_failed', [
                'notificationId' => $id . '_scheduled_assignment_failed',
                'type' => 'scheduled_assignment_failed', 'rideId' => $id,
                'passengerUid' => (string)($ride['passengerId'] ?? ''),
                'receiverUid' => (string)($ride['passengerId'] ?? ''),
                'receiverRole' => 'passenger',
                'title' => 'Driver not available',
                'body' => 'We are currently unable to assign a driver. Please try booking again or choose another time.',
                'read' => false, 'createdAt' => wow_now(),
            ], false);
        }
        wow_set_doc('rides', $id, $updates, true);
    }
}

flock($lock, LOCK_UN);
fclose($lock);
