<?php
declare(strict_types=1);

require_once __DIR__ . '/firestore.php';

use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\GuzzleException;

function wow_firebase_api_key(): string
{
    $apiKey = getenv('FIREBASE_WEB_API_KEY') ?: WOW_FIREBASE_WEB_API_KEY;
    if ($apiKey === '' || $apiKey === 'YOUR_FIREBASE_WEB_API_KEY') {
        throw new RuntimeException('Firebase Web API key is not configured.');
    }
    return $apiKey;
}

function wow_auth_request(string $method, array $payload): array
{
    $client = new Client(['timeout' => 12]);
    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:' . $method . '?key=' . rawurlencode(wow_firebase_api_key());

    try {
        $response = $client->post($url, ['json' => $payload]);
        $data = json_decode((string)$response->getBody(), true);
        return is_array($data) ? $data : [];
    } catch (ClientException $exception) {
        $body = $exception->getResponse() ? (string)$exception->getResponse()->getBody() : '';
        $payload = json_decode($body, true);
        $message = (string)($payload['error']['message'] ?? 'Firebase Authentication request failed.');
        throw new RuntimeException('Firebase Authentication error: ' . $message, 0, $exception);
    } catch (GuzzleException $exception) {
        throw new RuntimeException('Firebase Authentication request failed.', 0, $exception);
    }
}

function wow_auth_create_user(string $email, string $password, string $displayName): array
{
    return wow_auth_request('signUp', [
        'email' => strtolower(trim($email)),
        'password' => $password,
        'displayName' => $displayName,
        'returnSecureToken' => true,
    ]);
}

function wow_auth_login(string $email, string $password): array
{
    return wow_auth_request('signInWithPassword', [
        'email' => strtolower(trim($email)),
        'password' => $password,
        'returnSecureToken' => true,
    ]);
}

function wow_auth_failure_code(Throwable $exception): string
{
    $message = strtoupper($exception->getMessage());
    foreach (['INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS', 'USER_DISABLED'] as $code) {
        if (str_contains($message, $code)) return strtolower($code);
    }
    if (
        str_contains($message, '429')
        || str_contains($message, 'QUOTA EXCEEDED')
        || str_contains($message, 'RESOURCE_EXHAUSTED')
    ) {
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
    return 'login_service_unavailable';
}

function wow_auth_is_credentials_failure(Throwable $exception): bool
{
    return in_array(wow_auth_failure_code($exception), [
        'invalid_password',
        'email_not_found',
        'invalid_login_credentials',
        'user_disabled',
    ], true);
}

function wow_auth_delete_user(string $idToken): void
{
    if ($idToken !== '') wow_auth_request('delete', ['idToken' => $idToken]);
}

function wow_auth_send_password_reset(string $email): void
{
    wow_auth_request('sendOobCode', [
        'requestType' => 'PASSWORD_RESET',
        'email' => strtolower(trim($email)),
    ]);
}

function wow_auth_send_email_verification(string $idToken): void
{
    if ($idToken === '') {
        throw new RuntimeException('Firebase Authentication error: INVALID_ID_TOKEN');
    }
    wow_auth_request('sendOobCode', [
        'requestType' => 'VERIFY_EMAIL',
        'idToken' => $idToken,
    ]);
}

function wow_auth_update_password(string $email, string $currentPassword, string $newPassword): void
{
    $login = wow_auth_login($email, $currentPassword);
    $idToken = (string)($login['idToken'] ?? '');
    if ($idToken === '') {
        throw new RuntimeException('Firebase Authentication error: INVALID_LOGIN_TOKEN');
    }

    wow_auth_request('update', [
        'idToken' => $idToken,
        'password' => $newPassword,
        'returnSecureToken' => true,
    ]);
}
