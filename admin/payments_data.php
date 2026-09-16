<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/financial_service.php';

admin_require_auth();
date_default_timezone_set('Asia/Karachi');
header('Content-Type: application/json; charset=utf-8');

function pt_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function pt_in(): array
{
    $json = json_decode((string)file_get_contents('php://input'), true);
    return is_array($json) ? array_merge($_GET, $_POST, $json) : array_merge($_GET, $_POST);
}

function pt_norm($value): string
{
    return strtolower(trim((string)$value));
}

function pt_money_value($value): ?float
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

function pt_num(array $row, array $keys): float
{
    foreach ($keys as $key) {
        if (!array_key_exists($key, $row)) continue;
        $value = pt_money_value($row[$key]);
        if ($value !== null) return max(0, $value);
    }
    return 0.0;
}

function pt_text(array $row, array $keys, string $fallback = ''): string
{
    foreach ($keys as $key) {
        $value = $row[$key] ?? null;
        if (is_scalar($value) && trim((string)$value) !== '') return trim((string)$value);
    }
    return $fallback;
}

function pt_time($value): string
{
    return wow_timestamp_to_string($value ?? '');
}

function pt_ms($value): int
{
    if ($value instanceof \Google\Cloud\Core\Timestamp) return $value->get()->getTimestamp();
    if ($value instanceof DateTimeInterface) return $value->getTimestamp();
    if (is_numeric($value)) {
        $number = (float)$value;
        if ($number > 20000000000) $number /= 1000;
        return (int)$number;
    }
    $parsed = strtotime((string)$value);
    return $parsed ?: 0;
}

function pt_bool($value): bool
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) || $value === 1 || $value === '1';
}

function pt_real(array $row): bool
{
    return !pt_bool($row['isDemo'] ?? false)
        && !pt_bool($row['isDemoPayment'] ?? false)
        && !pt_bool($row['isTest'] ?? false)
        && !pt_bool($row['isDeleted'] ?? $row['deleted'] ?? false);
}

function pt_method($value): string
{
    return match (pt_norm($value)) {
        'easypaisa', 'easy_paisa' => 'Easypaisa',
        'jazzcash', 'jazz_cash' => 'JazzCash',
        'nayapay', 'naya_pay' => 'NayaPay',
        'wallet' => 'Wallet',
        'card' => 'Card',
        'online' => 'Online',
        'cash', 'cash_pending' => 'Cash',
        default => pt_norm($value) !== '' ? ucwords(str_replace('_', ' ', pt_norm($value))) : 'Not available',
    };
}

function pt_status($value): string
{
    $status = str_replace([' ', '-'], '_', pt_norm($value));
    if (in_array($status, ['paid', 'confirmed', 'success', 'successful', 'completed', 'cash_collected', 'collected', 'received'], true)) return 'paid';
    if (in_array($status, ['partially_refunded', 'partial_refund'], true)) return 'partially_refunded';
    if (in_array($status, ['refunded', 'reversed'], true)) return $status;
    if (in_array($status, ['failed', 'declined', 'expired', 'cancelled', 'canceled', 'chargeback'], true)) return 'failed';
    return 'pending';
}

function pt_completed_status($value): bool
{
    return in_array(pt_norm($value), ['completed', 'ride_completed', 'finished', 'successful', 'success'], true);
}

function pt_commission_rate(): float
{
    if (function_exists('wow_financial_commission_rate')) return wow_financial_commission_rate();
    return 0.30;
}

function pt_split(float $fare): array
{
    $rate = pt_commission_rate();
    $commission = round(max(0, $fare) * $rate, 2);
    return [
        'rate' => $rate,
        'percent' => round($rate * 100, 2),
        'commission' => $commission,
        'driver_share' => round(max(0, $fare) - $commission, 2),
    ];
}

