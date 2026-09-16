<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
admin_require_auth();
header('Content-Type: application/json; charset=utf-8');

function shell_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit();
}

function shell_text(array $row, array $keys): string
{
    foreach ($keys as $key) {
        $value = trim((string)($row[$key] ?? ''));
        if ($value !== '') return $value;
    }
    return '';
}

function shell_is_admin_notification(array $row, string $adminUid): bool
{
    $targetRole = strtolower(shell_text($row, ['targetRole', 'recipientRole', 'role']));
    $targetUid = shell_text($row, ['targetUid', 'userId', 'recipientId']);
    if (in_array($targetRole, ['admin', 'admins', 'super_admin', 'owner'], true) || ($adminUid !== '' && $targetUid === $adminUid)) return true;
    if ($targetRole !== '' || $targetUid !== '') return false;
    $type = strtolower(shell_text($row, ['type', 'notificationType', 'category']));
    foreach (['driver_verification','driver_application','sos','emergency','ride_issue','payment_confirmation','payment_pending','refund','passenger_report','lost_found','support_request'] as $adminType) {
        if (str_contains($type, $adminType)) return true;
    }
    return false;
}

$input = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($input)) $input = array_merge($_GET, $_POST);
$action = strtolower(trim((string)($input['action'] ?? 'notifications')));
$admin = $_SESSION['admin_auth'] ?? [];

