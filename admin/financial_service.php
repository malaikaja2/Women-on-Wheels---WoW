<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

const WOW_DEFAULT_COMMISSION_RATE = 0.30;

function wow_financial_normalize(string $value): string
{
    return strtolower(trim($value));
}

function wow_financial_number($value): ?float
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

function wow_financial_timestamp($value): ?DateTimeImmutable
{
    if ($value instanceof \Google\Cloud\Core\Timestamp) {
        $date = $value->get();
        return $date instanceof DateTimeImmutable ? $date : DateTimeImmutable::createFromMutable($date);
    }
    if ($value instanceof DateTimeImmutable) return $value;
    if ($value instanceof DateTimeInterface) return new DateTimeImmutable($value->format(DATE_ATOM));
    if (is_int($value) || is_float($value) || (is_string($value) && preg_match('/^\d+(?:\.\d+)?$/', trim($value)))) {
        $number = (float)$value;
        if ($number > 20000000000) $number /= 1000;
        try { return (new DateTimeImmutable('@' . (string)(int)$number))->setTimezone(new DateTimeZone(date_default_timezone_get())); } catch (Throwable) { return null; }
    }
    if (is_string($value) && trim($value) !== '') {
        try { return new DateTimeImmutable($value); } catch (Throwable) { return null; }
    }
    return null;
}

function wow_financial_date_bounds(string $filter): array
{
    $filter = wow_financial_normalize($filter);
    $now = new DateTimeImmutable('now');
    if ($filter === 'today') return [$now->setTime(0, 0), null];
    if ($filter === 'last_7_days' || $filter === 'week') return [$now->modify('-6 days')->setTime(0, 0), null];
    if ($filter === 'last_30_days') return [$now->modify('-29 days')->setTime(0, 0), null];
    if ($filter === 'month' || $filter === 'this_month') return [$now->modify('first day of this month')->setTime(0, 0), null];
    if ($filter === 'this_year' || $filter === 'year') return [$now->setDate((int)$now->format('Y'), 1, 1)->setTime(0, 0), null];
    return [null, null];
}

function wow_financial_commission_rate(): float
{
    static $cachedRate = null;
    if (is_float($cachedRate)) return $cachedRate;
    try {
        $settings = wow_doc_data('appSettings', 'global') ?: [];
        $fareSettings = is_array($settings['fareSettings'] ?? null) ? $settings['fareSettings'] : [];
        $financial = wow_doc_data('platformSettings', 'financial') ?: [];
        $value = wow_financial_number($financial['commissionRate'] ?? $fareSettings['platformCommissionPercent'] ?? null);
        if ($value !== null) {
            if ($value > 1 && $value <= 100) $value /= 100;
            if ($value > 0 && $value < 1) return $cachedRate = $value;
        }
        error_log('[WOW Financial] shared commission setting unavailable or invalid; using 0.30.');
    } catch (Throwable $error) {
        error_log('[WOW Financial] commission configuration could not be loaded; using 0.30. ' . $error->getMessage());
    }
    return $cachedRate = WOW_DEFAULT_COMMISSION_RATE;
}

function wow_financial_ride_key(array $ride): string
{
    return trim((string)($ride['uid'] ?? $ride['documentId'] ?? $ride['id'] ?? $ride['rideId'] ?? ''));
}

function wow_financial_payment_ride_key(array $payment): string
{
    return trim((string)($payment['rideId'] ?? $payment['ride_id'] ?? $payment['uid'] ?? ''));
}

function wow_financial_fare(array $ride): array
{
    foreach (['finalFare', 'paidAmount', 'acceptedFare', 'agreedFare', 'totalFare', 'fare'] as $field) {
        if (!array_key_exists($field, $ride)) continue;
        $fare = wow_financial_number($ride[$field]);
        if ($fare !== null && $fare > 0) return ['field' => $field, 'raw' => $ride[$field], 'value' => $fare];
    }
    return ['field' => '', 'raw' => null, 'value' => null];
}