function pt_ride_type(array $ride): string
{
    $type = pt_norm($ride['rideType'] ?? $ride['bookingType'] ?? '');
    if (str_contains($type, 'carpool') || pt_bool($ride['isCarpool'] ?? false)) return 'carpool';
    if (str_contains($type, 'sched') || pt_bool($ride['isScheduled'] ?? false) || isset($ride['scheduledAt'])) return 'scheduled';
    return 'instant';
}

function pt_ride_keys(array $ride): array
{
    return array_values(array_unique(array_filter([
        pt_text($ride, ['uid']),
        pt_text($ride, ['rideId']),
        pt_text($ride, ['bookingId']),
        pt_text($ride, ['requestId']),
        pt_text($ride, ['rideCode']),
    ], static fn(string $value): bool => $value !== '')));
}

function pt_payment_keys(array $payment, string $docId): array
{
    return array_values(array_unique(array_filter([
        $docId,
        pt_text($payment, ['rideId', 'ride_id']),
        pt_text($payment, ['paymentId', 'paymentCode']),
        pt_text($payment, ['rideCode']),
    ], static fn(string $value): bool => $value !== '')));
}

function pt_index_rides(): array
{
    $rides = [];
    foreach (['rideRequests', 'rides'] as $collection) {
        foreach (admin_list_collection($collection, 1000) as $ride) {
            if (!pt_real($ride)) continue;
            $ride['_collection'] = $collection;
            foreach (pt_ride_keys($ride) as $key) {
                $existing = $rides[$key] ?? null;
                $preferCurrentCollection = !$existing || (($existing['_collection'] ?? '') !== 'rides' && $collection === 'rides');
                $preferNewer = $existing && $collection === ($existing['_collection'] ?? '') && pt_ms($ride['updatedAt'] ?? $ride['createdAt'] ?? '') >= pt_ms($existing['updatedAt'] ?? $existing['createdAt'] ?? '');
                if ($preferCurrentCollection || $preferNewer) $rides[$key] = $ride;
            }
        }
    }
    return $rides;
}

function pt_index_profiles(string $collection): array
{
    $profiles = [];
    foreach (admin_list_collection($collection, 1000) as $profile) {
        $id = pt_text($profile, ['uid', 'id']);
        if ($id !== '') $profiles[$id] = $profile;
    }
    return $profiles;
}

