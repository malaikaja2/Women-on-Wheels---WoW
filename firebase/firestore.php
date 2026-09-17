<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/config.php';

use Google\Auth\Credentials\ServiceAccountCredentials;
use Google\Cloud\Core\Timestamp;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use Psr\Http\Message\ResponseInterface;

function wow_firebase_service_account_credentials(): array|string
{
    $keyPath = getenv('GOOGLE_APPLICATION_CREDENTIALS') ?: '';
    if ($keyPath !== '' && is_file($keyPath)) {
        return $keyPath;
    }

    $localFallback = 'C:\\firebase-keys\\women-on-wheels-f8970-service-account.json';
    if (is_file($localFallback)) {
        return $localFallback;
    }

    $runtimeConfigPath = __DIR__ . '/firebase_runtime_config.php';
    if (!is_file($runtimeConfigPath)) {
        throw new RuntimeException('Firebase service-account credentials are not configured.');
    }

    $runtimeConfig = require $runtimeConfigPath;
    $serviceAccount = is_array($runtimeConfig) ? ($runtimeConfig['service_account'] ?? null) : null;
    if (!is_array($serviceAccount)
        || empty($serviceAccount['project_id'])
        || empty($serviceAccount['client_email'])
        || empty($serviceAccount['private_key'])
        || empty($serviceAccount['token_uri'])) {
        throw new RuntimeException('Firebase runtime credentials are invalid.');
    }

    return $serviceAccount;
}

function wow_firebase_service_account_data(): array
{
    $credentials = wow_firebase_service_account_credentials();
    if (is_array($credentials)) {
        return $credentials;
    }

    $serviceAccount = json_decode((string)file_get_contents($credentials), true);
    if (!is_array($serviceAccount)
        || empty($serviceAccount['client_email'])
        || empty($serviceAccount['private_key'])) {
        throw new RuntimeException('Firebase service-account credentials are invalid.');
    }

    return $serviceAccount;
}

final class WowFirestoreRestClient
{
    private Client $http;
    private string $projectId;
    private string $baseUrl;
    private string $databaseId;
    private ?array $token = null;

    public function __construct(string $projectId, string $databaseId = '(default)')
    {
        $this->projectId = $projectId;
        $this->databaseId = $databaseId;
        $this->baseUrl = $this->documentsBaseUrl($databaseId);
        $this->http = new Client(['timeout' => 20]);
    }

    public function collection(string $path): WowFirestoreCollection
    {
        return new WowFirestoreCollection($this, trim($path, '/'));
    }

    public function getDocument(string $path): ?array
    {
        try {
            $response = $this->requestWithDatabaseFallback('GET', $this->baseUrl . '/' . $this->encodePath($path), [
                'headers' => $this->headers(),
            ]);
        } catch (ClientException $exception) {
            if ($exception->getResponse() && $exception->getResponse()->getStatusCode() === 404) {
                return null;
            }
            throw $exception;
        }

        return json_decode((string)$response->getBody(), true) ?: null;
    }

    public function listDocuments(string $collectionPath, int $limit = 1000): array
    {
        $response = $this->requestWithDatabaseFallback('GET', $this->baseUrl . '/' . $this->encodePath($collectionPath), [
            'headers' => $this->headers(),
            'query' => ['pageSize' => $limit],
        ]);

        $payload = json_decode((string)$response->getBody(), true) ?: [];
        return $payload['documents'] ?? [];
    }

    public function queryDocuments(string $collectionPath, array $filters, int $limit = 1000, array $orders = []): array
    {
        $parts = explode('/', trim($collectionPath, '/'));
        $collectionId = array_pop($parts);
        $parentPath = implode('/', $parts);
        $url = $this->baseUrl . ($parentPath !== '' ? '/' . $this->encodePath($parentPath) : '') . ':runQuery';

        $structuredQuery = [
            'from' => [['collectionId' => $collectionId]],
            'limit' => $limit,
        ];

        if ($filters) {
            $clauses = [];
            foreach ($filters as $filter) {
                $clauses[] = [
                    'fieldFilter' => [
                        'field' => ['fieldPath' => $filter['field']],
                        'op' => 'EQUAL',
                        'value' => $this->encodeValue($filter['value']),
                    ],
                ];
            }
            $structuredQuery['where'] = count($clauses) === 1
                ? $clauses[0]
                : ['compositeFilter' => ['op' => 'AND', 'filters' => $clauses]];
        }
        if ($orders) {
            $structuredQuery['orderBy'] = array_map(static fn(array $order): array => [
                'field' => ['fieldPath' => $order['field']],
                'direction' => strtoupper((string)($order['direction'] ?? 'ASC')) === 'DESC' ? 'DESCENDING' : 'ASCENDING',
            ], $orders);
        }

        $response = $this->requestWithDatabaseFallback('POST', $url, [
            'headers' => $this->headers(),
            'json' => ['structuredQuery' => $structuredQuery],
        ]);

        $payload = json_decode((string)$response->getBody(), true) ?: [];
        $documents = [];
        foreach ($payload as $row) {
            if (isset($row['document'])) {
                $documents[] = $row['document'];
            }
        }
        return $documents;
    }

