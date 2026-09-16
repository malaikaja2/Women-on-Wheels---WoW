# Women On Wheels Firebase Setup

This project no longer opens a MySQL connection from runtime PHP. Runtime data is stored in Firebase Authentication and Cloud Firestore.

## Firestore Collections

- `admins/{uid}`
- `passengers/{uid}`
- `drivers/{uid}`
- `rides/{rideId}`
- `rideReviews/{rideId}`
- `sosAlerts/{alertId}`
- `fareTrainingData/{id}`
- `wowAssistantInteractions/{id}`
- `adminLoginAudit/{id}`

Firebase Authentication UID is used as the document ID for `admins`, `passengers`, and `drivers`. Passwords are stored only by Firebase Authentication.

## Web PHP Setup

1. Enable Firebase Authentication and the Email/Password provider.
2. Enable Cloud Firestore.
3. Confirm `firebase/config.php` contains the Firebase project ID and Web API key. You can override these with environment variables:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_WEB_API_KEY`
4. Generate a service account JSON key in Project Settings > Service Accounts.
5. Store the service account JSON outside the web root.
6. Set:
   - `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json`
7. Install Composer, then run from this folder:
   - `composer install`
8. Publish the Firestore rules:
   - `firebase deploy --only firestore:rules`

Composer dependencies are installed in this workspace. The PHP website uses Firestore over the official REST API through `firebase/firestore.php`, so it does not require the PHP gRPC extension at runtime.

The service-account key used by PHP was created outside the web root:

- `C:\firebase-keys\women-on-wheels-f8970-service-account.json`

The user environment variable is set to:

- `GOOGLE_APPLICATION_CREDENTIALS=C:\firebase-keys\women-on-wheels-f8970-service-account.json`

Restart Apache after changing environment variables so PHP receives the updated value.

## Mobile Flutter Setup

The Flutter project is at:

- `C:\Users\HP\women_on_wheels_app`

It already contains `lib/firebase_options.dart` for the same Firebase project. The app now:

- Initializes Firebase before `runApp`.
- Uses Firebase Authentication for Passenger, Driver, and Admin login.
- Writes Passenger and Driver signup profiles to Firestore.
- Saves driver CNIC filename metadata in Firestore. The PHP website stores actual CNIC uploads locally in `php/uploads` to stay on the free Firebase plan.
- Routes users to role-specific dashboards.
- Streams role rides from Firestore so website/mobile ride updates sync in real time.

Run:

- `flutter pub get`
- `flutter analyze`
- `flutter test`
- `flutter run -d chrome` or `flutter run -d <device-id>`

## Admin Accounts

Admin users must exist in Firebase Authentication and have a matching Firestore document:

Collection: `admins/{uid}`

Required fields:

- `email`
- `fullName`
- `role`: `admin` or `super_admin`
- `isActive`: `true`

You can create the Auth account in Firebase Console, then create the Firestore document using the Auth UID.

## Runtime Notes

- `php/db.php` and `admin/db.php` now bootstrap Firebase instead of MySQL.
- Old `.sql` files are kept only as migration references and are not used by runtime PHP.
- XAMPP Apache can still serve the PHP app, but XAMPP MySQL is no longer required.
- Driver CNIC uploads from the PHP website are stored locally under `php/uploads/...`; the path is saved in Firestore on the driver profile.
- Firestore rules are deployed.
- Firebase Storage is intentionally not used because this Firebase project requires billing to create a new Storage bucket. Auth and Firestore remain on the free Firebase plan.
