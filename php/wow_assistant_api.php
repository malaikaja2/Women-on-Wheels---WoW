<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/wow_assistant_knowledge.php';

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

set_exception_handler(static function (Throwable $error): never {
    error_log('WOW assistant unavailable: ' . $error->getMessage());
    assistant_json([
        'ok' => false,
        'error' => 'service_busy',
        'message' => 'WOW Assistant is temporarily unavailable. Please try again shortly.',
    ], 503);
});

function assistant_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function assistant_input(): array
{
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}

function assistant_bearer(): string
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    return preg_match('/^Bearer\s+(.+)$/i', $header, $match) ? trim($match[1]) : '';
}

function assistant_identity(string $token): array
{
    $sessionUid = trim((string)($_SESSION['firebase_uid'] ?? $_SESSION['user_id'] ?? ''));
    $sessionRole = strtolower(trim((string)($_SESSION['role'] ?? '')));
    if ($sessionUid !== '' && in_array($sessionRole, ['passenger', 'driver'], true)) {
        return [
            'uid' => $sessionUid,
            'email' => strtolower((string)($_SESSION['email'] ?? '')),
            'role' => $sessionRole,
        ];
    }
    if ($token === '') assistant_json(['ok' => false, 'error' => 'authentication_required'], 401);
    try {
        $http = new Client(['timeout' => 10]);
        $response = $http->post(
            'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode(WOW_FIREBASE_WEB_API_KEY),
            ['json' => ['idToken' => $token]]
        );
        $payload = json_decode((string)$response->getBody(), true);
        $user = is_array($payload['users'][0] ?? null) ? $payload['users'][0] : [];
        $uid = trim((string)($user['localId'] ?? ''));
        if ($uid === '') assistant_json(['ok' => false, 'error' => 'authentication_required'], 401);
        return ['uid' => $uid, 'email' => strtolower((string)($user['email'] ?? ''))];
    } catch (Throwable $error) {
        error_log('WOW assistant token verification failed: ' . $error->getMessage());
        assistant_json(['ok' => false, 'error' => 'authentication_required'], 401);
    }
}

function assistant_role(string $uid, string $hint = ''): array
{
    $hint = strtolower(trim($hint));
    if ($hint === 'driver') {
        $driver = wow_doc_data('drivers', $uid);
        if ($driver) return ['role' => 'driver', 'profile' => $driver];
    }
    if ($hint === 'passenger') {
        $passenger = wow_doc_data('passengers', $uid);
        if ($passenger) return ['role' => 'passenger', 'profile' => $passenger];
    }
    $driver = wow_doc_data('drivers', $uid);
    if ($driver) return ['role' => 'driver', 'profile' => $driver];
    $passenger = wow_doc_data('passengers', $uid);
    if ($passenger) return ['role' => 'passenger', 'profile' => $passenger];
    assistant_json(['ok' => false, 'error' => 'account_profile_unavailable'], 403);
}

