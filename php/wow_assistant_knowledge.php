<?php
declare(strict_types=1);

/**
 * Source-controlled Women on Wheels assistant knowledge.
 *
 * This file is deliberately data-driven: add or edit entries here instead of
 * adding UI conditionals. Admin-published Firestore answers are layered on top
 * by wow_assistant_retrieve_knowledge().
 */

function wow_assistant_normalize(string $value): string
{
    $value = strtolower(trim($value));
    $value = str_replace(['women-on-wheels', 'women on wheel', 'womens on wheels', 'woman on wheels'], 'women on wheels', $value);
    $value = str_replace(['passward', 'pasword'], 'password', $value);
    $value = str_replace(['licence', 'license'], 'licence', $value);
    $value = str_replace(['reqwaust', 'requst', 'requestt'], 'request', $value);
    $value = str_replace(['passenegr', 'passanger'], 'passenger', $value);
    $value = preg_replace('/[^a-z0-9%\s]+/i', ' ', $value) ?? $value;
    $value = preg_replace('/\s+/', ' ', $value) ?? $value;
    return trim($value);
}

function wow_assistant_tokens(string $value): array
{
    $stop = array_flip([
        'a','an','and','are','can','do','does','for','how','i','is','it','my','of','on','or','the','to','what','when','where','who','why',
        'hai','hain','he','ka','ke','ki','ko','main','mein','mujhe','mera','meri','kya','kese','kaise','karun','karni','karna',
    ]);
    $tokens = [];
    foreach (explode(' ', wow_assistant_normalize($value)) as $token) {
        if ($token === '' || isset($stop[$token])) continue;
        $tokens[] = $token;
    }
    return array_values(array_unique($tokens));
}

function wow_assistant_close_word(string $a, string $b): bool
{
    if ($a === $b) return true;
    $aLen = strlen($a);
    $bLen = strlen($b);
    if ($aLen < 4 || $bLen < 4 || abs($aLen - $bLen) > 2) return false;
    return levenshtein($a, $b) <= ($aLen >= 7 || $bLen >= 7 ? 2 : 1);
}

function wow_assistant_roman_urdu(string $message): bool
{
    return preg_match('/\b(kaise|kese|kesy|nahi|nhi|meri|mera|mujhe|kahan|kaha|kitna|kitni|karun|karni|kyun|hogi|mil|chahiye|banun|banaun|madad)\b/i', $message) === 1;
}

