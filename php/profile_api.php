<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';
require_once __DIR__ . '/auth_audit_service.php';

$input = array_merge($_GET, $_POST, fare_input());
$action = strtolower(trim((string)($input['action'] ?? 'get')));
$uid = fare_resolve_user_id($conn, 'passenger', $input);
if ($uid === '') {
    fare_json(['ok' => false, 'error' => 'passenger_required'], 401);
}

function profile_settings(array $profile): array
{
    $settings = $profile['settings'] ?? [];
    return [
        'preferred_payment_method' => (string)($settings['preferredPaymentMethod'] ?? 'cash'),
        'notifications_ride_updates' => (bool)($settings['notificationsRideUpdates'] ?? true),
        'notifications_promotions' => (bool)($settings['notificationsPromotions'] ?? true),
        'safety_alerts_enabled' => (bool)($settings['safetyAlertsEnabled'] ?? true),
        'emergency_contact_name' => (string)($settings['emergencyContactName'] ?? ''),
        'emergency_contact_phone' => (string)($settings['emergencyContactPhone'] ?? ''),
        'language' => (string)($settings['language'] ?? 'en'),
        'share_trip_status' => (bool)($settings['shareTripStatus'] ?? true),
        'profile_visibility' => (string)($settings['profileVisibility'] ?? 'drivers_only'),
        'marketing_opt_in' => (bool)($settings['marketingOptIn'] ?? true),
    ];
}

function profile_mask_account(string $value): string
{
    $digits = preg_replace('/\D+/', '', $value) ?? '';
    if ($digits === '') return '--';
    return str_repeat('*', max(0, strlen($digits) - 4)) . substr($digits, -4);
}

function profile_payment_rows(string $uid, string $preferred): array
{
    $rows = [];
    $docs = wow_firestore()->collection('passengers')->document($uid)->collection('paymentMethods')->limit(20)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $data = $doc->data();
        if ((bool)($data['isActive'] ?? true) === false) continue;
        $type = (string)($data['methodType'] ?? $doc->id());
        $rows[] = [
            'method_type' => $type,
            'account_title' => (string)($data['accountTitle'] ?? ''),
            'account_number' => profile_mask_account((string)($data['accountNumber'] ?? '')),
            'last4' => substr(preg_replace('/\D+/', '', (string)($data['accountNumber'] ?? '')) ?: '', -4),
            'is_default' => $preferred === $type,
        ];
    }
    return $rows;
}

function profile_saved_places(string $uid): array
{
    $rows = [];
    $docs = wow_firestore()->collection('passengers')->document($uid)->collection('savedPlaces')->limit(20)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $data = $doc->data();
        if ((bool)($data['isActive'] ?? true) === false) continue;
        $rows[] = [
            'id' => $doc->id(),
            'place_type' => (string)($data['placeType'] ?? $doc->id()),
            'name' => (string)($data['name'] ?? ''),
            'address' => (string)($data['address'] ?? ''),
            'latitude' => $data['latitude'] ?? null,
            'longitude' => $data['longitude'] ?? null,
        ];
    }
    usort($rows, static fn(array $a, array $b): int => strcmp((string)$a['place_type'], (string)$b['place_type']));
    return $rows;
}

function profile_notification_row(string $id, array $data): array
{
    return [
        'id' => $id,
        'type' => (string)($data['type'] ?? $data['notificationType'] ?? 'system'),
        'title' => (string)($data['title'] ?? 'Notification'),
        'message' => (string)($data['message'] ?? $data['body'] ?? ''),
        'is_read' => (bool)($data['isRead'] ?? $data['read'] ?? false),
        'created_at' => wow_timestamp_to_string($data['createdAt'] ?? $data['sentAt'] ?? ''),
    ];
}

