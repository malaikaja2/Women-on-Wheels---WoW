<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function wow_driver_document_root(): string
{
    $root = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__, 3))) . DIRECTORY_SEPARATOR . 'wow_private_driver_documents';
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
        throw new RuntimeException('document_directory_unavailable');
    }
    return $root;
}

function wow_driver_document_slot(string $slot): string
{
    $slot = str_replace('-', '_', strtolower(trim($slot)));
    $aliases = [
        'license' => 'licence',
        'license_image' => 'licence',
        'licence_image' => 'licence',
        'driver_license' => 'licence',
        'profile_photo' => 'profile',
        'profile_image' => 'profile',
        'vehicle_photo' => 'vehicle_image',
        'vehicle_registration_document' => 'vehicle_registration',
        'vehicle_document' => 'vehicle_registration',
        'registration_document' => 'vehicle_registration',
    ];
    $slot = $aliases[$slot] ?? $slot;
    if (!in_array($slot, ['cnic_front', 'cnic_back', 'licence', 'profile', 'vehicle_image', 'vehicle_registration'], true)) {
        throw new InvalidArgumentException('invalid_document_slot');
    }
    return $slot;
}

function wow_driver_document_sensitive(string $slot): bool
{
    return wow_driver_document_slot($slot) !== 'profile';
}

function wow_driver_document_validate_uid(string $uid): void
{
    if (!preg_match('/^[A-Za-z0-9_-]{10,128}$/', $uid)) {
        throw new InvalidArgumentException('invalid_uid');
    }
}

function wow_driver_document_limits(string $slot): array
{
    return wow_driver_document_slot($slot) === 'profile'
        ? ['source' => 6 * 1024 * 1024, 'stored' => 2 * 1024 * 1024, 'maxSide' => 800, 'quality' => 82]
        : ['source' => 10 * 1024 * 1024, 'stored' => 5 * 1024 * 1024, 'maxSide' => 1600, 'quality' => 86];
}

function wow_driver_document_extension(string $mime): string
{
    return match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        default => throw new InvalidArgumentException('invalid_file_type'),
    };
}

function wow_driver_document_read_image(string $path, string $mime): array
{
    $info = @getimagesize($path);
    if (!is_array($info) || (int)($info[0] ?? 0) < 1 || (int)($info[1] ?? 0) < 1) {
        throw new InvalidArgumentException('invalid_image_content');
    }
    if ((int)$info[0] > 7000 || (int)$info[1] > 7000) {
        throw new InvalidArgumentException('image_dimensions_too_large');
    }
    $actualMime = strtolower((string)($info['mime'] ?? $mime));
    if (!in_array($actualMime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new InvalidArgumentException('invalid_file_type');
    }
    return ['width' => (int)$info[0], 'height' => (int)$info[1], 'mime' => $actualMime];
}

function wow_driver_document_prepare(string $slot, string $path, int $sourceSize): array
{
    $limits = wow_driver_document_limits($slot);
    if ($sourceSize < 1 || $sourceSize > $limits['source'] || !is_file($path)) {
        throw new InvalidArgumentException('invalid_file_size');
    }
    $mime = strtolower((new finfo(FILEINFO_MIME_TYPE))->file($path) ?: '');
    $image = wow_driver_document_read_image($path, $mime);
    $mime = $image['mime'];
    $extension = wow_driver_document_extension($mime);
    $preparedPath = $path;
    $preparedSize = filesize($path) ?: $sourceSize;
    $cleanup = false;

    if (
        extension_loaded('gd')
        && function_exists('imagecreatetruecolor')
        && function_exists('imagejpeg')
        && ($preparedSize > $limits['stored'] || max($image['width'], $image['height']) > $limits['maxSide'])
    ) {
        $source = match ($mime) {
            'image/jpeg' => function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($path) : false,
            'image/png' => function_exists('imagecreatefrompng') ? @imagecreatefrompng($path) : false,
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            default => false,
        };
        if ($source) {
            $scale = min(1, $limits['maxSide'] / max($image['width'], $image['height']));
            $width = max(1, (int)round($image['width'] * $scale));
            $height = max(1, (int)round($image['height'] * $scale));
            $canvas = imagecreatetruecolor($width, $height);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $width, $height, $image['width'], $image['height']);
            $tmp = tempnam(sys_get_temp_dir(), 'wow_doc_');
            if ($tmp && imagejpeg($canvas, $tmp, (int)$limits['quality'])) {
                $preparedPath = $tmp;
                $preparedSize = filesize($tmp) ?: $preparedSize;
                $mime = 'image/jpeg';
                $extension = 'jpg';
                $image = ['width' => $width, 'height' => $height, 'mime' => $mime];
                $cleanup = true;
            }
            imagedestroy($canvas);
            imagedestroy($source);
        }
    }

    if ($preparedSize > $limits['stored']) {
        if ($cleanup) @unlink($preparedPath);
        throw new InvalidArgumentException('image_too_large');
    }
    return [
        'path' => $preparedPath,
        'mime' => $mime,
        'extension' => $extension,
        'size' => $preparedSize,
        'width' => $image['width'],
        'height' => $image['height'],
        'cleanup' => $cleanup,
    ];
}