function wow_assistant_knowledge(): array
{
    return [
        'about_wow' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'about_wow',
            'type' => 'general',
            'phrases' => ['what is wow', 'what is women on wheels', 'tell me about wow', 'explain wow', 'wow kya hai', 'women on wheels kya hai'],
            'keywords' => ['wow', 'women on wheels', 'purpose', 'platform', 'about'],
            'text' => 'Women on Wheels connects authenticated women passengers with verified women drivers. It supports ride booking, driver requests, offers, live tracking, chat/call, payments, ratings, Lost and Found, SOS, and admin review features already built into this project.',
        ],
        'how_wow_works' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'about_wow',
            'type' => 'general',
            'phrases' => ['how does wow work', 'how women on wheels works', 'how do i use wow', 'app kaise use', 'website kaise use'],
            'keywords' => ['works', 'use', 'guide', 'flow', 'process'],
            'text' => "Basic flow:\n1. Passenger signs in and creates a ride request.\n2. Eligible online drivers see matching requests.\n3. Driver accepts or sends a counteroffer.\n4. The passenger confirms the valid driver offer where required.\n5. The assigned ride opens tracking, chat, call, payment, rating, and history features.",
        ],
        'passenger_registration' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'registration',
            'type' => 'general',
            'phrases' => ['passenger registration', 'register as passenger', 'passenger account', 'passenger kaise register', 'passenger signup'],
            'keywords' => ['passenger', 'register', 'registration', 'signup', 'account'],
            'text' => 'To register as a passenger, use Sign Up, choose Passenger, enter the required account details, then log in with the registered email and password. Passenger ride data stays tied to the authenticated Firebase UID.',
        ],
        'driver_registration' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'registration',
            'type' => 'general',
            'phrases' => ['driver registration', 'register as driver', 'become a driver', 'driver kaise banun', 'driver kaise banu', 'i want to register as a driver'],
            'keywords' => ['driver', 'register', 'registration', 'signup', 'become', 'banun', 'banu'],
            'text' => 'To become a WOW driver, use driver registration, submit profile and vehicle details, upload required verification documents, then wait for admin approval. A driver should not receive normal ride requests until approved by the existing verification flow.',
        ],
        'driver_documents' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'documents',
            'type' => 'general',
            'phrases' => ['what documents do i need', 'driver documents', 'documents required', 'cnic and licence', 'driver ke documents', 'documents kya chahiye'],
            'keywords' => ['documents', 'document', 'cnic', 'licence', 'license', 'vehicle', 'photo', 'verification'],
            'text' => 'Driver registration uses profile details plus CNIC, driving licence, and vehicle-related information/images where the form asks for them. The assistant will not show CNIC numbers, licence numbers, or uploaded private documents.',
        ],
        'driver_verification_general' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'verification',
            'type' => 'general',
            'phrases' => ['driver verification', 'driver approval', 'admin approval', 'why account pending', 'approval kaise hoti hai'],
            'keywords' => ['verification', 'approval', 'approved', 'pending', 'rejected', 'admin'],
            'text' => 'Driver accounts go through admin review. Admin checks the submitted profile and required documents, then the driver status becomes approved, pending, or rejected according to the saved driver record.',
        ],
        'approval_timing' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'verification',
            'type' => 'general',
            'phrases' => ['how long does approval take', 'approval time', 'kitna time approval', 'approval kab hogi', 'verification kab approve hogi'],
            'keywords' => ['approval time', 'how long approval', 'kab approve', 'kitna time'],
            'text' => 'The current project does not define a guaranteed driver approval time. Check the Driver Verification screen for the real saved status, or contact WOW support if it stays pending.',
        ],
        'login_help' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'account_login',
            'type' => 'general',
            'phrases' => ['how do i log in', 'login help', 'cannot login', 'login nahi', 'sign in help'],
            'keywords' => ['login', 'log in', 'signin', 'sign in', 'password', 'account'],
            'text' => 'Use the Login screen with your registered email and password, and choose the correct Passenger or Driver role. If login fails, check the email, password, internet connection, and whether you are opening the correct role side.',
        ],
        'forgot_password' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'account_login',
            'type' => 'general',
            'phrases' => ['forgot password', 'reset password', 'password bhool', 'password bhool gaya', 'password change'],
            'keywords' => ['forgot', 'reset', 'password', 'bhool'],
            'text' => 'Use Forgot Password on the login screen, enter the registered email, then check inbox and spam for the Firebase reset email. The assistant cannot see or reset your password directly.',
        ],
        'profile_help' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'profile',
            'type' => 'general',
            'phrases' => ['update my profile', 'edit profile', 'change profile', 'profile update', 'phone update'],
            'keywords' => ['profile', 'edit', 'update', 'photo', 'phone', 'name'],
            'text' => 'Use the Profile or Driver Profile screen to update permitted details such as profile photo and allowed contact/profile fields. Verification-sensitive driver details can require admin review and should not be changed through chat.',
        ],
        'book_ride' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_booking',
            'type' => 'general',
            'phrases' => ['how do i book a ride', 'book a ride', 'request a ride', 'i need a ride', 'ride kaise book karun', 'mujhe ride book karni hai', 'find a driver'],
            'keywords' => ['book', 'booking', 'request', 'ride', 'pickup', 'destination', 'driver', 'chahiye'],
            'text' => "To book a ride as a passenger:\n1. Choose pickup and destination.\n2. Select vehicle type such as Car, Bike, or Scooty where available.\n3. Review fare or offer range.\n4. Choose payment method.\n5. Submit the ride request and wait for a valid driver response.",
        ],
        'pickup_destination' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_booking',
            'type' => 'general',
            'phrases' => ['pickup and destination', 'pickup dropoff', 'drop off location', 'destination location', 'pickup kaise set karun'],
            'keywords' => ['pickup', 'dropoff', 'drop', 'destination', 'location', 'map', 'gps'],
            'text' => 'The booking flow stores pickup and destination using saved address text plus coordinates. Select suggestions or map pins carefully because matching, fare, route, and tracking depend on those saved locations.',
        ],
        'scheduled_rides' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'scheduled_rides',
            'type' => 'general',
            'phrases' => ['scheduled ride', 'schedule a ride', 'book later', 'ride later', 'future ride'],
            'keywords' => ['scheduled', 'schedule', 'later', 'future', 'advance'],
            'text' => 'Scheduled rides are future ride requests. The passenger chooses a future date/time during booking, and the request stays scheduled until the existing matching/assignment flow handles it.',
        ],
        'carpool' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'carpool',
            'type' => 'general',
            'phrases' => ['what is carpool', 'car pool', 'shared ride', 'pool ride', 'carpool kaise hota hai'],
            'keywords' => ['carpool', 'pool', 'shared', 'seats', 'passengers'],
            'text' => 'Carpool is the shared-ride feature for car-based trips where compatible passengers can share route and seats. Use the carpool option only where the booking flow shows it.',
        ],
        'driver_requests' => [
            'roles' => ['driver', 'passenger'],
            'category' => 'ride_requests',
            'type' => 'general',
            'phrases' => ['driver ride requests', 'view ride requests', 'driver request nahi aa rahi', 'requests not showing', 'live requests'],
            'keywords' => ['requests', 'request', 'online', 'available', 'driver dashboard', 'matching'],
            'text' => 'Drivers see matching open requests when they are authenticated, approved, online, available, connected, and matched with the requested vehicle type. Old, assigned, cancelled, expired, or rejected requests should not remain actionable.',
        ],
        'passenger_offers' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'offers',
            'type' => 'general',
            'phrases' => ['passenger offer', 'driver offer', 'counter offer', 'send offer', 'accept offer'],
            'keywords' => ['offer', 'counteroffer', 'counter', 'accept', 'decline', 'fare range'],
            'text' => 'WOW supports passenger offers and driver counteroffers. A counteroffer is not a completed assignment until the required acceptance steps in the existing ride flow are completed by the correct side.',
        ],
        'driver_matching' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'driver_matching',
            'type' => 'general',
            'phrases' => ['how does driver matching work', 'find driver', 'driver matching', 'driver kaise milta hai', 'no driver found'],
            'keywords' => ['matching', 'find', 'driver', 'nearby', 'available', 'vehicle'],
            'text' => 'Driver matching uses the active ride request, requested vehicle type, driver approval/availability, and saved location data. The assistant cannot force a match or assign a driver from chat.',
        ],
        'driver_availability' => [
            'roles' => ['driver', 'passenger'],
            'category' => 'driver_availability',
            'type' => 'general',
            'phrases' => ['go online', 'become available', 'driver available', 'online offline', 'driver unavailable'],
            'keywords' => ['online', 'offline', 'available', 'availability', 'presence'],
            'text' => 'Drivers control online and availability status from the driver side. To receive requests, the driver should be approved, online, available, connected, and using the correct role account.',
        ],
        'ride_acceptance' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_acceptance',
            'type' => 'general',
            'phrases' => ['driver accepted', 'passenger accepted', 'ride acceptance', 'waiting for passenger response', 'both accept'],
            'keywords' => ['accepted', 'assigned', 'waiting', 'response', 'confirm'],
            'text' => 'A ride should be treated as assigned only when the existing acceptance flow confirms it. If a driver sends or accepts an offer that still needs passenger confirmation, the driver should wait for passenger response before the trip starts.',
        ],
        'ride_statuses' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_status',
            'type' => 'general',
            'phrases' => ['ride statuses', 'ride lifecycle', 'status meaning', 'started completed cancelled'],
            'keywords' => ['status', 'searching', 'scheduled', 'assigned', 'arrived', 'started', 'completed', 'cancelled'],
            'text' => 'WOW ride statuses include searching/scheduled, driver assigned or accepted, driver arriving/arrived, started/in progress, and completed/cancelled style states. The assistant reads these statuses but does not change them.',
        ],
        'cancel_ride' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_cancellation',
            'type' => 'general',
            'phrases' => ['cancel ride', 'ride cancel', 'cancel booking', 'ride cancel karni hai'],
            'keywords' => ['cancel', 'cancellation', 'cancelled', 'canceled'],
            'text' => 'Use the active ride/request screen to cancel where the app allows it and choose the correct reason. The chatbot cannot cancel a ride for you.',
        ],
        'live_tracking' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'live_tracking',
            'type' => 'general',
            'phrases' => ['live tracking', 'track ride', 'track driver', 'driver location', 'driver kahan hai', 'map route'],
            'keywords' => ['tracking', 'track', 'map', 'route', 'driver location', 'gps', 'live'],
            'text' => 'Live tracking is available on authorized active ride screens. Driver location is shared through the active ride tracking path, not as public driver profile data. If tracking is unavailable, check location permission, internet, and ride assignment.',
        ],
        'chat_call' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'communication',
            'type' => 'general',
            'phrases' => ['in ride chat', 'in ride call', 'call driver', 'call passenger', 'message driver'],
            'keywords' => ['chat', 'call', 'message', 'phone', 'communication'],
            'text' => 'Chat and in-app calling are available for authorized ride participants after a ride is assigned. The system should not expose personal phone numbers just to use chat or call.',
        ],
        'payments' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'payments',
            'type' => 'general',
            'phrases' => ['how do payments work', 'payment methods', 'cash payment', 'easypaisa', 'jazzcash', 'nayapay', 'card payment'],
            'keywords' => ['payment', 'cash', 'easypaisa', 'jazzcash', 'nayapay', 'card', 'paid'],
            'text' => 'WOW shows available payment methods in the ride/payment flow, including Cash and configured wallet/card-style options where enabled. Payment is confirmed only when the ride/payment record says it is paid or collected.',
        ],
        'driver_earnings' => [
            'roles' => ['driver', 'passenger'],
            'category' => 'driver_earnings',
            'type' => 'general',
            'phrases' => ['driver earnings', 'how earnings work', 'commission', 'driver share', 'wow commission'],
            'keywords' => ['earnings', 'earning', 'kamai', 'commission', '70%', '30%', 'income'],
            'text' => 'Driver earnings are calculated from valid completed/paid ride records. The current project uses driver share and WOW commission data in the finance flow; pending, cancelled, failed, duplicate, or test records should not be counted as confirmed earnings.',
        ],
        'ratings_reviews' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ratings_reviews',
            'type' => 'general',
            'phrases' => ['ratings', 'reviews', 'rate driver', 'review ride', 'feedback'],
            'keywords' => ['rating', 'ratings', 'review', 'reviews', 'feedback', 'stars'],
            'text' => 'Ratings and reviews are available after completed rides. Keep feedback factual and related to the trip, driver behavior, service quality, and safety.',
        ],
        'lost_found' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'lost_found',
            'type' => 'general',
            'phrases' => ['lost and found', 'lost item', 'found item', 'i lost something', 'saman gum gaya'],
            'keywords' => ['lost', 'found', 'item', 'saman', 'cheez', 'case'],
            'text' => 'Lost and Found cases are linked to completed rides. Passengers can report lost items, drivers can respond/report found items, and allowed case chat/call stays limited to the involved ride participants.',
        ],
        'sos_safety' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'safety',
            'type' => 'general',
            'phrases' => ['sos', 'safety', 'emergency', 'unsafe', 'danger', 'madad chahiye'],
            'keywords' => ['sos', 'safety', 'emergency', 'unsafe', 'danger', 'madad'],
            'text' => 'For immediate danger, use the SOS control on the active ride screen and contact local emergency services if needed. The assistant cannot trigger SOS by itself or claim help was contacted unless the system confirms it.',
        ],
        'notifications' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'notifications',
            'type' => 'general',
            'phrases' => ['notifications', 'alerts', 'notification nahi aa rahi', 'ride update'],
            'keywords' => ['notification', 'notifications', 'alert', 'alerts', 'updates'],
            'text' => 'Notifications reflect real ride, payment, safety, support, and Lost and Found events. If they are delayed, open the relevant ride screen for the authoritative current status.',
        ],
        'support_complaints' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'support',
            'type' => 'general',
            'phrases' => ['contact support', 'complaint', 'report issue', 'problem with ride', 'support chahiye'],
            'keywords' => ['support', 'complaint', 'issue', 'problem', 'report', 'help'],
            'text' => 'Use Contact Support or Report Issue from the relevant screen when available. Include the ride code, screen, short issue summary, and time. Do not share passwords, OTPs, wallet PINs, or private document numbers.',
        ],
        'privacy' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'privacy',
            'type' => 'security',
            'phrases' => ['privacy', 'security', 'show cnic', 'show licence', 'another user', 'other passenger ride', 'firebase token', 'password'],
            'keywords' => ['privacy', 'security', 'cnic', 'licence', 'token', 'password', 'secret', 'another', 'other user'],
            'text' => 'I cannot reveal passwords, Firebase tokens, API keys, CNIC/licence details, uploaded documents, another user profile, another user ride, or private location data outside an authorized active ride feature.',
        ],
        'current_ride_status' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'ride_status',
            'type' => 'personal',
            'phrases' => ['my current ride status', 'what is my ride status', 'meri ride status', 'do i have an active ride', 'meri request kahan hai'],
            'keywords' => ['my ride', 'current ride', 'ride status', 'active ride', 'meri request', 'status kya'],
            'text' => 'I can check your own current ride status when you are signed in.',
        ],
        'driver_accepted_status' => [
            'roles' => ['passenger'],
            'category' => 'ride_acceptance',
            'type' => 'personal',
            'phrases' => ['has my driver accepted', 'driver accepted my request', 'driver assigned to me', 'driver ne accept kiya'],
            'keywords' => ['my driver', 'accepted', 'assigned', 'accept kiya'],
            'text' => 'I can check whether your own active ride has an assigned/accepted driver.',
        ],
        'driver_arrived_status' => [
            'roles' => ['passenger'],
            'category' => 'ride_status',
            'type' => 'personal',
            'phrases' => ['has my driver arrived', 'driver arrived', 'driver aa gaya', 'driver aya'],
            'keywords' => ['driver arrived', 'arrived', 'aa gaya', 'aya'],
            'text' => 'I can check whether your own ride status says the driver has arrived.',
        ],
        'scheduled_ride_status' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'scheduled_rides',
            'type' => 'personal',
            'phrases' => ['my scheduled ride', 'do i have a scheduled ride', 'meri scheduled ride', 'next scheduled ride'],
            'keywords' => ['my scheduled', 'next scheduled', 'next ride', 'meri scheduled'],
            'text' => 'I can check your own next scheduled ride if one exists.',
        ],
        'verification_status' => [
            'roles' => ['driver'],
            'category' => 'verification',
            'type' => 'personal',
            'phrases' => ['is my driver account approved', 'my verification status', 'am i approved', 'meri verification status', 'account approved hai'],
            'keywords' => ['my verification', 'am i approved', 'account approved', 'approved hai', 'verification status'],
            'text' => 'I can check the verification status saved on your own driver profile.',
        ],
        'payment_status' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'payments',
            'type' => 'personal',
            'phrases' => ['my payment status', 'is my payment done', 'payment hogayi', 'payment pending', 'current payment'],
            'keywords' => ['my payment', 'payment status', 'payment pending', 'paid', 'hogayi'],
            'text' => 'I can check the payment status for your own current ride when available.',
        ],
        'driver_earnings_status' => [
            'roles' => ['driver'],
            'category' => 'driver_earnings',
            'type' => 'personal',
            'phrases' => ['my earnings', 'what are my earnings', 'aaj ki earning', 'meri earning', 'my income'],
            'keywords' => ['my earnings', 'meri earning', 'aaj ki earning', 'my income', 'kamai'],
            'text' => 'I can check your own driver earnings summary from targeted driver finance records.',
        ],
        'notifications_status' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'notifications',
            'type' => 'personal',
            'phrases' => ['do i have notifications', 'my notifications', 'any alerts for me', 'meri notifications'],
            'keywords' => ['my notifications', 'notifications for me', 'alerts for me'],
            'text' => 'I can check a few recent notifications for your own account.',
        ],
        'lost_found_status' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'lost_found',
            'type' => 'personal',
            'phrases' => ['my lost and found case', 'lost item status', 'found item status', 'meri lost item case'],
            'keywords' => ['my lost', 'lost status', 'found status', 'case status'],
            'text' => 'I can check the latest Lost and Found case linked to your own account.',
        ],
        'greeting' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'general_help',
            'type' => 'general',
            'phrases' => ['hi', 'hello', 'hey', 'salam', 'assalam'],
            'keywords' => ['hi', 'hello', 'hey', 'salam', 'assalam'],
            'text' => 'Hello! I am the Women on Wheels assistant. You can ask about WOW, booking, driver registration, tracking, payments, safety, Lost and Found, or account help.',
        ],
        'thanks' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'general_help',
            'type' => 'general',
            'phrases' => ['thanks', 'thank you', 'shukriya'],
            'keywords' => ['thanks', 'thank', 'shukriya'],
            'text' => 'You are welcome. I am here whenever you need WOW help.',
        ],
        'unknown' => [
            'roles' => ['passenger', 'driver'],
            'category' => 'unknown',
            'type' => 'general',
            'phrases' => [],
            'keywords' => [],
            'text' => "I do not have confirmed information about that WOW feature yet. You can ask about rides, driver registration, payments, safety, tracking, Lost and Found, ratings, notifications, or account help.",
        ],
    ];
}

