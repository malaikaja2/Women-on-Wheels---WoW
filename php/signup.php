<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';
require_once __DIR__ . '/driver_documents.php';
require_once __DIR__ . '/auth_audit_service.php';

function se(string $error, string $role = 'passenger'): void
{
    $safeRole = $role === 'driver' ? 'driver' : 'passenger';
    $ajax = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest'
        || str_contains(strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json');
    if ($ajax) {
        http_response_code(422);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $error, 'role' => $safeRole]);
        exit();
    }
    header('Location: ../signup.html?error=' . urlencode($error) . '&role=' . urlencode($safeRole));
    exit();
}

function strong(string $password): bool
{
    return preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/', $password) === 1;
}

function firebase_signup_error_code(Throwable $exception): string
{
    if (preg_match('/Firebase Authentication error:\s*([A-Z0-9_:]+)/', $exception->getMessage(), $matches) === 1) {
        return $matches[1];
    }
    return '';
}

function signup_runtime_error_code(Throwable $exception): string
{
    $message = strtoupper($exception->getMessage());
    if (str_contains($message, '429') || str_contains($message, 'QUOTA') || str_contains($message, 'RESOURCE_EXHAUSTED')) {
        return 'firebase_quota_exceeded';
    }
    if (
        str_contains($message, 'TIMED OUT')
        || str_contains($message, 'COULD NOT RESOLVE HOST')
        || str_contains($message, 'CONNECTION')
        || str_contains($message, 'EMPTY REPLY')
        || str_contains($message, 'RECV FAILURE')
    ) {
        return 'firebase_unavailable';
    }
    if (str_contains($message, 'GOOGLE_APPLICATION_CREDENTIALS') || str_contains($message, 'SERVICE ACCOUNT TOKEN')) {
        return 'firebase_server_config';
    }
    if (str_contains($message, 'PERMISSION_DENIED') || str_contains($message, '403')) {
        return 'firebase_permission_denied';
    }
    return 'signup_failed';
}

function signup_identifier(string $value): string
{
    return strtoupper(preg_replace('/[^A-Za-z0-9]+/', '', trim($value)) ?? '');
}

function signup_duplicate_fields(string $field): array
{
    if ($field === 'cnicNumber') return ['cnicNumber', 'cnic', 'cnicNormalized'];
    if ($field === 'vehicleNumber') return ['vehicleNumber', 'vehicleNumberNormalized'];
    if ($field === 'licenceNumber') return ['licenceNumber', 'licenseNumber', 'licenceNumberNormalized', 'licenseNumberNormalized'];
    return [$field];
}

function signup_duplicate_candidates(string $field, string $value): array
{
    $raw = trim($value);
    $normalized = signup_identifier($value);
    $candidates = [];
    foreach (signup_duplicate_fields($field) as $key) {
        $values = str_contains(strtolower($key), 'normalized') ? [$normalized] : [$raw, strtoupper($raw)];
        foreach ($values as $candidate) {
            if ($candidate !== '') $candidates[$key . "\0" . $candidate] = ['field' => $key, 'value' => $candidate];
        }
    }
    return array_values($candidates);
}

function save_signup_upload(string $field, string $fileName, string $uid, string $idToken, bool $required, string $errorCode): ?array
{
    if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) {
        if ($required) throw new RuntimeException('UPLOAD_ERROR:missing_documents');
        return null;
    }
    if ($_FILES[$field]['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException('UPLOAD_ERROR:' . $errorCode);
    }

    $size = (int)($_FILES[$field]['size'] ?? 0);
    try {
        return wow_save_driver_document_record($uid, $fileName, (string)$_FILES[$field]['tmp_name'], $size);
    } catch (Throwable $exception) {
        error_log('Driver document upload failed: ' . $exception->getMessage());
        throw new RuntimeException('UPLOAD_ERROR:' . $errorCode, 0, $exception);
    }
    return null;
}

function signup_upload_value(?array $record, string $key): string
{
    return is_array($record) ? (string)($record[$key] ?? '') : '';
}

function signup_upload_paths(array $records): array
{
    $paths = [];
    foreach ($records as $record) {
        if (!is_array($record)) continue;
        $slot = wow_driver_document_slot((string)($record['slot'] ?? ''));
        $path = (string)($record['path'] ?? '');
        if ($path === '') continue;
        $paths[$slot] = $path;
        if ($slot === 'profile') $paths['profile_photo'] = $path;
    }
    return $paths;
}