function wow_financial_is_test(array $row): bool
{
    $id = strtolower((string)($row['uid'] ?? $row['rideId'] ?? $row['paymentId'] ?? ''));
    $email = strtolower((string)($row['email'] ?? $row['passengerEmail'] ?? $row['driverEmail'] ?? ''));
    return str_starts_with($id, 'test_') || str_contains($id, '_test_') || str_contains($email, '@womenonwheels.local')
        || ($row['isDemo'] ?? false) === true || ($row['demo'] ?? false) === true || ($row['sample'] ?? false) === true
        || ($row['isDemoPayment'] ?? false) === true;
}

/**
 * Identifies records created by the 30/70 settlement flow. Legacy completed
 * rides predate commission accounting and must not be retroactively treated as
 * driver earnings, otherwise admin and driver totals diverge.
 */
function wow_financial_has_commission_metadata(array $ride, array $payment = []): bool
{
    foreach ([$payment, $ride] as $row) {
        if (!$row) continue;
        if (wow_financial_timestamp($row['commissionCalculatedAt'] ?? null)) return true;
        foreach (['driverEarning', 'driverShare', 'platformCommission', 'adminCommission', 'wowCommission'] as $field) {
            if (array_key_exists($field, $row) && wow_financial_number($row[$field]) !== null) return true;
        }
        $rate = wow_financial_number($row['commissionRate'] ?? null);
        if ($rate !== null && $rate > 0) return true;
    }
    return false;
}

