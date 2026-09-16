<?php
declare(strict_types=1);

function admin_page_open(string $title, string $subtitle, string $searchId, string $refreshId, string $notifyId): void
{
    $e = static fn(string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>' . $e($title) . ' - Women on Wheels</title><link rel="stylesheet" href="dashboard.css?v=20260802-admin-layout2"><link rel="stylesheet" href="dashboard_v2.css?v=20260802-admin-layout2"></head><body><div class="admin-layout">';
    require __DIR__ . '/shared_sidebar.php';
    echo '<main class="content"><header class="topbar"><label class="search-wrap" for="' . $e($searchId) . '"><span class="search-icon">&#8981;</span><input id="' . $e($searchId) . '" type="search" placeholder="Search records..."></label><div class="topbar-right"><span class="status-pill"><span class="dot"></span>System Online</span><button class="icon-btn" type="button" aria-label="Notifications"><span class="notify-dot" id="' . $e($notifyId) . '">0</span>&#128276;</button><button class="quick-actions" type="button" id="' . $e($refreshId) . '">Refresh</button></div></header><section class="intro"><div><h1>' . $e($title) . '</h1><p>' . $e($subtitle) . '</p></div></section>';
}

function admin_page_close(string $script): void
{
    $e = static fn(string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
    echo '</main></div><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"></script><script src="admin_realtime.js?v=20260802-admin-performance1"></script><script src="' . $e($script) . '?v=20260802-shared-shell1"></script></body></html>';
}
