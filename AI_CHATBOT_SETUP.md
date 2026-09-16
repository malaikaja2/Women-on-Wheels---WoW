# Women on Wheels AI Assistant configuration

The passenger and driver website and Flutter app share:

- `php/wow_assistant_api.php`
- `php/wow_assistant_knowledge.php`

The clients send the current Firebase ID token. The PHP endpoint verifies it
with Firebase Authentication, resolves the passenger or driver profile on the
server, retrieves only an authorized minimal context, and then calls the
configured AI provider.

## Server environment

Configure these values on the PHP host (never in JavaScript, Flutter, Firestore,
or source control):

```text
WOW_AI_API_KEY=provider-secret
WOW_AI_API_URL=https://api.openai.com/v1/chat/completions
WOW_AI_MODEL=gpt-4.1-mini
```

`WOW_AI_API_URL` and `WOW_AI_MODEL` are optional. If no key is configured, the
endpoint returns a verified retrieval-based fallback and never invents live
ride, payment, earnings, or Lost & Found statuses.

For deployed Flutter builds, provide the public HTTPS PHP base URL:

```text
flutter build apk --dart-define=WOW_API_BASE_URL=https://your-host.example/php
```

Do not use the localhost default in a production mobile build.

## Security expectations

- Production traffic must use HTTPS.
- The endpoint rejects missing, expired, and unauthorized Firebase tokens.
- Admin profiles are intentionally unsupported by this endpoint.
- AI provider keys must be available only to the PHP server process.
- Keep server logs free of tokens, phone numbers, CNIC data, and payment secrets.
