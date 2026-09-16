<?php
declare(strict_types=1);

require_once __DIR__ . '/../firebase/repositories.php';
require_once __DIR__ . '/integration_utils.php';

function admin_db_connection()
{
    return wow_firestore();
}

/**
 * A tiny cross-request cache for read-heavy admin screens.
 *
 * Admin reports used to download the same 500-1500 Firestore documents on
 * every navigation. The cache is intentionally short-lived, shared by all
 * admin pages, and falls back to the last good snapshot during a transient
 * Firebase timeout. Mutations still go directly to Firestore.
 */
function admin_cached_firestore_rows(string $key, callable $loader, int $ttl = 5): array
{
    static $memory = [];
    if (array_key_exists($key, $memory)) return $memory[$key];

    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'wow-admin-firestore-cache';
    $file = $directory . DIRECTORY_SEPARATOR . hash('sha256', WOW_FIREBASE_PROJECT_ID . '|' . $key) . '.cache';
    $cached = null;
    if (is_file($file)) {
        $value = @unserialize((string)@file_get_contents($file), ['allowed_classes' => true]);
        if (is_array($value) && isset($value['saved_at'], $value['rows']) && is_array($value['rows'])) $cached = $value;
    }
    if ($cached && time() - (int)$cached['saved_at'] <= $ttl) return $memory[$key] = $cached['rows'];

    try {
        $rows = $loader();
        if (!is_dir($directory)) @mkdir($directory, 0700, true);
        if (is_dir($directory)) {
            $temporary = $file . '.' . getmypid() . '.tmp';
            if (@file_put_contents($temporary, serialize(['saved_at' => time(), 'rows' => $rows]), LOCK_EX) !== false) @rename($temporary, $file);
        }
        return $memory[$key] = $rows;
    } catch (Throwable $error) {
        if ($cached) {
            error_log('Admin Firestore cache served stale data for ' . $key . ': ' . $error->getMessage());
            return $memory[$key] = $cached['rows'];
        }
        throw $error;
    }
}

/**
 * Request-scoped Firestore cache for admin read endpoints.
 *
 * Several admin reports reuse the same large collections (directly and through
 * financial_service.php). Keeping one snapshot per request prevents duplicate
 * billable reads without making data stale across requests.
 */
function admin_list_collection(string $collection, int $limit = 1000): array
{
    static $cache = [];
    $key = $collection . ':' . $limit;
    if (!array_key_exists($key, $cache)) {
        $cache[$key] = admin_cached_firestore_rows('list:' . $key, static fn(): array => wow_list_collection($collection, $limit));
    }
    return $cache[$key];
}

/** Load only the newest rows for list screens instead of scanning history. */
function admin_list_recent_collection(string $collection, int $limit = 100, string $timeField = 'createdAt'): array
{
    static $cache = [];
    $key = $collection . ':' . $timeField . ':desc:' . $limit;
    if (array_key_exists($key, $cache)) return $cache[$key];
    return $cache[$key] = admin_cached_firestore_rows('recent:' . $key, static function () use ($collection, $timeField, $limit): array {
        $rows = [];
        $documents = wow_firestore()->collection($collection)->orderBy($timeField, 'DESC')->limit($limit)->documents();
        foreach ($documents as $document) {
            if (!$document->exists()) continue;
            $data = $document->data();
            $data['uid'] = $document->id();
            $rows[] = $data;
        }
        return $rows;
    }, 20);
}

/**
 * Load a subcollection type in one query instead of issuing one query per ride.
 * The parent document id is included for efficient grouping by callers.
 */
function admin_list_collection_group(string $collection, int $limit = 2000): array
{
    static $cache = [];
    $key = $collection . ':' . $limit;
    if (array_key_exists($key, $cache)) return $cache[$key];

    $rows = [];
    $documents = wow_firestore()->collectionGroup($collection)->limit($limit)->documents();
    foreach ($documents as $document) {
        if (!$document->exists()) continue;
        $data = $document->data();
        $data['uid'] = $document->id();
        $parent = $document->reference()->parent()->parent();
        $data['_parent_id'] = $parent ? $parent->id() : '';
        $rows[] = $data;
    }
    return $cache[$key] = $rows;
}