function pt_build_row(string $rowId, array $payment, array $ride, array $passengers, array $drivers, string $source): ?array
{
    $hasPaymentRecord = $source === 'payments';
    $rideDocId = pt_text($ride, ['uid', 'rideId', 'bookingId', 'requestId'], $rowId);
    $rideId = pt_text($payment, ['rideId', 'ride_id'], $rideDocId);
    $rideStatus = pt_norm($ride['status'] ?? $ride['rideStatus'] ?? $payment['rideStatus'] ?? '');
    if (!pt_completed_status($rideStatus)) return null;

    $gross = pt_num($payment, ['finalFare', 'paidAmount', 'paymentAmount', 'amount', 'grossFare', 'gross_fare']);
    if ($gross <= 0) $gross = pt_num($ride, ['finalFare', 'acceptedFare', 'agreedFare', 'totalFare', 'fare', 'passengerOffer']);
    if ($gross <= 0) return null;

    $refund = min($gross, pt_num($payment, ['refundedAmount', 'refundAmount']));
    $status = pt_status(pt_text($payment, ['refundStatus', 'paymentStatus', 'status'], pt_text($ride, ['paymentStatus'], 'pending')));
    $net = max(0, $gross - $refund);
    $netSplit = pt_split($net);
    $grossSplit = pt_split($gross);
    $storedCommission = pt_num($payment, ['adminCommission', 'platformCommission', 'wowCommission']);
    if ($storedCommission <= 0) $storedCommission = pt_num($ride, ['adminCommission', 'platformCommission', 'wowCommission']);
    $storedDriver = pt_num($payment, ['driverEarning', 'driverShare', 'netEarning', 'earning']);
    if ($storedDriver <= 0) $storedDriver = pt_num($ride, ['driverEarning', 'driverShare', 'netEarning', 'earning']);
    if (in_array($status, ['refunded', 'reversed'], true)) {
        $commission = 0.0;
        $driverShare = 0.0;
    } elseif ($refund > 0) {
        $commission = $netSplit['commission'];
        $driverShare = $netSplit['driver_share'];
    } else {
        $commission = $storedCommission > 0 ? $storedCommission : $grossSplit['commission'];
        $driverShare = $storedDriver > 0 ? $storedDriver : round($gross - $commission, 2);
    }

    $passengerId = pt_text($payment, ['passengerId', 'passengerUid'], pt_text($ride, ['passengerId', 'passengerUid', 'userId']));
    $driverId = pt_text($payment, ['driverId', 'driverUid'], pt_text($ride, ['assignedDriverId', 'driverId', 'driverUid']));
    $passenger = $passengers[$passengerId] ?? [];
    $driver = $drivers[$driverId] ?? [];
    $method = pt_method(pt_text($payment, ['paymentMethod'], pt_text($ride, ['paymentMethod'], '')));
    $dateTime = pt_time($payment['confirmedAt'] ?? $payment['paidAt'] ?? $payment['collectedAt'] ?? $ride['completedAt'] ?? $ride['rideCompletedAt'] ?? $payment['createdAt'] ?? $ride['updatedAt'] ?? '');

    return [
        'id' => $rowId,
        'payment_id' => $hasPaymentRecord ? pt_text($payment, ['paymentCode', 'paymentId'], $rowId) : 'PENDING-' . strtoupper(substr($rideId ?: $rowId, -6)),
        'transaction_id' => pt_text($payment, ['transactionId']),
        'ride_id' => $rideId,
        'ride_code' => pt_text($ride, ['rideCode', 'bookingCode', 'rideId'], $rideId ?: 'Ride reference unavailable'),
        'ride_type' => pt_ride_type($ride),
        'ride_status' => $rideStatus,
        'pickup' => pt_text($ride, ['pickupAddress', 'pickupName', 'pickup']),
        'dropoff' => pt_text($ride, ['destinationAddress', 'destinationName', 'dropoffAddress', 'dropoff']),
        'passenger_id' => $passengerId,
        'passenger_name' => pt_text($passenger, ['fullName', 'name'], pt_text($payment, ['passengerName'], pt_text($ride, ['passengerName', 'userName'], 'Passenger profile unavailable'))),
        'passenger_email' => pt_text($passenger, ['email'], pt_text($payment, ['passengerEmail'])),
        'driver_id' => $driverId,
        'driver_name' => pt_text($driver, ['fullName', 'name'], pt_text($payment, ['driverName'], pt_text($ride, ['driverName', 'targetDriverName'], 'Driver profile unavailable'))),
        'driver_email' => pt_text($driver, ['email'], pt_text($payment, ['driverEmail'])),
        'gross_fare' => round($gross, 2),
        'wow_commission' => round($commission, 2),
        'driver_share' => round($driverShare, 2),
        'commission_rate' => $grossSplit['rate'],
        'commission_percent' => $grossSplit['percent'],
        'refunded_amount' => round($refund, 2),
        'net_confirmed' => round($net, 2),
        'method' => $method,
        'method_key' => pt_norm(str_replace(' ', '_', $method)),
        'status' => $status,
        'commission_status' => pt_norm(pt_text($payment, ['commissionStatus'], pt_text($ride, ['commissionStatus'], $status === 'paid' ? 'collected' : 'pending'))),
        'created_at' => pt_time($payment['createdAt'] ?? $ride['createdAt'] ?? ''),
        'paid_at' => pt_time($payment['paidAt'] ?? $payment['collectedAt'] ?? ''),
        'confirmed_at' => pt_time($payment['confirmedAt'] ?? ''),
        'refunded_at' => pt_time($payment['refundedAt'] ?? ''),
        'date_time' => $dateTime,
        'refund_status' => pt_norm(pt_text($payment, ['refundStatus'])),
        'refund_reason' => pt_text($payment, ['refundReason']),
        'source' => $source,
        'has_payment_record' => $hasPaymentRecord,
    ];
}

