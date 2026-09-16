<?php
declare(strict_types=1);
require_once __DIR__.'/auth.php';
admin_require_auth();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="csrf-token" content="<?php echo htmlspecialchars(admin_csrf_token(),ENT_QUOTES,'UTF-8'); ?>">
  <title>Authentication Monitoring - Women on Wheels</title>
  <link rel="stylesheet" href="dashboard.css?v=20260802">
  <link rel="stylesheet" href="dashboard_v2.css?v=20260802">
  <link rel="stylesheet" href="auth_monitoring.css?v=20260803">
  <link rel="stylesheet" href="auth_monitoring_actions.css?v=20260803">
</head>
<body class="am-page"><div class="admin-layout">
<?php require __DIR__.'/shared_sidebar.php'; ?>
<main class="content">
<?php require __DIR__.'/shared_header.php'; ?>
<section class="am-head"><div><h1>Authentication Monitoring</h1><p>Monitor account access, verification, password recovery and suspicious authentication activity.</p></div><button class="am-btn secondary" id="amExport">&#8681; Export Data</button></section>
<section class="am-kpis">
  <article><span>&#10003;</span><div><p>Successful Logins Today</p><h3 id="amSuccess">--</h3><small>Across connected platforms</small></div></article>
  <article><span>!</span><div><p>Failed Logins Today</p><h3 id="amFailed">--</h3><small>Invalid or blocked access</small></div></article>
  <article><span>&#8635;</span><div><p>Reset Requests Today</p><h3 id="amResets">--</h3><small>Password recovery requested</small></div></article>
  <article><span>&#9993;</span><div><p>Unverified Accounts</p><h3 id="amUnverified">--</h3><small>Email/password accounts</small></div></article>
  <article><span>&#9873;</span><div><p>Suspicious Activity</p><h3 id="amSuspicious">--</h3><small>Events needing review</small></div></article>
</section>
<section class="am-tabs"><button class="active" data-tab="all">All Activity <b id="amAllCount">0</b></button><button data-tab="login">Login Activity</button><button data-tab="recovery">Password Recovery</button><button data-tab="verification">Email Verification</button><button data-tab="security">Security Events</button></section>
<section class="am-toolbar">
  <label class="am-search"><span>&#128269;</span><input id="amSearch" type="search" placeholder="Search by user, email or event reference"><button id="amClear" hidden aria-label="Clear search">&times;</button></label>
  <select id="amRole"><option value="all">All Roles</option><option value="passenger">Passenger</option><option value="driver">Driver</option><option value="admin">Admin</option></select>
  <select id="amStatus"><option value="all">All Statuses</option><option value="successful">Successful</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="blocked">Blocked</option><option value="needs_review">Needs Review</option></select>
  <select id="amSource"><option value="all">All Platforms</option><option value="passenger_app">Passenger Mobile App</option><option value="passenger_website">Passenger Website</option><option value="driver_app">Driver Mobile App</option><option value="driver_website">Driver Website</option><option value="admin_website">Admin Website</option><option value="unknown">Source unavailable</option></select>
  <select id="amProvider"><option value="all">All Providers</option><option value="password">Email and Password</option><option value="google.com">Google</option></select>
  <select id="amDate"><option value="7d">Last 7 Days</option><option value="today">Today</option><option value="30d">Last 30 Days</option><option value="all">All Time</option></select>
  <button class="am-btn secondary" id="amRefresh">&#8635; Refresh</button>
</section>
<section class="am-panel"><div class="am-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Activity</th><th>Provider</th><th>Source</th><th>Status</th><th>Date and Time</th><th>Risk</th><th>Actions</th></tr></thead><tbody id="amBody"><tr><td colspan="9"><div class="am-skeleton"></div></td></tr></tbody></table></div><footer class="am-pagination"><span id="amCount">Loading authentication activity...</span><div><button id="amPrev" disabled>Previous</button><strong id="amPage">Page 1</strong><button id="amNext" disabled>Next</button></div></footer></section>
<div class="am-backdrop" id="amBackdrop" hidden><div class="am-modal" role="dialog" aria-modal="true" aria-labelledby="amModalTitle"><header><div><p>Authentication Event</p><h2 id="amModalTitle">Event</h2><div id="amModalBadges"></div></div><button id="amClose" aria-label="Close authentication event">&times;</button></header><div class="am-modal-body"><section><h3>User Information</h3><div class="am-facts" id="amUserInfo"></div></section><section><h3>Event Information</h3><div class="am-facts" id="amEventInfo"></div></section><section><h3>Technical Information</h3><div class="am-facts" id="amTechnical"></div></section></div><footer id="amModalActions"></footer></div></div>
<div class="am-toast" id="amToast" hidden></div>
</main></div>
<script src="admin_realtime.js?v=20260802"></script><script src="auth_monitoring.js?v=20260803"></script>
</body></html>
