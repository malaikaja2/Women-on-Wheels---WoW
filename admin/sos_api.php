<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
admin_require_auth();

header('Content-Type: application/json; charset=utf-8');

function sos_admin_json(array $value, int $code = 200): void { http_response_code($code); echo json_encode($value); exit; }
function sos_admin_input(): array { $v = json_decode((string)file_get_contents('php://input'), true); return is_array($v) ? array_merge($_GET, $_POST, $v) : array_merge($_GET, $_POST); }
function sos_admin_text(array $v, array $keys, string $fallback = ''): string { foreach ($keys as $key) { if (isset($v[$key]) && trim((string)$v[$key]) !== '') return trim((string)$v[$key]); } return $fallback; }
function sos_admin_point($value): array {
    if (is_object($value) && method_exists($value, 'latitude')) return ['lat' => $value->latitude(), 'lng' => $value->longitude()];
    if (is_array($value)) return ['lat' => $value['lat'] ?? $value['latitude'] ?? null, 'lng' => $value['lng'] ?? $value['longitude'] ?? null];
    return ['lat' => null, 'lng' => null];
}
function sos_admin_activity(string $id, string $type, string $message, array $admin, array $meta = []): void {
    $ref = wow_firestore()->collection('sosAlerts')->document($id)->collection('activityLog')->newDocument();
    $ref->set(['type' => $type, 'message' => $message, 'adminId' => (string)($admin['uid'] ?? $admin['id'] ?? ''), 'adminName' => (string)($admin['full_name'] ?? 'Admin'), 'metadata' => $meta, 'createdAt' => wow_now()]);
}
function sos_admin_status(array $alert): string {
    $raw = strtolower(sos_admin_text($alert, ['status','alertStatus'], 'new'));
    $resolvedFlag = $alert['isResolved'] ?? false;
    $hasResolvedAt = (isset($alert['resolvedAt']) && $alert['resolvedAt'] !== '' && $alert['resolvedAt'] !== null) || (isset($alert['resolved_at']) && $alert['resolved_at'] !== '' && $alert['resolved_at'] !== null);
    $resolved = $resolvedFlag === true || strtolower((string)$resolvedFlag) === 'true' || $hasResolvedAt;
    if ($resolved) return in_array($raw, ['false_alarm','accidental','dismissed'], true) ? 'false_alarm' : 'resolved';
    if (in_array($raw, ['resolved','closed','completed','safe'], true)) return 'resolved';
    if (in_array($raw, ['false_alarm','accidental','dismissed'], true)) return 'false_alarm';
    if (in_array($raw, ['cancelled','canceled'], true)) return 'cancelled';
    if (in_array($raw, ['acknowledged','seen','accepted'], true)) return 'acknowledged';
    if (in_array($raw, ['responding','in_progress','assigned','help_on_the_way','authorities_informed'], true)) return 'responding';
    return 'new';
}
function sos_admin_notify(array $alert, string $id, string $title, string $message, string $type, array $admin): void {
    $targets = array_unique(array_filter([
        sos_admin_text($alert,['userId']), sos_admin_text($alert,['passengerId','passengerUid']), sos_admin_text($alert,['driverId','driverUid'])
    ]));
    foreach ($targets as $targetUid) {
        $ref = wow_firestore()->collection('notifications')->newDocument();
        $ref->set(['userId'=>$targetUid,'targetUid'=>$targetUid,'rideId'=>sos_admin_text($alert,['rideId','ride_id']),'sosAlertId'=>$id,'type'=>$type,'severity'=>'critical','title'=>$title,'message'=>$message,'status'=>'Unread','isRead'=>false,'createdBy'=>(string)($admin['uid']??''),'createdAt'=>wow_now(),'updatedAt'=>wow_now()]);
    }
}
function sos_admin_enrich(string $id, array $alert, ?array $context = null): array {
    $rideId = sos_admin_text($alert, ['rideId', 'ride_id']);
    $ride = $rideId !== ''
        ? ($context['rides'][$rideId] ?? ($context === null ? (wow_doc_data('rides', $rideId) ?: []) : []))
        : [];
    $passengerId = sos_admin_text($alert, ['passengerId', 'passengerUid'], sos_admin_text($ride, ['passengerId', 'passengerUid']));
    $driverId = sos_admin_text($alert, ['driverId', 'driverUid'], sos_admin_text($ride, ['assignedDriverId', 'driverId', 'driverUid']));
    $passenger = $passengerId !== ''
        ? ($context['passengers'][$passengerId] ?? ($context === null ? (wow_doc_data('passengers', $passengerId) ?: []) : []))
        : [];
    $driver = $driverId !== ''
        ? ($context['drivers'][$driverId] ?? ($context === null ? (wow_doc_data('drivers', $driverId) ?: []) : []))
        : [];
    $point = sos_admin_point($alert['location'] ?? $alert['currentLocation'] ?? null);
    if (!is_numeric($point['lat'])) $point['lat'] = $alert['lat'] ?? $alert['currentLatitude'] ?? null;
    if (!is_numeric($point['lng'])) $point['lng'] = $alert['lng'] ?? $alert['currentLongitude'] ?? null;
    if ((!is_numeric($point['lat']) || !is_numeric($point['lng'])) && $rideId !== '' && $context === null) {
        $role = strtolower(sos_admin_text($alert, ['triggered_by', 'reporterRole', 'role'], 'passenger')) === 'driver' ? 'driver' : 'passenger';
        $live = wow_doc_data('rides/' . $rideId . '/liveLocations', $role) ?: [];
        $ridePoint = $ride[$role . '_location'] ?? $ride[$role . 'Location'] ?? [];
        $point['lat'] = $live['latitude'] ?? $live['lat'] ?? $ridePoint['latitude'] ?? $ridePoint['lat'] ?? $ride[$role . 'Latitude'] ?? $point['lat'];
        $point['lng'] = $live['longitude'] ?? $live['lng'] ?? $ridePoint['longitude'] ?? $ridePoint['lng'] ?? $ride[$role . 'Longitude'] ?? $point['lng'];
    }
    $created = wow_timestamp_to_string($alert['triggeredAt'] ?? $alert['createdAt'] ?? $alert['created_at'] ?? $alert['timestamp'] ?? '');
    $acknowledged = wow_timestamp_to_string($alert['acknowledgedAt'] ?? '');
    $responding = wow_timestamp_to_string($alert['respondingAt'] ?? '');
    $resolved = wow_timestamp_to_string($alert['resolvedAt'] ?? $alert['resolved_at'] ?? '');
    $triggeredBy = strtolower(sos_admin_text($alert, ['triggered_by', 'reporterRole', 'role'], 'passenger')) === 'driver' ? 'driver' : 'passenger';
    $status = sos_admin_status($alert);
    $responseAt = $acknowledged ?: $responding;
    $vehicleModel = sos_admin_text($ride, ['vehicleModel','vehicleMake','vehicleType'], sos_admin_text($driver, ['vehicleModel','vehicleMake','vehicleType']));
    $vehiclePlate = sos_admin_text($ride, ['registrationNumber','plateNumber','vehicleNumber'], sos_admin_text($driver, ['registrationNumber','plateNumber','vehicleNumber']));
    $vehicleLabel = trim($vehicleModel . ($vehicleModel !== '' && $vehiclePlate !== '' ? ' · ' : '') . $vehiclePlate);
    $passengerName = $passengerId !== '' ? sos_admin_text($passenger, ['name','fullName'], sos_admin_text($alert, ['passengerName'], 'Passenger profile unavailable')) : 'Passenger profile unavailable';
    $driverName = $driverId !== '' ? sos_admin_text($driver, ['name','fullName'], sos_admin_text($alert, ['driverName'], 'Driver profile unavailable')) : 'Driver profile unavailable';
    return [
        'id' => $id, 'incident_id' => sos_admin_text($alert, ['incidentId', 'alertId', 'alert_id'], $id),
        'status' => $status, 'priority' => sos_admin_text($alert, ['priority'], 'critical'),
        'triggered_by' => $triggeredBy, 'triggered_label' => strtoupper($triggeredBy) . ' SOS',
        'source' => sos_admin_text($alert, ['source', 'platform'], 'connected_platform'),
        'message' => sos_admin_text($alert, ['emergencyMessage', 'message'], 'Emergency SOS triggered by ' . $triggeredBy),
        'ride_id' => $rideId, 'ride_code' => sos_admin_text($alert, ['rideCode'], sos_admin_text($ride, ['rideCode','rideId'], $rideId)), 'ride_status' => sos_admin_text($ride, ['status','rideStatus'], sos_admin_text($alert, ['rideStatus'])), 'ride_type'=>sos_admin_text($ride,['rideType','bookingType']),
        'fare'=>$ride['finalFare'] ?? $ride['acceptedFare'] ?? $ride['agreedFare'] ?? $ride['fare'] ?? null, 'payment_method'=>sos_admin_text($ride,['paymentMethod']),
        'passenger_id' => $passengerId, 'passenger_name' => $passengerName, 'passenger_phone' => sos_admin_text($passenger, ['phone', 'phoneNumber'], sos_admin_text($alert, ['passengerPhone'])),
        'driver_id' => $driverId, 'driver_name' => $driverName, 'driver_phone' => sos_admin_text($driver, ['phone', 'phoneNumber'], sos_admin_text($alert, ['driverPhone'])),
        'vehicle_label' => $vehicleLabel ?: 'Vehicle information unavailable',
        'pickup' => sos_admin_text($alert, ['pickupAddress', 'pickupLocation'], sos_admin_text($ride, ['pickupAddress', 'pickup', 'pickupLocation'])), 'destination' => sos_admin_text($alert, ['dropoffAddress', 'dropoffLocation'], sos_admin_text($ride, ['destinationAddress', 'dropoffAddress', 'dropoff', 'dropoffLocation'])),
        'pickup_lat' => $ride['pickupLat'] ?? $ride['pickupLatitude'] ?? null, 'pickup_lng' => $ride['pickupLng'] ?? $ride['pickupLongitude'] ?? null,
        'destination_lat' => $ride['destinationLatitude'] ?? $ride['destinationLat'] ?? $ride['dropoffLatitude'] ?? $ride['dropoffLat'] ?? $ride['dropLat'] ?? null, 'destination_lng' => $ride['destinationLongitude'] ?? $ride['destinationLng'] ?? $ride['dropoffLongitude'] ?? $ride['dropoffLng'] ?? $ride['dropLng'] ?? null,
        'lat' => is_numeric($point['lat']) ? (float)$point['lat'] : null, 'lng' => is_numeric($point['lng']) ? (float)$point['lng'] : null,
        'triggered_at'=>$created, 'created_at' => $created, 'acknowledged_at'=>$acknowledged, 'responding_at'=>$responding, 'resolved_at' => $resolved,
        'response_minutes' => ($created && $responseAt) ? max(0, round((strtotime($responseAt) - strtotime($created)) / 60, 1)) : null,
        'overdue'=>in_array($status,['new','acknowledged','responding'],true) && $created !== '' && strtotime($created) < time()-3600,
        'has_location'=>is_numeric($point['lat']) && is_numeric($point['lng']), 'resolution_type'=>sos_admin_text($alert,['resolutionType']),
        'admin_notes' => sos_admin_text($alert, ['adminNotes']), 'handled_by' => sos_admin_text($alert, ['handledByName', 'resolvedByName', 'handledBy', 'resolvedBy']),
    ];
}