function wow_assistant_score_entry(string $normalized, array $tokens, array $entry): int
{
    $score = 0;
    foreach ((array)($entry['phrases'] ?? []) as $phrase) {
        $phrase = wow_assistant_normalize((string)$phrase);
        if ($phrase === '') continue;
        $shortSingle = !str_contains($phrase, ' ') && strlen($phrase) <= 3;
        if ($shortSingle) {
            if (in_array($phrase, $tokens, true)) $score += 16;
            continue;
        }
        if ($normalized === $phrase) $score += 16;
        elseif (str_contains($normalized, $phrase)) $score += str_contains($phrase, ' ') ? 12 : 5;
        else {
            $phraseTokens = wow_assistant_tokens($phrase);
            if ($phraseTokens && count(array_intersect($tokens, $phraseTokens)) === count($phraseTokens)) $score += 6;
        }
    }
    foreach ((array)($entry['keywords'] ?? []) as $keyword) {
        $keyword = wow_assistant_normalize((string)$keyword);
        if ($keyword === '') continue;
        if (!str_contains($keyword, ' ') && strlen($keyword) <= 3) {
            if (in_array($keyword, $tokens, true)) $score += 3;
            continue;
        }
        if (str_contains($normalized, $keyword)) {
            $score += str_contains($keyword, ' ') ? 7 : 3;
            continue;
        }
        foreach ($tokens as $token) {
            if (wow_assistant_close_word($token, $keyword)) {
                $score += 1;
                break;
            }
        }
    }
    return $score;
}

