<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

function wow_collection_for_role(string $role): string
{
    $role = strtolower(trim($role));
    if ($role === 'admin' || $role === 'super_admin') return 'admins';
    if ($role === 'driver' || $role === 'driver_applicant') return 'drivers';
    return 'passengers';
}

function wow_public_user(array $data): array
{
    unset($data['password'], $data['password_hash'], $data['passwordHash']);
    return $data;
}

function wow_profile_text(array $data, array $keys, string $default = ''): string
{
    foreach ($keys as $key) {
        if (!array_key_exists($key, $data)) continue;
        $value = trim((string)$data[$key]);
        if ($value !== '') return $value;
    }
    return $default;
}

function wow_central_profile_role(string $role, array $data): string
{
    $value = strtolower(trim((string)($data['role'] ?? $role)));
    if ($value === 'super_admin') return 'admin';
    if (in_array($value, ['admin', 'driver', 'driver_applicant', 'passenger'], true)) {
        return $value;
    }
    return strtolower(trim($role)) === 'driver' ? 'driver' : 'passenger';
}

function wow_sync_user_profile(string $uid, string $role, array $data): void
{
    $uid = trim($uid);
    if ($uid === '') return;

    $data = wow_public_user($data);
    $centralRole = wow_central_profile_role($role, $data);
    $payload = [
        'uid' => $uid,
        'role' => $centralRole,
    ];

    $name = wow_profile_text($data, ['fullName', 'name', 'displayName', 'full_name', 'driverName', 'passengerName']);
    if ($name !== '') {
        $payload['name'] = $name;
        $payload['fullName'] = $name;
        $payload['displayName'] = $name;
    }

    $email = strtolower(wow_profile_text($data, ['email', 'emailAddress', 'email_address']));
    if ($email !== '') $payload['email'] = $email;

    $phone = wow_profile_text($data, ['phone', 'phoneNumber', 'mobile', 'contactNumber']);
    if ($phone !== '') {
        $payload['phone'] = $phone;
        $payload['phoneNumber'] = $phone;
    }

    $profileImage = wow_profile_text($data, ['profileImage', 'profilePhotoUrl', 'photoURL', 'photoUrl', 'profile_image']);
    if ($profileImage !== '') {
        $payload['profileImage'] = $profileImage;
        $payload['photoURL'] = $profileImage;
    }
    $profileImagePath = wow_profile_text($data, ['profileImagePath', 'profilePhotoPath']);
    if ($profileImagePath !== '') {
        $payload['profileImagePath'] = $profileImagePath;
        $payload['profilePhotoPath'] = $profileImagePath;
    }

    foreach (['gender', 'accountStatus', 'verificationStatus', 'authProvider'] as $field) {
        if (array_key_exists($field, $data) && $data[$field] !== null && trim((string)$data[$field]) !== '') {
            $payload[$field] = $data[$field];
        }
    }
    foreach ([
        'cnicFrontPath',
        'cnicImagePath',
        'cnicBackPath',
        'licenceImagePath',
        'licenseImagePath',
        'vehicleImagePath',
        'vehicleRegistrationPath',
        'registrationDocumentPath',
        'vehicleDocumentPath',
        'verificationRejectionReason',
        'rejectionReason',
    ] as $field) {
        if (array_key_exists($field, $data) && $data[$field] !== null && trim((string)$data[$field]) !== '') {
            $payload[$field] = $data[$field];
        }
    }
    foreach (['isApproved', 'isActive', 'isRejected', 'emailVerified'] as $field) {
        if (array_key_exists($field, $data)) $payload[$field] = (bool)$data[$field];
    }
    if (array_key_exists('settings', $data) && is_array($data['settings'])) {
        $payload['settings'] = $data['settings'];
    }
    if (array_key_exists('documentPaths', $data) && is_array($data['documentPaths'])) {
        $payload['documentPaths'] = $data['documentPaths'];
    }
    if (array_key_exists('documentMetadata', $data) && is_array($data['documentMetadata'])) {
        $payload['documentMetadata'] = $data['documentMetadata'];
    }
    if (array_key_exists('createdAt', $data)) $payload['createdAt'] = $data['createdAt'];
    foreach (['verificationSubmittedAt', 'verificationReviewedAt', 'verificationReviewedBy'] as $field) {
        if (array_key_exists($field, $data)) $payload[$field] = $data[$field];
    }

    wow_set_doc('users', $uid, $payload, true);
}

function wow_ride_driver_uid(array $ride): string
{
    return wow_profile_text($ride, ['assignedDriverId', 'driverUid', 'driverId', 'driverID', 'targetDriverUid']);
}

function wow_is_active_driver_ride_status(string $status): bool
{
    return in_array(strtolower(trim($status)), [
        'driver_assigned', 'accepted', 'driver_selected', 'confirmed',
        'driver_en_route', 'driver_arriving', 'arriving', 'arrived',
        'started', 'ride_started', 'ongoing', 'in_progress', 'on_trip', 'active',
    ], true);
}