function assistant_rate_limit(string $uid): void
{
    $window = 60;
    $limit = 12;
    $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'wow_ai_' . hash('sha256', $uid) . '.json';
    $now = time();
    $events = [];
    $handle = @fopen($path, 'c+');
    if (!$handle) return;
    try {
        flock($handle, LOCK_EX);
        $raw = stream_get_contents($handle);
        $decoded = json_decode((string)$raw, true);
        if (is_array($decoded)) {
            $events = array_values(array_filter($decoded, static fn($t): bool => is_int($t) && $t > $now - $window));
        }
        if (count($events) >= $limit) assistant_json(['ok' => false, 'error' => 'rate_limited', 'retryAfter' => $window], 429);
        $events[] = $now;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($events));
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function assistant_query_owned(string $collection, array $fields, string $uid, int $limit = 20): array
{
    $rows = [];
    $seen = [];
    foreach ($fields as $field) {
        try {
            $docs = wow_firestore()->collection($collection)->where($field, '=', $uid)->limit($limit)->documents();
            foreach ($docs as $doc) {
                if (!$doc->exists() || isset($seen[$doc->id()])) continue;
                $seen[$doc->id()] = true;
                $rows[] = ['id' => $doc->id(), ...$doc->data()];
            }
        } catch (Throwable $error) {
            error_log("WOW assistant targeted query failed {$collection}.{$field}: " . $error->getMessage());
        }
    }
    return $rows;
}

function assistant_collection_rows(string $collectionPath, int $limit = 50): array
{
    $rows = [];
    try {
        foreach (wow_firestore()->collection($collectionPath)->limit($limit)->documents() as $doc) {
            if (!$doc->exists()) continue;
            $rows[] = ['id' => $doc->id(), ...$doc->data()];
        }
    } catch (Throwable $error) {
        error_log("WOW assistant collection read failed {$collectionPath}: " . $error->getMessage());
    }
    return $rows;
}

function assistant_millis(mixed $value): int
{
    if ($value instanceof DateTimeInterface) return $value->getTimestamp() * 1000;
    if (is_object($value) && method_exists($value, 'get')) {
        try { return $value->get()->getTimestamp() * 1000; } catch (Throwable) {}
    }
    if (is_numeric($value)) {
        $number = (int)$value;
        return $number > 20000000000 ? $number : $number * 1000;
    }
    $parsed = is_string($value) ? strtotime($value) : false;
    return $parsed === false ? 0 : $parsed * 1000;
}

function assistant_money(mixed $value): ?float
{
    if (!is_numeric($value)) return null;
    $amount = (float)$value;
    return $amount > 0 ? round($amount, 2) : null;
}

function assistant_safe_address(mixed $value): string
{
    if (is_string($value)) return mb_substr(trim($value), 0, 220);
    if (is_array($value)) return mb_substr(trim((string)($value['address'] ?? $value['name'] ?? '')), 0, 220);
    return '';
}

function assistant_status_label(string $status): string
{
    $status = trim($status) !== '' ? trim($status) : 'unknown';
    return ucwords(str_replace('_', ' ', $status));
}

function assistant_safe_ride(array $ride): array
{
    $fare = null;
    foreach (['finalFare', 'acceptedFare', 'agreedFare', 'totalFare', 'fare', 'estimatedFare'] as $field) {
        $fare = assistant_money($ride[$field] ?? null);
        if ($fare !== null) break;
    }
    return array_filter([
        'documentId' => (string)($ride['id'] ?? ''),
        'rideId' => mb_substr((string)($ride['rideCode'] ?? $ride['rideId'] ?? $ride['id'] ?? ''), 0, 80),
        'status' => mb_substr((string)($ride['status'] ?? 'unknown'), 0, 50),
        'bookingType' => mb_substr((string)($ride['bookingType'] ?? $ride['rideType'] ?? ''), 0, 40),
        'vehicleType' => mb_substr((string)($ride['vehicleType'] ?? $ride['requestedVehicleType'] ?? ''), 0, 30),
        'pickup' => assistant_safe_address($ride['pickupAddress'] ?? $ride['pickupName'] ?? $ride['pickupLocation'] ?? $ride['pickup'] ?? ''),
        'dropoff' => assistant_safe_address($ride['dropoffAddress'] ?? $ride['destinationAddress'] ?? $ride['destinationName'] ?? $ride['dropoffLocation'] ?? $ride['dropoff'] ?? ''),
        'statusUpdatedAt' => assistant_millis($ride['updatedAt'] ?? $ride['createdAt'] ?? null),
        'scheduledAt' => assistant_millis($ride['scheduledAt'] ?? $ride['scheduledDateTime'] ?? null),
        'driverAssigned' => trim((string)($ride['assignedDriverId'] ?? $ride['driverId'] ?? $ride['driverUid'] ?? '')) !== '',
        'driverName' => mb_substr((string)($ride['driverName'] ?? $ride['acceptedDriverName'] ?? $ride['respondingDriverName'] ?? ''), 0, 80),
        'paymentMethod' => mb_substr((string)($ride['paymentMethod'] ?? ''), 0, 30),
        'paymentStatus' => mb_substr((string)($ride['paymentStatus'] ?? 'unknown'), 0, 30),
        'fare' => $fare,
    ], static fn($value): bool => $value !== '' && $value !== null);
}

function assistant_active_statuses(): array
{
    return ['pending', 'searching', 'searching_driver', 'finding_driver', 'scheduled', 'driver_assigned', 'accepted', 'confirmed', 'driver_selected', 'driver_en_route', 'driver_arriving', 'arriving', 'arrived', 'started', 'ride_started', 'ongoing', 'in_progress', 'active', 'on_trip'];
}

function assistant_terminal_statuses(): array
{
    return ['completed', 'ride_completed', 'cancelled', 'canceled', 'expired', 'rejected', 'no_driver_found'];
}

function assistant_owned_rides(string $uid, string $role, int $limit = 20): array
{
    $fields = $role === 'driver'
        ? ['assignedDriverId', 'driverId', 'driverUid']
        : ['passengerId', 'passengerUid'];
    $rides = assistant_query_owned('rides', $fields, $uid, $limit);
    usort($rides, static fn(array $a, array $b): int => assistant_millis($b['updatedAt'] ?? $b['createdAt'] ?? null) <=> assistant_millis($a['updatedAt'] ?? $a['createdAt'] ?? null));
    return $rides;
}

function assistant_current_ride(array $rides): ?array
{
    $active = assistant_active_statuses();
    foreach ($rides as $ride) {
        if (in_array(strtolower((string)($ride['status'] ?? '')), $active, true)) return $ride;
    }
    return null;
}

function assistant_next_scheduled_ride(array $rides): ?array
{
    $now = (int)(microtime(true) * 1000);
    $scheduled = array_values(array_filter($rides, static function (array $ride) use ($now): bool {
        $status = strtolower((string)($ride['status'] ?? ''));
        $scheduledAt = assistant_millis($ride['scheduledAt'] ?? $ride['scheduledDateTime'] ?? null);
        return $scheduledAt > $now || $status === 'scheduled';
    }));
    usort($scheduled, static fn(array $a, array $b): int => assistant_millis($a['scheduledAt'] ?? $a['scheduledDateTime'] ?? null) <=> assistant_millis($b['scheduledAt'] ?? $b['scheduledDateTime'] ?? null));
    return $scheduled[0] ?? null;
}

function assistant_latest_lost_found(string $uid, string $role): ?array
{
    $fields = $role === 'driver'
        ? ['driverId', 'driverUid', 'assignedDriverId']
        : ['passengerId', 'passengerUid'];
    $cases = assistant_query_owned('lost_found_cases', $fields, $uid, 10);
    usort($cases, static fn(array $a, array $b): int => assistant_millis($b['updatedAt'] ?? $b['createdAt'] ?? null) <=> assistant_millis($a['updatedAt'] ?? $a['createdAt'] ?? null));
    return $cases[0] ?? null;
}

function assistant_recent_notifications(string $uid, string $role): array
{
    $fields = $role === 'driver' ? ['receiverUid', 'driverUid', 'recipientId', 'userId'] : ['receiverUid', 'passengerUid', 'recipientId', 'userId'];
    $rows = assistant_query_owned('notifications', $fields, $uid, 8);
    usort($rows, static fn(array $a, array $b): int => assistant_millis($b['createdAt'] ?? null) <=> assistant_millis($a['createdAt'] ?? null));
    return array_slice($rows, 0, 5);
}

function assistant_payment_for_ride(?array $ride): ?array
{
    if (!$ride) return null;
    $ids = array_values(array_unique(array_filter([
        (string)($ride['id'] ?? ''),
        (string)($ride['rideId'] ?? ''),
        (string)($ride['rideCode'] ?? ''),
    ])));
    foreach ($ids as $id) {
        $payment = wow_doc_data('payments', $id);
        if ($payment) return ['id' => $id, ...$payment];
    }
    return null;
}

function assistant_driver_earnings(string $uid): array
{
    $cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'wow_assistant_earn_' . sha1($uid) . '.json';
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) <= 15) {
        $cached = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached)) return $cached;
    }

    $entries = [];
    $seen = [];
    $add = static function (string $rideId, float $earning, int $when) use (&$entries, &$seen): void {
        if ($rideId === '' || $earning <= 0 || isset($seen[$rideId])) return;
        $seen[$rideId] = true;
        $entries[] = ['rideId' => $rideId, 'earning' => round($earning, 2), 'when' => $when];
    };

    foreach (assistant_collection_rows('driverEarnings/' . $uid . '/rides', 80) as $row) {
        if (strtolower((string)($row['status'] ?? '')) !== 'earned') continue;
        $earning = assistant_money($row['earning'] ?? $row['driverEarning'] ?? null);
        if ($earning === null) continue;
        $add((string)($row['rideId'] ?? $row['id'] ?? ''), $earning, assistant_millis($row['completedAt'] ?? $row['createdAt'] ?? null));
    }

    $paidStatuses = ['paid', 'demo_paid', 'cash_collected', 'completed', 'success', 'successful', 'confirmed', 'collected', 'received'];
    foreach (assistant_query_owned('payments', ['driverId', 'driverUid', 'assignedDriverId'], $uid, 80) as $row) {
        $status = strtolower(trim((string)($row['paymentStatus'] ?? $row['status'] ?? '')));
        if (!in_array($status, $paidStatuses, true)) continue;
        $fare = assistant_money($row['finalFare'] ?? $row['amount'] ?? $row['fare'] ?? null) ?? 0.0;
        $earning = assistant_money($row['driverEarning'] ?? $row['driverShare'] ?? null) ?? round($fare * 0.70, 2);
        $add((string)($row['rideId'] ?? $row['id'] ?? ''), $earning, assistant_millis($row['paidAt'] ?? $row['collectedAt'] ?? $row['updatedAt'] ?? $row['createdAt'] ?? null));
    }

    foreach (assistant_query_owned('rides', ['assignedDriverId', 'driverId', 'driverUid'], $uid, 80) as $row) {
        $status = strtolower(trim((string)($row['status'] ?? '')));
        if (!in_array($status, ['completed', 'ride_completed'], true)) continue;
        $paymentStatus = strtolower(trim((string)($row['paymentStatus'] ?? '')));
        $cashConfirmed = ($row['cashCollected'] ?? false) === true || ($row['cashConfirmed'] ?? false) === true || ($row['paymentConfirmed'] ?? false) === true || ($row['isPaid'] ?? false) === true;
        if ($paymentStatus !== '' && !in_array($paymentStatus, $paidStatuses, true) && !$cashConfirmed) continue;
        $fare = assistant_money($row['finalFare'] ?? $row['agreedFare'] ?? $row['acceptedFare'] ?? $row['fare'] ?? $row['estimatedFare'] ?? null);
        if ($fare === null) continue;
        $earning = assistant_money($row['driverEarning'] ?? $row['driverShare'] ?? null) ?? round($fare * 0.70, 2);
        $add((string)($row['id'] ?? $row['rideId'] ?? ''), $earning, assistant_millis($row['completedAt'] ?? $row['updatedAt'] ?? $row['createdAt'] ?? null));
    }

    $tz = new DateTimeZone('Asia/Karachi');
    $now = new DateTimeImmutable('now', $tz);
    $todayKey = $now->format('Y-m-d');
    $weekKey = $now->format('o-W');
    $monthKey = $now->format('Y-m');
    $summary = ['today' => 0.0, 'week' => 0.0, 'month' => 0.0, 'total' => 0.0, 'completedCount' => count($entries)];
    foreach ($entries as $entry) {
        $earning = (float)$entry['earning'];
        $summary['total'] += $earning;
        $when = (int)$entry['when'];
        if ($when <= 0) continue;
        $date = (new DateTimeImmutable('@' . (int)floor($when / 1000)))->setTimezone($tz);
        if ($date->format('Y-m-d') === $todayKey) $summary['today'] += $earning;
        if ($date->format('o-W') === $weekKey) $summary['week'] += $earning;
        if ($date->format('Y-m') === $monthKey) $summary['month'] += $earning;
    }
    foreach (['today', 'week', 'month', 'total'] as $key) $summary[$key] = round((float)$summary[$key], 2);
    @file_put_contents($cacheFile, json_encode($summary), LOCK_EX);
    return $summary;
}