function wow_assistant_previous_topic(array $history, string $role): string
{
    for ($index = count($history) - 1; $index >= 0; $index--) {
        if (($history[$index]['role'] ?? '') !== 'user') continue;
        $previous = trim((string)($history[$index]['content'] ?? ''));
        if ($previous === '') continue;
        $analysis = wow_assistant_analyze($previous, $role, [], false);
        return (string)($analysis['intent'] ?? '');
    }
    return '';
}

function wow_assistant_followup_boost(string $intent, string $previousIntent, string $normalized): int
{
    if ($previousIntent === '') return 0;
    $short = str_word_count($normalized) <= 6;
    $mentionsDocs = preg_match('/\b(document|documents|cnic|licence|license)\b/', $normalized) === 1;
    $mentionsCancel = preg_match('/\b(cancel|cancelled|canceled|it|isko|usko)\b/', $normalized) === 1;
    $mentionsPayment = preg_match('/\b(payment|paid|cash|status)\b/', $normalized) === 1;
    if ($mentionsDocs && in_array($previousIntent, ['driver_registration', 'driver_documents', 'driver_verification_general'], true) && $intent === 'driver_documents') return 12;
    if ($mentionsCancel && in_array($previousIntent, ['book_ride', 'current_ride_status', 'scheduled_rides'], true) && $intent === 'cancel_ride') return 8;
    if ($mentionsPayment && in_array($previousIntent, ['book_ride', 'payments', 'current_ride_status'], true) && $intent === 'payment_status') return 8;
    if ($short && $intent === $previousIntent) return 5;
    return 0;
}

