<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';
require_once __DIR__ . '/../admin/financial_service.php';

$input = array_merge($_GET, $_POST, fare_input());
$driverUid = fare_resolve_user_id($conn, 'driver', $input);
if ($driverUid === '') fare_json(['ok' => false, 'error' => 'driver_required'], 422);

$driverProfile = wow_get_driver_profile($driverUid, true) ?: [];
$driverRole = strtolower((string)($driverProfile['role'] ?? ''));
$driverGender = strtolower((string)($driverProfile['gender'] ?? ''));
if ($driverGender !== '' && $driverGender !== 'female') {
    fare_json(['ok' => false, 'error' => 'female_driver_required'], 403);
}
if ($driverRole === 'driver_applicant' || !wow_driver_is_approved($driverProfile)) {
    fare_json(['ok' => false, 'error' => 'driver_pending'], 403);
}

$cacheKey = 'wow_driver_earnings_' . sha1($driverUid) . '.json';
$cacheFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$refresh = in_array(strtolower((string)($input['refresh'] ?? '')), ['1', 'true', 'yes'], true);
if (!$refresh && is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) <= 10) {
    $cached = (string)@file_get_contents($cacheFile);
    if ($cached !== '') {
        header('Content-Type: application/json; charset=utf-8');
        echo $cached;
        exit();
    }
}

function driver_earnings_rows(string $collectionPath, int $limit = 150): array
{
    $rows = [];
    foreach (wow_firestore()->collection($collectionPath)->limit($limit)->documents() as $doc) {
        if (!$doc->exists()) continue;
        $row = $doc->data();
        $row['uid'] = $doc->id();
        $rows[] = $row;
    }
    return $rows;
}

function driver_earnings_query(string $collection, string $field, string $value, int $limit = 150): array
{
    $rows = [];
    if ($value === '') return $rows;
    foreach (wow_firestore()->collection($collection)->where($field, '=', $value)->limit($limit)->documents() as $doc) {
        if (!$doc->exists()) continue;
        $row = $doc->data();
        $row['uid'] = $doc->id();
        $rows[$doc->id()] = $row;
    }
    return array_values($rows);
}

function driver_earnings_date_key(?DateTimeImmutable $date, string $format): string
{
    return $date ? $date->setTimezone(new DateTimeZone('Asia/Karachi'))->format($format) : '';
}

function driver_earnings_ride_id(array $row, string $fallback = ''): string
{
    $value = trim((string)($row['rideId'] ?? $row['uid'] ?? $row['id'] ?? $fallback));
    return $value !== '' ? $value : $fallback;
}

function driver_earnings_entry(array $source, string $rideId, float $earning, ?DateTimeImmutable $date, array $extra = []): array
{
    return array_merge([
        'ride_id' => $rideId,
        'passenger_name' => (string)($source['passengerName'] ?? 'Passenger'),
        'pickup' => (string)($source['pickupName'] ?? $source['pickupAddress'] ?? $source['pickup'] ?? ''),
        'dropoff' => (string)($source['destinationName'] ?? $source['destinationAddress'] ?? $source['dropoffAddress'] ?? $source['dropoff'] ?? ''),
        'fare' => wow_financial_number($source['finalFare'] ?? $source['amount'] ?? $source['fare'] ?? null) ?? 0.0,
        'driver_earning' => round($earning, 2),
        'payment_method' => (string)($source['paymentMethod'] ?? ''),
        'payment_status' => (string)($source['paymentStatus'] ?? $source['status'] ?? ''),
        'commission_status' => (string)($source['commissionStatus'] ?? ''),
        'distance_km' => wow_financial_number($source['distanceKm'] ?? $source['totalDistanceKm'] ?? null),
        'completed_at' => $date?->format(DATE_ATOM) ?? '',
    ], $extra);
}