function assistant_context_for_intent(string $intent, string $uid, string $role, array $profile): array
{
    $context = ['role' => $role];
    if ($intent === 'verification_status') {
        $context['verificationStatus'] = (string)($profile['verificationStatus'] ?? $profile['accountStatus'] ?? 'unknown');
        $context['isApproved'] = (bool)($profile['isApproved'] ?? false);
        $context['isRejected'] = (bool)($profile['isRejected'] ?? false);
        return $context;
    }

    if ($intent === 'driver_earnings_status' && $role === 'driver') {
        $context['earnings'] = assistant_driver_earnings($uid);
        return $context;
    }

    if ($intent === 'notifications_status') {
        $notifications = assistant_recent_notifications($uid, $role);
        $context['recentNotifications'] = array_map(static fn(array $row): array => [
            'type' => mb_substr((string)($row['type'] ?? 'update'), 0, 40),
            'title' => mb_substr((string)($row['title'] ?? $row['message'] ?? 'WOW update'), 0, 120),
            'read' => (bool)($row['isRead'] ?? $row['read'] ?? false),
            'createdAt' => assistant_millis($row['createdAt'] ?? null),
        ], $notifications);
        $context['unreadNotificationCount'] = count(array_filter($context['recentNotifications'], static fn(array $row): bool => !$row['read']));
        return $context;
    }

    if ($intent === 'lost_found_status') {
        $case = assistant_latest_lost_found($uid, $role);
        $context['latestLostFoundCase'] = $case ? array_filter([
            'caseId' => (string)($case['caseId'] ?? $case['id'] ?? ''),
            'rideId' => (string)($case['rideId'] ?? ''),
            'item' => mb_substr((string)($case['itemName'] ?? $case['item'] ?? 'item'), 0, 100),
            'status' => mb_substr((string)($case['status'] ?? 'unknown'), 0, 50),
        ]) : null;
        return $context;
    }

    $rides = assistant_owned_rides($uid, $role, 20);
    $current = assistant_current_ride($rides);
    $scheduled = assistant_next_scheduled_ride($rides);
    if ($current) $context['currentRide'] = assistant_safe_ride($current);
    if ($scheduled) $context['nextScheduledRide'] = assistant_safe_ride($scheduled);
    $context['rideHistoryCount'] = count($rides);

    if ($intent === 'payment_status') {
        $payment = assistant_payment_for_ride($current);
        $context['currentPaymentStatus'] = $payment
            ? mb_substr((string)($payment['paymentStatus'] ?? $payment['status'] ?? 'unknown'), 0, 30)
            : ($current ? (string)($current['paymentStatus'] ?? 'unknown') : null);
    }

    return $context;
}

