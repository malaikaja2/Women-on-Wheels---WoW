<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/financial_service.php';

admin_require_auth();

function json_out(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit();
}

function csv_field_dash(string $value): string
{
    return '"' . str_replace('"', '""', $value) . '"';
}

function status_badge(string $status): string
{
    $status = strtolower(trim($status));
    if (in_array($status, ['accepted', 'driver_arriving', 'ride_started', 'arrived', 'in_progress'], true)) return 'active';
    if ($status === 'searching_driver') return 'searching';
    return $status === '' ? 'searching' : $status;
}

function real_admin_record(array $row): bool
{
    $id = strtolower((string)($row['uid'] ?? $row['id'] ?? $row['applicationId'] ?? $row['rideId'] ?? $row['rideCode'] ?? $row['driverId'] ?? $row['passengerId'] ?? ''));
    $email = strtolower((string)($row['email'] ?? $row['passengerEmail'] ?? $row['driverEmail'] ?? ''));
    $type = strtolower((string)($row['type'] ?? $row['category'] ?? ''));
    if (strpos($id, 'test_') === 0 || strpos($id, '_test_') !== false) return false;
    if (strpos($email, '@womenonwheels.local') !== false || strpos($email, 'test.') !== false) return false;
    if ($type === 'test' || !empty($row['isDemo']) || !empty($row['demo']) || !empty($row['sample'])) return false;
    return true;
}

function area_label($value): string
{
    $text = trim((string)$value);
    if ($text === '') return 'Unknown';
    $parts = explode(',', $text);
    return trim((string)($parts[0] ?? $text)) ?: 'Unknown';
}

function dashboard_location($value): string
{
    if (is_string($value) && trim($value) !== '') return trim($value);
    if (is_array($value)) {
        $address = trim((string)($value['address'] ?? $value['name'] ?? $value['formattedAddress'] ?? ''));
        if ($address !== '') return $address;
        $lat = $value['latitude'] ?? $value['lat'] ?? null;
        $lng = $value['longitude'] ?? $value['lng'] ?? null;
        if (is_numeric($lat) && is_numeric($lng)) return number_format((float)$lat, 5) . ', ' . number_format((float)$lng, 5);
    }
    return 'Location unavailable';
}

function top_counts(array $rows, callable $getter, int $limit = 3): array
{
    $counts = [];
    foreach ($rows as $row) {
        $key = area_label($getter($row));
        if ($key === 'Unknown') continue;
        $counts[$key] = ($counts[$key] ?? 0) + 1;
    }
    arsort($counts);
    $out = [];
    foreach (array_slice($counts, 0, $limit, true) as $label => $count) {
        $out[] = ['label' => $label, 'count' => $count];
    }
    return $out;
}

function dash_time_ms($value): int
{
    if ($value instanceof \Google\Cloud\Core\Timestamp) return $value->get()->getTimestamp() * 1000;
    if ($value instanceof \DateTimeInterface) return $value->getTimestamp() * 1000;
    if (is_numeric($value)) return (int)$value * ((int)$value < 20000000000 ? 1000 : 1);
    $parsed = strtotime((string)$value);
    return $parsed ? $parsed * 1000 : 0;
}

function dash_norm_text($value): string
{
    return strtolower(trim((string)$value));
}

function dash_truthy($value): bool
{
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return (float)$value !== 0.0;
    $text = dash_norm_text($value);
    return $text !== '' && !in_array($text, ['0', 'false', 'no', 'null', 'undefined'], true);
}

function dash_ride_key(array $ride): string
{
    foreach (['uid', 'id', 'rideId', 'ride_id', 'rideCode', 'bookingId', 'booking_id', 'requestId', 'tripId'] as $field) {
        $value = trim((string)($ride[$field] ?? ''));
        if ($value !== '') return $value;
    }
    return '';
}

function dash_scheduled_time_ms(array $ride): int
{
    foreach (['scheduledAt', 'scheduledDateTime', 'scheduleAt', 'scheduled_at', 'pickupDateTime', 'pickupAt'] as $field) {
        $ms = dash_time_ms($ride[$field] ?? null);
        if ($ms > 0) return $ms;
    }
    $date = trim((string)($ride['scheduledDate'] ?? $ride['scheduleDate'] ?? $ride['pickupDate'] ?? ''));
    if ($date !== '') {
        $time = trim((string)($ride['scheduledTime'] ?? $ride['scheduleTime'] ?? $ride['pickupTime'] ?? '23:59'));
        $ms = dash_time_ms($date . ' ' . ($time !== '' ? $time : '23:59'));
        if ($ms > 0) return $ms;
    }
    return 0;
}

function dash_is_scheduled_ride(array $ride): bool
{
    $status = dash_norm_text($ride['status'] ?? $ride['rideStatus'] ?? $ride['bookingStatus'] ?? '');
    if (in_array($status, ['completed', 'ride_completed', 'finished', 'success', 'successful', 'cancelled', 'canceled', 'cancelled_by_passenger', 'rejected', 'declined', 'expired', 'failed'], true)) return false;
    if (dash_scheduled_time_ms($ride) > 0) return true;
    if (dash_truthy($ride['isScheduled'] ?? false) || dash_truthy($ride['scheduled'] ?? false)) return true;
    if (in_array($status, ['scheduled', 'schedule_pending', 'scheduled_confirmed', 'prebooked'], true)) return true;
    $type = dash_norm_text(implode(' ', [
        (string)($ride['rideType'] ?? ''),
        (string)($ride['bookingType'] ?? ''),
        (string)($ride['requestType'] ?? ''),
        (string)($ride['scheduleType'] ?? ''),
    ]));
    return str_contains($type, 'sched') || str_contains($type, 'advance') || str_contains($type, 'prebook');
}

