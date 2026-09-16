<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../php/driver_documents.php';

admin_require_auth();

$uid = trim((string)($_GET['uid'] ?? ''));
$slot = trim((string)($_GET['slot'] ?? ''));
$file = basename((string)($_GET['file'] ?? ''));

try {
    if ($slot === '' && $file !== '') $slot = wow_driver_document_parse_file_slot($file);
    $slot = wow_driver_document_slot($slot);
    wow_driver_document_validate_uid($uid);
    wow_stream_driver_document($uid, $slot, $file);
} catch (Throwable $exception) {
    error_log('Admin driver document stream failed: ' . $exception->getMessage());
    http_response_code(404);
    exit('Not found');
}
