<?php
require_once 'db.php';
require_once 'fare_engine.php';

if (!fare_ensure_rides_table($conn)) {
    fare_json(['ok' => false, 'error' => 'rides_table_create_failed'], 500);
}

$input = array_merge($_GET, $_POST, fare_input());
$driverId = fare_resolve_user_id($conn, 'driver', $input);
if ($driverId <= 0) {
    fare_json(['ok' => false, 'error' => 'driver_required'], 422);
}

$vehicleStmt = $conn->prepare('SELECT vehicle_type FROM drivers WHERE id = ? LIMIT 1');
$driverVehicle = 'car';
if ($vehicleStmt) {
    $vehicleStmt->bind_param('i', $driverId);
    $vehicleStmt->execute();
    $vehicleRow = $vehicleStmt->get_result()->fetch_assoc();
    if ($vehicleRow && isset($vehicleRow['vehicle_type'])) {
        $driverVehicle = fare_normalize_vehicle((string)$vehicleRow['vehicle_type']);
    }
}

$requestsSql = "SELECT r.id, r.ride_code, r.pickup, r.dropoff, r.distance_km, r.duration_min, r.vehicle_type, r.fare, r.status, r.created_at,
                       p.name AS passenger_name, p.phone AS passenger_phone
                FROM rides r
                INNER JOIN passengers p ON p.id = r.passenger_id
                WHERE r.status = 'requested' AND r.driver_id IS NULL AND r.vehicle_type = ?
                ORDER BY r.id DESC
                LIMIT 50";
$requestsStmt = $conn->prepare($requestsSql);
$requests = [];
if ($requestsStmt) {
    $requestsStmt->bind_param('s', $driverVehicle);
    $requestsStmt->execute();
    $res = $requestsStmt->get_result();
    while ($res && ($row = $res->fetch_assoc())) {
        $requests[] = $row;
    }
}

$activeSql = "SELECT r.id, r.ride_code, r.pickup, r.dropoff, r.distance_km, r.duration_min, r.vehicle_type, r.fare, r.status, r.created_at, r.updated_at,
                     p.name AS passenger_name, p.phone AS passenger_phone
              FROM rides r
              INNER JOIN passengers p ON p.id = r.passenger_id
              WHERE r.driver_id = ? AND r.status IN ('accepted', 'arrived', 'in_progress')
              ORDER BY r.updated_at DESC
              LIMIT 1";
$activeStmt = $conn->prepare($activeSql);
$activeRide = null;
if ($activeStmt) {
    $activeStmt->bind_param('i', $driverId);
    $activeStmt->execute();
    $activeRide = $activeStmt->get_result()->fetch_assoc() ?: null;
}

$historySql = "SELECT r.id, r.ride_code, r.pickup, r.dropoff, r.distance_km, r.duration_min, r.vehicle_type, r.fare, r.status, r.created_at, r.completed_at,
                      p.name AS passenger_name
               FROM rides r
               INNER JOIN passengers p ON p.id = r.passenger_id
               WHERE r.driver_id = ? AND r.status IN ('completed', 'cancelled')
               ORDER BY r.id DESC
               LIMIT 100";
$historyStmt = $conn->prepare($historySql);
$history = [];
if ($historyStmt) {
    $historyStmt->bind_param('i', $driverId);
    $historyStmt->execute();
    $res = $historyStmt->get_result();
    while ($res && ($row = $res->fetch_assoc())) {
        $history[] = $row;
    }
}

$summary = [
    'today' => 0.0,
    'week' => 0.0,
    'total' => 0.0
];

$sumTotalStmt = $conn->prepare("SELECT COALESCE(SUM(fare), 0) AS total FROM rides WHERE driver_id = ? AND status = 'completed'");
if ($sumTotalStmt) {
    $sumTotalStmt->bind_param('i', $driverId);
    $sumTotalStmt->execute();
    $row = $sumTotalStmt->get_result()->fetch_assoc();
    if ($row) $summary['total'] = (float)$row['total'];
}

$sumTodayStmt = $conn->prepare("SELECT COALESCE(SUM(fare), 0) AS total FROM rides WHERE driver_id = ? AND status = 'completed' AND DATE(completed_at) = CURDATE()");
if ($sumTodayStmt) {
    $sumTodayStmt->bind_param('i', $driverId);
    $sumTodayStmt->execute();
    $row = $sumTodayStmt->get_result()->fetch_assoc();
    if ($row) $summary['today'] = (float)$row['total'];
}

$sumWeekStmt = $conn->prepare("SELECT COALESCE(SUM(fare), 0) AS total FROM rides WHERE driver_id = ? AND status = 'completed' AND YEARWEEK(completed_at, 1) = YEARWEEK(CURDATE(), 1)");
if ($sumWeekStmt) {
    $sumWeekStmt->bind_param('i', $driverId);
    $sumWeekStmt->execute();
    $row = $sumWeekStmt->get_result()->fetch_assoc();
    if ($row) $summary['week'] = (float)$row['total'];
}

fare_json([
    'ok' => true,
    'driver_id' => $driverId,
    'driver_vehicle_type' => $driverVehicle,
    'requests' => $requests,
    'active_ride' => $activeRide,
    'history' => $history,
    'summary' => $summary
]);