function wow_driver_document_url(string $uid, string $slotOrFile): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/WomenonWheels/WomenonWheels/php/x.php')));
    $param = str_contains($slotOrFile, '.') ? 'file' : 'slot';
    return $scheme . '://' . $host . rtrim($script, '/') . '/driver_document.php?uid=' . rawurlencode($uid) . '&' . $param . '=' . rawurlencode($slotOrFile);
}

function wow_driver_document_object_path(string $uid, string $slot, string $extension): string
{
    $slot = wow_driver_document_slot($slot);
    return $slot === 'profile'
        ? 'users/' . $uid . '/profile/profile.' . $extension
        : 'users/' . $uid . '/verification/' . $slot . '.' . $extension;
}

function wow_driver_document_bucket(): string
{
    return getenv('FIREBASE_STORAGE_BUCKET') ?: (defined('WOW_FIREBASE_STORAGE_BUCKET') ? WOW_FIREBASE_STORAGE_BUCKET : '');
}

function wow_driver_document_service_account_path(): string
{
    $path = getenv('GOOGLE_APPLICATION_CREDENTIALS') ?: '';
    if ($path !== '' && is_file($path)) return $path;
    $fallback = 'C:\\firebase-keys\\women-on-wheels-f8970-service-account.json';
    return is_file($fallback) ? $fallback : '';
}

function wow_driver_document_storage_token(): string
{
    static $token = null;
    if (is_array($token) && (int)($token['expires_at'] ?? 0) > time() + 60) {
        return (string)$token['access_token'];
    }
    $path = wow_driver_document_service_account_path();
    if ($path === '') throw new RuntimeException('storage_credentials_unavailable');
    $credentials = new \Google\Auth\Credentials\ServiceAccountCredentials(
        ['https://www.googleapis.com/auth/devstorage.full_control'],
        $path
    );
    $token = $credentials->fetchAuthToken();
    if (empty($token['access_token'])) throw new RuntimeException('storage_token_unavailable');
    $token['expires_at'] = time() + (int)($token['expires_in'] ?? 3600);
    return (string)$token['access_token'];
}

function wow_driver_document_delete_firebase_variants(string $bucket, string $uid, string $slot, string $keepObject): void
{
    $prefix = wow_driver_document_slot($slot) === 'profile'
        ? 'users/' . $uid . '/profile/profile.'
        : 'users/' . $uid . '/verification/' . wow_driver_document_slot($slot) . '.';
    $client = new \GuzzleHttp\Client(['timeout' => 12]);
    foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
        $object = $prefix . $ext;
        if ($object === $keepObject) continue;
        try {
            $client->delete('https://storage.googleapis.com/storage/v1/b/' . rawurlencode($bucket) . '/o/' . rawurlencode($object), [
                'headers' => ['Authorization' => 'Bearer ' . wow_driver_document_storage_token()],
            ]);
        } catch (Throwable) {
        }
    }
}