function pt_rows(): array
{
    $rides = pt_index_rides();
    $passengers = pt_index_profiles('passengers');
    $drivers = pt_index_profiles('drivers');
    $rows = [];
    $seenRideKeys = [];

    foreach (admin_list_collection('payments', 1000) as $payment) {
        if (!pt_real($payment)) continue;
        $docId = pt_text($payment, ['uid']);
        if ($docId === '') continue;
        $ride = [];
        foreach (pt_payment_keys($payment, $docId) as $key) {
            if (isset($rides[$key])) {
                $ride = $rides[$key];
                break;
            }
        }
        $row = pt_build_row($docId, $payment, $ride, $passengers, $drivers, 'payments');
        if (!$row) continue;
        $rows[] = $row;
        foreach (array_filter([$row['ride_id'], $row['ride_code'], $docId]) as $key) $seenRideKeys[(string)$key] = true;
    }

    foreach ($rides as $ride) {
        if (!pt_completed_status($ride['status'] ?? $ride['rideStatus'] ?? '')) continue;
        $keys = pt_ride_keys($ride);
        if (!$keys || array_intersect_key(array_flip($keys), $seenRideKeys)) continue;
        $docId = pt_text($ride, ['uid', 'rideId', 'bookingId', 'requestId']);
        if ($docId === '') continue;
        $row = pt_build_row($docId, [], $ride, $passengers, $drivers, 'rides');
        if (!$row) continue;
        $rows[] = $row;
        foreach ($keys as $key) $seenRideKeys[$key] = true;
    }

    usort($rows, static fn(array $a, array $b): int => strcmp((string)$b['date_time'], (string)$a['date_time']));
    return $rows;
}

function pt_filtered_summary_rows(array $rows, string $filter): array
{
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi'));
    $from = match ($filter) {
        'today' => $now->setTime(0, 0),
        '7d' => $now->modify('-6 days')->setTime(0, 0),
        '30d' => $now->modify('-29 days')->setTime(0, 0),
        'month' => $now->modify('first day of this month')->setTime(0, 0),
        'year' => $now->setDate((int)$now->format('Y'), 1, 1)->setTime(0, 0),
        default => null,
    };
    if (!$from) return $rows;
    return array_values(array_filter($rows, static function (array $row) use ($from): bool {
        $value = (string)($row['date_time'] ?? '');
        if ($value === '') return false;
        try {
            return new DateTimeImmutable($value) >= $from;
        } catch (Throwable) {
            return false;
        }
    }));
}

function pt_summary(array $rows): array
{
    $gross = $commission = $drivers = $pendingOnline = $pendingCash = $pendingCommission = $refunded = 0.0;
    $chart = [];
    $onlineMethods = ['Easypaisa', 'JazzCash', 'NayaPay', 'Online', 'Wallet', 'Card'];
    foreach ($rows as $row) {
        $status = (string)$row['status'];
        $refund = (float)$row['refunded_amount'];
        $refunded += $refund;
        if (in_array($status, ['paid', 'partially_refunded'], true)) {
            $net = max(0, (float)$row['gross_fare'] - $refund);
            $gross += $net;
            $commission += (float)$row['wow_commission'];
            $drivers += (float)$row['driver_share'];
            $day = substr((string)$row['date_time'], 0, 10);
            if ($day !== '') $chart[$day] = ($chart[$day] ?? 0) + $net;
        } elseif ($status === 'pending') {
            if (in_array($row['method'], $onlineMethods, true)) $pendingOnline += (float)$row['gross_fare'];
            if ($row['method'] === 'Cash') {
                $pendingCash += (float)$row['gross_fare'];
                $pendingCommission += (float)$row['wow_commission'];
            }
        }
    }
    ksort($chart);
    return [
        'summary' => [
            'gross_ride_revenue' => round($gross, 2),
            'wow_commission' => round($commission, 2),
            'driver_earnings' => round($drivers, 2),
            'pending_online' => round($pendingOnline, 2),
            'pending_cash' => round($pendingCash, 2),
            'pending_cash_commission' => round($pendingCommission, 2),
            'refunded_amount' => round($refunded, 2),
        ],
        'chart' => array_map(static fn($date, $value): array => ['date' => $date, 'value' => round($value, 2)], array_keys($chart), array_values($chart)),
    ];
}