function daily_chart(array $rows, callable $timeGetter, callable $valueGetter = null, int $days = 7): array
{
    $labels = [];
    $values = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $key = date('Y-m-d', strtotime("-{$i} days"));
        $labels[$key] = date('M j', strtotime($key));
        $values[$key] = 0;
    }
    foreach ($rows as $row) {
        $ms = dash_time_ms($timeGetter($row));
        if (!$ms) continue;
        $key = date('Y-m-d', (int)floor($ms / 1000));
        if (!array_key_exists($key, $values)) continue;
        $values[$key] += $valueGetter ? (float)$valueGetter($row) : 1;
    }
    return [
        'labels' => array_values($labels),
        'values' => array_map(static fn($value) => round((float)$value, 2), array_values($values)),
    ];
}

function key_count_chart(array $counts, int $limit = 6): array
{
    arsort($counts);
    $counts = array_slice($counts, 0, $limit, true);
    return [
        'labels' => array_map(static fn($key) => ucwords(str_replace('_', ' ', (string)$key)), array_keys($counts)),
        'values' => array_values(array_map('intval', $counts)),
    ];
}

function pm_normalize(string $value): string { return strtolower(trim($value)); }
function pm_bool($value): bool { return filter_var($value, FILTER_VALIDATE_BOOLEAN); }
function pm_status(array $p): string
{
    return pm_bool($p['isBlocked'] ?? false) || pm_normalize((string)($p['accountStatus'] ?? $p['status'] ?? '')) === 'blocked' ? 'blocked' : 'active';
}
function pm_mask_cnic(string $cnic): string
{
    $digits = preg_replace('/\D+/', '', $cnic) ?? '';
    if (strlen($digits) < 7) return '';
    return substr($digits, 0, 5) . '-*****-' . substr($digits, -1);
}
function pm_ride_status(array $ride): string { return pm_normalize((string)($ride['status'] ?? $ride['rideStatus'] ?? '')); }
function pm_fare(array $ride): float
{
    foreach (['finalFare','paidAmount','totalFare','agreedFare','acceptedFare','fare'] as $field) if (isset($ride[$field]) && is_numeric($ride[$field])) return max(0, (float)$ride[$field]);
    return 0.0;
}
function pm_passenger_row(array $p, array $passengerRides): array
{
    usort($passengerRides, static fn(array $a, array $b): int => dash_time_ms($b['updatedAt'] ?? $b['completedAt'] ?? $b['createdAt'] ?? '') <=> dash_time_ms($a['updatedAt'] ?? $a['completedAt'] ?? $a['createdAt'] ?? ''));
    $ratings = [];
    foreach ($passengerRides as $ride) foreach (['passengerRating','ratingForPassenger','driverRatingForPassenger'] as $field) if (isset($ride[$field]) && is_numeric($ride[$field]) && (float)$ride[$field] > 0 && (float)$ride[$field] <= 5) { $ratings[] = (float)$ride[$field]; break; }
    $storedRating = $p['rating'] ?? $p['averageRating'] ?? null;
    $rating = $ratings ? array_sum($ratings) / count($ratings) : (is_numeric($storedRating) && (float)$storedRating > 0 ? (float)$storedRating : null);
    $uid = (string)($p['uid'] ?? $p['id'] ?? '');
    $lastRide = $passengerRides[0] ?? [];
    $location = $p['city'] ?? $p['location'] ?? $p['address'] ?? $lastRide['pickup'] ?? $lastRide['pickupAddress'] ?? '';
    if (is_array($location)) $location = dashboard_location($location);
    return [
        'passenger_id'=>$uid, 'uid'=>$uid,
        'name'=>(string)($p['fullName'] ?? $p['name'] ?? 'Passenger'),
        'email'=>(string)($p['email'] ?? ''), 'phone'=>(string)($p['phoneNumber'] ?? $p['phone'] ?? ''),
        'masked_cnic'=>pm_mask_cnic((string)($p['cnic'] ?? '')),
        'total_rides'=>count($passengerRides), 'rating'=>$rating, 'status'=>pm_status($p),
        'created_at'=>wow_timestamp_to_string($p['createdAt'] ?? $p['registeredAt'] ?? ''),
        'last_active'=>wow_timestamp_to_string($p['lastActive'] ?? $p['lastSeen'] ?? $lastRide['updatedAt'] ?? $p['updatedAt'] ?? $p['createdAt'] ?? ''),
        'location_hint'=>trim((string)$location) ?: 'Location not provided',
    ];
}

