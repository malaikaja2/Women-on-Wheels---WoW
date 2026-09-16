<?php

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');

$token = getenv('MAPBOX_ACCESS_TOKEN');
if ($token === false || trim((string)$token) === '') {
    $envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (is_readable($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            if (preg_match('/^\s*MAPBOX_ACCESS_TOKEN\s*=\s*(.*)\s*$/', $line, $match)) {
                $token = trim($match[1], " \t\n\r\0\x0B\"'");
                break;
            }
        }
    }
}

echo 'window.WOW_MAPBOX_ACCESS_TOKEN = ' . json_encode(trim((string)$token)) . ';';