function pt_notify(array $payment, string $id, string $title, string $message, array $admin): void
{
    foreach (array_unique(array_filter([
        pt_text($payment, ['passengerId', 'passengerUid']),
        pt_text($payment, ['driverId', 'driverUid'])
    ])) as $uid) {
        $notification = wow_firestore()->collection('notifications')->newDocument();
        $notification->set([
            'type' => 'payment_update',
            'paymentId' => $id,
            'rideId' => pt_text($payment, ['rideId']),
            'receiverUid' => $uid,
            'targetUid' => $uid,
            'title' => $title,
            'message' => $message,
            'read' => false,
            'isRead' => false,
            'createdBy' => (string)($admin['uid'] ?? ''),
            'createdAt' => wow_now(),
        ]);
    }
}

function pt_log(string $id, string $action, string $notes, array $admin): void
{
    $log = wow_firestore()->collection('payments')->document($id)->collection('auditLog')->newDocument();
    $log->set([
        'action' => $action,
        'notes' => $notes,
        'adminId' => (string)($admin['uid'] ?? $admin['id'] ?? ''),
        'adminName' => (string)($admin['full_name'] ?? 'Admin'),
        'createdAt' => wow_now(),
    ]);
}

function pt_find_ride_for_payment(array $payment, string $paymentId): array
{
    foreach (array_filter([pt_text($payment, ['rideId', 'ride_id']), $paymentId]) as $id) {
        foreach (['rides', 'rideRequests'] as $collection) {
            $ride = wow_doc_data($collection, $id);
            if ($ride) return [$collection, $id, $ride];
        }
    }
    return ['', '', []];
}

$input = pt_in();
$action = pt_norm($input['action'] ?? 'list');
$admin = $_SESSION['admin_auth'] ?? [];