try {
    if ($action === 'profile') {
        $uid = (string)($admin['uid'] ?? $admin['id'] ?? '');
        $profile = $uid !== '' ? (wow_doc_data('admins', $uid) ?: []) : [];
        shell_json(['ok' => true, 'profile' => [
            'uid' => $uid,
            'name' => shell_text($profile, ['fullName', 'full_name', 'name']) ?: (string)($admin['full_name'] ?? 'Admin'),
            'email' => shell_text($profile, ['email']) ?: (string)($admin['email'] ?? ''),
            'role' => shell_text($profile, ['role']) ?: (string)($admin['role'] ?? 'admin'),
            'photo' => shell_text($profile, ['profilePhotoUrl', 'profileImageUrl', 'photoURL']),
            'status' => shell_text($profile, ['accountStatus', 'status']) ?: (!empty($profile['isActive']) ? 'active' : 'active'),
            'phone' => shell_text($profile, ['phone', 'phoneNumber']),
            'last_login' => wow_timestamp_to_string($profile['lastLoginAt'] ?? $profile['lastLogin'] ?? ''),
        ]]);
    }

    if (in_array($action, ['mark_read','mark_unread','mark_all_read','delete_notification'], true)) {
        if (!admin_verify_csrf_token((string)($input['csrf'] ?? ''))) shell_json(['ok'=>false,'message'=>'Your secure session expired. Refresh and try again.'],403);
        $id = trim((string)($input['id'] ?? ''));
        $adminUid = (string)($admin['uid'] ?? $admin['id'] ?? '');
        if (in_array($action, ['mark_read','mark_unread','delete_notification'], true)) {
            if ($id === '') shell_json(['ok' => false, 'error' => 'notification_required'], 422);
            $notification = wow_doc_data('notifications', $id) ?: [];
            if (!$notification || !shell_is_admin_notification($notification, $adminUid)) {
                shell_json(['ok' => false, 'error' => 'notification_unavailable'], 404);
            }
            if ($action === 'delete_notification') wow_set_doc('notifications',$id,['status'=>'Archived','isArchived'=>true,'archivedAt'=>wow_now(),'archivedBy'=>$adminUid],true);
            elseif($action === 'mark_unread') wow_set_doc('notifications',$id,['status'=>'Unread','isRead'=>false,'readAt'=>null],true);
            else wow_set_doc('notifications', $id, ['status' => 'Read', 'isRead' => true, 'readAt' => wow_now()], true);
        } else {
            foreach (admin_list_collection('notifications', 100) as $notification) {
                $notificationId = (string)($notification['uid'] ?? '');
                if ($notificationId === '' || !shell_is_admin_notification($notification, $adminUid) || !empty($notification['isRead']) || strtolower((string)($notification['status'] ?? '')) === 'read') continue;
                wow_set_doc('notifications', $notificationId, ['status' => 'Read', 'isRead' => true, 'readAt' => wow_now(), 'updatedAt' => wow_now()], true);
            }
        }
        shell_json(['ok' => true]);
    }

    if ($action === 'search') {
        $query = strtolower(trim((string)($input['q'] ?? '')));
        if (mb_strlen($query) < 2) shell_json(['ok' => true, 'results' => []]);
        $results = [];
        $sources = [
            ['passenger','passengers',100,['uid','name','fullName','email','phone','phoneNumber','cnic','city','status'],'dashboard.php?view=passengers&passenger='],
            ['driver','drivers',100,['uid','name','fullName','email','phone','phoneNumber','cnic','cnicNumber','vehicleNumber','registrationNumber','verificationStatus','status'],'drivers.php?driver='],
            ['driver_application','driverApplications',100,['uid','applicationId','driverId','name','fullName','email','phone','cnicNumber','vehicleNumber','status','verificationStatus'],'drivers.php?filter=pending&driver='],
            ['ride','rides',150,['uid','rideId','rideCode','passengerName','driverName','passengerEmail','driverEmail','passengerPhone','driverPhone','pickup','pickupAddress','dropoff','dropoffAddress','destinationAddress','status','vehicleNumber'],'rides.php?search='],
            ['payment','payments',100,['uid','paymentId','transactionId','rideId','passengerName','driverName','paymentMethod','paymentStatus'],'payments.php?search='],
            ['rating','rideReviews',100,['uid','ratingId','reviewId','rideId','passengerName','driverName','review','reviewText','status'],'ratings_reviews.php?search='],
            ['sos','sosAlerts',100,['uid','alertId','rideId','rideCode','passengerName','driverName','reporterName','pickupAddress','dropoffAddress','status'],'sos_monitoring.php?incident='],
            ['lost_found','lost_found_cases',100,['uid','caseId','rideId','passengerName','driverName','itemName','category','status'],'lost_found.php?case='],
            ['notification','notifications',100,['uid','notificationId','title','message','body','rideId','type','status'],'notifications.php?search='],
            ['assistant','chatbotMessages',100,['uid','conversationId','message','response','intent','issueCategory','passengerName','driverName','userRole'],'wow_assistant.php?search='],
        ];
        $cacheFile=sys_get_temp_dir().DIRECTORY_SEPARATOR.'wow_admin_global_search_'.WOW_FIREBASE_PROJECT_ID.'.json';
        $catalog=[];$cacheFresh=is_file($cacheFile)&&(time()-(int)filemtime($cacheFile)<600);
        if($cacheFresh){$decoded=json_decode((string)file_get_contents($cacheFile),true);if(is_array($decoded))$catalog=$decoded;}
        if(!$catalog){
            foreach ($sources as [$type,$collection,$limit,$fields,$route]) foreach (admin_list_collection($collection, $limit) as $row) {
                if(!empty($row['isArchived']))continue;
                $id=shell_text($row,['uid','rideId','rideCode','paymentId','ratingId','reviewId','alertId','caseId','conversationId','applicationId']);if($id==='')continue;
                $name=shell_text($row,['name','fullName','rideCode','paymentId','title','alertId','caseId','itemName','message'])?:$id;
                $detail=shell_text($row,['email','phone','phoneNumber','verificationStatus','paymentStatus','status','rideId','pickupAddress','pickup','reviewText','category']);
                $targetRoute=$route.rawurlencode($id);if($type==='ride')$targetRoute.='&open='.rawurlencode($id);
                $catalog[]=['type'=>$type,'id'=>$id,'name'=>$name,'detail'=>$detail,'route'=>$targetRoute,'search'=>strtolower(implode(' ',array_map(static fn(string$field):string=>(string)($row[$field]??''),$fields)))];
            }
            @file_put_contents($cacheFile,json_encode($catalog),LOCK_EX);
        }
        $typeCounts=[];foreach($catalog as$item){$type=(string)($item['type']??'');if(($typeCounts[$type]??0)>=4||!str_contains((string)($item['search']??''),$query))continue;unset($item['search']);$results[]=$item;$typeCounts[$type]=($typeCounts[$type]??0)+1;}
        foreach ([['settings','Fare & Commission Settings','Pricing, platform availability and safety configuration','settings.php#pricing'],['settings','Safety & SOS Settings','SOS countdown and emergency preferences','settings.php#safety'],['settings','Notification Settings','Admin, passenger and driver preferences','settings.php#notifications']] as $setting) {
            if (str_contains(strtolower($setting[1].' '.$setting[2]),$query)) $results[]=['type'=>$setting[0],'id'=>$setting[3],'name'=>$setting[1],'detail'=>$setting[2],'route'=>$setting[3]];
        }
        shell_json(['ok' => true, 'results' => $results]);
    }

    $items = [];
    $adminUid = (string)($admin['uid'] ?? $admin['id'] ?? '');
    foreach (array_reverse(admin_list_collection('notifications', 200)) as $notification) {
        $id = (string)($notification['uid'] ?? '');
        if ($id === '' || !shell_is_admin_notification($notification, $adminUid) || !empty($notification['isArchived'])) continue;
        $items[] = [
            'id'=>$id,
            'title'=>(string)($notification['title'] ?? 'Notification'),
            'message'=>(string)($notification['message'] ?? $notification['body'] ?? $notification['description'] ?? ''),
            'user'=>(string)($notification['userName'] ?? $notification['passengerName'] ?? $notification['driverName'] ?? $notification['senderName'] ?? ''),
            'type'=>(string)($notification['type'] ?? $notification['targetRole'] ?? 'system'),
            'created_at'=>wow_timestamp_to_string($notification['createdAt'] ?? ''),
            'read'=>!empty($notification['isRead']) || strtolower((string)($notification['status'] ?? '')) === 'read',
            'ride_id'=>(string)($notification['rideId'] ?? ''),
            'sos_id'=>(string)($notification['sosAlertId'] ?? ''),
            'route'=>(static function(array $row): string {
                $type = strtolower((string)($row['type'] ?? $row['notificationType'] ?? ''));
                $rideId = (string)($row['rideId'] ?? ''); $sosId = (string)($row['sosAlertId'] ?? $row['alertId'] ?? '');
                $driverId = (string)($row['driverId'] ?? $row['driverUid'] ?? ''); $caseId = (string)($row['caseId'] ?? $row['lostFoundId'] ?? '');
                if ($sosId !== '' || str_contains($type, 'sos') || str_contains($type, 'emergency')) return 'sos_monitoring.php' . ($sosId !== '' ? '?incident='.rawurlencode($sosId) : '?filter=active');
                if (str_contains($type, 'payment') || str_contains($type, 'refund')) return 'payments.php' . ($rideId !== '' ? '?search='.rawurlencode($rideId) : '?filter=pending');
                if ($caseId !== '' || str_contains($type, 'lost')) return 'lost_found.php' . ($caseId !== '' ? '?case='.rawurlencode($caseId) : '');
                if ($driverId !== '' || str_contains($type, 'driver_verification') || str_contains($type, 'driver_application')) return 'drivers.php' . ($driverId !== '' ? '?driver='.rawurlencode($driverId) : '?filter=pending');
                if ($rideId !== '') return 'rides.php?search='.rawurlencode($rideId);
                if (str_contains($type, 'passenger') || str_contains($type, 'report')) return 'dashboard.php?view=passengers';
                return 'notifications.php';
            })($notification),
        ];
    }
    $unreadTotal=count(array_filter($items, static fn(array $item): bool => !$item['read']));
    shell_json(['ok'=>true,'notifications'=>array_slice($items,0,25),'unread'=>$unreadTotal]);
} catch (Throwable $error) {
    error_log('Admin shell data failed: ' . $error->getMessage());
    shell_json(['ok'=>false,'error'=>'admin_shell_unavailable'],500);
}