function assistant_general_reply(array $analysis, array $knowledge): string
{
    $intent = (string)($analysis['intent'] ?? 'unknown');
    if ($intent === 'unknown') return (string)(wow_assistant_knowledge()['unknown']['text'] ?? '');
    $top = $knowledge[0] ?? null;
    if ($top && trim((string)($top['text'] ?? '')) !== '') return (string)$top['text'];
    return (string)(wow_assistant_knowledge()['unknown']['text'] ?? '');
}

function assistant_personal_reply(string $intent, string $role, array $context): string
{
    $ride = $context['currentRide'] ?? null;
    $scheduled = $context['nextScheduledRide'] ?? null;
    return match ($intent) {
        'current_ride_status' => $ride
            ? 'Your current ride status is ' . assistant_status_label((string)($ride['status'] ?? 'unknown')) . (($ride['driverAssigned'] ?? false) ? '. A driver is assigned.' : '. No assigned driver is saved yet.')
            : 'I could not find an active ride for your account right now.',
        'driver_accepted_status' => $ride
            ? (($ride['driverAssigned'] ?? false)
                ? 'Yes. Your ride has an assigned driver' . (empty($ride['driverName']) ? '.' : ': ' . $ride['driverName'] . '.')
                : 'Not yet. Your current ride does not show an assigned driver.')
            : 'I could not find an active ride for your account right now.',
        'driver_arrived_status' => $ride
            ? (in_array(strtolower((string)($ride['status'] ?? '')), ['arrived'], true)
                ? 'Yes. The saved ride status says the driver has arrived.'
                : 'Not yet. The saved ride status is ' . assistant_status_label((string)($ride['status'] ?? 'unknown')) . '.')
            : 'I could not find an active ride for your account right now.',
        'scheduled_ride_status' => $scheduled
            ? 'Your next scheduled ride status is ' . assistant_status_label((string)($scheduled['status'] ?? 'scheduled')) . assistant_schedule_suffix($scheduled) . '.'
            : 'I could not find a scheduled ride for your account right now.',
        'verification_status' => $role === 'driver'
            ? assistant_verification_reply($context)
            : 'Verification status is available only for driver accounts.',
        'payment_status' => $ride
            ? 'Your current ride payment status is ' . assistant_status_label((string)($context['currentPaymentStatus'] ?? $ride['paymentStatus'] ?? 'unknown')) . '.'
            : 'I could not find an active ride to check payment status.',
        'driver_earnings_status' => $role === 'driver'
            ? assistant_earnings_reply((array)($context['earnings'] ?? []))
            : 'Driver earnings are available only for driver accounts.',
        'notifications_status' => assistant_notifications_reply((array)($context['recentNotifications'] ?? []), (int)($context['unreadNotificationCount'] ?? 0)),
        'lost_found_status' => ($context['latestLostFoundCase'] ?? null)
            ? 'Your latest Lost and Found case status is ' . assistant_status_label((string)$context['latestLostFoundCase']['status']) . ' for ' . (string)($context['latestLostFoundCase']['item'] ?? 'the item') . '.'
            : 'I could not find a Lost and Found case for your account right now.',
        default => assistant_general_reply(['intent' => 'unknown'], []),
    };
}

