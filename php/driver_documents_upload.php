<?php
declare(strict_types=1);
require_once __DIR__ . '/driver_documents.php';
header('Content-Type: application/json; charset=utf-8');

function upload_json(array $payload, int $status = 200): never { http_response_code($status); echo json_encode($payload); exit(); }

$uid = wow_firebase_uid_from_bearer();
if ($uid === '') upload_json(['ok' => false, 'error' => 'not-authenticated'], 401);
if (!isset($_FILES['document']) || $_FILES['document']['error'] !== UPLOAD_ERR_OK) upload_json(['ok' => false, 'error' => 'upload-failed'], 422);
try {
    $record = wow_save_driver_document_record($uid, (string)($_POST['slot'] ?? ''), (string)$_FILES['document']['tmp_name'], (int)$_FILES['document']['size']);
    wow_record_driver_document_upload($uid, $record);
    upload_json([
        'ok' => true,
        'url' => $record['url'],
        'path' => $record['path'],
        'storagePath' => $record['storagePath'],
        'storageProvider' => $record['storageProvider'],
        'slot' => $record['slot'],
        'fileName' => $record['fileName'],
        'mimeType' => $record['mimeType'],
        'size' => $record['size'],
        'width' => $record['width'],
        'height' => $record['height'],
    ]);
} catch (InvalidArgumentException $error) { upload_json(['ok' => false, 'error' => $error->getMessage()], 422); }
catch (Throwable $error) { error_log('Driver upload failed: ' . $error->getMessage()); upload_json(['ok' => false, 'error' => 'upload-failed'], 500); }