    public function setDocument(string $path, array $data, bool $merge = true): void
    {
        $query = '';
        if ($merge) {
            $parts = [];
            foreach (array_keys($data) as $field) {
                $parts[] = 'updateMask.fieldPaths=' . rawurlencode((string)$field);
            }
            $query = implode('&', $parts);
        }

        $url = $this->baseUrl . '/' . $this->encodePath($path) . ($query !== '' ? '?' . $query : '');
        $this->requestWithDatabaseFallback('PATCH', $url, [
            'headers' => $this->headers(),
            'json' => ['fields' => $this->encodeFields($data)],
        ]);
    }

    public function createDocument(string $collectionPath, string $id, array $data): void
    {
        $this->requestWithDatabaseFallback('POST', $this->baseUrl . '/' . $this->encodePath($collectionPath), [
            'headers' => $this->headers(),
            'query' => ['documentId' => $id],
            'json' => ['fields' => $this->encodeFields($data)],
        ]);
    }

    /** Write many independent documents in one Firestore HTTP request. */
    public function batchSetDocuments(array $writes): void
    {
        if (!$writes) return;
        foreach (array_chunk($writes, 200) as $chunk) {
            $payload = [];
            foreach ($chunk as $write) {
                $path = trim((string)($write['path'] ?? ''), '/');
                if ($path === '') continue;
                $item = ['update' => [
                    'name' => $this->documentResourceName($path),
                    'fields' => $this->encodeFields((array)($write['data'] ?? [])),
                ]];
                if (($write['merge'] ?? true) === true) {
                    $item['updateMask'] = ['fieldPaths' => array_values(array_map('strval', array_keys((array)($write['data'] ?? []))))];
                }
                $payload[] = $item;
            }
            if (!$payload) continue;
            $this->requestWithDatabaseFallback('POST', $this->baseUrl . ':batchWrite', [
                'headers' => $this->headers(),
                'json' => ['writes' => $payload],
            ]);
        }
    }

    public function deleteDocument(string $path): void
    {
        try {
            $this->requestWithDatabaseFallback('DELETE', $this->baseUrl . '/' . $this->encodePath($path), [
                'headers' => $this->headers(),
            ]);
        } catch (ClientException $exception) {
            if (!$exception->getResponse() || $exception->getResponse()->getStatusCode() !== 404) {
                throw $exception;
            }
        }
    }

    public function decodeDocument(array $document): array
    {
        return $this->decodeFields($document['fields'] ?? []);
    }

    public function documentId(array $document): string
    {
        $name = (string)($document['name'] ?? '');
        return basename($name);
    }

    private function headers(): array
    {
        return [
            'Authorization' => 'Bearer ' . $this->accessToken(),
            'Content-Type' => 'application/json',
        ];
    }

    private function documentsBaseUrl(string $databaseId): string
    {
        return 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($this->projectId) . '/databases/' . rawurlencode($databaseId) . '/documents';
    }

    private function requestWithDatabaseFallback(string $method, string $url, array $options): ResponseInterface
    {
        try {
            return $this->http->request($method, $url, $options);
        } catch (ClientException $exception) {
            if (!$this->shouldFallbackToDefaultDatabase($exception)) {
                throw $exception;
            }

            $oldBaseUrl = $this->baseUrl;
            $this->databaseId = '(default)';
            $this->baseUrl = $this->documentsBaseUrl($this->databaseId);
            $fallbackUrl = str_starts_with($url, $oldBaseUrl)
                ? $this->baseUrl . substr($url, strlen($oldBaseUrl))
                : $url;

            return $this->http->request($method, $fallbackUrl, $options);
        }
    }