try {
    $ledgerRows = driver_earnings_rows('driverEarnings/' . $driverUid . '/rides', 150);
    $paymentRows = driver_earnings_query('payments', 'driverId', $driverUid, 150);
    $rideRows = driver_earnings_query('rides', 'assignedDriverId', $driverUid, 150);

    $entries = [];
    $seenRideIds = [];
    foreach ($ledgerRows as $row) {
        if (strtolower((string)($row['status'] ?? '')) !== 'earned') continue;
        $rideId = driver_earnings_ride_id($row);
        if ($rideId === '' || isset($seenRideIds[$rideId])) continue;
        $earning = wow_financial_number($row['earning'] ?? $row['driverEarning'] ?? null);
        if ($earning === null || $earning <= 0) continue;
        $date = wow_financial_timestamp($row['completedAt'] ?? $row['createdAt'] ?? null);
        $entries[] = driver_earnings_entry($row, $rideId, $earning, $date, ['source' => 'ledger']);
        $seenRideIds[$rideId] = true;
    }

    $paidStatuses = ['paid', 'demo_paid', 'cash_collected', 'completed', 'success', 'successful', 'confirmed', 'collected', 'received'];
    foreach ($paymentRows as $row) {
        $status = wow_financial_normalize((string)($row['paymentStatus'] ?? $row['status'] ?? ''));
        if (!in_array($status, $paidStatuses, true)) continue;
        $rideId = driver_earnings_ride_id($row);
        if ($rideId === '' || isset($seenRideIds[$rideId])) continue;
        $fare = wow_financial_number($row['finalFare'] ?? $row['amount'] ?? $row['fare'] ?? null) ?? 0.0;
        $earning = wow_financial_number($row['driverEarning'] ?? $row['driverShare'] ?? null);
        if ($earning === null) $earning = round($fare * 0.70, 2);
        if ($earning <= 0) continue;
        $date = wow_financial_timestamp($row['paidAt'] ?? $row['collectedAt'] ?? $row['updatedAt'] ?? $row['createdAt'] ?? null);
        $entries[] = driver_earnings_entry($row, $rideId, $earning, $date, ['source' => 'payment']);
        $seenRideIds[$rideId] = true;
    }

    foreach ($rideRows as $row) {
        $status = wow_financial_normalize((string)($row['status'] ?? ''));
        if (!in_array($status, ['completed', 'ride_completed'], true)) continue;
        $rideId = driver_earnings_ride_id($row);
        if ($rideId === '' || isset($seenRideIds[$rideId])) continue;
        $fare = wow_financial_number($row['finalFare'] ?? $row['agreedFare'] ?? $row['acceptedFare'] ?? $row['fare'] ?? $row['estimatedFare'] ?? null) ?? 0.0;
        if ($fare <= 0) continue;
        $earning = wow_financial_number($row['driverEarning'] ?? $row['driverShare'] ?? null);
        if ($earning === null) $earning = round($fare * 0.70, 2);
        $date = wow_financial_timestamp($row['completedAt'] ?? $row['updatedAt'] ?? $row['createdAt'] ?? null);
        $entries[] = driver_earnings_entry($row, $rideId, $earning, $date, ['source' => 'ride']);
        $seenRideIds[$rideId] = true;
    }

    usort($entries, static function (array $a, array $b): int {
        return strcmp((string)($b['completed_at'] ?? ''), (string)($a['completed_at'] ?? ''));
    });

    $todayKey = (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('Y-m-d');
    $weekKey = (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('o-W');
    $monthKey = (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('Y-m');
    $today = $week = $month = $total = 0.0;
    foreach ($entries as $entry) {
        $earning = (float)($entry['driver_earning'] ?? 0);
        $total += $earning;
        $date = wow_financial_timestamp($entry['completed_at'] ?? null);
        if (driver_earnings_date_key($date, 'Y-m-d') === $todayKey) $today += $earning;
        if (driver_earnings_date_key($date, 'o-W') === $weekKey) $week += $earning;
        if (driver_earnings_date_key($date, 'Y-m') === $monthKey) $month += $earning;
    }

    $reviews = [];
    $ratingSum = 0;
    foreach (driver_earnings_query('rideReviews', 'driverUid', $driverUid, 50) as $review) {
        $rating = (float)($review['rating'] ?? 0);
        if ($rating < 1 || $rating > 5) continue;
        $ratingSum += $rating;
        $reviews[] = [
            'id' => (string)($review['uid'] ?? ''),
            'rideId' => (string)($review['rideId'] ?? ''),
            'rating' => $rating,
            'reviewText' => (string)($review['reviewText'] ?? $review['review'] ?? ''),
            'passengerName' => (string)($review['passengerName'] ?? 'Passenger'),
            'createdAt' => wow_timestamp_to_string($review['createdAt'] ?? ''),
        ];
    }

    $payload = [
        'ok' => true,
        'summary' => [
            'today' => round($today, 2),
            'week' => round($week, 2),
            'month' => round($month, 2),
            'total' => round($total, 2),
            'completed_count' => count($entries),
        ],
        'history' => array_slice($entries, 0, 50),
        'rating_summary' => [
            'avg_rating' => count($reviews) ? round($ratingSum / count($reviews), 2) : 0,
            'total_reviews' => count($reviews),
        ],
        'recent_reviews' => array_slice($reviews, 0, 20),
        'read_strategy' => 'driver_ledger_payments_completed_rides',
        'cache_seconds' => 10,
    ];
    $json = json_encode($payload);
    if (is_string($json)) @file_put_contents($cacheFile, $json, LOCK_EX);
    fare_json($payload);
} catch (Throwable $exception) {
    error_log('Driver earnings data failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'driver_earnings_failed'], 500);
}