function signup_upload_metadata(array $records): array
{
    $metadata = [];
    foreach ($records as $record) {
        if (!is_array($record)) continue;
        $slot = wow_driver_document_slot((string)($record['slot'] ?? ''));
        $item = wow_driver_document_metadata($record);
        $metadata[$slot] = $item;
        if ($slot === 'profile') $metadata['profile_photo'] = $item;
    }
    return $metadata;
}

function duplicate_driver_value(string $field, string $value): bool
{
    if (signup_identifier($value) === '') return false;
    try {
        foreach (['drivers', 'driverApplications'] as $collection) {
            foreach (signup_duplicate_candidates($field, $value) as $candidate) {
                $documents = wow_firestore()
                    ->collection($collection)
                    ->where($candidate['field'], '=', $candidate['value'])
                    ->limit(1)
                    ->documents();
                foreach ($documents as $document) {
                    if ($document->exists()) return true;
                }
            }
        }
    } catch (Throwable $exception) {
        error_log('Driver duplicate check failed: ' . $exception->getMessage());
        throw new RuntimeException('SIGNUP_PREFLIGHT:' . signup_runtime_error_code($exception), 0, $exception);
    }
    return false;
}

$role = $_POST['role'] ?? '';
$name = trim((string)($_POST['name'] ?? ''));
$email = strtolower(trim((string)($_POST['email'] ?? '')));
$phone = trim((string)($_POST['phone'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$confirm = (string)($_POST['confirm_password'] ?? '');

if (!in_array($role, ['passenger', 'driver'], true)) se('invalid_role');
if ($name === '' || $email === '' || $phone === '' || $password === '' || $confirm === '') se('missing_fields', $role);
if ($password !== $confirm) se('password_mismatch', $role);
if (!strong($password)) se('weak_password', $role);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) se('missing_fields', $role);
try {
    if (wow_find_profile_by_email($role, $email)) se('email_exists', $role);
} catch (Throwable $exception) {
    error_log('Signup email preflight failed: ' . $exception->getMessage());
    se(signup_runtime_error_code($exception), $role);
}

$gender = $vehicleType = $vehicleNumber = $cnic = $licenseNumber = '';
if ($role === 'driver') {
    $gender = strtolower(trim((string)($_POST['gender'] ?? '')));
    $vehicleType = fare_normalize_vehicle(trim((string)($_POST['vehicle_type'] ?? '')));
    $vehicleNumber = trim((string)($_POST['vehicle_number'] ?? ''));
    $cnic = trim((string)($_POST['cnic'] ?? ''));
    $licenseNumber = trim((string)($_POST['license_number'] ?? ''));
    if ($gender === '' || $vehicleType === '' || $vehicleNumber === '' || $cnic === '' || $licenseNumber === '') se('missing_fields', $role);
    if ($gender !== 'female') se('female_driver_required', $role);
    if (!preg_match('/^\d{5}-\d{7}-\d{1}$/', $cnic)) se('invalid_cnic', $role);
    try {
        if (duplicate_driver_value('cnicNumber', $cnic)) se('duplicate_cnic', $role);
        if (duplicate_driver_value('vehicleNumber', $vehicleNumber)) se('duplicate_vehicle', $role);
        if (duplicate_driver_value('licenceNumber', $licenseNumber)) se('duplicate_licence', $role);
    } catch (Throwable $exception) {
        if (str_starts_with($exception->getMessage(), 'SIGNUP_PREFLIGHT:')) se(substr($exception->getMessage(), 17), $role);
        se(signup_runtime_error_code($exception), $role);
    }
}

$createdIdToken = '';
try {
    $auth = wow_auth_create_user($email, $password, $name);
    $uid = (string)($auth['localId'] ?? '');
    $createdIdToken = (string)($auth['idToken'] ?? '');
    if ($uid === '') {
        se('signup_failed', $role);
    }

    if ($role === 'driver') {
        $idToken = (string)($auth['idToken'] ?? '');
        $cnicFrontUpload = save_signup_upload('cnic_upload', 'cnic_front', $uid, $idToken, true, 'cnic_upload_failed');
        $cnicBackUpload = save_signup_upload('cnic_back', 'cnic_back', $uid, $idToken, true, 'cnic_upload_failed');
        $licenceUpload = save_signup_upload('licence_upload', 'licence', $uid, $idToken, true, 'licence_upload_failed');
        $profileUpload = save_signup_upload('profile_photo', 'profile', $uid, $idToken, false, 'profile_photo_upload_failed');
        $driverUploads = array_values(array_filter([$cnicFrontUpload, $cnicBackUpload, $licenceUpload, $profileUpload], 'is_array'));
        $documentPaths = signup_upload_paths($driverUploads);
        $documentMetadata = signup_upload_metadata($driverUploads);
        $uploadPath = signup_upload_value($cnicFrontUpload, 'url');
        $cnicBackUrl = signup_upload_value($cnicBackUpload, 'url');
        $licenceImageUrl = signup_upload_value($licenceUpload, 'url');
        $profilePhotoPath = signup_upload_value($profileUpload, 'url');
        $cnicFrontPath = signup_upload_value($cnicFrontUpload, 'path');
        $cnicBackPath = signup_upload_value($cnicBackUpload, 'path');
        $licenceImagePath = signup_upload_value($licenceUpload, 'path');
        $profileImagePath = signup_upload_value($profileUpload, 'path');

        $driverApplicant = [
            'name' => $name,
            'fullName' => $name,
            'email' => $email,
            'phone' => $phone,
            'gender' => 'female',
            'role' => 'driver_applicant',
            'vehicleType' => $vehicleType,
            'vehicleNumber' => $vehicleNumber,
            'vehicleNumberNormalized' => signup_identifier($vehicleNumber),
            'licenseNumber' => $licenseNumber,
            'licenseNumberNormalized' => signup_identifier($licenseNumber),
            'licenceNumber' => $licenseNumber,
            'licenceNumberNormalized' => signup_identifier($licenseNumber),
            'cnic' => $cnic,
            'cnicNumber' => $cnic,
            'cnicNormalized' => signup_identifier($cnic),
            'cnicUploadUrl' => $uploadPath,
            'cnicImageUrl' => $uploadPath,
            'cnicFrontUrl' => $uploadPath,
            'cnicBackUrl' => $cnicBackUrl,
            'licenceImageUrl' => $licenceImageUrl,
            'profilePhotoUrl' => $profilePhotoPath,
            'cnicFrontPath' => $cnicFrontPath,
            'cnicImagePath' => $cnicFrontPath,
            'cnicBackPath' => $cnicBackPath,
            'licenceImagePath' => $licenceImagePath,
            'licenseImagePath' => $licenceImagePath,
            'profilePhotoPath' => $profileImagePath,
            'profileImagePath' => $profileImagePath,
            'documentPaths' => $documentPaths,
            'documentMetadata' => $documentMetadata,
            'verificationStatus' => 'pending',
            'verificationSubmittedAt' => wow_now(),
            'verificationReviewedAt' => null,
            'verificationReviewedBy' => null,
            'verificationRejectionReason' => null,
            'isApproved' => false,
            'isRejected' => false,
            'rejectionReason' => '',
            'accountStatus' => 'pending_verification',
            'isActive' => false,
            'isOnline' => false,
            'isAvailable' => false,
            'emailVerified' => false,
            'currentLocation' => ['lat' => null, 'lng' => null],
            'rating' => 0,
            'legacyMysqlId' => null,
            'verifiedAt' => null,
            'verifiedBy' => null,
        ];
        wow_create_profile('driver', $uid, $driverApplicant);
        wow_set_doc('driverApplications', $uid, [
            'applicationId' => $uid,
            'driverId' => $uid,
            'fullName' => $name,
            'driverName' => $name,
            'email' => $email,
            'phone' => $phone,
            'gender' => 'female',
            'cnicNumber' => $cnic,
            'cnicFileUrl' => $uploadPath,
            'cnicImageUrl' => $uploadPath,
            'cnicFrontUrl' => $uploadPath,
            'cnicBackUrl' => $cnicBackUrl,
            'licenceImageUrl' => $licenceImageUrl,
            'profileImageUrl' => $profilePhotoPath,
            'cnicFrontPath' => $cnicFrontPath,
            'cnicImagePath' => $cnicFrontPath,
            'cnicBackPath' => $cnicBackPath,
            'licenceImagePath' => $licenceImagePath,
            'licenseImagePath' => $licenceImagePath,
            'profilePhotoPath' => $profileImagePath,
            'profileImagePath' => $profileImagePath,
            'documentPaths' => $documentPaths,
            'documentMetadata' => $documentMetadata,
            'vehicleType' => $vehicleType,
            'vehicleNumber' => $vehicleNumber,
            'vehicleNumberNormalized' => signup_identifier($vehicleNumber),
            'licenseNumber' => $licenseNumber,
            'licenseNumberNormalized' => signup_identifier($licenseNumber),
            'licenceNumber' => $licenseNumber,
            'licenceNumberNormalized' => signup_identifier($licenseNumber),
            'cnicNormalized' => signup_identifier($cnic),
            'status' => 'pending',
            'verificationStatus' => 'pending', 'isApproved' => false, 'role' => 'driver_applicant',
            'verificationSubmittedAt' => wow_now(),
            'verificationReviewedAt' => null,
            'verificationReviewedBy' => null,
            'verificationRejectionReason' => null,
            'reviewedAt' => null, 'reviewedBy' => null, 'rejectionReason' => '',
        ], true);
        wow_set_doc('users', $uid, [
            'fullName' => $name,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role' => 'driver_applicant',
            'profileImage' => $profilePhotoPath,
            'photoURL' => $profilePhotoPath,
            'profilePhotoPath' => $profileImagePath,
            'profileImagePath' => $profileImagePath,
            'cnicFrontPath' => $cnicFrontPath,
            'cnicImagePath' => $cnicFrontPath,
            'cnicBackPath' => $cnicBackPath,
            'licenceImagePath' => $licenceImagePath,
            'licenseImagePath' => $licenceImagePath,
            'documentPaths' => $documentPaths,
            'documentMetadata' => $documentMetadata,
            'verificationStatus' => 'pending',
            'verificationSubmittedAt' => wow_now(),
            'verificationReviewedAt' => null,
            'verificationReviewedBy' => null,
            'verificationRejectionReason' => null,
            'isApproved' => false,
            'isRejected' => false,
            'accountStatus' => 'pending_verification',
            'emailVerified' => false,
        ], true);
    } else {
        wow_create_profile('passenger', $uid, [
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role' => 'passenger',
            'legacyMysqlId' => null,
            'emailVerified' => false,
        ]);
        wow_set_doc('users', $uid, [
            'fullName' => $name,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role' => 'passenger',
            'emailVerified' => false,
        ], true);
    }

    try {
        wow_auth_send_email_verification($createdIdToken);
        wow_auth_audit_log([
            'userId'=>$uid,'email'=>$email,'role'=>$role,
            'eventType'=>'email_verification_sent','status'=>'successful',
            'authProvider'=>'password',
            'sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website'
        ]);
    } catch (Throwable $verificationError) {
        error_log('Verification email could not be sent: '.$verificationError->getMessage());
        wow_auth_audit_log([
            'userId'=>$uid,'email'=>$email,'role'=>$role,
            'eventType'=>'email_verification_failed','status'=>'failed',
            'authProvider'=>'password',
            'sourcePlatform'=>$role==='driver'?'driver_website':'passenger_website',
            'failureReasonCode'=>wow_auth_failure_code($verificationError)
        ]);
    }

    $_SESSION['firebase_uid'] = $uid;
    $_SESSION['user_id'] = $uid;
    $_SESSION['user_name'] = $name;
    $_SESSION['user_email'] = $email;
    $_SESSION['role'] = $role;

    $ajax = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest'
        || str_contains(strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json');
    if ($ajax) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => true, 'role' => $role]);
        exit();
    }
    header('Location: ../login.html?signup=success&role=' . urlencode($role));
    exit();
} catch (Throwable $exception) {
    error_log('Firebase signup failed: ' . $exception->getMessage());
    if ($createdIdToken !== '') {
        try { wow_auth_delete_user($createdIdToken); } catch (Throwable $cleanupError) { error_log('Signup cleanup failed: ' . $cleanupError->getMessage()); }
    }
    if (preg_match('/UPLOAD_ERROR:([a-z_]+)/', $exception->getMessage(), $uploadMatch) === 1) se($uploadMatch[1], $role);
    $firebaseError = firebase_signup_error_code($exception);
    if ($firebaseError === 'EMAIL_EXISTS') se('email_exists', $role);
    if ($firebaseError === 'INVALID_EMAIL') se('invalid_email', $role);
    if ($firebaseError === 'OPERATION_NOT_ALLOWED') se('auth_not_enabled', $role);
    if (str_starts_with($firebaseError, 'WEAK_PASSWORD')) se('weak_password', $role);
    if (str_starts_with($exception->getMessage(), 'SIGNUP_PREFLIGHT:')) se(substr($exception->getMessage(), 17), $role);
    $runtimeError = signup_runtime_error_code($exception);
    if ($runtimeError !== 'signup_failed') se($runtimeError, $role);
    se('signup_failed', $role);
}