function wow_assistant_analyze(string $message, string $role, array $history = [], bool $useHistory = true): array
{
    $role = strtolower(trim($role)) === 'driver' ? 'driver' : 'passenger';
    $normalized = wow_assistant_normalize($message);
    $tokens = wow_assistant_tokens($normalized);
    $previousIntent = $useHistory ? wow_assistant_previous_topic($history, $role) : '';
    $scored = [];
    foreach (wow_assistant_knowledge() as $id => $entry) {
        if ($id === 'unknown') continue;
        if (!in_array($role, (array)($entry['roles'] ?? []), true)) continue;
        $score = wow_assistant_score_entry($normalized, $tokens, $entry);
        $score += wow_assistant_followup_boost($id, $previousIntent, $normalized);
        if ($score > 0) {
            $scored[] = [
                'id' => $id,
                'score' => $score,
                'category' => (string)($entry['category'] ?? 'general_help'),
                'type' => (string)($entry['type'] ?? 'general'),
                'text' => (string)($entry['text'] ?? ''),
                'source' => 'static',
            ];
        }
    }
    usort($scored, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);
    $top = $scored[0] ?? [
        'id' => 'unknown',
        'score' => 0,
        'category' => 'unknown',
        'type' => 'general',
        'text' => wow_assistant_knowledge()['unknown']['text'],
        'source' => 'static',
    ];
    return [
        'intent' => (string)$top['id'],
        'category' => (string)$top['category'],
        'confidence' => (int)$top['score'],
        'requiresContext' => ($top['type'] ?? 'general') === 'personal',
        'type' => (string)($top['type'] ?? 'general'),
        'language' => wow_assistant_roman_urdu($message) ? 'roman_urdu' : 'english',
        'previousIntent' => $previousIntent,
        'matches' => array_slice($scored, 0, 5),
    ];
}

