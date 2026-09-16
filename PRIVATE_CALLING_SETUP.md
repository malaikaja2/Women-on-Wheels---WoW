# Private ride calling deployment

The passenger website uses `passenger-ride.html`. Passenger and driver calls use
the same `rideCalls/{rideId}` signaling document and a unique `callId` per call.
Audio is WebRTC; Firebase is used only for authorization, signaling, state, and
notifications.

## Production requirements

1. Deploy `firebase/firestore.rules`.
2. Deploy the functions in `.mobile_patch/functions/index.js`.
3. Configure Firebase Cloud Messaging tokens on passenger and driver profiles.
4. Serve both websites over HTTPS (localhost is allowed for development).
5. Configure a production TURN service on the PHP server:

   - `WOW_TURN_URLS` — comma-separated TURN URLs, for example
     `turn:turn.example.com:3478,turns:turn.example.com:5349`
   - `WOW_TURN_SECRET` — the TURN REST shared secret

   `php/rtc_ice_config.php` verifies the Firebase ID token and ride membership,
   then returns a short-lived TURN credential. Never put the TURN secret in web
   or Flutter source.

6. Integrate `.mobile_patch/ride_call_screen.dart` into the shared Flutter
   project used by both apps and retain the existing `flutter_webrtc`
   dependency and microphone permissions.

## Required verification

Use two authenticated assigned ride participants and test all app/browser
combinations. Verify microphone permission, ringing, answer/decline, mute,
speaker, timeout, reconnect/end, multi-device answer, FCM background delivery,
continued GPS/map operation, and ride-completion call disabling.

Admin clients should read `callMetadata` only. They must not read `rideCalls`,
request RTC credentials, or join a channel.