function wow_financial_reconcile(string $dateFilter = 'all', bool $developmentLog = false, ?array $rideRows = null, ?array $paymentRows = null): array
{
    $rides = $rideRows ?? admin_list_collection('rides', 2000);
    $payments = $paymentRows ?? admin_list_collection('payments', 2000);
    $paymentMap = [];
    foreach ($payments as $payment) {
        if (wow_financial_is_test($payment)) continue;
        $key = wow_financial_payment_ride_key($payment);
        if ($key === '') continue;
        $existing = $paymentMap[$key] ?? null;
        $candidateTime = wow_financial_timestamp($payment['updatedAt'] ?? $payment['paidAt'] ?? $payment['createdAt'] ?? null);
        $existingTime = $existing ? wow_financial_timestamp($existing['updatedAt'] ?? $existing['paidAt'] ?? $existing['createdAt'] ?? null) : null;
        if (!$existing || ($candidateTime && (!$existingTime || $candidateTime > $existingTime))) $paymentMap[$key] = $payment;
    }

    [$from, $to] = wow_financial_date_bounds($dateFilter);
    $rate = wow_financial_commission_rate();
    $successful = ['paid', 'completed', 'success', 'successful', 'confirmed', 'cash_collected', 'collected', 'received'];
    $pendingStatuses = ['pending', 'initiated', 'processing', 'unpaid', 'awaiting_payment', 'awaiting_confirmation'];
    $failedStatuses = ['failed', 'cancelled', 'canceled', 'expired', 'disputed', 'chargeback'];
    $refundStatuses = ['refunded', 'reversed', 'partially_refunded'];
    $onlineMethods = ['easypaisa', 'jazzcash', 'nayapay', 'online', 'wallet', 'card'];
    $seen = [];
    $included = [];
    $transactions = [];
    $totals = ['grossRideRevenue' => 0.0, 'wowCommissionEarnings' => 0.0, 'driverEarnings' => 0.0, 'pendingOnlinePayments' => 0.0, 'refundedAmount' => 0.0];
    $audit = [
        'totalRideDocumentsChecked' => count($rides), 'validCompletedPaidRides' => 0, 'excludedCancelledRides' => 0,
        'excludedIncompleteRides' => 0, 'excludedUnpaidRides' => 0, 'excludedFailedPayments' => 0,
        'excludedRefundedRides' => 0, 'excludedInvalidFareRecords' => 0, 'duplicateRideIdsRemoved' => 0,
        'excludedInvalidParticipants' => 0, 'excludedOutsideDateFilter' => 0, 'pendingOnlineRideCount' => 0,
        'excludedPreCommissionRecords' => 0,
    ];

    // Refunds are payment events and may still be valid when the linked ride
    // is archived or outside the current ride page. Count each payment once.
    $seenRefunds = [];
    foreach ($payments as $payment) {
        if (wow_financial_is_test($payment)) continue;
        $paymentStatus = wow_financial_normalize((string)($payment['paymentStatus'] ?? $payment['status'] ?? ''));
        if (!in_array($paymentStatus, $refundStatuses, true)) continue;
        $refundKey = trim((string)($payment['transactionId'] ?? $payment['paymentId'] ?? $payment['uid'] ?? $payment['rideId'] ?? ''));
        if ($refundKey === '' || isset($seenRefunds[$refundKey])) continue;
        $refundDate = wow_financial_timestamp($payment['refundedAt'] ?? $payment['updatedAt'] ?? $payment['paidAt'] ?? null);
        if ($from && (!$refundDate || $refundDate < $from || ($to && $refundDate >= $to))) continue;
        $refund = wow_financial_number($payment['refundAmount'] ?? $payment['refundedAmount'] ?? null);
        if ($refund === null && $paymentStatus !== 'partially_refunded') {
            $refund = wow_financial_number($payment['amount'] ?? $payment['finalFare'] ?? $payment['paidAmount'] ?? null);
        }
        if ($refund !== null && $refund > 0) {
            $totals['refundedAmount'] += $refund;
            $seenRefunds[$refundKey] = true;
        }
    }

    foreach ($rides as $ride) {
        $docId = wow_financial_ride_key($ride);
        $rideId = trim((string)($ride['rideId'] ?? $ride['rideCode'] ?? $docId));
        $status = wow_financial_normalize((string)($ride['status'] ?? ''));
        $reason = '';
        if ($docId === '' || isset($seen[$docId])) {
            $audit['duplicateRideIdsRemoved']++;
            $reason = 'duplicate_or_missing_ride_document_id';
        } else {
            $seen[$docId] = true;
        }
        if ($reason === '' && wow_financial_is_test($ride)) $reason = 'test_or_demo_record';
        if ($reason === '' && (($ride['isDeleted'] ?? false) === true || ($ride['deleted'] ?? false) === true || ($ride['archivedInvalid'] ?? false) === true || wow_financial_normalize((string)($ride['recordStatus'] ?? '')) === 'archived_invalid')) {
            $audit['excludedIncompleteRides']++;
            $reason = 'deleted_or_archived_invalid';
        }
        if ($reason === '' && in_array($status, ['cancelled', 'canceled', 'rejected', 'expired'], true)) {
            $audit['excludedCancelledRides']++;
            $reason = 'cancelled_rejected_or_expired';
        }
        if ($reason === '' && !in_array($status, ['completed', 'ride_completed'], true)) {
            $audit['excludedIncompleteRides']++;
            $reason = 'ride_not_completed';
        }
        $fare = wow_financial_fare($ride);
        if ($reason === '' && $fare['value'] === null) {
            $audit['excludedInvalidFareRecords']++;
            $reason = 'invalid_final_fare';
        }
        $driverId = trim((string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? ''));
        $passengerId = trim((string)($ride['passengerId'] ?? $ride['passengerUid'] ?? ''));
        if ($reason === '' && ($driverId === '' || $passengerId === '')) {
            $audit['excludedInvalidParticipants']++;
            $reason = 'invalid_or_unassigned_participant';
        }
        $payment = $paymentMap[$docId] ?? $paymentMap[$rideId] ?? [];
        if ($reason === '' && !wow_financial_has_commission_metadata($ride, $payment)) {
            $audit['excludedPreCommissionRecords']++;
            $reason = 'pre_commission_legacy_record';
        }
        $method = wow_financial_normalize((string)($payment['paymentMethod'] ?? $ride['paymentMethod'] ?? 'cash'));
        $paymentStatus = wow_financial_normalize((string)($payment['paymentStatus'] ?? $payment['status'] ?? $ride['paymentStatus'] ?? 'unpaid'));
        if (($payment['paymentConfirmed'] ?? $ride['paymentConfirmed'] ?? false) === true && $paymentStatus === 'unpaid') $paymentStatus = 'confirmed';
        $completion = wow_financial_timestamp($payment['paymentConfirmedAt'] ?? $payment['confirmedAt'] ?? $payment['paidAt'] ?? $ride['completedAt'] ?? $ride['rideCompletedAt'] ?? null);
        if ($reason === '' && $from && (!$completion || $completion < $from || ($to && $completion >= $to))) {
            $audit['excludedOutsideDateFilter']++;
            $reason = 'outside_date_filter';
        }
        $isOnline = in_array($method, $onlineMethods, true);
        if ($reason === '' && in_array($paymentStatus, $refundStatuses, true)) {
            $audit['excludedRefundedRides']++;
            $reason = 'payment_refunded_or_reversed';
        }
        if ($reason === '' && in_array($paymentStatus, $failedStatuses, true)) {
            $audit['excludedFailedPayments']++;
            $reason = 'payment_failed_or_disputed';
        }
        if ($reason === '' && $isOnline && in_array($paymentStatus, $pendingStatuses, true)) {
            $totals['pendingOnlinePayments'] += (float)$fare['value'];
            $audit['pendingOnlineRideCount']++;
            $audit['excludedUnpaidRides']++;
            $reason = 'online_payment_pending';
        }
        if ($reason === '' && !in_array($paymentStatus, $successful, true)) {
            $audit['excludedUnpaidRides']++;
            $reason = 'payment_not_confirmed';
        }

        if ($reason !== '') {
            if ($developmentLog) error_log('[WOW Financial][excluded] ' . json_encode(['documentId' => $docId, 'rideId' => $rideId, 'reason' => $reason, 'rideStatus' => $status, 'paymentStatus' => $paymentStatus]));
            continue;
        }

        $finalFare = (float)$fare['value'];
        $commission = wow_financial_number($payment['adminCommission'] ?? $payment['platformCommission'] ?? $payment['wowCommission'] ?? $ride['adminCommission'] ?? $ride['platformCommission'] ?? $ride['wowCommission'] ?? null);
        if ($commission === null) $commission = round($finalFare * $rate, 2);
        $driverEarning = wow_financial_number($payment['driverEarning'] ?? $payment['driverShare'] ?? $ride['driverEarning'] ?? $ride['driverShare'] ?? null);
        if ($driverEarning === null) $driverEarning = round($finalFare * (1 - $rate), 2);
        $totals['grossRideRevenue'] += $finalFare;
        $totals['wowCommissionEarnings'] += $commission;
        $totals['driverEarnings'] += $driverEarning;
        $audit['validCompletedPaidRides']++;
        $row = [
            'document_id' => $docId, 'ride_id' => $rideId, 'ride_status' => $status, 'payment_method' => $method,
            'payment_status' => $paymentStatus, 'selected_fare_field' => $fare['field'], 'selected_fare_raw' => $fare['raw'],
            'final_fare' => $finalFare, 'commission_rate' => $rate, 'wow_commission' => $commission,
            'driver_earning' => $driverEarning, 'completed_at' => $completion?->format(DATE_ATOM) ?? '',
            'passenger_name' => (string)($ride['passengerName'] ?? $payment['passengerName'] ?? 'Passenger'),
            'driver_id' => $driverId, 'commission_status' => (string)($payment['commissionStatus'] ?? 'pending'),
        ];
        $included[] = $row;
        $transactions[] = $row;
        if ($developmentLog) error_log('[WOW Financial][included] ' . json_encode(array_diff_key($row, ['passenger_name' => true])));
    }

    foreach ($totals as $key => $value) $totals[$key] = round($value, 2);
    $audit = array_merge($audit, $totals, ['commissionRate' => $rate]);
    if ($developmentLog) error_log('[WOW Financial][reconciliation] ' . json_encode($audit));
    return [
        'filter' => $dateFilter, 'commissionRate' => $rate, 'totals' => $totals,
        'validCompletedRideCount' => $audit['validCompletedPaidRides'],
        'excludedRideCount' => count($rides) - $audit['validCompletedPaidRides'],
        'duplicateRideCount' => $audit['duplicateRideIdsRemoved'],
        'transactions' => $transactions, 'reconciliation' => $audit,
    ];
}
