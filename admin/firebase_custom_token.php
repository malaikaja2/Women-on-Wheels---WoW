<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../firebase/firestore.php';

header('Content-Type: application/json; charset=utf-8');

function admin_token_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit();
}

function admin_b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

admin_require_auth();

$admin = $_SESSION['admin_auth'] ?? [];
$uid = (string)($admin['uid'] ?? $admin['id'] ?? '');
if ($uid === '') {
    admin_token_json(['ok' => false, 'error' => 'admin_not_authenticated'], 401);
}

try {
    $serviceAccount = wow_firebase_service_account_data();
} catch (Throwable) {
    admin_token_json(['ok' => false, 'error' => 'service_account_invalid'], 500);
}

$now = time();
$header = ['alg' => 'RS256', 'typ' => 'JWT'];
$claims = [
    'iss' => (string)$serviceAccount['client_email'],
    'sub' => (string)$serviceAccount['client_email'],
    'aud' => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    'iat' => $now,
    'exp' => $now + 3600,
    'uid' => $uid,
    'claims' => ['role' => 'admin'],
];

$unsigned = admin_b64url(json_encode($header)) . '.' . admin_b64url(json_encode($claims));
$signature = '';
if (!openssl_sign($unsigned, $signature, (string)$serviceAccount['private_key'], OPENSSL_ALGO_SHA256)) {
    admin_token_json(['ok' => false, 'error' => 'token_sign_failed'], 500);
}

admin_token_json([
    'ok' => true,
    'token' => $unsigned . '.' . admin_b64url($signature),
    'uid' => $uid,
    'project_id' => WOW_FIREBASE_PROJECT_ID,
    'api_key' => WOW_FIREBASE_WEB_API_KEY,
]);