function wow_driver_document_try_firebase_upload(string $uid, string $slot, array $prepared): ?array
{
    $mode = strtolower(trim((string)(getenv('WOW_FILE_STORAGE') ?: 'local')));
    if ($mode === 'local') return null;
    $bucket = wow_driver_document_bucket();
    if ($bucket === '') {
        if ($mode === 'firebase') throw new RuntimeException('storage_bucket_unavailable');
        return null;
    }
    $object = wow_driver_document_object_path($uid, $slot, (string)$prepared['extension']);
    try {
        $client = new \GuzzleHttp\Client(['timeout' => 30]);
        $client->post('https://storage.googleapis.com/upload/storage/v1/b/' . rawurlencode($bucket) . '/o', [
            'headers' => [
                'Authorization' => 'Bearer ' . wow_driver_document_storage_token(),
                'Content-Type' => (string)$prepared['mime'],
            ],
            'query' => ['uploadType' => 'media', 'name' => $object],
            'body' => fopen((string)$prepared['path'], 'rb'),
        ]);
        wow_driver_document_delete_firebase_variants($bucket, $uid, $slot, $object);
        return [
            'provider' => 'firebase_storage',
            'path' => 'gs://' . $bucket . '/' . $object,
            'storagePath' => $object,
            'fileName' => basename($object),
        ];
    } catch (Throwable $exception) {
        if ($mode === 'firebase') throw $exception;
        error_log('WOW Firebase Storage unavailable; using local private document storage: ' . $exception->getMessage());
        return null;
    }
}

function wow_driver_document_save_local(string $uid, string $slot, array $prepared): array
{
    $directory = wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid;
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('document_directory_unavailable');
    }
    $slot = wow_driver_document_slot($slot);
    $target = $directory . DIRECTORY_SEPARATOR . $slot . '.' . (string)$prepared['extension'];
    $tmp = $directory . DIRECTORY_SEPARATOR . '.' . $slot . '-' . bin2hex(random_bytes(4)) . '.' . (string)$prepared['extension'];
    if (!copy((string)$prepared['path'], $tmp)) throw new RuntimeException('document_write_failed');
    @chmod($tmp, 0600);
    if (!rename($tmp, $target)) {
        @unlink($tmp);
        throw new RuntimeException('document_write_failed');
    }
    @chmod($target, 0600);
    foreach (glob($directory . DIRECTORY_SEPARATOR . $slot . '.*') ?: [] as $old) {
        if (realpath($old) !== realpath($target)) @unlink($old);
    }
    return [
        'provider' => 'local_private',
        'path' => 'local://driver_documents/' . $uid . '/' . basename($target),
        'storagePath' => $target,
        'fileName' => basename($target),
    ];
}

function wow_save_driver_document_record(string $uid, string $slot, string $temporaryPath, int $size): array
{
    wow_driver_document_validate_uid($uid);
    $slot = wow_driver_document_slot($slot);
    $prepared = wow_driver_document_prepare($slot, $temporaryPath, $size);
    try {
        $storage = wow_driver_document_try_firebase_upload($uid, $slot, $prepared)
            ?? wow_driver_document_save_local($uid, $slot, $prepared);
    } finally {
        if (!empty($prepared['cleanup'])) @unlink((string)$prepared['path']);
    }
    return [
        'uid' => $uid,
        'slot' => $slot,
        'storageProvider' => $storage['provider'],
        'path' => $storage['path'],
        'storagePath' => $storage['storagePath'],
        'url' => wow_driver_document_url($uid, $slot),
        'fileName' => $storage['fileName'],
        'mimeType' => $prepared['mime'],
        'size' => $prepared['size'],
        'width' => $prepared['width'],
        'height' => $prepared['height'],
        'originalSize' => $size,
    ];
}

function wow_save_driver_document(string $uid, string $slot, string $temporaryPath, int $size): string
{
    return (string)wow_save_driver_document_record($uid, $slot, $temporaryPath, $size)['url'];
}