$input = sos_admin_input(); $action = strtolower(trim((string)($input['action'] ?? 'list'))); $admin = $_SESSION['admin_auth'] ?? [];
try {
    if ($action === 'list') {
        $context = ['rides' => [], 'passengers' => [], 'drivers' => []];
        foreach (admin_list_collection('rides', 1000) as $item) { foreach (array_unique(array_filter([(string)($item['uid']??''),sos_admin_text($item,['rideId','rideCode','bookingId','requestId'])])) as $key) $context['rides'][$key]=$item; }
        foreach (admin_list_collection('passengers', 1000) as $item) $context['passengers'][(string)($item['uid'] ?? '')] = $item;
        foreach (admin_list_collection('drivers', 1000) as $item) $context['drivers'][(string)($item['uid'] ?? '')] = $item;
        $rows = [];
        foreach (admin_list_collection('sosAlerts', 1000) as $raw) {
            $id = (string)($raw['uid'] ?? $raw['alertId'] ?? '');
            if ($id !== '') $rows[] = sos_admin_enrich($id, $raw, $context);
        }
        usort($rows, static fn($a, $b) => strcmp((string)$b['created_at'], (string)$a['created_at']));
        $deduped = [];
        foreach ($rows as $row) {
            $duplicate = false;
            foreach ($deduped as $kept) {
                if ($row['ride_code'] !== '' && $row['ride_code'] === $kept['ride_code'] && $row['triggered_by'] === $kept['triggered_by']) {
                    $delta = abs(strtotime((string)$row['triggered_at']) - strtotime((string)$kept['triggered_at']));
                    if ($delta <= 30) { $duplicate = true; break; }
                }
            }
            if (!$duplicate) $deduped[] = $row;
        }
        sos_admin_json(['ok' => true, 'incidents' => $deduped]);
    }
    $id = trim((string)($input['id'] ?? '')); if ($id === '') sos_admin_json(['ok' => false, 'error' => 'incident_required'], 422);
    $alert = wow_doc_data('sosAlerts', $id); if (!$alert) sos_admin_json(['ok' => false, 'error' => 'incident_not_found'], 404);
    if ($action === 'detail') {
        $item = sos_admin_enrich($id, $alert); $logs = []; $notes = [];
        foreach (admin_list_collection('sosAlerts/' . $id . '/activityLog', 300) as $v) $logs[] = ['id' => $v['uid'] ?? '', 'type' => $v['type'] ?? '', 'message' => $v['message'] ?? '', 'admin_name' => $v['adminName'] ?? '', 'created_at' => wow_timestamp_to_string($v['createdAt'] ?? '')];
        foreach (admin_list_collection('sosAlerts/' . $id . '/notes', 300) as $v) $notes[] = ['id' => $v['uid'] ?? '', 'text' => $v['text'] ?? '', 'admin_name' => $v['adminName'] ?? '', 'created_at' => wow_timestamp_to_string($v['createdAt'] ?? '')];
        usort($logs, static fn($a,$b)=>strcmp($b['created_at'],$a['created_at'])); usort($notes, static fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));
        sos_admin_json(['ok'=>true,'incident'=>$item,'activity'=>$logs,'notes'=>$notes]);
    }
    if ($action === 'note') {
        $text = trim((string)($input['text'] ?? '')); if ($text === '') sos_admin_json(['ok'=>false,'error'=>'note_required'],422);
        $ref = wow_firestore()->collection('sosAlerts')->document($id)->collection('notes')->newDocument();
        $ref->set(['text'=>$text,'adminId'=>(string)($admin['uid']??''),'adminName'=>(string)($admin['full_name']??'Admin'),'createdAt'=>wow_now()]);
        wow_set_doc('sosAlerts',$id,['adminNotes'=>$text,'handledBy'=>(string)($admin['uid']??''),'handledByName'=>(string)($admin['full_name']??'Admin'),'updatedAt'=>wow_now()],true);
        sos_admin_activity($id,'note_added','Internal note added',$admin); sos_admin_json(['ok'=>true]);
    }
    if ($action === 'event') {
        $type = trim((string)($input['type'] ?? 'admin_action')); $message = trim((string)($input['message'] ?? 'Admin action recorded'));
        if ($type === 'emergency_message_sent') {
            $rideId = sos_admin_text($alert, ['rideId', 'ride_id']);
            foreach (array_unique(array_filter([
                sos_admin_text($alert, ['passengerId', 'passengerUid']),
                sos_admin_text($alert, ['driverId', 'driverUid']),
            ])) as $targetUid) {
                $notice = wow_firestore()->collection('notifications')->newDocument();
                $notice->set([
                    'userId' => $targetUid, 'targetUid' => $targetUid, 'rideId' => $rideId,
                    'sosAlertId' => $id, 'type' => 'emergency_message', 'severity' => 'critical',
                    'title' => 'Emergency Safety Message', 'message' => $message, 'isRead' => false,
                    'sentBy' => (string)($admin['uid'] ?? ''), 'createdAt' => wow_now(), 'updatedAt' => wow_now(),
                ]);
            }
        }
        sos_admin_activity($id,$type,$message,$admin); sos_admin_json(['ok'=>true]);
    }
    if ($action === 'status') {
        $status = strtolower(trim((string)($input['status'] ?? ''))); $allowed=['new','acknowledged','responding','resolved','false_alarm']; if (!in_array($status,$allowed,true)) sos_admin_json(['ok'=>false,'error'=>'invalid_status'],422);
        $terminal = in_array($status,['resolved','false_alarm'],true);
        $resolutionNote = trim((string)($input['resolutionNotes'] ?? $input['resolutionNote'] ?? $input['resolution_note'] ?? ''));
        $resolutionType = trim((string)($input['resolutionType'] ?? ($status === 'false_alarm' ? 'False alarm' : '')));
        if ($terminal && $resolutionNote === '') sos_admin_json(['ok'=>false,'error'=>'resolution_note_required','message'=>'A resolution note is required.'],422);
        $adminUid = (string)($admin['uid'] ?? $admin['id'] ?? '');
        $adminName = (string)($admin['full_name'] ?? 'Admin');
        $updates=['status'=>$status,'handledBy'=>$adminUid,'handledByName'=>$adminName,'updatedAt'=>wow_now()];
        if ($status === 'acknowledged') $updates += ['acknowledgedAt'=>wow_now(),'acknowledgedBy'=>$adminUid,'acknowledgedByName'=>$adminName];
        if ($status === 'responding') $updates += ['respondingAt'=>wow_now(),'respondingBy'=>$adminUid,'respondingByName'=>$adminName];
        if ($terminal) {
            $updates += [
                'isResolved'=>true,
                'resolvedAt'=>wow_now(),'resolved_at'=>wow_now(),
                'resolvedBy'=>$adminUid,'resolvedByName'=>$adminName,
                'resolutionType'=>$resolutionType,'resolutionNotes'=>$resolutionNote,'resolutionNote'=>$resolutionNote,
            ];
        }
        wow_set_doc('sosAlerts',$id,$updates,true); $rideId=sos_admin_text($alert,['rideId','ride_id']); if ($terminal && $rideId!=='') wow_set_doc('rides',$rideId,['sosActive'=>false,'activeEmergencyAlertId'=>null,'safetyStatus'=>$status,'updatedAt'=>wow_now()],true);
        sos_admin_activity(
            $id,
            $terminal?'incident_resolved':'status_changed',
            $terminal?'Incident closed as '.str_replace('_',' ',$status).': '.$resolutionNote:'Status changed to '.str_replace('_',' ',$status),
            $admin,
            ['previousStatus'=>sos_admin_status($alert),'newStatus'=>$status,'resolutionType'=>$resolutionType,'notes'=>$resolutionNote]
        );
        if ($status === 'acknowledged') sos_admin_notify($alert,$id,'SOS Alert Received','Your SOS alert has been received by the Women on Wheels safety team.','sos_acknowledged',$admin);
        elseif ($status === 'responding') sos_admin_notify($alert,$id,'Safety Team Responding','The safety team is responding to your SOS alert.','sos_responding',$admin);
        elseif ($terminal) sos_admin_notify($alert,$id,'SOS Alert Resolved','Your SOS incident has been marked resolved by the safety team.','sos_resolved',$admin);
        sos_admin_json(['ok'=>true,'status'=>$status]);
    }
    sos_admin_json(['ok'=>false,'error'=>'unsupported_action'],422);
} catch (Throwable $e) { error_log('SOS admin API: '.$e->getMessage()); sos_admin_json(['ok'=>false,'error'=>'sos_operation_failed'],500); }