try {
    $mode = strtolower(trim((string)($_GET['mode'] ?? 'overview')));
    if ($mode === 'passenger_detail') {
        $uid = trim((string)($_GET['uid'] ?? ''));
        if ($uid === '') json_out(['ok'=>false, 'error'=>'passenger_required'], 422);
        $passenger = wow_doc_data('passengers', $uid);
        if (!$passenger || !real_admin_record($passenger)) json_out(['ok'=>false, 'error'=>'passenger_not_found'], 404);
        $allRides = array_values(array_filter(admin_list_collection('rides', 1000), static fn(array $r): bool => real_admin_record($r) && (string)($r['passengerId'] ?? $r['passengerUid'] ?? $r['passengerID'] ?? '') === $uid));
        $row = pm_passenger_row($passenger, $allRides);
        $completed = $cancelled = 0; $spending = 0.0;
        foreach ($allRides as $ride) { $s=pm_ride_status($ride); if (in_array($s,['completed','ride_completed'],true)) {$completed++;$spending+=pm_fare($ride);} elseif(str_starts_with($s,'cancelled') || str_starts_with($s,'canceled')) $cancelled++; }
        usort($allRides, static fn(array $a,array $b): int => dash_time_ms($b['completedAt'] ?? $b['updatedAt'] ?? $b['createdAt'] ?? '') <=> dash_time_ms($a['completedAt'] ?? $a['updatedAt'] ?? $a['createdAt'] ?? ''));
        $recent = array_map(static function(array $r): array { return ['ride_id'=>(string)($r['rideCode'] ?? $r['rideId'] ?? $r['uid'] ?? ''),'pickup'=>dashboard_location($r['pickup'] ?? $r['pickupAddress'] ?? ''),'dropoff'=>dashboard_location($r['dropoff'] ?? $r['dropoffAddress'] ?? ''),'date'=>wow_timestamp_to_string($r['completedAt'] ?? $r['updatedAt'] ?? $r['createdAt'] ?? ''),'fare'=>pm_fare($r),'status'=>pm_ride_status($r),'driver'=>(string)($r['driverName'] ?? 'Unassigned')]; }, array_slice($allRides,0,5));
        $countRelated = static function(string $collection, string $uid, ?callable $extra=null): int { $count=0; foreach(admin_list_collection($collection,300) as $item){if(!real_admin_record($item))continue;$match=(string)($item['passengerId'] ?? $item['passengerUid'] ?? $item['userId'] ?? $item['reportedBy'] ?? '')===$uid;if($match&&(!$extra||$extra($item)))$count++;}return $count; };
        $safety=['sos_alerts'=>$countRelated('sosAlerts',$uid),'complaints'=>$countRelated('reports',$uid,static fn(array $r):bool=>(string)($r['reportedBy']??$r['passengerId']??'')===$uid),'lost_found'=>$countRelated('lost_found_cases',$uid),'reports_against'=>$countRelated('reports',$uid,static fn(array $r):bool=>(string)($r['reportedUserId']??$r['againstUserId']??'')===$uid)];
        json_out(['ok'=>true,'passenger'=>$row,'ride_summary'=>['total_rides'=>count($allRides),'completed_rides'=>$completed,'cancelled_rides'=>$cancelled,'average_rating'=>$row['rating'],'total_spending'=>round($spending,2)],'recent_rides'=>$recent,'safety'=>$safety]);
    }
    if ($mode === 'revenue') {
        $financialFilter = strtolower(trim((string)($_GET['financial_filter'] ?? 'all')));
        if (!in_array($financialFilter, ['today', 'last_7_days', 'last_30_days', 'this_month', 'this_year', 'all'], true)) $financialFilter = 'all';
        $financial = wow_financial_reconcile($financialFilter, getenv('WOW_FINANCIAL_DEBUG') === '1');
        $totals = $financial['totals'];
        json_out(['ok' => true, 'generated_at' => date('c'), 'revenue' => [
            'filter' => $financialFilter,
            'commission_rate' => $financial['commissionRate'],
            'gross_ride_revenue' => $totals['grossRideRevenue'],
            'wow_commission_earnings' => $totals['wowCommissionEarnings'],
            'driver_earnings' => $totals['driverEarnings'],
            'pending_online_payments' => $totals['pendingOnlinePayments'],
            'refunded_amount' => $totals['refundedAmount'],
            'valid_completed_ride_count' => $financial['validCompletedRideCount'],
            'excluded_ride_count' => $financial['excludedRideCount'],
            'duplicate_ride_count' => $financial['duplicateRideCount'],
        ]]);
    }
    $isPassengerMode = $mode === 'passengers';
    $passengers = array_values(array_filter(admin_list_collection('passengers', 1000), 'real_admin_record'));
    $drivers = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('drivers', 1000), 'real_admin_record'));
    $driverApplications = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('driverApplications', 1000), 'real_admin_record'));
    $financialRideRows = admin_list_collection('rides', 1000);
    $rideRows = $isPassengerMode ? $financialRideRows : array_merge($financialRideRows, admin_list_collection('rideRequests', 1000));
    $ridesById = [];
    foreach (array_filter($rideRows, 'real_admin_record') as $ride) {
        $rideKey = (string)($ride['uid'] ?? $ride['rideId'] ?? $ride['rideCode'] ?? '');
        if ($rideKey !== '') $ridesById[$rideKey] = $ride;
    }
    $rides = array_values($ridesById);
    $sos = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('sosAlerts', 1000), 'real_admin_record'));
    $lostFoundCases = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('lost_found_cases', 1000), 'real_admin_record'));
    $payments = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('payments', 1000), 'real_admin_record'));
    $reports = $isPassengerMode ? [] : array_values(array_filter(admin_list_collection('reports', 1000), 'real_admin_record'));

    if ($mode === 'passengers') {
        $summary = ['total' => 0, 'active' => 0, 'blocked' => 0];
        $rows = [];
        $ridesByPassenger = [];
        foreach ($rides as $ride) {
            $passengerId = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? $ride['passengerID'] ?? '');
            if ($passengerId !== '') $ridesByPassenger[$passengerId][] = $ride;
        }
        foreach ($passengers as $passenger) {
            $uid = (string)($passenger['uid'] ?? $passenger['id'] ?? '');
            $summary['total']++;
            $status = pm_status($passenger);
            if ($status === 'blocked') $summary['blocked']++;
            else $summary['active']++;
            $passengerRides = $ridesByPassenger[$uid] ?? [];
            $rows[] = pm_passenger_row($passenger, $passengerRides);
        }

        usort($rows, static fn(array $a,array $b): int => dash_time_ms($b['last_active'] ?? '') <=> dash_time_ms($a['last_active'] ?? ''));
        $query = pm_normalize((string)($_GET['q'] ?? ''));
        $statusFilter = pm_normalize((string)($_GET['status'] ?? 'all'));
        $filtered = array_values(array_filter($rows, static function(array $row) use ($query,$statusFilter): bool {
            if ($statusFilter !== '' && $statusFilter !== 'all' && pm_normalize((string)$row['status']) !== $statusFilter) return false;
            if ($query === '') return true;
            return strpos(pm_normalize(implode(' ', [(string)$row['passenger_id'],(string)$row['name'],(string)$row['email'],(string)$row['phone'],(string)$row['masked_cnic'],(string)$row['location_hint']])), $query) !== false;
        }));

        if (isset($_GET['export']) && strtolower(trim((string)$_GET['export'])) === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename=passengers_export_' . date('Ymd_His') . '.csv');
            echo implode(',', ['Passenger Name', 'Email', 'Phone', 'Masked CNIC', 'City', 'Status', 'Total Rides', 'Rating', 'Registration Date', 'Last Active']) . "\n";
            foreach ($filtered as $row) {
                echo implode(',', array_map('csv_field_dash', [
                    (string)$row['name'], (string)$row['email'], (string)$row['phone'], (string)$row['masked_cnic'],
                    (string)$row['location_hint'], (string)$row['status'],
                    (string)$row['total_rides'], (string)($row['rating'] ?? 'Not rated'), (string)$row['created_at'], (string)$row['last_active'],
                ])) . "\n";
            }
            exit();
        }

        $pageSize = max(10, min(20, (int)($_GET['page_size'] ?? 15)));
        $total = count($filtered); $totalPages = max(1, (int)ceil($total / $pageSize));
        $page = max(1, min($totalPages, (int)($_GET['page'] ?? 1)));
        $pageRows = array_slice($filtered, ($page - 1) * $pageSize, $pageSize);
        json_out(['ok' => true, 'generated_at' => date('c'), 'admin' => $_SESSION['admin_auth'] ?? null, 'summary' => $summary, 'passengers' => $pageRows, 'pagination'=>['page'=>$page,'page_size'=>$pageSize,'total'=>$total,'total_pages'=>$totalPages,'has_prev'=>$page>1,'has_next'=>$page<$totalPages]]);
    }

    $activeStatuses = ['accepted', 'driver_assigned', 'driver_en_route', 'driver_arriving', 'ride_started', 'started', 'arrived', 'ongoing', 'in_progress', 'on_trip', 'active'];
    $searchingStatuses = ['searching', 'searching_driver', 'pending', 'requested'];
    $driverResponded = array_values(array_filter($rides, static fn(array $ride): bool => strtolower((string)($ride['status'] ?? '')) === 'driver_responded'));
    $accepted = array_values(array_filter($rides, static fn(array $ride): bool => strtolower((string)($ride['status'] ?? '')) === 'accepted'));
    $scheduledSourceRows = $isPassengerMode ? [] : array_merge($rideRows, admin_list_collection('scheduledRides', 1000), admin_list_collection('bookings', 1000));
    $scheduledById = [];
    foreach (array_filter($scheduledSourceRows, 'real_admin_record') as $ride) {
        $key = dash_ride_key($ride);
        if ($key === '') continue;
        $old = $scheduledById[$key] ?? null;
        if (!$old || dash_time_ms($ride['updatedAt'] ?? $ride['createdAt'] ?? null) >= dash_time_ms($old['updatedAt'] ?? $old['createdAt'] ?? null)) {
            $scheduledById[$key] = $ride;
        }
    }
    $scheduled = array_values(array_filter(array_values($scheduledById), 'dash_is_scheduled_ride'));
    $carpool = array_values(array_filter($rides, static fn(array $ride): bool => strtolower((string)($ride['rideType'] ?? '')) === 'carpool' || !empty($ride['carpool'])));
    $completed = array_values(array_filter($rides, static fn(array $ride): bool => in_array(strtolower(trim((string)($ride['status'] ?? ''))), ['completed', 'ride_completed'], true)));
    $cancelled = array_values(array_filter($rides, static fn(array $ride): bool => in_array(strtolower(trim((string)($ride['status'] ?? ''))), ['cancelled', 'canceled'], true)));
    $active = array_values(array_filter($rides, static fn(array $ride): bool => in_array(strtolower((string)($ride['status'] ?? '')), $activeStatuses, true)));
    $pendingDriverProfiles = array_values(array_filter($drivers, static fn(array $driver): bool => strtolower((string)($driver['verificationStatus'] ?? $driver['status'] ?? '')) === 'pending'));
    $pendingDriverApplications = array_values(array_filter($driverApplications, static fn(array $driver): bool => strtolower((string)($driver['verificationStatus'] ?? $driver['status'] ?? 'pending')) === 'pending'));
    $pendingDrivers = [];
    $seenPendingDrivers = [];
    foreach (array_merge($pendingDriverProfiles, $pendingDriverApplications) as $driver) {
        $key = strtolower((string)($driver['uid'] ?? $driver['driverId'] ?? $driver['userId'] ?? $driver['firebaseUid'] ?? $driver['applicationId'] ?? $driver['email'] ?? uniqid('driver_', true)));
        if (isset($seenPendingDrivers[$key])) continue;
        $seenPendingDrivers[$key] = true;
        $pendingDrivers[] = $driver;
    }
    $onlineDrivers = array_values(array_filter($drivers, static function (array $driver): bool {
        if (!(bool)($driver['isOnline'] ?? $driver['online'] ?? false)) return false;
        $approval = strtolower(trim((string)($driver['verificationStatus'] ?? $driver['approvalStatus'] ?? $driver['status'] ?? 'approved')));
        if (!in_array($approval, ['approved', 'verified', 'active'], true)) return false;
        $heartbeat = dash_time_ms($driver['lastHeartbeatAt'] ?? $driver['lastLocationAt'] ?? $driver['lastSeenAt'] ?? $driver['updatedAt'] ?? null);
        return $heartbeat > 0 && $heartbeat >= (int)((microtime(true) - 600) * 1000);
    }));
    $earnings = array_reduce($completed, static fn(float $carry, array $ride): float => $carry + (float)($ride['fare'] ?? 0), 0.0);
    $passengersById = [];
    foreach ($passengers as $passenger) $passengersById[(string)($passenger['uid'] ?? '')] = $passenger;
    $driversById = [];
    foreach ($drivers as $driver) $driversById[(string)($driver['uid'] ?? '')] = $driver;

    $hourly = [];
    for ($h = 0; $h < 24; $h++) $hourly[] = ['hour' => $h, 'rides_count' => 0];
    foreach ($rides as $ride) {
        $created = $ride['createdAt'] ?? null;
        if ($created instanceof \Google\Cloud\Core\Timestamp) {
            $hourly[(int)$created->get()->format('G')]['rides_count']++;
        }
    }
    $hourCounts = array_map(static fn(array $row): int => (int)($row['rides_count'] ?? 0), $hourly);
    $peakHour = max($hourCounts) > 0 ? array_search(max($hourCounts), $hourCounts, true) : null;
    $peakHourLabel = $peakHour === null ? 'N/A' : date('g A', strtotime(sprintf('%02d:00', (int)$peakHour)));

    $recentRides = [];
    foreach (array_slice(array_reverse($rides), 0, 10) as $ride) {
        $passengerId = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '');
        $driverId = (string)($ride['assignedDriverId'] ?? $ride['driverId'] ?? $ride['driverUid'] ?? '');
        $passenger = $passengersById[$passengerId] ?? null;
        $driver = $driversById[$driverId] ?? null;
        $recentRides[] = [
            'id' => (string)($ride['uid'] ?? $ride['id'] ?? $ride['rideId'] ?? $ride['rideCode'] ?? ''),
            'ride_code' => (string)($ride['rideCode'] ?? ''),
            'passenger_name' => (string)($passenger['name'] ?? 'Passenger'),
            'driver_name' => (string)($driver['name'] ?? 'Unassigned'),
            'pickup' => (string)($ride['pickup'] ?? ''),
            'dropoff' => (string)($ride['dropoff'] ?? ''),
            'fare' => (float)($ride['fare'] ?? 0),
            'payment_label' => (string)($ride['paymentLabel'] ?? ''),
            'status' => (string)($ride['status'] ?? 'pending'),
            'status_badge' => status_badge((string)($ride['status'] ?? 'pending')),
            'created_at' => wow_timestamp_to_string($ride['createdAt'] ?? ''),
        ];
    }

    $sosAlerts = [];
    foreach (array_reverse($sos) as $alert) {
        $rideId = (string)($alert['rideId'] ?? $alert['ride_id'] ?? '');
        $ride = $ridesById[$rideId] ?? [];
        $role = strtolower((string)($alert['triggered_by'] ?? $alert['reporterRole'] ?? $alert['role'] ?? ''));
        $passengerId = (string)($alert['passengerId'] ?? $alert['passengerUid'] ?? $ride['passengerId'] ?? $ride['passengerUid'] ?? '');
        $driverId = (string)($alert['driverId'] ?? $alert['driverUid'] ?? $ride['assignedDriverId'] ?? $ride['driverId'] ?? $ride['driverUid'] ?? '');
        if (!in_array($role, ['passenger', 'driver'], true)) {
            $triggeredBy = (string)($alert['triggeredBy'] ?? $alert['userId'] ?? '');
            $role = $triggeredBy !== '' && $triggeredBy === $driverId ? 'driver' : 'passenger';
        }
        $profile = $role === 'driver'
            ? ($driversById[$driverId] ?? [])
            : ($passengersById[$passengerId] ?? []);
        if (!$profile && !empty($alert['userId'])) {
            $userId = (string)$alert['userId'];
            $profile = $passengersById[$userId] ?? $driversById[$userId] ?? [];
            if (isset($driversById[$userId])) $role = 'driver';
        }
        $location = $alert['location'] ?? $alert['currentLocation'] ?? [];
        $locationPoint = is_array($location) ? $location : [];
        $lat = $alert['lat'] ?? $alert['latitude'] ?? $alert['currentLatitude'] ?? $locationPoint['lat'] ?? $locationPoint['latitude'] ?? null;
        $lng = $alert['lng'] ?? $alert['longitude'] ?? $alert['currentLongitude'] ?? $locationPoint['lng'] ?? $locationPoint['longitude'] ?? null;
        $sosAlerts[] = [
            'id' => (string)($alert['uid'] ?? ''),
            'status' => strtolower((string)($alert['status'] ?? 'active')),
            'created_at' => wow_timestamp_to_string($alert['createdAt'] ?? ''),
            'location_updated_at' => wow_timestamp_to_string($alert['locationUpdatedAt'] ?? $alert['updatedAt'] ?? $alert['createdAt'] ?? ''),
            'location' => dashboard_location($alert['location'] ?? $alert['currentLocation'] ?? null),
            'location_available' => is_numeric($lat) && is_numeric($lng),
            'ride_id' => $rideId,
            'ride_code' => (string)($alert['rideCode'] ?? $ride['rideCode'] ?? $rideId),
            'pickup' => dashboard_location($alert['pickupAddress'] ?? $alert['pickupLocation'] ?? $ride['pickupAddress'] ?? $ride['pickup'] ?? $ride['pickupLocation'] ?? null),
            'dropoff' => dashboard_location($alert['dropoffAddress'] ?? $alert['dropoffLocation'] ?? $ride['destinationAddress'] ?? $ride['dropoffAddress'] ?? $ride['dropoff'] ?? $ride['dropoffLocation'] ?? null),
            'role' => $role,
            'reporter_name' => (string)($alert['reporterName'] ?? $alert['passengerName'] ?? $alert['driverName'] ?? $profile['fullName'] ?? $profile['name'] ?? 'User unavailable'),
            'profile_image' => (string)($alert['profileImageUrl'] ?? $profile['profilePhotoUrl'] ?? $profile['profileImageUrl'] ?? ''),
        ];
    }
    $activeSosAlerts = array_values(array_filter($sosAlerts, static fn(array $alert): bool => !in_array(strtolower(trim((string)($alert['status'] ?? 'active'))), ['resolved', 'false_alarm', 'closed', 'cancelled', 'canceled'], true)));
    $activeRideIds = array_fill_keys(array_filter(array_map(static fn(array $ride): string => trim((string)($ride['uid'] ?? $ride['rideId'] ?? $ride['rideCode'] ?? '')), $active)), true);
    $emergencyRideIds = [];
    foreach ($activeSosAlerts as $alert) {
        $rideId = trim((string)($alert['ride_id'] ?? ''));
        if ($rideId !== '' && isset($activeRideIds[$rideId])) $emergencyRideIds[$rideId] = true;
    }
    $pendingDriverRows = [];
    foreach (array_slice(array_reverse($pendingDrivers), 0, 3) as $driver) {
        $pendingDriverRows[] = [
            'id' => (string)($driver['uid'] ?? $driver['driverId'] ?? $driver['userId'] ?? $driver['firebaseUid'] ?? $driver['applicationId'] ?? ''),
            'application_id' => (string)($driver['applicationId'] ?? $driver['uid'] ?? ''),
            'name' => (string)($driver['name'] ?? $driver['fullName'] ?? 'Driver'),
            'email' => (string)($driver['email'] ?? ''),
            'phone' => (string)($driver['phone'] ?? ''),
            'vehicle' => (string)($driver['vehicleType'] ?? $driver['vehicleModel'] ?? 'N/A'),
            'status' => (string)($driver['verificationStatus'] ?? $driver['status'] ?? 'pending'),
            'created_at' => wow_timestamp_to_string($driver['createdAt'] ?? $driver['appliedAt'] ?? $driver['updatedAt'] ?? ''),
        ];
    }

    $avgDuration = count($completed) ? array_reduce($completed, static fn(float $carry, array $ride): float => $carry + (float)($ride['durationMin'] ?? 0), 0.0) / count($completed) : null;
    $avgFare = count($completed) ? $earnings / count($completed) : null;
    $driverRatings = array_values(array_filter(array_map(static fn(array $driver) => $driver['rating'] ?? null, $drivers), 'is_numeric'));
    $vehicleCounts = [];
    foreach ($rides as $ride) {
        $vehicle = strtolower(trim((string)($ride['vehicleType'] ?? $ride['rideType'] ?? 'unknown')));
        $vehicleCounts[$vehicle] = ($vehicleCounts[$vehicle] ?? 0) + 1;
    }
    arsort($vehicleCounts);
    $statusChart = [
        'labels' => ['Completed', 'Cancelled'],
        'values' => [count($completed), count($cancelled)],
    ];
    $driverStatusCounts = [
        'approved' => count(array_filter($drivers, static fn(array $driver): bool => strtolower((string)($driver['verificationStatus'] ?? '')) === 'approved' || !empty($driver['isApproved']))),
        'pending' => count($pendingDrivers),
        'rejected' => count(array_filter($drivers, static fn(array $driver): bool => strtolower((string)($driver['verificationStatus'] ?? '')) === 'rejected')),
    ];
    $hourlyChart = [
        'labels' => array_map(static fn(int $hour): string => date('g A', strtotime(sprintf('%02d:00', $hour))), range(0, 23)),
        'values' => $hourCounts,
    ];
    $topPickupChart = top_counts($rides, static fn(array $ride) => $ride['pickup'] ?? $ride['pickupLocation'] ?? '', 6);
    $topDropoffChart = top_counts($rides, static fn(array $ride) => $ride['dropoff'] ?? $ride['dropoffLocation'] ?? '', 6);
    $analyticsCharts = [
        'ride_requests_by_day' => daily_chart($rides, static fn(array $ride) => $ride['createdAt'] ?? null),
        'completed_vs_cancelled' => $statusChart,
        'vehicle_type_demand' => key_count_chart($vehicleCounts),
        'peak_request_hours' => $hourlyChart,
        'pickup_areas' => [
            'labels' => array_column($topPickupChart, 'label'),
            'values' => array_column($topPickupChart, 'count'),
        ],
        'dropoff_areas' => [
            'labels' => array_column($topDropoffChart, 'label'),
            'values' => array_column($topDropoffChart, 'count'),
        ],
        'passenger_growth' => daily_chart($passengers, static fn(array $passenger) => $passenger['createdAt'] ?? $passenger['registeredAt'] ?? null),
        'driver_approval_trend' => key_count_chart($driverStatusCounts, 3),
        'sos_alerts_trend' => daily_chart($sos, static fn(array $alert) => $alert['createdAt'] ?? null),
        'revenue_trend' => ['labels' => [], 'values' => []],
    ];
    $recentPassengerGrowth = count(array_filter($passengers, static function (array $passenger): bool {
        $created = $passenger['createdAt'] ?? null;
        return $created instanceof \Google\Cloud\Core\Timestamp && $created->get()->getTimestamp() >= strtotime('-30 days');
    }));
    $analytics = [
        'top_pickups' => top_counts($rides, static fn(array $ride) => $ride['pickup'] ?? $ride['pickupLocation'] ?? ''),
        'top_dropoffs' => top_counts($rides, static fn(array $ride) => $ride['dropoff'] ?? $ride['dropoffLocation'] ?? ''),
        'vehicle_usage' => $vehicleCounts,
        'passenger_growth' => $recentPassengerGrowth,
        'driver_approval_trend' => $driverStatusCounts,
        'recent_sos' => array_slice($sosAlerts, 0, 3),
        'charts' => $analyticsCharts,
        'summary' => [
            'passengers' => count($passengers),
            'drivers' => count($drivers),
            'rides' => count($rides),
            'active_rides' => count($active),
            'completed_rides' => count($completed),
            'cancelled_rides' => count($cancelled),
            'peak_hour_label' => $peakHourLabel,
            'most_used_vehicle_type' => array_key_first($vehicleCounts) ?: 'N/A',
        ],
    ];

    $lostFoundCounts = ['open' => 0, 'item_found' => 0, 'return_arranged' => 0, 'resolved' => 0];
    $lostFoundRows = [];
    usort($lostFoundCases, static fn(array $a, array $b): int => dash_time_ms($b['updatedAt'] ?? $b['createdAt'] ?? null) <=> dash_time_ms($a['updatedAt'] ?? $a['createdAt'] ?? null));
    foreach ($lostFoundCases as $case) {
        $status = strtolower(str_replace(' ', '_', trim((string)($case['status'] ?? 'open'))));
        if (in_array($status, ['reported', 'driver_notified', 'driver_responded', 'driver_contacted', 'open'], true)) $lostFoundCounts['open']++;
        elseif (in_array($status, ['item_found', 'found'], true)) $lostFoundCounts['item_found']++;
        elseif (in_array($status, ['return_arranged', 'return_scheduled'], true)) $lostFoundCounts['return_arranged']++;
        elseif (in_array($status, ['returned', 'resolved', 'closed'], true)) $lostFoundCounts['resolved']++;
        if (count($lostFoundRows) < 3) {
            $lostFoundRows[] = [
                'id' => (string)($case['uid'] ?? $case['caseId'] ?? ''),
                'item_name' => (string)($case['itemName'] ?? $case['item'] ?? $case['itemDescription'] ?? 'Item details unavailable'),
                'ride_id' => (string)($case['rideId'] ?? ''),
                'passenger' => (string)($case['passengerName'] ?? 'Passenger unavailable'),
                'driver' => (string)($case['driverName'] ?? 'Driver unavailable'),
                'status' => $status,
                'created_at' => wow_timestamp_to_string($case['updatedAt'] ?? $case['createdAt'] ?? ''),
            ];
        }
    }

    $financialFilter = strtolower(trim((string)($_GET['financial_filter'] ?? 'all')));
    if (!in_array($financialFilter, ['today', 'last_7_days', 'last_30_days', 'this_month', 'this_year', 'all'], true)) $financialFilter = 'all';
    $financial = wow_financial_reconcile($financialFilter, getenv('WOW_FINANCIAL_DEBUG') === '1', $financialRideRows, $payments);
    $financialTotals = $financial['totals'];
    $analytics['charts']['revenue_trend'] = daily_chart(
        $financial['transactions'],
        static fn(array $row) => $row['completed_at'] ?? null,
        static fn(array $row) => (float)($row['final_fare'] ?? 0)
    );

    $openReports = count(array_filter($reports, static fn(array $report): bool => !in_array(strtolower((string)($report['status'] ?? 'open')), ['resolved', 'closed', 'rejected'], true)));
    $openLostFound = array_sum([$lostFoundCounts['open'], $lostFoundCounts['item_found'], $lostFoundCounts['return_arranged']]);
    $pendingOnlinePayments = (int)$financial['reconciliation']['pendingOnlineRideCount'];
    $activities = [];
    foreach ($rides as $ride) {
        $status = strtolower((string)($ride['status'] ?? ''));
        if (!in_array($status, ['completed', 'ride_completed', 'cancelled'], true)) continue;
        $rideId = (string)($ride['uid'] ?? $ride['rideId'] ?? $ride['rideCode'] ?? '');
        $activities[] = ['type' => $status === 'cancelled' ? 'Ride cancelled' : 'Ride completed', 'user' => (string)($ride['passengerName'] ?? 'Passenger'), 'details' => (string)($ride['rideCode'] ?? $ride['rideId'] ?? 'Ride'), 'status' => $status, 'time' => wow_timestamp_to_string($ride['completedAt'] ?? $ride['cancelledAt'] ?? $ride['updatedAt'] ?? $ride['createdAt'] ?? ''), 'route' => 'rides.php?search=' . rawurlencode($rideId)];
    }
    foreach ($drivers as $driver) {
        $status = strtolower((string)($driver['verificationStatus'] ?? ''));
        if (!in_array($status, ['pending', 'approved'], true)) continue;
        $driverId = (string)($driver['uid'] ?? $driver['driverId'] ?? '');
        $activities[] = ['type' => $status === 'approved' ? 'Driver approved' : 'Driver registration', 'user' => (string)($driver['name'] ?? $driver['fullName'] ?? 'Driver'), 'details' => (string)($driver['vehicleType'] ?? 'Vehicle unavailable'), 'status' => $status, 'time' => wow_timestamp_to_string($driver['approvedAt'] ?? $driver['updatedAt'] ?? $driver['createdAt'] ?? ''), 'route' => 'drivers.php?driver=' . rawurlencode($driverId)];
    }
    foreach ($sos as $alert) {
        $alertId = (string)($alert['uid'] ?? $alert['alertId'] ?? '');
        $activities[] = ['type' => 'SOS activity', 'user' => (string)($alert['reporterName'] ?? $alert['passengerName'] ?? $alert['driverName'] ?? 'User unavailable'), 'details' => (string)($alert['rideId'] ?? 'Ride unavailable'), 'status' => (string)($alert['status'] ?? 'active'), 'time' => wow_timestamp_to_string($alert['updatedAt'] ?? $alert['createdAt'] ?? ''), 'route' => 'sos_monitoring.php?incident=' . rawurlencode($alertId)];
    }
    foreach ($payments as $payment) {
        $paymentRideId = (string)($payment['rideCode'] ?? $payment['rideId'] ?? '');
        $activities[] = ['type' => 'Payment', 'user' => (string)($payment['passengerName'] ?? 'Passenger'), 'details' => $paymentRideId ?: 'Ride unavailable', 'status' => (string)($payment['paymentStatus'] ?? 'pending'), 'time' => wow_timestamp_to_string($payment['updatedAt'] ?? $payment['createdAt'] ?? ''), 'route' => 'payments.php?search=' . rawurlencode($paymentRideId)];
    }
    foreach ($lostFoundCases as $case) {
        $caseId = (string)($case['uid'] ?? $case['caseId'] ?? '');
        $activities[] = ['type' => 'Lost and Found', 'user' => (string)($case['passengerName'] ?? 'Passenger'), 'details' => (string)($case['itemName'] ?? $case['item'] ?? 'Item case'), 'status' => (string)($case['status'] ?? 'open'), 'time' => wow_timestamp_to_string($case['updatedAt'] ?? $case['createdAt'] ?? ''), 'route' => 'lost_found.php?case=' . rawurlencode($caseId)];
    }
    usort($activities, static fn(array $a, array $b): int => dash_time_ms($b['time']) <=> dash_time_ms($a['time']));
    $activities = array_slice($activities, 0, 5);
    $driverMapPoints = array_map(static function (array $driver): array {
        $loc = is_array($driver['currentLocation'] ?? null) ? $driver['currentLocation'] : [];
        return [
            'type' => 'driver',
            'label' => (string)($driver['name'] ?? 'Driver'),
            'status' => !empty($driver['isAvailable']) ? 'online' : 'busy',
            'lat' => $loc['lat'] ?? $loc['latitude'] ?? null,
            'lng' => $loc['lng'] ?? $loc['longitude'] ?? null,
        ];
    }, $drivers);
    $rideMapPoints = [];
    foreach ($rides as $ride) {
        $status = strtolower((string)($ride['status'] ?? ''));
        if (!in_array($status, ['searching_driver', 'accepted', 'driver_arriving', 'ride_started', 'pending', 'arrived', 'in_progress'], true)) continue;
        $rideKey = (string)($ride['uid'] ?? $ride['id'] ?? $ride['rideId'] ?? $ride['rideCode'] ?? '');
        $rideMapPoints[] = [
            'type' => 'pickup',
            'ride_id' => $rideKey,
            'label' => (string)($ride['pickup'] ?? 'Pickup'),
            'status' => $status,
            'lat' => $ride['pickupLat'] ?? null,
            'lng' => $ride['pickupLng'] ?? null,
        ];
        $rideMapPoints[] = [
            'type' => 'dropoff',
            'ride_id' => $rideKey,
            'label' => (string)($ride['dropoff'] ?? 'Drop-off'),
            'status' => $status,
            'lat' => $ride['dropLat'] ?? $ride['dropoffLat'] ?? null,
            'lng' => $ride['dropLng'] ?? $ride['dropoffLng'] ?? null,
        ];
    }
    $mapPoints = array_values(array_filter(array_merge($driverMapPoints, $rideMapPoints), static fn(array $point): bool => is_numeric($point['lat'] ?? null) && is_numeric($point['lng'] ?? null)));

    json_out([
        'ok' => true,
        'generated_at' => date('c'),
        'admin' => $_SESSION['admin_auth'] ?? null,
        'stats' => [
            'total_users' => count($passengers),
            'total_drivers' => count($drivers),
            'pending_driver_applications' => count($pendingDrivers),
            'total_rides' => count($rides),
            'active_rides' => count($active),
            'pending_rides' => count(array_filter($rides, static fn(array $ride): bool => in_array(strtolower((string)($ride['status'] ?? '')), $searchingStatuses, true))),
            'driver_responded_rides' => count($driverResponded),
            'accepted_rides' => count($accepted),
            'completed_rides' => count($completed),
            'cancelled_rides' => count($cancelled),
            'searching_rides' => count(array_filter($rides, static fn(array $ride): bool => in_array(strtolower((string)($ride['status'] ?? '')), $searchingStatuses, true))),
            'scheduled_rides' => count($scheduled),
            'carpool_rides' => count($carpool),
            'today_rides' => count(array_filter($rides, static function (array $ride): bool {
                $created = $ride['createdAt'] ?? null;
                return $created instanceof \Google\Cloud\Core\Timestamp && $created->get()->format('Y-m-d') === date('Y-m-d');
            })),
            'payment_records' => count($rides),
            'earnings' => $financialTotals['wowCommissionEarnings'],
            'active_drivers' => count($onlineDrivers),
            'busy_drivers' => count(array_filter($drivers, static fn(array $driver): bool => (bool)($driver['isOnline'] ?? false) && !(bool)($driver['isAvailable'] ?? true))),
            'sos_alerts' => count($activeSosAlerts),
            'emergency_rides' => count($emergencyRideIds),
        ],
        'quick_stats' => [
            'avg_ride_duration_min' => $avgDuration !== null ? round($avgDuration, 2) : null,
            'avg_fare' => $avgFare !== null ? round($avgFare, 2) : null,
            'driver_rating_avg' => count($driverRatings) ? round(array_sum($driverRatings) / count($driverRatings), 2) : null,
            'passenger_rating_avg' => null,
            'cancellation_rate' => count($rides) ? round((count($cancelled) / count($rides)) * 100, 2) : 0,
            'peak_hours' => $peakHourLabel,
        ],
        'hourly_activity' => $hourly,
        'recent_rides' => $recentRides,
        'pending_drivers' => $pendingDriverRows,
        'sos_alerts' => array_slice($activeSosAlerts, 0, 3),
        'lost_found' => ['counts' => $lostFoundCounts, 'cases' => $lostFoundRows],
        'revenue' => [
            'filter' => $financialFilter,
            'commission_rate' => $financial['commissionRate'],
            'gross_ride_revenue' => $financialTotals['grossRideRevenue'],
            'wow_commission_earnings' => $financialTotals['wowCommissionEarnings'],
            'driver_earnings' => $financialTotals['driverEarnings'],
            'pending_online_payments' => $financialTotals['pendingOnlinePayments'],
            'refunded_amount' => $financialTotals['refundedAmount'],
            'valid_completed_ride_count' => $financial['validCompletedRideCount'],
            'excluded_ride_count' => $financial['excludedRideCount'],
            'duplicate_ride_count' => $financial['duplicateRideCount'],
        ],
        'financial_reconciliation' => getenv('WOW_FINANCIAL_DEBUG') === '1' ? $financial['reconciliation'] : null,
        'attention' => [
            'pending_drivers' => count($pendingDrivers),
            'active_sos' => count($activeSosAlerts),
            'open_lost_found' => $openLostFound,
            'pending_payments' => $pendingOnlinePayments,
            'unresolved_reports' => $openReports,
        ],
        'recent_activity' => $activities,
        'analytics' => $analytics,
        'map_points' => $mapPoints,
        'map_center' => ['lat' => 24.8607, 'lng' => 67.0011],
    ]);
} catch (Throwable $exception) {
    error_log('Firestore dashboard data failed: ' . $exception->getMessage());
    if (strtolower(trim((string)($_GET['mode'] ?? 'overview'))) === 'passengers') {
        json_out(['ok' => false, 'message' => 'Passenger data is temporarily unavailable.'], 500);
    }
    json_out(['ok' => false, 'message' => 'Dashboard data is temporarily unavailable.'], 500);
}