try {
    if ($action === 'list') {
        $filter = pt_norm($input['date'] ?? $input['filter'] ?? 'all');
        $rows = pt_rows();
        $summary = pt_summary(pt_filtered_summary_rows($rows, $filter));
        pt_json([
            'ok' => true,
            'summary' => $summary['summary'],
            'transactions' => $rows,
            'chart' => $summary['chart'],
        ]);
    }

    $id = trim((string)($input['id'] ?? ''));
    $payment = $id !== '' ? wow_doc_data('payments', $id) : null;
    if (!$payment) pt_json(['ok' => false, 'message' => 'Payment record was not found.'], 404);

    if ($action === 'confirm') {
        $method = pt_method($payment['paymentMethod'] ?? '');
        $status = pt_status(pt_text($payment, ['paymentStatus', 'status']));
        if (!in_array($method, ['Easypaisa', 'JazzCash', 'NayaPay', 'Online', 'Wallet', 'Card'], true) || $status !== 'pending') {
            pt_json(['ok' => false, 'message' => 'Only pending online payments can be confirmed.'], 422);
        }

        [$rideCollection, $rideId, $ride] = pt_find_ride_for_payment($payment, $id);
        $gross = pt_num($payment, ['finalFare', 'paidAmount', 'paymentAmount', 'amount']);
        if ($gross <= 0 && $ride) $gross = pt_num($ride, ['finalFare', 'acceptedFare', 'agreedFare', 'totalFare', 'fare', 'passengerOffer']);
        if ($gross <= 0) pt_json(['ok' => false, 'message' => 'Payment amount is unavailable.'], 422);
        $split = pt_split($gross);
        $now = wow_now();
        $settlement = [
            'amount' => $gross,
            'finalFare' => $gross,
            'paymentStatus' => 'paid',
            'attemptStatus' => 'succeeded',
            'confirmedAt' => $payment['confirmedAt'] ?? $now,
            'paidAt' => $payment['paidAt'] ?? $now,
            'confirmedBy' => (string)($admin['uid'] ?? ''),
            'commissionRate' => $split['percent'],
            'commissionPercent' => $split['percent'],
            'platformCommission' => $split['commission'],
            'adminCommission' => $split['commission'],
            'wowCommission' => $split['commission'],
            'driverEarning' => $split['driver_share'],
            'driverShare' => $split['driver_share'],
            'commissionStatus' => 'collected',
            'commissionCalculatedAt' => $payment['commissionCalculatedAt'] ?? $now,
            'updatedAt' => $now,
        ];
        wow_set_doc('payments', $id, $settlement, true);
        if ($rideCollection !== '' && $rideId !== '') {
            wow_set_doc($rideCollection, $rideId, [
                'paymentStatus' => 'paid',
                'paymentAttemptStatus' => 'succeeded',
                'paymentUpdatedAt' => $now,
                'paymentTransactionId' => (string)($payment['transactionId'] ?? ''),
                'commissionRate' => $split['percent'],
                'commissionPercent' => $split['percent'],
                'platformCommission' => $split['commission'],
                'adminCommission' => $split['commission'],
                'wowCommission' => $split['commission'],
                'driverEarning' => $split['driver_share'],
                'driverShare' => $split['driver_share'],
                'commissionStatus' => 'collected',
                'commissionCalculatedAt' => $payment['commissionCalculatedAt'] ?? $now,
            ], true);
        }
        pt_log($id, 'payment_confirmed', 'Online payment confirmed by admin.', $admin);
        pt_notify(array_merge($payment, $settlement), $id, 'Payment Confirmed', 'Your ride payment has been confirmed.', $admin);
        pt_json(['ok' => true]);
    }

    if ($action === 'refund') {
        $gross = pt_num($payment, ['finalFare', 'paidAmount', 'paymentAmount', 'amount']);
        $already = pt_num($payment, ['refundedAmount', 'refundAmount']);
        $amount = (float)($input['amount'] ?? 0);
        $reason = trim((string)($input['reason'] ?? ''));
        if ($amount <= 0 || $amount > $gross - $already) pt_json(['ok' => false, 'message' => 'Enter a valid refundable amount.'], 422);
        if ($reason === '') pt_json(['ok' => false, 'message' => 'Refund reason is required.'], 422);
        $total = round($already + $amount, 2);
        $full = $total >= $gross - .01;
        $net = max(0, $gross - $total);
        $split = pt_split($net);
        wow_set_doc('payments', $id, [
            'paymentStatus' => $full ? 'refunded' : 'partially_refunded',
            'refundStatus' => $full ? 'refunded' : 'partially_refunded',
            'refundedAmount' => $total,
            'refundReason' => $reason,
            'refundNotes' => trim((string)($input['notes'] ?? '')),
            'refundedAt' => wow_now(),
            'refundedBy' => (string)($admin['uid'] ?? ''),
            'platformCommission' => $full ? 0 : $split['commission'],
            'adminCommission' => $full ? 0 : $split['commission'],
            'wowCommission' => $full ? 0 : $split['commission'],
            'driverEarning' => $full ? 0 : $split['driver_share'],
            'driverShare' => $full ? 0 : $split['driver_share'],
            'commissionStatus' => $full ? 'refunded' : 'adjusted',
            'updatedAt' => wow_now(),
        ], true);
        pt_log($id, $full ? 'full_refund' : 'partial_refund', $reason, $admin);
        pt_notify($payment, $id, 'Payment Refund Processed', 'A refund of Rs. ' . number_format($amount, 2) . ' has been processed for your ride payment.', $admin);
        pt_json(['ok' => true]);
    }

    pt_json(['ok' => false, 'message' => 'Unsupported payment action.'], 422);
} catch (Throwable $error) {
    error_log('Payments admin: ' . $error->getMessage());
    pt_json(['ok' => false, 'message' => 'Payment data could not be loaded.'], 500);
}
