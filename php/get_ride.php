<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fare_engine.php';

function ride_payload(string $id, array $ride, array $latestOffer = []): array
{
    $driver = !empty($ride['driverUid']) ? wow_doc_data('drivers', (string)$ride['driverUid']) : null;
    $passenger = !empty($ride['passengerUid']) ? wow_doc_data('passengers', (string)$ride['passengerUid']) : null;
    return [
        'id' => $id,
        'ride_id' => $id,
        'ride_code' => (string)($ride['rideCode'] ?? ''),
        'wow_code' => (string)($ride['rideCode'] ?? ''),
        'passenger_id' => (string)($ride['passengerUid'] ?? $ride['passengerID'] ?? ''),
        'driver_id' => (string)($ride['driverUid'] ?? $ride['driverId'] ?? $ride['driverID'] ?? ''),
        'pickup' => (string)($ride['pickup'] ?? ''),
        'dropoff' => (string)($ride['dropoff'] ?? ''),
        'pickup_lat' => $ride['pickupLat'] ?? null,
        'pickup_lng' => $ride['pickupLng'] ?? null,
        'drop_lat' => $ride['dropLat'] ?? $ride['dropoffLat'] ?? null,
        'drop_lng' => $ride['dropLng'] ?? $ride['dropoffLng'] ?? null,
        'distance_km' => $ride['distanceKm'] ?? $ride['distance'] ?? 0,
        'duration_min' => $ride['durationMin'] ?? 0,
        'vehicle_type' => (string)($ride['vehicleType'] ?? ''),
        'traffic_level' => (string)($ride['trafficLevel'] ?? ''),
        'time_of_day' => (string)($ride['timeOfDay'] ?? ''),
        'payment_method' => (string)($ride['paymentMethod'] ?? ''),
        'payment_label' => (string)($ride['paymentLabel'] ?? ''),
        'fare' => $ride['fare'] ?? $ride['estimatedFare'] ?? 0,
        'offered_fare' => $ride['offeredFare'] ?? $ride['offerPrice'] ?? null,
        'estimated_fare' => $ride['estimatedFare'] ?? $ride['fare'] ?? 0,
        'offer_price' => $ride['offerPrice'] ?? $ride['offeredFare'] ?? null,
        'status' => (string)($ride['status'] ?? 'pending'),
        'scheduled_at' => wow_timestamp_to_string($ride['scheduledAt'] ?? $ride['scheduledDateTime'] ?? $ride['scheduleAt'] ?? ''),
        'scheduled_date' => (string)($ride['scheduledDate'] ?? ''),
        'scheduled_time' => (string)($ride['scheduledTime'] ?? $ride['pickupTime'] ?? ''),
        'created_at' => wow_timestamp_to_string($ride['createdAt'] ?? ''),
        'updated_at' => wow_timestamp_to_string($ride['updatedAt'] ?? ''),
        'completed_at' => wow_timestamp_to_string($ride['completedAt'] ?? ''),
        'passenger_name' => (string)($ride['passengerName'] ?? $passenger['name'] ?? ''),
        'passenger_phone' => (string)($ride['passengerPhone'] ?? $passenger['phone'] ?? ''),
        'driver_name' => (string)($ride['driverName'] ?? $ride['acceptedDriverName'] ?? $driver['name'] ?? ''),
        'driver_phone' => (string)($ride['driverPhone'] ?? $ride['acceptedDriverPhone'] ?? $driver['phone'] ?? ''),
        'driver_vehicle_type' => (string)($ride['vehicleInfo']['type'] ?? $ride['acceptedDriverVehicle'] ?? $driver['vehicleType'] ?? ''),
        'driver_vehicle_number' => (string)($ride['vehicleInfo']['number'] ?? $driver['vehicleNumber'] ?? ''),
        'driver_current_lat' => $driver['currentLocation']['lat'] ?? null,
        'driver_current_lng' => $driver['currentLocation']['lng'] ?? null,
        // Server-side offer projection is a fallback for browsers where the
        // Firestore realtime listener is unavailable or temporarily denied.
        'latestOfferId' => (string)($latestOffer['uid'] ?? $latestOffer['offerId'] ?? $latestOffer['driverId'] ?? ''),
        'latestOfferStatus' => (string)($latestOffer['status'] ?? $latestOffer['offerStatus'] ?? ''),
        'latestOfferType' => (string)($latestOffer['offerType'] ?? 'counter_offer'),
        'driverOffer' => $latestOffer['offeredFare'] ?? $latestOffer['driverOfferPrice'] ?? $latestOffer['offerPrice'] ?? null,
        'respondingDriverId' => (string)($latestOffer['driverId'] ?? ''),
        'respondingDriverName' => (string)($latestOffer['driverName'] ?? ''),
        'respondingDriverPhone' => (string)($latestOffer['driverPhone'] ?? ''),
        'respondingDriverProfileImage' => (string)($latestOffer['driverProfileImage'] ?? ''),
        'respondingDriverRating' => $latestOffer['driverRating'] ?? null,
        'respondingDriverVehicleType' => (string)($latestOffer['driverVehicleType'] ?? $latestOffer['vehicleType'] ?? ''),
        'respondingDriverVehicleName' => (string)($latestOffer['driverVehicleName'] ?? $latestOffer['vehicleName'] ?? ''),
        'respondingDriverVehicleNumber' => (string)($latestOffer['driverVehicleNumber'] ?? $latestOffer['vehicleNumber'] ?? ''),
        'driverResponseAt' => wow_timestamp_to_string($latestOffer['createdAt'] ?? $latestOffer['updatedAt'] ?? ''),
        'driverResponseExpiresAt' => wow_timestamp_to_string($latestOffer['expiresAt'] ?? ''),
    ];
}