function wow_assistant_kb_cache_file(): string
{
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'wow_assistant_admin_kb_v2.json';
}

function wow_assistant_admin_knowledge(): array
{
    static $memory = null;
    if (is_array($memory)) return $memory;
    if (!function_exists('wow_list_collection')) return $memory = [];
    $cacheFile = wow_assistant_kb_cache_file();
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) <= 60) {
        $cached = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached)) return $memory = $cached;
    }
    $items = [];
    try {
        foreach (wow_list_collection('chatbotKnowledgeBase', 500) as $item) {
            $status = strtolower(trim((string)($item['status'] ?? (($item['isActive'] ?? false) ? 'active' : 'draft'))));
            if ($status !== 'active' || ($item['isActive'] ?? true) === false) continue;
            $items[] = [
                'id' => (string)($item['uid'] ?? $item['intent'] ?? 'custom'),
                'intent' => (string)($item['intent'] ?? 'custom'),
                'category' => (string)($item['category'] ?? 'general_help'),
                'answer' => trim((string)($item['answer'] ?? $item['answerEnglish'] ?? '')),
                'phrases' => array_values(array_filter(array_map('strval', array_merge(
                    (array)($item['phrases'] ?? []),
                    (array)($item['keywords'] ?? []),
                    (array)($item['alternativeQuestions'] ?? []),
                    [(string)($item['intent'] ?? '')]
                )))),
                'allowedRoles' => array_values(array_filter(array_map(static fn($v): string => strtolower(trim((string)$v)), (array)($item['allowedRoles'] ?? [$item['userRole'] ?? 'all'])))),
                'userRole' => strtolower(trim((string)($item['userRole'] ?? 'all'))),
                'priority' => max(0, min(100, (int)($item['priority'] ?? 50))),
            ];
        }
        @file_put_contents($cacheFile, json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    } catch (Throwable $error) {
        error_log('WOW Assistant knowledge collection unavailable: ' . $error->getMessage());
    }
    return $memory = $items;
}