function wow_driver_document_field_map(string $slot): array
{
    return match (wow_driver_document_slot($slot)) {
        'profile' => [
            'url' => ['profilePhotoUrl', 'profileImageUrl', 'profileImage', 'photoURL'],
            'path' => ['profilePhotoPath', 'profileImagePath'],
        ],
        'cnic_front' => [
            'url' => ['cnicUploadUrl', 'cnicImageUrl', 'cnicFrontUrl', 'cnicFileUrl'],
            'path' => ['cnicFrontPath', 'cnicImagePath'],
        ],
        'cnic_back' => [
            'url' => ['cnicBackUrl'],
            'path' => ['cnicBackPath'],
        ],
        'licence' => [
            'url' => ['licenceImageUrl', 'licenseImageUrl', 'licenceUrl', 'licenseUrl'],
            'path' => ['licenceImagePath', 'licenseImagePath', 'licencePath', 'licensePath'],
        ],
        'vehicle_image' => [
            'url' => ['vehicleImageUrl', 'vehiclePhotoUrl'],
            'path' => ['vehicleImagePath', 'vehiclePhotoPath'],
        ],
        'vehicle_registration' => [
            'url' => ['vehicleRegistrationUrl', 'registrationDocumentUrl', 'vehicleDocumentUrl'],
            'path' => ['vehicleRegistrationPath', 'registrationDocumentPath', 'vehicleDocumentPath'],
        ],
    };
}

function wow_driver_document_metadata(array $record): array
{
    return [
        'path' => (string)$record['path'],
        'url' => (string)$record['url'],
        'provider' => (string)$record['storageProvider'],
        'storagePath' => (string)$record['storagePath'],
        'fileName' => (string)$record['fileName'],
        'mimeType' => (string)$record['mimeType'],
        'size' => (int)$record['size'],
        'width' => (int)$record['width'],
        'height' => (int)$record['height'],
        'uploadedAt' => wow_now(),
    ];
}

function wow_record_driver_document_upload(string $uid, array $record): void
{
    wow_driver_document_validate_uid($uid);
    $slot = wow_driver_document_slot((string)($record['slot'] ?? ''));
    $pathsKey = $slot === 'profile' ? 'profile_photo' : $slot;
    $fields = wow_driver_document_field_map($slot);
    $metadata = wow_driver_document_metadata($record);
    $sensitive = wow_driver_document_sensitive($slot);

    foreach (['drivers', 'driverApplications', 'users'] as $collection) {
        $current = wow_doc_data($collection, $uid) ?: [];
        $documentPaths = is_array($current['documentPaths'] ?? null) ? $current['documentPaths'] : [];
        $documentMetadata = is_array($current['documentMetadata'] ?? null) ? $current['documentMetadata'] : [];
        $documentPaths[$slot] = (string)$record['path'];
        $documentPaths[$pathsKey] = (string)$record['path'];
        $documentMetadata[$slot] = $metadata;
        $documentMetadata[$pathsKey] = $metadata;

        $update = ['documentPaths' => $documentPaths, 'documentMetadata' => $documentMetadata];
        foreach ($fields['url'] as $key) $update[$key] = (string)$record['url'];
        foreach ($fields['path'] as $key) $update[$key] = (string)$record['path'];

        if ($sensitive) {
            $update += [
                'verificationStatus' => 'pending',
                'verificationSubmittedAt' => wow_now(),
                'verificationReviewedAt' => null,
                'verificationReviewedBy' => null,
                'verificationRejectionReason' => null,
                'rejectionReason' => '',
                'isApproved' => false,
                'isRejected' => false,
                'accountStatus' => 'pending_verification',
            ];
            if ($collection !== 'users') {
                $update += ['role' => 'driver_applicant', 'isActive' => false, 'isOnline' => false, 'isAvailable' => false];
            } else {
                $update['role'] = 'driver_applicant';
            }
            if ($collection === 'driverApplications') {
                $update += ['status' => 'pending', 'submittedAt' => wow_now(), 'reviewedAt' => null, 'reviewedBy' => null];
            }
        }
        wow_set_doc($collection, $uid, $update, true);
    }
}