function profile_ride_status_group(string $status): string
{
    $status = strtolower(trim($status));
    if (in_array($status, ['completed', 'ride_completed', 'finished', 'success', 'successful'], true)) return 'completed';
    if (str_contains($status, 'cancel') || in_array($status, ['canceled', 'rejected', 'declined', 'expired'], true)) return 'cancelled';
    if (in_array($status, ['started', 'ride_started', 'ongoing', 'in_progress', 'active', 'on_trip'], true)) return 'in_progress';
    if (in_array($status, ['accepted', 'driver_assigned', 'driver_selected', 'driver_en_route', 'driver_arriving', 'arriving', 'arrived'], true)) return 'accepted';
    return 'pending';
}

function profile_notifications(string $uid, ?array $rides = null): array
{
    $rows = [];
    $seen = [];
    $add = static function (string $id, array $data) use (&$rows, &$seen): void {
        if ($id === '' || isset($seen[$id])) return;
        $seen[$id] = true;
        $rows[] = profile_notification_row($id, $data);
    };

    $docs = wow_firestore()->collection('passengers')->document($uid)->collection('notifications')->limit(50)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $add('passenger_' . $doc->id(), $doc->data());
    }

    foreach ([['receiverUid', $uid], ['passengerUid', $uid]] as [$field, $value]) {
        $docs = wow_firestore()->collection('notifications')->where($field, '=', $value)->limit(50)->documents();
        foreach ($docs as $doc) {
            if (!$doc->exists()) continue;
            $add('notification_' . $doc->id(), $doc->data());
        }
    }

    foreach (($rides ?? profile_rides($uid)) as $ride) {
        $status = profile_ride_status_group((string)$ride['status']);
        if (!in_array($status, ['accepted', 'in_progress', 'completed', 'cancelled'], true)) continue;
        $title = $status === 'completed' ? 'Ride Completed' : ($status === 'accepted' ? 'Driver Assigned' : ($status === 'cancelled' ? 'Ride Cancelled' : 'Ride Update'));
        $add('ride_' . $ride['id'] . '_' . $status, [
            'type' => 'ride',
            'title' => $title,
            'message' => trim(($ride['pickup'] ?: 'Pickup') . ' to ' . ($ride['dropoff'] ?: 'drop-off') . ' is ' . str_replace('_', ' ', $status) . '.'),
            'isRead' => true,
            'createdAt' => $ride['completed_at'] ?: $ride['created_at'],
        ]);
    }

    usort($rows, static fn(array $a, array $b): int => strcmp((string)$b['created_at'], (string)$a['created_at']));
    return array_slice($rows, 0, 50);
}

function profile_support_requests(string $uid): array
{
    $rows = [];
    $docs = wow_firestore()->collection('supportRequests')->where('passengerUid', '=', $uid)->limit(20)->documents();
    foreach ($docs as $doc) {
        if (!$doc->exists()) continue;
        $data = $doc->data();
        $rows[] = [
            'id' => $doc->id(),
            'category' => (string)($data['category'] ?? 'general'),
            'message' => (string)($data['message'] ?? ''),
            'status' => (string)($data['status'] ?? 'open'),
            'ride_id' => (string)($data['rideId'] ?? ''),
            'created_at' => wow_timestamp_to_string($data['createdAt'] ?? ''),
        ];
    }
    usort($rows, static fn(array $a, array $b): int => strcmp((string)$b['created_at'], (string)$a['created_at']));
    return $rows;
}

