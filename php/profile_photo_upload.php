<?php
declare(strict_types=1);

require_once __DIR__ . '/driver_documents.php';

header('Content-Type: application/json; charset=utf-8');

function profile_upload_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload);
    exit();
}

$uid = wow_firebase_uid_from_bearer();
if ($uid === '') profile_upload_json(['ok' => false, 'error' => 'not-authenticated'], 401);
if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
    profile_upload_json(['ok' => false, 'error' => 'upload-failed'], 422);
}

try {
    $record = wow_save_driver_document_record($uid, 'profile', (string)$_FILES['photo']['tmp_name'], (int)$_FILES['photo']['size']);
    $role = strtolower(trim((string)($_POST['role'] ?? '')));
    $passenger = wow_doc_data('passengers', $uid) ?: [];
    $driver = wow_doc_data('drivers', $uid) ?: [];
    if ($role === 'passenger' || $passenger || !$driver) {
        $update = [
            'profileImage' => $record['url'],
            'photoURL' => $record['url'],
            'profileImagePath' => $record['path'],
            'profilePhotoPath' => $record['path'],
            'documentPaths' => array_merge(is_array($passenger['documentPaths'] ?? null) ? $passenger['documentPaths'] : [], [
                'profile' => $record['path'],
                'profile_photo' => $record['path'],
            ]),
            'documentMetadata' => array_merge(is_array($passenger['documentMetadata'] ?? null) ? $passenger['documentMetadata'] : [], [
                'profile' => wow_driver_document_metadata($record),
                'profile_photo' => wow_driver_document_metadata($record),
            ]),
        ];
        wow_set_doc('passengers', $uid, $update, true);
        wow_sync_user_profile($uid, 'passenger', array_merge($passenger, $update, ['role' => 'passenger']));
    } else {
        wow_record_driver_document_upload($uid, $record);
    }

    profile_upload_json([
        'ok' => true,
        'url' => $record['url'],
        'path' => $record['path'],
        'storagePath' => $record['storagePath'],
        'storageProvider' => $record['storageProvider'],
        'fileName' => $record['fileName'],
        'mimeType' => $record['mimeType'],
        'size' => $record['size'],
        'width' => $record['width'],
        'height' => $record['height'],
    ]);
} catch (InvalidArgumentException $error) {
    profile_upload_json(['ok' => false, 'error' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('Profile photo upload failed: ' . $error->getMessage());
    profile_upload_json(['ok' => false, 'error' => 'upload-failed'], 500);
}