function assistant_schedule_suffix(array $ride): string
{
    $scheduledAt = (int)($ride['scheduledAt'] ?? 0);
    if ($scheduledAt <= 0) return '';
    $date = (new DateTimeImmutable('@' . (int)floor($scheduledAt / 1000)))->setTimezone(new DateTimeZone('Asia/Karachi'));
    return ' for ' . $date->format('D, d M Y h:i A');
}

function assistant_verification_reply(array $context): string
{
    $status = strtolower((string)($context['verificationStatus'] ?? 'unknown'));
    if (($context['isApproved'] ?? false) && !in_array($status, ['rejected', 'blocked'], true)) $status = 'approved';
    if (($context['isRejected'] ?? false)) $status = 'rejected';
    return 'Your driver verification status is ' . assistant_status_label($status) . '. The assistant cannot approve, reject, or bypass admin review.';
}

function assistant_earnings_reply(array $earnings): string
{
    if (!$earnings) return 'I could not load your earnings summary right now.';
    return 'Your driver earnings summary: today Rs. ' . number_format((float)($earnings['today'] ?? 0), 2)
        . ', this week Rs. ' . number_format((float)($earnings['week'] ?? 0), 2)
        . ', this month Rs. ' . number_format((float)($earnings['month'] ?? 0), 2)
        . ', total Rs. ' . number_format((float)($earnings['total'] ?? 0), 2)
        . '. Counted rides: ' . (int)($earnings['completedCount'] ?? 0) . '.';
}

