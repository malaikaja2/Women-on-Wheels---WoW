<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$input = array_merge($_GET, $_POST, fare_input());
$action = strtolower(fare_get_string($input, 'action', 'list'));
$rideCode = preg_replace('/[^A-Za-z0-9\-_]/', '', fare_get_string($input, 'ride_code', '')) ?? '';
$rideId = preg_replace('/[^A-Za-z0-9\-_]/', '', trim((string)($input['ride_id'] ?? ''))) ?? '';
$role = strtolower((string)($_SESSION['role'] ?? fare_get_string($input, 'role', '')));
$uid = trim((string)($_SESSION['firebase_uid'] ?? ''));

if (!in_array($role, ['passenger', 'driver'], true) || $uid === '') {
    fare_json(['ok' => false, 'error' => 'authentication_required'], 401);
}
if ($rideId === '' && $rideCode === '') {
    fare_json(['ok' => false, 'error' => 'ride_identifier_required'], 422);
}

try {
    $ride = null;
    if ($rideId !== '') {
        $snapshot = wow_firestore()->collection('rides')->document($rideId)->snapshot();
        if ($snapshot->exists()) $ride = $snapshot->data();
    }
    if (!$ride && $rideCode !== '') {
        $documents = wow_firestore()->collection('rides')->where('rideCode', '=', $rideCode)->limit(1)->documents();
        foreach ($documents as $document) {
            if (!$document->exists()) continue;
            $rideId = $document->id();
            $ride = $document->data();
            break;
        }
    }
    if (!$ride || $rideId === '') fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);

    $passengerUid = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '');
    $driverUid = (string)($ride['assignedDriverId'] ?? $ride['driverId'] ?? $ride['driverUid'] ?? '');
    $isParticipant = ($role === 'passenger' && hash_equals($passengerUid, $uid))
        || ($role === 'driver' && $driverUid !== '' && hash_equals($driverUid, $uid));
    if (!$isParticipant) fare_json(['ok' => false, 'error' => 'ride_access_denied'], 403);
    $chatStatuses = ['driver_assigned', 'accepted', 'driver_selected', 'driver_en_route', 'driver_arriving', 'arriving', 'arrived', 'ride_started', 'started', 'ongoing', 'in_progress', 'on_trip', 'active', 'completed'];
    $rideStatus = strtolower((string)($ride['status'] ?? ''));
    if (!in_array($rideStatus, $chatStatuses, true)) {
        fare_json(['ok' => false, 'error' => 'chat_not_available_for_ride_status'], 403);
    }

    $messages = wow_firestore()->collection('rides')->document($rideId)->collection('messages');
    if ($action === 'send') {
        $message = mb_substr(trim((string)($input['message'] ?? '')), 0, 1000);
        if ($message === '') fare_json(['ok' => false, 'error' => 'message_required'], 422);
        $clientId = preg_replace('/[^A-Za-z0-9\-_]/', '', trim((string)($input['client_message_id'] ?? ''))) ?? '';
        $messageId = $clientId !== '' ? $uid . '-' . $clientId : bin2hex(random_bytes(10));
        $receiverUid = $role === 'passenger' ? $driverUid : $passengerUid;
        $receiverRole = $role === 'passenger' ? 'driver' : 'passenger';
        $senderName = trim((string)($_SESSION['user_name'] ?? $input['sender'] ?? ucfirst($role)));
        $payload = [
            'messageId' => $messageId,
            'chatId' => $rideId,
            'rideId' => $rideId,
            'rideCode' => (string)($ride['rideCode'] ?? $rideCode),
            'senderId' => $uid,
            'senderRole' => $role,
            'senderName' => $senderName,
            'receiverId' => $receiverUid,
            'receiverRole' => $receiverRole,
            'message' => $message,
            'text' => $message,
            'messageType' => 'text',
            'sentAt' => wow_now(),
            'deliveredAt' => null,
            'readAt' => null,
            'deliveryStatus' => 'sent',
            'read' => false,
            'isRead' => false,
            'isDeleted' => false,
            'notificationId' => 'chat-' . $rideId . '-' . $messageId,
            'source' => 'website_php',
            'createdAt' => wow_now(),
        ];
        $messages->document($messageId)->set($payload, ['merge' => false]);
        wow_set_doc('rideChats', $rideId, [
            'chatId' => $rideId,
            'rideId' => $rideId,
            'passengerId' => $passengerUid,
            'driverId' => $driverUid,
            'lastMessage' => $message,
            'lastMessageAt' => wow_now(),
            'lastMessageSenderId' => $uid,
            'chatStatus' => 'active',
            'updatedAt' => wow_now(),
        ], true);
        fare_json(['ok' => true, 'message' => [
            'id' => $messageId,
            'ride_id' => $rideId,
            'ride_code' => $payload['rideCode'],
            'role' => $role,
            'sender_id' => $uid,
            'sender' => $senderName,
            'message' => $message,
            'created_at' => date(DATE_ATOM),
        ]]);
    }

    $since = fare_get_string($input, 'since', '');
    $rows = [];
    foreach ($messages->limit(400)->documents() as $document) {
        if (!$document->exists()) continue;
        $data = $document->data();
        $createdAt = wow_timestamp_to_string($data['createdAt'] ?? '');
        if ($since !== '' && $createdAt !== '' && strcmp($createdAt, $since) <= 0) continue;
        $rows[] = [
            'id' => $document->id(),
            'ride_id' => $rideId,
            'ride_code' => (string)($data['rideCode'] ?? $ride['rideCode'] ?? ''),
            'role' => (string)($data['senderRole'] ?? 'passenger'),
            'sender_id' => (string)($data['senderId'] ?? ''),
            'sender' => (string)($data['senderName'] ?? ''),
            'receiver_id' => (string)($data['receiverId'] ?? ''),
            'message' => (string)($data['message'] ?? $data['text'] ?? ''),
            'read' => !empty($data['read']) || !empty($data['isRead']),
            'created_at' => $createdAt,
        ];
    }
    usort($rows, static fn(array $a, array $b): int => strcmp((string)$a['created_at'], (string)$b['created_at']));
    fare_json(['ok' => true, 'ride_id' => $rideId, 'ride_code' => (string)($ride['rideCode'] ?? ''), 'messages' => $rows]);
} catch (Throwable $exception) {
    error_log('Firestore ride chat API failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'chat_unavailable'], 500);
}