    private function shouldFallbackToDefaultDatabase(ClientException $exception): bool
    {
        if ($this->databaseId === '(default)' || !$exception->getResponse() || $exception->getResponse()->getStatusCode() !== 404) {
            return false;
        }

        $body = (string)$exception->getResponse()->getBody();
        return stripos($body, 'database') !== false && stripos($body, 'does not exist') !== false;
    }

    private function accessToken(): string
    {
        if ($this->token && (int)($this->token['expires_at'] ?? 0) > time() + 60) {
            return (string)$this->token['access_token'];
        }

        $credentials = new ServiceAccountCredentials(
            ['https://www.googleapis.com/auth/datastore'],
            wow_firebase_service_account_credentials()
        );
        $token = $credentials->fetchAuthToken();
        if (empty($token['access_token'])) {
            throw new RuntimeException('Unable to fetch Firebase service account token.');
        }
        $token['expires_at'] = time() + (int)($token['expires_in'] ?? 3600);
        $this->token = $token;
        return (string)$token['access_token'];
    }

    private function encodePath(string $path): string
    {
        return implode('/', array_map('rawurlencode', explode('/', trim($path, '/'))));
    }

    private function documentResourceName(string $path): string
    {
        return 'projects/' . $this->projectId . '/databases/' . $this->databaseId . '/documents/' . trim($path, '/');
    }

    private function encodeFields(array $data): array
    {
        $fields = [];
        foreach ($data as $key => $value) {
            $fields[$key] = $this->encodeValue($value);
        }
        return $fields;
    }

