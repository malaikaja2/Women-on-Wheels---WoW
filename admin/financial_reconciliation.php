<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/financial_service.php';

$filter = strtolower(trim((string)($argv[1] ?? 'all')));
if (!in_array($filter, ['today', 'week', 'month', 'all'], true)) $filter = 'all';
$result = wow_financial_reconcile($filter, true);

echo json_encode([
    'filter' => $result['filter'],
    'commissionRate' => $result['commissionRate'],
    'totals' => $result['totals'],
    'validCompletedRideCount' => $result['validCompletedRideCount'],
    'excludedRideCount' => $result['excludedRideCount'],
    'duplicateRideCount' => $result['duplicateRideCount'],
    'reconciliation' => $result['reconciliation'],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