function wow_assistant_retrieve_knowledge(string $message, string $role, int $limit = 4, ?array $analysis = null): array
{
    $analysis ??= wow_assistant_analyze($message, $role);
    $normalized = wow_assistant_normalize($message);
    $tokens = wow_assistant_tokens($normalized);
    $scored = [];

    foreach ((array)($analysis['matches'] ?? []) as $match) {
        if (($match['id'] ?? '') === 'unknown') continue;
        $scored[] = [
            'id' => (string)$match['id'],
            'score' => (int)$match['score'],
            'category' => (string)($match['category'] ?? 'general_help'),
            'text' => (string)($match['text'] ?? ''),
            'source' => 'static',
        ];
    }

    foreach (wow_assistant_admin_knowledge() as $item) {
        $allowed = (array)($item['allowedRoles'] ?? []);
        $userRole = (string)($item['userRole'] ?? 'all');
        if ($allowed && !in_array('all', $allowed, true) && !in_array($role, $allowed, true)) continue;
        if (!$allowed && $userRole !== 'all' && $userRole !== $role) continue;
        $score = 0;
        foreach ((array)($item['phrases'] ?? []) as $phrase) {
            $phrase = wow_assistant_normalize((string)$phrase);
            if ($phrase === '') continue;
            $shortSingle = !str_contains($phrase, ' ') && strlen($phrase) <= 3;
            if ($shortSingle) {
                if (in_array($phrase, $tokens, true)) $score += 18;
                continue;
            }
            if ($normalized === $phrase) $score += 18;
            elseif (str_contains($normalized, $phrase)) $score += str_contains($phrase, ' ') ? 12 : 4;
            else {
                $phraseTokens = wow_assistant_tokens($phrase);
                if ($phraseTokens && count(array_intersect($tokens, $phraseTokens)) === count($phraseTokens)) $score += 5;
            }
        }
        $answer = trim((string)($item['answer'] ?? ''));
        if ($score > 0 && $answer !== '') {
            $scored[] = [
                'id' => (string)($item['intent'] ?? $item['id'] ?? 'custom'),
                'score' => $score + (int)(($item['priority'] ?? 50) / 20),
                'category' => (string)($item['category'] ?? 'general_help'),
                'text' => $answer,
                'source' => 'admin',
            ];
        }
    }

    usort($scored, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);
    if (!$scored) {
        $entry = wow_assistant_knowledge()['unknown'];
        $scored[] = ['id' => 'unknown', 'score' => 1, 'category' => 'unknown', 'text' => $entry['text'], 'source' => 'static'];
    }
    return array_slice($scored, 0, max(1, $limit));
}