function assistant_notifications_reply(array $notifications, int $unread): string
{
    if (!$notifications) return 'I could not find recent notifications for your account.';
    $latest = $notifications[0]['title'] ?? 'WOW update';
    return 'You have ' . count($notifications) . ' recent notification(s), with ' . $unread . ' unread. Latest: ' . $latest . '.';
}

function assistant_actions(string $role, array $context, string $intent): array
{
    $currentRideId = (string)($context['currentRide']['documentId'] ?? '');
    if ($role === 'driver') {
        $actions = [
            ['label' => 'Open Current Ride', 'route' => 'driver-ride.html', 'rideId' => $currentRideId],
            ['label' => 'View Requests', 'route' => 'driver-dashboard.html'],
            ['label' => 'Open Earnings', 'route' => 'driver-earnings.html'],
            ['label' => 'Open Lost & Found', 'route' => 'driver-lost-items.html'],
            ['label' => 'Contact Support', 'route' => 'driver-help.html'],
        ];
    } else {
        $actions = [
            ['label' => 'Book a Ride', 'route' => 'dashboard.html'],
            ['label' => 'Open Current Ride', 'route' => 'passenger-ride.html', 'rideId' => $currentRideId],
            ['label' => 'View Ride History', 'route' => 'activity.html'],
            ['label' => 'Open Lost & Found', 'route' => 'lost-found.html'],
            ['label' => 'Contact Support', 'route' => 'help.html'],
        ];
    }
    if (!in_array($intent, ['current_ride_status', 'driver_accepted_status', 'driver_arrived_status', 'payment_status'], true)) {
        $actions = array_values(array_filter($actions, static fn(array $action): bool => ($action['label'] ?? '') !== 'Open Current Ride'));
    }
    return array_values(array_filter($actions, static fn(array $a): bool => ($a['label'] ?? '') !== 'Open Current Ride' || ($a['rideId'] ?? '') !== ''));
}

