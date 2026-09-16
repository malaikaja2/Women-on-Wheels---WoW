<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$input = fare_input();
$action = strtolower(fare_get_string($input, 'action', 'driver_summary'));

function find_ride_for_review(array $input): array
{
    $rideCode = fare_get_string($input, 'ride_code', '');
    $rideId = trim((string)($input['ride_id'] ?? ''));
    if ($rideId !== '') {
        $snapshot = wow_firestore()->collection('rides')->document($rideId)->snapshot();
        if ($snapshot->exists()) return ['id' => $snapshot->id(), 'data' => $snapshot->data()];
    }
    if ($rideCode !== '') {
        $docs = wow_firestore()->collection('rides')->where('rideCode', '=', $rideCode)->limit(1)->documents();
        foreach ($docs as $doc) {
            if ($doc->exists()) return ['id' => $doc->id(), 'data' => $doc->data()];
        }
    }
    return ['id' => '', 'data' => null];
}

if ($action === 'submit') {
    $passengerUid = fare_resolve_user_id($conn, 'passenger', $input);
    if ($passengerUid === '') fare_json(['ok' => false, 'error' => 'passenger_required'], 422);
    $rating = (int)($input['rating'] ?? 0);
    if ($rating < 1 || $rating > 5) fare_json(['ok' => false, 'error' => 'rating_invalid'], 422);
    $reviewText = mb_substr(trim((string)($input['review_text'] ?? '')), 0, 1000);
    $rideWrap = find_ride_for_review($input);
    $ride = $rideWrap['data'];
    if (!$ride) fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);
    $ridePassengerUid = (string)($ride['passengerId'] ?? $ride['passengerUid'] ?? '');
    $rideDriverUid = (string)($ride['assignedDriverId'] ?? $ride['driverId'] ?? $ride['driverUid'] ?? '');
    if ($ridePassengerUid !== $passengerUid) fare_json(['ok' => false, 'error' => 'ride_access_denied'], 403);
    if ($rideDriverUid === '') fare_json(['ok' => false, 'error' => 'driver_not_assigned'], 422);
    if (fare_normalize_ride_status((string)($ride['status'] ?? '')) !== 'completed') fare_json(['ok' => false, 'error' => 'ride_not_completed'], 422);

    $reviewId = $rideWrap['id'];
    $existing = wow_firestore()->collection('rideReviews')->document($reviewId)->snapshot();
    if ($existing->exists()) fare_json(['ok' => false, 'error' => 'review_already_submitted'], 409);
    $passengerName = (string)($ride['passengerName'] ?? $ride['userName'] ?? 'Passenger');
    $driverName = (string)($ride['driverName'] ?? $ride['acceptedDriverName'] ?? 'Driver');
    $rideCode = (string)($ride['rideCode'] ?? '');
    $review = [
        'reviewId' => $reviewId,
        'ratingId' => $reviewId,
        'rideId' => $reviewId,
        'rideCode' => $rideCode,
        'passengerId' => $passengerUid,
        'passengerUid' => $passengerUid,
        'driverId' => $rideDriverUid,
        'driverUid' => $rideDriverUid,
        'reviewerId' => $passengerUid,
        'reviewerRole' => 'passenger',
        'reviewerName' => $passengerName,
        'revieweeId' => $rideDriverUid,
        'revieweeRole' => 'driver',
        'revieweeName' => $driverName,
        'passengerName' => $passengerName,
        'passengerDisplayName' => $passengerName,
        'driverName' => $driverName,
        'driverDisplayName' => $driverName,
        'rating' => $rating,
        'review' => $reviewText,
        'reviewText' => $reviewText,
        'comment' => $reviewText,
        'feedback' => $reviewText,
        'feedbackTags' => [],
        'tags' => [],
        'sourcePlatform' => 'passenger_website',
        'source' => 'passenger_website',
        'platform' => 'passenger_website',
        'moderationStatus' => 'visible',
        'isVisible' => true,
        'isDeleted' => false,
        'rideCompletedAt' => $ride['completedAt'] ?? null,
        'createdAt' => wow_now(),
        'updatedAt' => wow_now(),
    ];
    wow_firestore()->collection('rideReviews')->document($reviewId)->set($review);
    wow_firestore()->collection('ratings')->document($reviewId)->set($review, ['merge' => true]);
    wow_set_doc('rides', $reviewId, [
        'passengerRating' => $rating,
        'passengerFeedback' => $reviewText,
        'reviewSubmitted' => true,
        'reviewId' => $reviewId,
        'reviewSubmittedAt' => wow_now(),
        'ratedAt' => wow_now(),
        'updatedAt' => wow_now(),
    ], true);
    fare_json(['ok' => true, 'review_id' => $reviewId, 'ride_id' => $reviewId, 'ride_code' => $review['rideCode'], 'driver_id' => $review['driverUid'], 'rating' => $rating]);
}

if ($action === 'ride_review') {
    $rideWrap = find_ride_for_review($input);
    if ($rideWrap['id'] === '') fare_json(['ok' => true, 'review' => null]);
    $snap = wow_firestore()->collection('rideReviews')->document($rideWrap['id'])->snapshot();
    if (!$snap->exists()) fare_json(['ok' => true, 'review' => null]);
    $r = $snap->data();
    fare_json(['ok' => true, 'review' => [
        'id' => $snap->id(),
        'ride_id' => (string)($r['rideId'] ?? ''),
        'ride_code' => (string)($r['rideCode'] ?? ''),
        'rating' => (int)($r['rating'] ?? 0),
        'review_text' => (string)($r['reviewText'] ?? ''),
        'created_at' => wow_timestamp_to_string($r['createdAt'] ?? ''),
    ]]);
}

$driverUid = fare_resolve_user_id($conn, 'driver', $input);
if ($driverUid === '') fare_json(['ok' => false, 'error' => 'driver_required'], 422);
$limit = max(1, min(100, (int)($input['limit'] ?? 20)));
$docs = wow_firestore()->collection('rideReviews')->where('driverUid', '=', $driverUid)->limit($limit)->documents();
$rows = [];
$sum = 0;
$passengerCache = [];
foreach ($docs as $doc) {
    if (!$doc->exists()) continue;
    $r = $doc->data();
    $passengerName = (string)($r['passengerDisplayName'] ?? $r['passengerName'] ?? $r['reviewerName'] ?? '');
    $passengerUid = (string)($r['passengerUid'] ?? $r['passengerId'] ?? $r['reviewerId'] ?? '');
    if ($passengerName === '' && $passengerUid !== '') {
        if (!array_key_exists($passengerUid, $passengerCache)) {
            $passengerCache[$passengerUid] = wow_doc_data('passengers', $passengerUid);
        }
        $passengerName = (string)($passengerCache[$passengerUid]['name'] ?? '');
    }
    $rating = (int)($r['rating'] ?? 0);
    $sum += $rating;
    $rows[] = [
        'id' => $doc->id(),
        'ride_id' => (string)($r['rideId'] ?? ''),
        'ride_code' => (string)($r['rideCode'] ?? ''),
        'rating' => $rating,
        'review_text' => (string)($r['reviewText'] ?? ''),
        'created_at' => wow_timestamp_to_string($r['createdAt'] ?? ''),
        'passenger_name' => $passengerName !== '' ? $passengerName : 'Passenger',
    ];
}
fare_json(['ok' => true, 'driver_id' => $driverUid, 'summary' => ['total_reviews' => count($rows), 'avg_rating' => count($rows) ? round($sum / count($rows), 2) : 0], 'reviews' => $rows]);