function wow_driver_document_pick(array $row, array $keys): string
{
    foreach ($keys as $key) {
        $value = $row[$key] ?? null;
        if (is_scalar($value) && trim((string)$value) !== '') return trim((string)$value);
    }
    return '';
}

function wow_driver_document_reference_from_profile(array $profile, string $slot): string
{
    $slot = wow_driver_document_slot($slot);
    $aliases = array_values(array_unique([$slot, $slot === 'profile' ? 'profile_photo' : $slot]));
    foreach ([is_array($profile['documentPaths'] ?? null) ? $profile['documentPaths'] : [], is_array($profile['documentMetadata'] ?? null) ? $profile['documentMetadata'] : []] as $map) {
        foreach ($aliases as $key) {
            $value = $map[$key] ?? null;
            if (is_array($value)) {
                foreach (['path', 'storagePath', 'url'] as $field) {
                    if (trim((string)($value[$field] ?? '')) !== '') return trim((string)$value[$field]);
                }
            } elseif (is_scalar($value) && trim((string)$value) !== '') {
                return trim((string)$value);
            }
        }
    }
    $fields = wow_driver_document_field_map($slot);
    return wow_driver_document_pick($profile, array_merge($fields['path'], $fields['url']));
}

function wow_driver_document_reference(string $uid, string $slot): string
{
    wow_driver_document_validate_uid($uid);
    $slot = wow_driver_document_slot($slot);
    foreach (['drivers', 'driverApplications', 'users'] as $collection) {
        $profile = wow_doc_data($collection, $uid);
        if (!$profile) continue;
        $reference = wow_driver_document_reference_from_profile($profile, $slot);
        if ($reference !== '') return $reference;
    }
    $local = wow_driver_document_existing_local_file($uid, $slot);
    return $local !== '' ? 'local://driver_documents/' . $uid . '/' . basename($local) : '';
}

function wow_driver_document_parse_file_slot(string $file): string
{
    $file = basename($file);
    if (!preg_match('/^(cnic_front|cnic_back|licence|profile|vehicle_image|vehicle_registration)\.(jpg|jpeg|png|webp)$/i', $file, $matches)) {
        throw new InvalidArgumentException('invalid_document_slot');
    }
    return wow_driver_document_slot($matches[1]);
}

function wow_driver_document_existing_local_file(string $uid, string $slot): string
{
    wow_driver_document_validate_uid($uid);
    $slot = wow_driver_document_slot($slot);
    $directory = wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid;
    foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
        $path = $directory . DIRECTORY_SEPARATOR . $slot . '.' . $ext;
        if (is_file($path)) return $path;
    }
    return '';
}

function wow_driver_document_exists(string $uid, string $slot): bool
{
    try {
        return wow_driver_document_reference($uid, $slot) !== '' || wow_driver_document_existing_local_file($uid, $slot) !== '';
    } catch (Throwable) {
        return false;
    }
}

function wow_stream_local_driver_document(string $path): never
{
    $mime = strtolower((new finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'application/octet-stream');
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        http_response_code(404);
        exit('Not found');
    }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=120');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit();
}