function assistant_escalation(array $input, string $category, bool $fallbackUsed): array
{
    $explicit = ($input['userRequestedSupport'] ?? false) === true || ($input['requestHumanSupport'] ?? false) === true;
    $reported = ($input['userReportedIssue'] ?? false) === true || strtolower(trim((string)($input['actionType'] ?? ''))) === 'report_issue';
    $feedback = strtolower(trim((string)($input['feedback'] ?? '')));
    $repeat = max(0, (int)($input['repeatedFallbackCount'] ?? 0));
    $confidence = is_numeric($input['assistantConfidence'] ?? null) ? (float)$input['assistantConfidence'] : null;
    $safetyConfirmed = in_array($category, ['safety', 'sos_emergency'], true) && ($input['confirmSafetyIntent'] ?? false) === true;
    $escalate = $explicit || $reported || $feedback === 'unhelpful' || $safetyConfirmed || ($fallbackUsed && $repeat >= 2 && $confidence !== null && $confidence < .4);
    $reason = $explicit ? 'user_requested_support' : ($reported ? 'user_reported_issue' : ($feedback === 'unhelpful' ? 'unhelpful_response' : ($safetyConfirmed ? 'confirmed_safety_emergency' : 'repeated_low_confidence_fallback')));
    return ['escalate' => $escalate, 'reason' => $reason];
}