$input = array_merge($_GET, $_POST, fare_input());
$rideCode = fare_get_string($input, 'ride_code', '');
$rideId = trim((string)($input['ride_id'] ?? ''));
if ($rideCode === '' && $rideId === '') {
    fare_json(['ok' => false, 'error' => 'ride_identifier_required'], 422);
}

try {
    $id = $rideId;
    $ride = null;
    if ($id !== '') {
        $snapshot = wow_firestore()->collection('rides')->document($id)->snapshot();
        if ($snapshot->exists()) {
            $ride = $snapshot->data();
        } else {
            $legacySnapshot = wow_firestore()->collection('rideRequests')->document($id)->snapshot();
            if ($legacySnapshot->exists()) $ride = $legacySnapshot->data();
        }
    }
    if (!$ride && $rideCode !== '') {
        $docs = wow_firestore()->collection('rides')->where('rideCode', '=', $rideCode)->limit(1)->documents();
        foreach ($docs as $doc) {
            if ($doc->exists()) {
                $id = $doc->id();
                $ride = $doc->data();
                break;
            }
        }
        if (!$ride) {
            $legacyDocs = wow_firestore()->collection('rideRequests')->where('rideCode', '=', $rideCode)->limit(1)->documents();
            foreach ($legacyDocs as $doc) {
                if ($doc->exists()) {
                    $id = $doc->id();
                    $ride = $doc->data();
                    break;
                }
            }
        }
    }
    if (!$ride) fare_json(['ok' => false, 'error' => 'ride_not_found'], 404);

    $latestOffer = [];
    $latestOfferTime = -1;
    foreach (['rides/' . $id . '/offers', 'rideRequests/' . $id . '/driverOffers'] as $offerPath) {
        foreach (wow_list_collection($offerPath, 100) as $offer) {
            $status = strtolower((string)($offer['status'] ?? $offer['offerStatus'] ?? ''));
            if ($status !== 'pending') continue;
            $rawTime = $offer['updatedAt'] ?? $offer['createdAt'] ?? null;
            $time = $rawTime instanceof \Google\Cloud\Core\Timestamp ? $rawTime->get()->getTimestamp() : (strtotime(wow_timestamp_to_string($rawTime ?? '')) ?: 0);
            if ($time >= $latestOfferTime) {
                $latestOfferTime = $time;
                $latestOffer = $offer;
            }
        }
    }
    fare_json(['ok' => true, 'ride' => ride_payload($id, $ride, $latestOffer)]);
} catch (Throwable $exception) {
    error_log('Firestore get ride failed: ' . $exception->getMessage());
    fare_json(['ok' => false, 'error' => 'ride_fetch_failed'], 500);
}
