<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/../firebase/config.php';

header('Content-Type: application/json; charset=utf-8');

function wow_token_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit();
}

function wow_b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

$uid = (string)($_SESSION['firebase_uid'] ?? $_SESSION['user_id'] ?? '');
if ($uid === '') {
    wow_token_json(['ok' => false, 'error' => 'not_authenticated'], 401);
}

$keyPath = getenv('GOOGLE_APPLICATION_CREDENTIALS') ?: '';
if ($keyPath === '' || !is_file($keyPath)) {
    wow_token_json(['ok' => false, 'error' => 'service_account_missing'], 500);
}

$serviceAccount = json_decode((string)file_get_contents($keyPath), true);
if (!is_array($serviceAccount) || empty($serviceAccount['client_email']) || empty($serviceAccount['private_key'])) {
    wow_token_json(['ok' => false, 'error' => 'service_account_invalid'], 500);
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
    'claims' => [
        'role' => (string)($_SESSION['role'] ?? ''),
    ],
];

$unsigned = wow_b64url(json_encode($header)) . '.' . wow_b64url(json_encode($claims));
$signature = '';
if (!openssl_sign($unsigned, $signature, (string)$serviceAccount['private_key'], OPENSSL_ALGO_SHA256)) {
    wow_token_json(['ok' => false, 'error' => 'token_sign_failed'], 500);
}

wow_token_json([
    'ok' => true,
    'token' => $unsigned . '.' . wow_b64url($signature),
    'uid' => $uid,
    'role' => (string)($_SESSION['role'] ?? ''),
    'project_id' => WOW_FIREBASE_PROJECT_ID,
    'api_key' => WOW_FIREBASE_WEB_API_KEY,
]);