function profile_rides(string $uid): array
{
    $rows = [];
    $seen = [];
    $driverCache = [];
    foreach (['passengerId', 'passengerUid', 'userId'] as $field) {
        $docs = wow_firestore()->collection('rides')->where($field, '=', $uid)->limit(30)->documents();
        foreach ($docs as $doc) {
            if (!$doc->exists() || isset($seen[$doc->id()])) continue;
            $seen[$doc->id()] = true;
            $ride = $doc->data();
            $driverName = (string)($ride['driverName'] ?? $ride['acceptedDriverName'] ?? '');
            $driverUid = (string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? '');
            if ($driverName === '' && $driverUid !== '') {
                if (!array_key_exists($driverUid, $driverCache)) {
                    $driverCache[$driverUid] = wow_doc_data('drivers', $driverUid);
                }
                $driverName = (string)($driverCache[$driverUid]['name'] ?? $driverCache[$driverUid]['fullName'] ?? '');
            }
            $rows[] = [
                'id' => $doc->id(),
                'ride_code' => (string)($ride['rideCode'] ?? ''),
                'pickup' => (string)($ride['pickup'] ?? $ride['pickupAddress'] ?? ''),
                'dropoff' => (string)($ride['dropoff'] ?? $ride['dropoffAddress'] ?? $ride['destinationAddress'] ?? ''),
                'fare' => $ride['fare'] ?? $ride['acceptedFare'] ?? $ride['finalFare'] ?? 0,
                'status' => (string)($ride['status'] ?? ''),
                'created_at' => wow_timestamp_to_string($ride['createdAt'] ?? $ride['requestedAt'] ?? ''),
                'completed_at' => wow_timestamp_to_string($ride['completedAt'] ?? ''),
                'driver_name' => $driverName,
            ];
        }
    }
    usort($rows, static fn(array $a, array $b): int => strcmp((string)$b['created_at'], (string)$a['created_at']));
    return $rows;
}