    private function encodeValue($value): array
    {
        if ($value === null) return ['nullValue' => null];
        if (is_bool($value)) return ['booleanValue' => $value];
        if (is_int($value)) return ['integerValue' => (string)$value];
        if (is_float($value)) return ['doubleValue' => $value];
        if ($value instanceof Timestamp) {
            return ['timestampValue' => $value->get()->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z')];
        }
        if ($value instanceof DateTimeInterface) {
            return ['timestampValue' => (new DateTimeImmutable($value->format(DATE_ATOM)))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z')];
        }
        if (is_array($value)) {
            if (array_is_list($value)) {
                return ['arrayValue' => ['values' => array_map(fn($item) => $this->encodeValue($item), $value)]];
            }
            return ['mapValue' => ['fields' => $this->encodeFields($value)]];
        }
        return ['stringValue' => (string)$value];
    }

    private function decodeFields(array $fields): array
    {
        $data = [];
        foreach ($fields as $key => $value) {
            $data[$key] = $this->decodeValue($value);
        }
        return $data;
    }

    private function decodeValue(array $value)
    {
        if (array_key_exists('nullValue', $value)) return null;
        if (array_key_exists('booleanValue', $value)) return (bool)$value['booleanValue'];
        if (array_key_exists('integerValue', $value)) return (int)$value['integerValue'];
        if (array_key_exists('doubleValue', $value)) return (float)$value['doubleValue'];
        if (array_key_exists('stringValue', $value)) return (string)$value['stringValue'];
        if (array_key_exists('timestampValue', $value)) return new Timestamp(new DateTimeImmutable((string)$value['timestampValue']));
        if (array_key_exists('arrayValue', $value)) {
            return array_map(fn($item) => $this->decodeValue($item), $value['arrayValue']['values'] ?? []);
        }
        if (array_key_exists('mapValue', $value)) return $this->decodeFields($value['mapValue']['fields'] ?? []);
        return null;
    }
}

final class WowFirestoreCollection
{
    private array $filters = [];
    private array $orders = [];
    private int $limit = 1000;

    public function __construct(private WowFirestoreRestClient $client, private string $path)
    {
    }

    public function document(string $id): WowFirestoreDocumentReference
    {
        return new WowFirestoreDocumentReference($this->client, $this->path . '/' . $id, $id);
    }

    public function newDocument(): WowFirestoreDocumentReference
    {
        $id = bin2hex(random_bytes(10));
        return $this->document($id);
    }

    public function add(array $data): WowFirestoreDocumentReference
    {
        $document = $this->newDocument();
        $document->set($data, ['merge' => false]);
        return $document;
    }

    public function where(string $field, string $operator, $value): self
    {
        $clone = clone $this;
        $clone->filters[] = ['field' => $field, 'value' => $value];
        return $clone;
    }

    public function limit(int $limit): self
    {
        $clone = clone $this;
        $clone->limit = max(1, $limit);
        return $clone;
    }

    public function orderBy(string $field, string $direction = 'ASC'): self
    {
        $clone = clone $this;
        $clone->orders[] = ['field' => $field, 'direction' => $direction];
        return $clone;
    }

    public function documents(): array
    {
        $documents = ($this->filters || $this->orders)
            ? $this->client->queryDocuments($this->path, $this->filters, $this->limit, $this->orders)
            : $this->client->listDocuments($this->path, $this->limit);

        return array_map(fn(array $document) => new WowFirestoreDocumentSnapshot($this->client, $document), $documents);
    }
}

final class WowFirestoreDocumentReference
{
    public function __construct(private WowFirestoreRestClient $client, private string $path, private string $id)
    {
    }

    public function id(): string
    {
        return $this->id;
    }

    public function snapshot(): WowFirestoreDocumentSnapshot
    {
        $document = $this->client->getDocument($this->path);
        return new WowFirestoreDocumentSnapshot($this->client, $document, $this->id);
    }

    public function set(array $data, array $options = []): void
    {
        $this->client->setDocument($this->path, $data, (bool)($options['merge'] ?? true));
    }

    public function delete(): void
    {
        $this->client->deleteDocument($this->path);
    }

    public function collection(string $collection): WowFirestoreCollection
    {
        return new WowFirestoreCollection($this->client, $this->path . '/' . trim($collection, '/'));
    }
}

final class WowFirestoreDocumentSnapshot
{
    public function __construct(private WowFirestoreRestClient $client, private ?array $document, private ?string $fallbackId = null)
    {
    }

    public function exists(): bool
    {
        return is_array($this->document);
    }

    public function data(): array
    {
        return $this->document ? $this->client->decodeDocument($this->document) : [];
    }

    public function id(): string
    {
        return $this->document ? $this->client->documentId($this->document) : (string)$this->fallbackId;
    }
}

function wow_firestore(): WowFirestoreRestClient
{
    static $db = null;

    if ($db instanceof WowFirestoreRestClient) {
        return $db;
    }

    $projectId = getenv('FIREBASE_PROJECT_ID') ?: WOW_FIREBASE_PROJECT_ID;
    if ($projectId === '' || $projectId === 'YOUR_FIREBASE_PROJECT_ID') {
        throw new RuntimeException('Firebase project id is not configured.');
    }

    $databaseId = getenv('FIRESTORE_DATABASE_ID') ?: WOW_FIRESTORE_DATABASE_ID;
    if ($databaseId === '') {
        $databaseId = '(default)';
    }

    $db = new WowFirestoreRestClient($projectId, $databaseId);
    return $db;
}

function wow_now(): Timestamp
{
    return new Timestamp(new DateTimeImmutable('now'));
}

function wow_doc_data(string $collection, string $id): ?array
{
    $snapshot = wow_firestore()->collection($collection)->document($id)->snapshot();
    if (!$snapshot->exists()) {
        return null;
    }

    $data = $snapshot->data();
    $data['uid'] = $snapshot->id();
    return $data;
}

function wow_find_one_by_email(string $collection, string $email): ?array
{
    $documents = wow_firestore()
        ->collection($collection)
        ->where('email', '=', strtolower(trim($email)))
        ->limit(1)
        ->documents();

    foreach ($documents as $document) {
        if ($document->exists()) {
            $data = $document->data();
            $data['uid'] = $document->id();
            return $data;
        }
    }

    return null;
}

function wow_set_doc(string $collection, string $id, array $data, bool $merge = true): void
{
    $data['updatedAt'] = wow_now();
    if (!$merge) {
        $data['createdAt'] = $data['createdAt'] ?? wow_now();
    }

    wow_firestore()->collection($collection)->document($id)->set($data, ['merge' => $merge]);
}

function wow_delete_doc(string $collection, string $id): void
{
    wow_firestore()->collection($collection)->document($id)->delete();
}

function wow_timestamp_to_string($value): string
{
    if ($value instanceof Timestamp) {
        // Keep the timezone offset in API responses. A timezone-less Firestore
        // value is interpreted as local time by JavaScript and makes every
        // admin "time ago" label drift by the server/browser offset.
        return $value->get()->format(DATE_ATOM);
    }
    if ($value instanceof DateTimeInterface) {
        return $value->format(DATE_ATOM);
    }
    return is_scalar($value) ? (string)$value : '';
}
