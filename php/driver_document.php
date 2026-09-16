<?php
declare(strict_types=1);

require_once __DIR__ . '/driver_documents.php';

$uid = trim((string)($_GET['uid'] ?? ''));
$slot = trim((string)($_GET['slot'] ?? ''));
$file = basename((string)($_GET['file'] ?? ''));

try {
    if ($slot === '' && $file !== '') $slot = wow_driver_document_parse_file_slot($file);
    $slot = wow_driver_document_slot($slot);
    wow_driver_document_validate_uid($uid);
} catch (Throwable) {
    http_response_code(400);
    exit('Invalid document');
}

$requestUid = wow_firebase_uid_from_bearer();
$isOwner = $requestUid !== '' && hash_equals($uid, $requestUid);
if (wow_driver_document_sensitive($slot) && !$isOwner) {
    http_response_code(403);
    exit('Forbidden');
}

try {
    wow_stream_driver_document($uid, $slot, $file);
} catch (Throwable $exception) {
    error_log('Driver document stream failed: ' . $exception->getMessage());
    http_response_code(404);
    exit('Not found');
}