try {
    $profile = wow_doc_data('passengers', $uid);
    if (!$profile) fare_json(['ok' => false, 'error' => 'user_not_found'], 404);

    if ($action === 'update_personal') {
        $name = trim((string)($input['name'] ?? ''));
        $phone = trim((string)($input['phone'] ?? ''));
        $profileImage = trim((string)($input['profile_image'] ?? ''));
        if ($name === '') fare_json(['ok' => false, 'error' => 'missing_fields'], 422);
        $update = ['name' => $name, 'phone' => $phone];
        if ($profileImage !== '') {
            if (strlen($profileImage) > 2048 || preg_match('/^data:image\/|^[A-Za-z0-9+\/=]{4096,}$/', $profileImage) === 1) {
                fare_json(['ok' => false, 'error' => 'profile_image_upload_required'], 422);
            }
            if (
                !preg_match('#^https?://#i', $profileImage)
                && !str_starts_with($profileImage, 'gs://')
                && !str_starts_with($profileImage, 'local://')
                && !str_starts_with($profileImage, 'passenger_profile_photos/')
                && !str_starts_with($profileImage, 'users/')
            ) {
                fare_json(['ok' => false, 'error' => 'invalid_profile_image_reference'], 422);
            }
            $update['profileImage'] = $profileImage;
        }
        wow_set_doc('passengers', $uid, $update);
        wow_sync_user_profile($uid, 'passenger', array_merge($profile, $update, ['role' => 'passenger']));
        fare_json(['ok' => true]);
    }

    if ($action === 'update_notifications') {
        $settings = $profile['settings'] ?? [];
        $settings['notificationsRideUpdates'] = (int)($input['notifications_ride_updates'] ?? 1) === 1;
        $settings['notificationsPromotions'] = (int)($input['notifications_promotions'] ?? 1) === 1;
        $settings['safetyAlertsEnabled'] = (int)($input['safety_alerts_enabled'] ?? 1) === 1;
        if (isset($input['emergency_contact_name'])) $settings['emergencyContactName'] = trim((string)$input['emergency_contact_name']);
        if (isset($input['emergency_contact_phone'])) $settings['emergencyContactPhone'] = trim((string)$input['emergency_contact_phone']);
        if (isset($input['preferred_payment_method'])) $settings['preferredPaymentMethod'] = trim((string)$input['preferred_payment_method']);
        wow_set_doc('passengers', $uid, ['settings' => $settings]);
        wow_sync_user_profile($uid, 'passenger', array_merge($profile, ['settings' => $settings, 'role' => 'passenger']));
        fare_json(['ok' => true]);
    }

    if ($action === 'save_settings') {
        $settings = $profile['settings'] ?? [];
        $settings['notificationsRideUpdates'] = (int)($input['notifications_ride_updates'] ?? ($settings['notificationsRideUpdates'] ?? 1)) === 1;
        $settings['notificationsPromotions'] = (int)($input['notifications_promotions'] ?? ($settings['notificationsPromotions'] ?? 1)) === 1;
        $settings['safetyAlertsEnabled'] = (int)($input['safety_alerts_enabled'] ?? ($settings['safetyAlertsEnabled'] ?? 1)) === 1;
        $settings['language'] = in_array((string)($input['language'] ?? 'en'), ['en', 'ur'], true) ? (string)$input['language'] : 'en';
        $settings['shareTripStatus'] = (int)($input['share_trip_status'] ?? 1) === 1;
        $settings['profileVisibility'] = in_array((string)($input['profile_visibility'] ?? 'drivers_only'), ['drivers_only', 'support_only'], true) ? (string)$input['profile_visibility'] : 'drivers_only';
        $settings['marketingOptIn'] = (int)($input['marketing_opt_in'] ?? 1) === 1;
        wow_set_doc('passengers', $uid, ['settings' => $settings]);
        wow_sync_user_profile($uid, 'passenger', array_merge($profile, ['settings' => $settings, 'role' => 'passenger']));
        fare_json(['ok' => true]);
    }

    if ($action === 'update_safety') {
        $settings = $profile['settings'] ?? [];
        $settings['emergencyContactName'] = trim((string)($input['emergency_contact_name'] ?? ''));
        $settings['emergencyContactPhone'] = trim((string)($input['emergency_contact_phone'] ?? ''));
        wow_set_doc('passengers', $uid, ['settings' => $settings]);
        wow_sync_user_profile($uid, 'passenger', array_merge($profile, ['settings' => $settings, 'role' => 'passenger']));
        fare_json(['ok' => true]);
    }

    if ($action === 'save_place') {
        $type = strtolower(trim((string)($input['place_type'] ?? 'favorite')));
        if (!in_array($type, ['home', 'work', 'favorite'], true)) $type = 'favorite';
        $name = trim((string)($input['name'] ?? ''));
        $address = trim((string)($input['address'] ?? ''));
        if ($name === '' || $address === '') fare_json(['ok' => false, 'error' => 'missing_fields'], 422);
        $placeId = $type === 'favorite' ? bin2hex(random_bytes(8)) : $type;
        $lat = isset($input['latitude']) && is_numeric($input['latitude']) ? (float)$input['latitude'] : null;
        $lng = isset($input['longitude']) && is_numeric($input['longitude']) ? (float)$input['longitude'] : null;
        wow_firestore()->collection('passengers')->document($uid)->collection('savedPlaces')->document($placeId)->set([
            'placeType' => $type,
            'name' => $name,
            'address' => $address,
            'latitude' => $lat,
            'longitude' => $lng,
            'isActive' => true,
            'updatedAt' => wow_now(),
            'createdAt' => wow_now(),
        ], ['merge' => true]);
        fare_json(['ok' => true]);
    }

    if ($action === 'delete_place') {
        $placeId = trim((string)($input['place_id'] ?? ''));
        if ($placeId === '') fare_json(['ok' => false, 'error' => 'place_not_found'], 404);
        wow_firestore()->collection('passengers')->document($uid)->collection('savedPlaces')->document($placeId)->set(['isActive' => false, 'updatedAt' => wow_now()], ['merge' => true]);
        fare_json(['ok' => true]);
    }

    if ($action === 'submit_support') {
        $category = trim((string)($input['category'] ?? 'general'));
        $message = trim((string)($input['message'] ?? ''));
        $rideId = trim((string)($input['ride_id'] ?? ''));
        if ($message === '') fare_json(['ok' => false, 'error' => 'missing_fields'], 422);
        $doc = wow_firestore()->collection('supportRequests')->newDocument();
        $doc->set([
            'passengerUid' => $uid,
            'passengerEmail' => (string)($profile['email'] ?? ''),
            'passengerName' => (string)($profile['name'] ?? ''),
            'category' => $category,
            'message' => $message,
            'rideId' => $rideId,
            'status' => 'open',
            'createdAt' => wow_now(),
            'updatedAt' => wow_now(),
        ], ['merge' => false]);
        fare_json(['ok' => true, 'request_id' => $doc->id()]);
    }

    if ($action === 'save_payment') {
        $method = strtolower(trim((string)($input['method_type'] ?? '')));
        $title = trim((string)($input['account_title'] ?? ''));
        $number = trim((string)($input['account_number'] ?? ''));
        if (!in_array($method, ['easypaisa', 'jazzcash'], true) || $title === '' || $number === '') {
            fare_json(['ok' => false, 'error' => 'missing_fields'], 422);
        }
        wow_firestore()->collection('passengers')->document($uid)->collection('paymentMethods')->document($method)->set([
            'methodType' => $method,
            'accountTitle' => $title,
            'accountNumber' => $number,
            'isActive' => true,
            'updatedAt' => wow_now(),
            'createdAt' => wow_now(),
        ], ['merge' => true]);
        if ((int)($input['is_default'] ?? $input['set_default'] ?? 0) === 1) {
            $settings = $profile['settings'] ?? [];
            $settings['preferredPaymentMethod'] = $method;
            wow_set_doc('passengers', $uid, ['settings' => $settings]);
            wow_sync_user_profile($uid, 'passenger', array_merge($profile, ['settings' => $settings, 'role' => 'passenger']));
        }
        fare_json(['ok' => true]);
    }

    if ($action === 'delete_payment') {
        $method = strtolower(trim((string)($input['method_type'] ?? '')));
        if ($method === '') fare_json(['ok' => false, 'error' => 'payment_method_not_found'], 404);
        wow_firestore()->collection('passengers')->document($uid)->collection('paymentMethods')->document($method)->set(['isActive' => false, 'updatedAt' => wow_now()], ['merge' => true]);
        fare_json(['ok' => true]);
    }

    if ($action === 'set_default_payment') {
        $method = strtolower(trim((string)($input['method_type'] ?? 'cash')));
        $settings = $profile['settings'] ?? [];
        $settings['preferredPaymentMethod'] = $method;
        wow_set_doc('passengers', $uid, ['settings' => $settings]);
        wow_sync_user_profile($uid, 'passenger', array_merge($profile, ['settings' => $settings, 'role' => 'passenger']));
        fare_json(['ok' => true]);
    }

    if ($action === 'change_password') {
        $currentPassword = (string)($input['current_password'] ?? '');
        $newPassword = (string)($input['new_password'] ?? '');
        $confirmPassword = (string)($input['confirm_password'] ?? '');
        $email = (string)($profile['email'] ?? '');
        if ($email === '' || $currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
            fare_json(['ok' => false, 'error' => 'missing_fields'], 422);
        }
        if ($newPassword !== $confirmPassword) {
            fare_json(['ok' => false, 'error' => 'password_mismatch'], 422);
        }
        if (strlen($newPassword) < 8) {
            fare_json(['ok' => false, 'error' => 'weak_password'], 422);
        }
        wow_auth_update_password($email, $currentPassword, $newPassword);
        wow_auth_audit_log(['userId'=>$uid,'email'=>$email,'role'=>'passenger','eventType'=>'password_changed','status'=>'successful','authProvider'=>'password','sourcePlatform'=>'passenger_website']);
        fare_json(['ok' => true]);
    }

    $settings = profile_settings($profile);
    $rides = profile_rides($uid);
    fare_json([
        'ok' => true,
        'user' => [
            'id' => $uid,
            'name' => (string)($profile['name'] ?? ''),
            'email' => (string)($profile['email'] ?? ''),
            'phone' => (string)($profile['phone'] ?? ''),
            'role' => 'Passenger',
            'profile_image' => (string)($profile['profileImage'] ?? ''),
            'member_since' => wow_timestamp_to_string($profile['createdAt'] ?? ''),
        ],
        'settings' => $settings,
        'payment_methods' => profile_payment_rows($uid, $settings['preferred_payment_method']),
        'saved_places' => profile_saved_places($uid),
        'notifications' => profile_notifications($uid, $rides),
        'support_requests' => profile_support_requests($uid),
        'rides' => $rides,
    ]);
} catch (Throwable $exception) {
    error_log('Firestore profile API failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'profile_failed'], 500);
}
