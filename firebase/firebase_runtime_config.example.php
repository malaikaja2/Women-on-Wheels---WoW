<?php
declare(strict_types=1);

// Copy this file to firebase/firebase_runtime_config.php on the production server.
// Do not commit the production file or expose these values in browser code.
return [
    'service_account' => [
        'type' => 'service_account',
        'project_id' => 'YOUR_FIREBASE_PROJECT_ID',
        'private_key_id' => 'YOUR_PRIVATE_KEY_ID',
        'private_key' => "YOUR_PRIVATE_KEY_WITH_\\n_LINE_BREAKS",
        'client_email' => 'YOUR_SERVICE_ACCOUNT_EMAIL',
        'client_id' => 'YOUR_CLIENT_ID',
        'auth_uri' => 'https://accounts.google.com/o/oauth2/auth',
        'token_uri' => 'https://oauth2.googleapis.com/token',
        'auth_provider_x509_cert_url' => 'https://www.googleapis.com/oauth2/v1/certs',
        'client_x509_cert_url' => 'YOUR_CLIENT_X509_CERT_URL',
        'universe_domain' => 'googleapis.com',
    ],
];