function assistant_ai(string $message, string $role, array $knowledge, array $context, array $history): ?string
{
    $apiKey = trim((string)(getenv('WOW_AI_API_KEY') ?: getenv('OPENAI_API_KEY') ?: ''));
    if ($apiKey === '') return null;
    $endpoint = trim((string)(getenv('WOW_AI_API_URL') ?: 'https://api.openai.com/v1/chat/completions'));
    $model = trim((string)(getenv('WOW_AI_MODEL') ?: 'gpt-4.1-mini'));
    $system = 'You are the Women on Wheels support assistant. Answer briefly in the user language when possible, including Roman Urdu. '
        . 'Use only VERIFIED KNOWLEDGE and the AUTHORIZED ACCOUNT CONTEXT below. Do not invent project features, policies, fees, phone numbers, or statuses. '
        . 'Never reveal passwords, Firebase tokens, API keys, CNIC/licence details, uploaded documents, another user profile, another user ride, or private location. '
        . 'If the verified information is insufficient, say that clearly. '
        . 'VERIFIED KNOWLEDGE: ' . json_encode($knowledge, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        . ' AUTHORIZED ACCOUNT CONTEXT: ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $messages = [['role' => 'system', 'content' => $system]];
    foreach (array_slice($history, -6) as $item) {
        if (!isset($item['role'], $item['content'])) continue;
        $messages[] = ['role' => $item['role'] === 'assistant' ? 'assistant' : 'user', 'content' => mb_substr((string)$item['content'], 0, 800)];
    }
    $messages[] = ['role' => 'user', 'content' => $message];
    try {
        $http = new Client(['timeout' => 18]);
        $response = $http->post($endpoint, [
            'headers' => ['Authorization' => 'Bearer ' . $apiKey, 'Content-Type' => 'application/json'],
            'json' => ['model' => $model, 'messages' => $messages, 'temperature' => 0.1, 'max_tokens' => 320],
        ]);
        $data = json_decode((string)$response->getBody(), true);
        $text = trim((string)($data['choices'][0]['message']['content'] ?? ''));
        return $text !== '' ? mb_substr($text, 0, 1800) : null;
    } catch (GuzzleException|Throwable $error) {
        error_log('WOW assistant provider request failed: ' . $error->getMessage());
        return null;
    }
}

function assistant_effective_message(string $message, array $history): string
{
    if (preg_match('/\b(it|that|this|usko|isko|wo|woh)\b/i', $message) !== 1) return $message;
    for ($index = count($history) - 1; $index >= 0; $index--) {
        if (($history[$index]['role'] ?? '') !== 'user') continue;
        $previous = trim((string)($history[$index]['content'] ?? ''));
        if ($previous !== '') return $previous . ' Follow-up: ' . $message;
    }
    return $message;
}

$input = assistant_input();
$identity = assistant_identity(assistant_bearer());
$roleHint = strtolower(trim((string)($input['role'] ?? $input['userRole'] ?? $identity['role'] ?? '')));
$resolved = assistant_role($identity['uid'], $roleHint);
$uid = $identity['uid'];
$role = $resolved['role'];
assistant_rate_limit($uid);

$action = strtolower(trim((string)($input['action'] ?? 'message')));
if ($action === 'history') {
    $rows = assistant_query_owned('chatbotMessages', ['userId'], $uid, 30);
    usort($rows, static fn(array $a, array $b): int => assistant_millis($a['createdAt'] ?? null) <=> assistant_millis($b['createdAt'] ?? null));
    assistant_json(['ok' => true, 'role' => $role, 'messages' => array_map(static fn(array $row): array => [
        'id' => (string)($row['id'] ?? ''),
        'message' => mb_substr((string)($row['message'] ?? ''), 0, 1000),
        'reply' => mb_substr((string)($row['botReply'] ?? $row['response'] ?? ''), 0, 2400),
        'createdAt' => assistant_millis($row['createdAt'] ?? null),
    ], array_slice($rows, -20))]);
}

$message = trim((string)($input['message'] ?? ''));
if ($message === '' || mb_strlen($message) > 500) assistant_json(['ok' => false, 'error' => 'invalid_message'], 422);
$history = is_array($input['history'] ?? null) ? array_slice($input['history'], -6) : [];
$effectiveMessage = assistant_effective_message($message, $history);
$responseStarted = microtime(true);

$analysis = wow_assistant_analyze($effectiveMessage, $role, $history);
$knowledge = wow_assistant_retrieve_knowledge($effectiveMessage, $role, 4, $analysis);
$intent = (string)($analysis['intent'] ?? 'unknown');
$category = (string)($analysis['category'] ?? ($knowledge[0]['category'] ?? 'general_help'));
$requiresContext = (bool)($analysis['requiresContext'] ?? false);
$context = $requiresContext ? assistant_context_for_intent($intent, $uid, $role, $resolved['profile']) : ['role' => $role];

$reply = $requiresContext
    ? assistant_personal_reply($intent, $role, $context)
    : assistant_general_reply($analysis, $knowledge);

$aiReply = null;
if (!$requiresContext && $intent === 'unknown') {
    $aiReply = assistant_ai($message, $role, $knowledge, [], $history);
    if ($aiReply !== null) $reply = $aiReply;
}

$fallbackUsed = $intent === 'unknown' && $aiReply === null;
$escalation = assistant_escalation($input, $category, $fallbackUsed);
$sourceHint = strtolower(trim((string)($input['source'] ?? $input['sourcePlatform'] ?? 'website')));
$sourcePlatform = $role . ((str_contains($sourceHint, 'app') || str_contains($sourceHint, 'mobile')) ? '_app' : '_website');
$nowId = $uid . '_' . (string)((int)(microtime(true) * 1000000));
$relatedRideId = (string)($context['currentRide']['documentId'] ?? '');

wow_set_doc('chatbotMessages', $nowId, [
    'userId' => $uid,
    'userUid' => $uid,
    'userRole' => $role,
    'message' => $message,
    'botReply' => $reply,
    'response' => $reply,
    'conversationId' => mb_substr((string)($input['conversationId'] ?? $uid . '_' . date('Ymd')), 0, 120),
    'intent' => $intent,
    'category' => $category,
    'fallbackUsed' => $fallbackUsed,
    'isEscalated' => $escalation['escalate'],
    'needsHumanSupport' => $escalation['escalate'],
    'resolutionStatus' => $escalation['escalate'] ? 'pending' : 'answered',
    'responseTimeMs' => (int)round((microtime(true) - $responseStarted) * 1000),
    'language' => (string)($analysis['language'] ?? 'english'),
    'relatedRideId' => $relatedRideId,
    'source' => $sourcePlatform,
    'sourcePlatform' => $sourcePlatform,
    'assistantMode' => $requiresContext ? 'personal_targeted' : 'general_knowledge',
    'createdAt' => wow_now(),
], true);

if ($escalation['escalate']) {
    wow_set_doc('supportEscalations', $nowId, [
        'escalationId' => $nowId,
        'conversationId' => mb_substr((string)($input['conversationId'] ?? $uid . '_' . date('Ymd')), 0, 120),
        'messageId' => $nowId,
        'userId' => $uid,
        'userRole' => $role,
        'question' => $message,
        'assistantAnswer' => $reply,
        'category' => $category,
        'escalationReason' => $escalation['reason'],
        'status' => 'new',
        'sourcePlatform' => $sourcePlatform,
        'relatedRideId' => $relatedRideId,
        'createdAt' => wow_now(),
    ], true);
}

assistant_json([
    'ok' => true,
    'role' => $role,
    'reply' => $reply,
    'intent' => $intent,
    'category' => $category,
    'requiresContext' => $requiresContext,
    'source' => [
        'mode' => $requiresContext ? 'personal_targeted' : 'general_knowledge',
        'knowledge' => array_column($knowledge, 'id'),
        'liveContext' => $requiresContext ? array_keys(array_filter($context, static fn($v): bool => $v !== null && $v !== [])) : [],
    ],
    'actions' => assistant_actions($role, $context, $intent),
]);
