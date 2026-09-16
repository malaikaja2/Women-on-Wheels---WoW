<?php
declare(strict_types=1);

require_once __DIR__ . '/../firebase/firestore.php';

use GuzzleHttp\Client;

header('Content-Type: application/json; charset=utf-8');

function rtc_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function rtc_bearer_token(): string
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    return preg_match('/^Bearer\s+(.+)$/i', $header, $match) ? trim($match[1]) : '';
}

try {
    $idToken = rtc_bearer_token();
    if ($idToken === '') rtc_json(['error' => 'authentication_required'], 401);

    $http = new Client(['timeout' => 10]);
    $response = $http->post(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode(WOW_FIREBASE_WEB_API_KEY),
        ['json' => ['idToken' => $idToken]]
    );
    $identity = json_decode((string)$response->getBody(), true);
    $uid = trim((string)($identity['users'][0]['localId'] ?? ''));
    if ($uid === '') rtc_json(['error' => 'authentication_required'], 401);

    $input = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $rideId = trim((string)($input['rideId'] ?? ''));
    $callId = trim((string)($input['callId'] ?? ''));
    $lostFoundCaseId = trim((string)($input['lostFoundCaseId'] ?? ''));
    $ride = $rideId !== '' ? wow_doc_data('rides', $rideId) : null;
    if (!$ride || $callId === '') rtc_json(['error' => 'invalid_call_context'], 404);

    $passengerId = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '');
    $driverId = (string)($ride['assignedDriverId'] ?? $ride['driverUid'] ?? $ride['driverId'] ?? '');
    $allowedStatuses = [
        'driver_assigned', 'accepted', 'driver_en_route', 'driver_arriving',
        'arriving', 'arrived', 'started', 'ride_started', 'ongoing',
        'in_progress', 'active', 'on_trip'
    ];
    $authorized = in_array($uid, [$passengerId, $driverId], true);
    if ($lostFoundCaseId !== '') {
        $case = wow_doc_data('lost_found_cases', $lostFoundCaseId);
        $caseStatus = strtolower(str_replace(' ', '_', trim((string)($case['status'] ?? ''))));
        $allowedCaseStatuses = ['open', 'reported', 'driver_contacted', 'driver_responded', 'item_found', 'return_arranged', 'return_scheduled'];
        $authorized = $authorized && $case
            && (string)($case['rideId'] ?? '') === $rideId
            && (string)($case['passengerId'] ?? '') === $passengerId
            && (string)($case['driverId'] ?? '') === $driverId
            && in_array(strtolower((string)($ride['status'] ?? '')), ['completed', 'ride_completed'], true)
            && in_array($caseStatus, $allowedCaseStatuses, true);
    } else {
        $authorized = $authorized && in_array(strtolower((string)($ride['status'] ?? '')), $allowedStatuses, true);
    }
    if (!$authorized) {
        rtc_json(['error' => 'call_not_authorized'], 403);
    }

    $urls = array_values(array_filter(array_map('trim', explode(',', (string)(getenv('WOW_TURN_URLS') ?: '')))));
    $secret = (string)(getenv('WOW_TURN_SECRET') ?: '');
    if (!$urls || $secret === '') {
        rtc_json([
            'iceServers' => [[
                'urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
            ]],
            'turnConfigured' => false
        ]);
    }

    $expires = time() + 900;
    $username = $expires . ':' . $uid . ':' . substr(hash('sha256', $rideId . ':' . $lostFoundCaseId . ':' . $callId), 0, 16);
    $credential = base64_encode(hash_hmac('sha1', $username, $secret, true));
    rtc_json([
        'iceServers' => [
            ['urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']],
            ['urls' => $urls, 'username' => $username, 'credential' => $credential]
        ],
        'expiresAt' => $expires,
        'turnConfigured' => true
    ]);
} catch (Throwable $error) {
    error_log('RTC ICE configuration failed: ' . $error->getMessage());
    rtc_json(['error' => 'ice_configuration_unavailable'], 500);
}