function wow_stream_http_driver_document(string $reference): never
{
    $host = strtolower((string)(parse_url($reference, PHP_URL_HOST) ?? ''));
    $currentHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $allowed = $host === $currentHost || in_array($host, ['firebasestorage.googleapis.com', 'storage.googleapis.com'], true) || str_ends_with($host, '.firebasestorage.app');
    if (!$allowed) {
        http_response_code(404);
        exit('Not found');
    }
    if (str_contains((string)(parse_url($reference, PHP_URL_PATH) ?? ''), 'driver_document.php')) {
        $query = [];
        parse_str((string)(parse_url($reference, PHP_URL_QUERY) ?? ''), $query);
        $uid = trim((string)($query['uid'] ?? ''));
        $slot = trim((string)($query['slot'] ?? ''));
        $file = trim((string)($query['file'] ?? ''));
        if ($slot === '' && $file !== '') $slot = wow_driver_document_parse_file_slot($file);
        $path = $file !== ''
            ? wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid . DIRECTORY_SEPARATOR . basename($file)
            : wow_driver_document_existing_local_file($uid, $slot);
        if ($path !== '' && is_file($path)) wow_stream_local_driver_document($path);
    }
    $client = new \GuzzleHttp\Client(['timeout' => 20]);
    $response = $client->get($reference);
    $type = strtolower((string)($response->getHeaderLine('Content-Type') ?: ''));
    if (!str_starts_with($type, 'image/jpeg') && !str_starts_with($type, 'image/png') && !str_starts_with($type, 'image/webp')) {
        http_response_code(404);
        exit('Not found');
    }
    header('Content-Type: ' . explode(';', $type)[0]);
    header('Cache-Control: private, max-age=120');
    header('X-Content-Type-Options: nosniff');
    echo $response->getBody();
    exit();
}

function wow_stream_storage_driver_document(string $reference): never
{
    if (!preg_match('#^gs://([^/]+)/(.+)$#', $reference, $matches)) {
        throw new RuntimeException('invalid_storage_reference');
    }
    $client = new \GuzzleHttp\Client(['timeout' => 20]);
    $response = $client->get('https://storage.googleapis.com/storage/v1/b/' . rawurlencode($matches[1]) . '/o/' . rawurlencode($matches[2]) . '?alt=media', [
        'headers' => ['Authorization' => 'Bearer ' . wow_driver_document_storage_token()],
    ]);
    $type = strtolower((string)($response->getHeaderLine('Content-Type') ?: 'image/jpeg'));
    if (!in_array(explode(';', $type)[0], ['image/jpeg', 'image/png', 'image/webp'], true)) {
        http_response_code(404);
        exit('Not found');
    }
    header('Content-Type: ' . explode(';', $type)[0]);
    header('Cache-Control: private, max-age=120');
    header('X-Content-Type-Options: nosniff');
    echo $response->getBody();
    exit();
}

function wow_stream_driver_document(string $uid, string $slot, string $file = ''): never
{
    wow_driver_document_validate_uid($uid);
    $slot = $file !== '' ? wow_driver_document_parse_file_slot($file) : wow_driver_document_slot($slot);
    if ($file !== '') {
        $path = wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid . DIRECTORY_SEPARATOR . basename($file);
        if (is_file($path)) wow_stream_local_driver_document($path);
    }
    $reference = wow_driver_document_reference($uid, $slot);
    if ($reference === '') {
        http_response_code(404);
        exit('Not found');
    }
    if (str_starts_with($reference, 'gs://')) wow_stream_storage_driver_document($reference);
    if (str_starts_with($reference, 'local://driver_documents/')) {
        $path = wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid . DIRECTORY_SEPARATOR . basename($reference);
        if (is_file($path)) wow_stream_local_driver_document($path);
    }
    if (preg_match('#^https?://#i', $reference)) wow_stream_http_driver_document($reference);
    if (str_contains($reference, 'driver_document.php')) {
        $query = [];
        parse_str((string)(parse_url($reference, PHP_URL_QUERY) ?? ''), $query);
        $file = trim((string)($query['file'] ?? ''));
        if ($file !== '') {
            $path = wow_driver_document_root() . DIRECTORY_SEPARATOR . $uid . DIRECTORY_SEPARATOR . basename($file);
            if (is_file($path)) wow_stream_local_driver_document($path);
        }
    }
    http_response_code(404);
    exit('Not found');
}

function wow_firebase_uid_from_bearer(): string
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) return '';
    try {
        $client = new \GuzzleHttp\Client(['timeout' => 12]);
        $response = $client->post('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode(wow_firebase_api_key()), ['json' => ['idToken' => $matches[1]]]);
        $data = json_decode((string)$response->getBody(), true);
        return (string)($data['users'][0]['localId'] ?? '');
    } catch (Throwable) {
        return '';
    }
}