function wow_driver_active_ride_id(string $driverUid, array $driverProfile = []): string
{
    $driverUid = trim($driverUid);
    if ($driverUid === '') return '';

    $currentRideId = trim((string)($driverProfile['currentRideId'] ?? ''));
    if ($currentRideId !== '') {
        $ride = wow_doc_data('rides', $currentRideId);
        if ($ride && wow_ride_driver_uid($ride) === $driverUid && wow_is_active_driver_ride_status((string)($ride['status'] ?? ''))) {
            return $currentRideId;
        }
    }

    foreach (['assignedDriverId', 'driverUid', 'driverId'] as $field) {
        $documents = wow_firestore()->collection('rides')->where($field, '=', $driverUid)->limit(8)->documents();
        foreach ($documents as $document) {
            if (!$document->exists()) continue;
            $ride = $document->data();
            if (wow_is_active_driver_ride_status((string)($ride['status'] ?? ''))) {
                return $document->id();
            }
        }
    }

    return '';
}

function wow_create_profile(string $role, string $uid, array $data): void
{
    $data['createdAt'] = $data['createdAt'] ?? wow_now();
    wow_set_doc(wow_collection_for_role($role), $uid, wow_public_user($data), true);
    wow_sync_user_profile($uid, $role, $data);
}

function wow_get_profile(string $role, string $uid): ?array
{
    return wow_doc_data(wow_collection_for_role($role), $uid);
}

function wow_driver_is_approved(array $driver): bool
{
    $role = strtolower((string)($driver['role'] ?? ''));
    $status = strtolower((string)($driver['verificationStatus'] ?? ''));
    if ($role !== 'driver') return false;
    return !empty($driver['isApproved']) || $status === 'approved' || $status === '';
}

function wow_normalize_driver_profile(string $uid, ?array $driver, bool $writeBack = true): ?array
{
    if (!$driver) return null;
    $role = strtolower((string)($driver['role'] ?? ''));
    $statusExists = array_key_exists('verificationStatus', $driver);
    $approvedExists = array_key_exists('isApproved', $driver);
    $isLegacyDriver = ($role === 'driver' || $role === '') && (!$statusExists || !$approvedExists);
    $isExplicitApprovedDriver = $role === 'driver' && (strtolower((string)($driver['verificationStatus'] ?? '')) === 'approved' || !empty($driver['isApproved']));

    if ($isLegacyDriver || $isExplicitApprovedDriver) {
        $driver['role'] = 'driver';
        $driver['verificationStatus'] = 'approved';
        $driver['isApproved'] = true;
        $driver['isActive'] = !array_key_exists('isActive', $driver) ? true : (bool)$driver['isActive'];
        if ($writeBack) {
            wow_set_doc('drivers', $uid, [
                'role' => 'driver',
                'verificationStatus' => 'approved',
                'isApproved' => true,
                'isActive' => $driver['isActive'],
                'verificationBackfilledAt' => wow_now(),
            ], true);
            wow_sync_user_profile($uid, 'driver', $driver);
            error_log('WOW driver verification backfill: drivers/' . $uid);
        }
    }

    $driver['uid'] = $uid;
    return $driver;
}

function wow_get_driver_profile(string $uid, bool $writeBack = true): ?array
{
    return wow_normalize_driver_profile($uid, wow_doc_data('drivers', $uid), $writeBack);
}

function wow_find_profile_by_email(string $role, string $email): ?array
{
    return wow_find_one_by_email(wow_collection_for_role($role), $email);
}

function wow_list_collection(string $collection, int $limit = 1000): array
{
    $rows = [];
    $documents = wow_firestore()->collection($collection)->limit($limit)->documents();
    foreach ($documents as $document) {
        if ($document->exists()) {
            $data = $document->data();
            $data['uid'] = $document->id();
            $rows[] = $data;
        }
    }
    return $rows;
}

function wow_set_docs_batch(array $writes): void
{
    $now = wow_now();
    $normalized = [];
    foreach ($writes as $write) {
        $collection = trim((string)($write['collection'] ?? ''), '/');
        $id = trim((string)($write['id'] ?? ''));
        if ($collection === '' || $id === '') continue;
        $data = (array)($write['data'] ?? []);
        $data['updatedAt'] = $data['updatedAt'] ?? $now;
        $data['createdAt'] = $data['createdAt'] ?? $now;
        $normalized[] = ['path' => $collection . '/' . $id, 'data' => $data, 'merge' => (bool)($write['merge'] ?? true)];
    }
    wow_firestore()->batchSetDocuments($normalized);
}

function wow_resolve_uid(string $role, array $input): string
{
    $normalizedRole = strtolower(trim($role)) === 'driver' ? 'driver' : 'passenger';
    $sessionRole = strtolower((string)($_SESSION['role'] ?? ''));
    $sessionUid = (string)($_SESSION['firebase_uid'] ?? '');
    if ($sessionUid !== '' && $sessionRole === $normalizedRole) {
        return $sessionUid;
    }

    foreach (['firebase_uid', 'uid', 'user_id'] as $key) {
        $value = trim((string)($input[$key] ?? ''));
        if ($value !== '' && !ctype_digit($value)) {
            return $value;
        }
    }

    $email = strtolower(trim((string)($input['email'] ?? $input['user_email'] ?? '')));
    if ($email !== '') {
        $profile = wow_find_profile_by_email($normalizedRole, $email);
        return (string)($profile['uid'] ?? '');
    }

    return '';
}
