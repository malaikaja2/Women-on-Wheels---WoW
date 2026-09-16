<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
admin_require_auth();

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function menu_active(string $target, string $current): string
{
    return $target === $current ? ' active' : '';
}

$allowedViews = [
    'dashboard',
    'passengers',
    'drivers',
    'ride-monitoring',
    'fare-insights',
    'carpooling',
    'payments',
    'safety-sos',
    'passenger-sos',
    'wow-companion',
    'auth-monitoring',
    'ratings-reviews',
    'ai-analytics',
    'notifications',
    'settings',
];

$requestedView = isset($_GET['view']) ? strtolower(trim((string)$_GET['view'])) : 'dashboard';
$viewRedirectMap = [
    'ratings-reviews' => 'ratings_reviews.php'
];
if (isset($viewRedirectMap[$requestedView])) {
    header('Location: ' . $viewRedirectMap[$requestedView]);
    exit;
}
$view = in_array($requestedView, $allowedViews, true) ? $requestedView : 'dashboard';
$isPassengerView = $view === 'passengers';

$admin = $_SESSION['admin_auth'] ?? [];
$adminName = isset($admin['full_name']) ? (string)$admin['full_name'] : 'Admin';
$adminRole = isset($admin['role']) ? (string)$admin['role'] : 'admin';
$adminEmail = isset($admin['email']) ? (string)$admin['email'] : '';
$adminInitial = strtoupper(substr($adminName, 0, 1));
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#9a48ff">
    <title>Admin Dashboard - Women on Wheels</title>
    <link rel="stylesheet" href="dashboard.css?v=20260719-lovable1">
    <link rel="stylesheet" href="dashboard_v2.css?v=20260915-admin-layout3">
    <?php if ($isPassengerView): ?><link rel="stylesheet" href="passenger_management.css?v=20260802-1"><?php endif; ?>
</head>
<body class="<?php echo $isPassengerView ? 'pm-page' : ''; ?>">
<div class="admin-layout">
    <?php require __DIR__ . '/dashboard_sidebar.php'; ?>


    <main class="content">
        <header class="topbar v2-topbar">
            <div class="v2-top-title"><strong>Admin Dashboard</strong><span>Women on Wheels</span></div>
            <label class="search-wrap" for="dashboardSearch">
                <span class="search-icon">&#8981;</span>
                <input id="dashboardSearch" type="search" placeholder="Search passengers, drivers, rides...">
                <button id="dashboardSearchClear" type="button" aria-label="Clear search" hidden>&times;</button>
                <div class="v2-search-results" id="dashboardSearchResults" hidden></div>
            </label>

            <div class="topbar-right">
                <span class="status-pill"><span class="dot"></span>System Online</span>
                <div class="v2-menu-wrap"><button class="icon-btn" id="adminNotificationBell" type="button" aria-label="Notifications" aria-expanded="false"><span class="notify-dot" id="notifyCount">0</span>&#128276;</button><div class="v2-notification-panel" id="adminNotificationPanel" hidden><div class="v2-notification-head"><strong>Notifications</strong><button type="button" id="adminMarkAllRead">Mark all read</button></div><div id="adminNotificationList"><div class="v2-skeleton rows"></div></div><a href="notifications.php">View all notifications</a></div></div>
                <div class="v2-menu-wrap"><button class="quick-actions" type="button" data-menu-toggle="quickActionsMenu">Quick Actions &#9662;</button><div class="v2-dropdown" id="quickActionsMenu"><button type="button" id="refreshNow">Refresh dashboard</button><a href="drivers.php?filter=pending">Verify drivers</a><a href="sos_monitoring.php?filter=active">Review SOS alerts</a><button type="button" id="quickSendNotification">Send notification</button></div></div>
                <div class="v2-menu-wrap"><button class="v2-profile-button" type="button" data-menu-toggle="profileMenu"><span class="avatar lg" id="adminProfileAvatar"><?php echo h($adminInitial); ?></span><span id="adminProfileName"><?php echo h($adminName); ?></span><b>&#8964;</b></button><div class="v2-dropdown profile" id="profileMenu"><strong id="adminMenuName"><?php echo h($adminName); ?></strong><small id="adminMenuEmail"><?php echo h($adminEmail); ?></small><span id="adminMenuRole"><?php echo h(ucwords(str_replace('_', ' ', $adminRole))); ?></span><a href="settings.php?section=profile">View Profile</a><a href="settings.php">Account Settings</a><button type="button" data-wow-change-password data-token-url="firebase_custom_token.php" data-login-url="login.php" data-logout-url="logout.php" data-logout-method="GET">Change Password</button><a href="logout.php" id="adminShellLogout">Logout</a></div></div>
            </div>
        </header>

        <?php if ($isPassengerView): ?>
            <section class="intro passenger-intro pm-header">
                <div>
                    <h1>Passenger Management</h1>
                    <p>View and manage registered passengers from mobile app</p>
                </div>
                <button class="pm-primary-small" id="passengerHeaderExport" type="button"><span aria-hidden="true">&#8681;</span> Export Data</button>
            </section>

            <section class="passenger-kpis">
                <article class="kpi-card"><span class="pm-kpi-icon">&#128101;</span><div>
                    <p>Total Passengers</p><h3 id="pmTotalPassengers" class="pm-skeleton-text">--</h3><small>All registered passenger accounts</small></div>
                </article>
                <article class="kpi-card"><span class="pm-kpi-icon verified">&#10003;</span><div>
                    <p>Active</p><h3 class="kpi-verified pm-skeleton-text" id="pmActivePassengers">--</h3><small>Passengers with available accounts</small></div>
                </article>
                <article class="kpi-card"><span class="pm-kpi-icon blocked">&#8856;</span><div>
                    <p>Blocked</p><h3 class="kpi-blocked pm-skeleton-text" id="pmBlockedPassengers">--</h3><small>Restricted passenger accounts</small></div>
                </article>
            </section>

            <section class="passenger-tools pm-toolbar">
                <label class="search-wrap passenger-search" for="passengerSearch">
                    <span class="search-icon">&#128269;</span>
                    <input id="passengerSearch" type="search" placeholder="Search by name, email, phone or CNIC" autocomplete="off">
                    <button id="passengerSearchClear" type="button" aria-label="Clear search" hidden>&times;</button>
                </label>
                <label class="status-filter" for="passengerStatusFilter">
                    <select id="passengerStatusFilter">
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="blocked">Blocked</option>
                    </select>
                </label>
                <button class="pm-secondary" id="passengerRefresh" type="button">&#8635; Refresh</button>
                <button class="pm-secondary" id="passengerToolbarExport" type="button">&#8681; Export</button>
            </section>

            <section class="panel passenger-table-panel">
                <div class="table-wrap">
                    <table class="passenger-table">
                        <thead>
                        <tr>
                            <th>Passenger</th>
                            <th>Contact</th>
                            <th>CNIC</th>
                            <th>Total Rides</th>
                            <th>Rating</th>
                            <th>Status</th>
                            <th>Last Active</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody id="passengerTableBody">
                        <tr class="pm-loading-row"><td colspan="8"><div class="pm-table-skeleton"></div><div class="pm-table-skeleton short"></div></td></tr>
                        </tbody>
                    </table>
                </div>
                <footer class="pm-pagination"><span id="pmResultCount">Loading passengers…</span><div><button id="pmPrevPage" type="button" disabled>Previous</button><strong id="pmPageLabel">Page 1</strong><button id="pmNextPage" type="button" disabled>Next</button></div></footer>
            </section>

            <div class="pm-modal-backdrop" id="passengerDetailBackdrop" hidden>
                <section class="pm-modal" role="dialog" aria-modal="true" aria-labelledby="pmModalName">
                    <header class="pm-modal-header"><span class="pm-modal-avatar" id="pmModalAvatar">P</span><div><div class="pm-modal-title"><h2 id="pmModalName">Passenger</h2><span id="pmModalStatus" class="pm-status">Active</span></div><p id="pmModalId">ID: —</p></div><button id="pmModalClose" class="pm-modal-close" type="button" aria-label="Close passenger details">&times;</button></header>
                    <div class="pm-modal-body" id="pmModalBody">
                        <div id="pmDetailError" class="pm-inline-state" hidden></div>
                        <section><h3>Personal Information</h3><div class="pm-detail-grid" id="pmPersonalGrid"></div></section>
                        <section><h3>Account Status</h3><div class="pm-detail-grid status-grid" id="pmAccountGrid"></div></section>
                        <section><h3>Ride Summary</h3><div class="pm-ride-stats" id="pmRideStats"></div></section>
                        <section><div class="pm-section-heading"><h3>Recent Ride History</h3><a id="pmCompleteHistory" href="rides.php">View Complete Ride History</a></div><div id="pmRecentRides" class="pm-related-loading"><div class="pm-table-skeleton"></div></div></section>
                        <section id="pmSafetySection" hidden><h3>Safety and Reports</h3><div class="pm-safety-grid" id="pmSafetyGrid"></div></section>
                    </div>
                    <footer class="pm-modal-footer" id="pmModalActions"><button class="pm-secondary" type="button" data-pm-close>Close</button></footer>
                </section>
            </div>
        <?php else: ?>
            <?php require __DIR__ . '/dashboard_overview.php'; ?>
            <?php if (false): ?>
            <section class="intro">
                <h1>Dashboard</h1>
                <div>
                    <p id="welcomeText">Welcome, <?php echo h($adminName); ?></p>
                </div>
            </section>

            <section class="stats-grid">
                <article class="stat-card is-loading"><p>Total Passengers</p><h3 id="statTotalUsers">--</h3></article>
                <article class="stat-card is-loading"><p>Total Drivers</p><h3 id="statTotalDrivers">--</h3></article>
                <article class="stat-card is-loading"><p>Pending Driver Verifications</p><h3 id="statPendingDriverApplications">--</h3></article>
                <article class="stat-card is-loading"><p>Active Rides</p><h3 id="statActiveRides">--</h3></article>
                <article class="stat-card is-loading"><p>Completed Rides</p><h3 id="statCompletedRides">--</h3></article>
                <article class="stat-card is-loading"><p>Cancelled Rides</p><h3 id="statCancelledRides">--</h3></article>
                <article class="stat-card is-loading"><p>SOS Alerts</p><h3 id="statActiveSosAlerts">--</h3></article>
                <article class="stat-card is-loading"><p>WOW Commission Earnings</p><h3 id="statEarnings">--</h3></article>
                <article class="stat-card is-loading"><p>Today's Ride Requests</p><h3 id="statTodayRides">--</h3></article>
                <article class="stat-card is-loading"><p>Online Drivers</p><h3 id="statOnlineDrivers">--</h3></article>
            </section>

            <section class="admin-quick-actions" aria-label="Quick actions">
                <a href="dashboard.php?view=passengers">Passengers</a>
                <a href="drivers.php">Drivers</a>
                <a href="rides.php">Rides</a>
                <a href="sos_monitoring.php">SOS Alerts</a>
                <a href="payments.php">Payments</a>
                <a href="ai_analytics.php">AI Analytics</a>
                <a href="fare_insights.php">Reports</a>
                <a href="drivers.php?filter=pending">Driver Verification</a>
            </section>

            <section class="dashboard-table-grid">
                <article class="panel table-panel">
                    <div class="panel-head"><div><h2>Recent Ride Requests</h2><p>Latest real Firestore ride records</p></div><a class="outline-btn" href="rides.php">View All</a></div>
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>Ride ID</th><th>Passenger</th><th>Driver</th><th>Route</th><th>Fare</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
                            <tbody id="recentRidesBody"><tr><td colspan="8" class="empty">Loading rides...</td></tr></tbody>
                        </table>
                    </div>
                </article>

                <article class="panel table-panel">
                    <div class="panel-head"><div><h2>Pending Driver Verification</h2><p>Drivers waiting for admin approval</p></div><a class="outline-btn" href="drivers.php">Verify</a></div>
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>Driver</th><th>Contact</th><th>Vehicle</th><th>Status</th><th>Applied</th><th>Action</th></tr></thead>
                            <tbody id="pendingDriversBody"><tr><td colspan="6" class="empty">Loading pending drivers...</td></tr></tbody>
                        </table>
                    </div>
                </article>

                <article class="panel table-panel">
                    <div class="panel-head"><div><h2>Recent SOS Alerts</h2><p>Emergency records from Firestore</p></div><a class="outline-btn" href="sos_monitoring.php">View All</a></div>
                    <div class="sos-list" id="sosList"><div class="empty">Loading SOS alerts...</div></div>
                </article>
            </section>

            <section class="panel ai-analytics-panel">
                <div class="panel-head">
                    <div>
                        <h2>AI Analytics</h2>
                        <p>Insights generated from real Firebase ride, driver, passenger, and SOS records</p>
                    </div>
                    <span class="live-chip"><span class="dot"></span>Live</span>
                </div>
                <div class="ai-analytics-empty" id="aiAnalyticsEmpty">Loading analytics...</div>
                <div class="ai-analytics-grid" id="aiAnalyticsGrid" hidden>
                    <article><span>Most Requested Pickup Areas</span><strong id="aiPickupAreas">--</strong></article>
                    <article><span>Most Requested Drop-off Areas</span><strong id="aiDropAreas">--</strong></article>
                    <article><span>Peak Ride Request Time</span><strong id="aiPeakTime">--</strong></article>
                    <article><span>Active vs Completed</span><strong id="aiActiveCompleted">--</strong></article>
                    <article><span>Cancelled Ride Percentage</span><strong id="aiCancelPercent">--</strong></article>
                    <article><span>Driver Approval Trend</span><strong id="aiDriverTrend">--</strong></article>
                    <article><span>Passenger Growth</span><strong id="aiPassengerGrowth">--</strong></article>
                    <article><span>Ride Demand by Vehicle</span><strong id="aiVehicleDemand">--</strong></article>
                    <article><span>SOS Alerts</span><strong id="aiSosSummary">--</strong></article>
                    <article class="wide"><span>Recent Emergency Records</span><strong id="aiRecentSos">--</strong></article>
                </div>
                <div class="analytics-charts-grid" id="analyticsChartsGrid" hidden>
                    <article class="chart-card"><span>Ride Requests by Day</span><canvas id="chartRideRequests" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Completed vs Cancelled</span><canvas id="chartCompletedCancelled" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Vehicle Type Demand</span><canvas id="chartVehicleDemand" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Peak Request Hours</span><canvas id="chartPeakHours" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Pickup Areas</span><canvas id="chartPickupAreas" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Drop-off Areas</span><canvas id="chartDropAreas" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Passenger Growth</span><canvas id="chartPassengerGrowth" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Driver Approval Trend</span><canvas id="chartDriverTrend" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>SOS Alerts Trend</span><canvas id="chartSosTrend" width="420" height="220"></canvas></article>
                    <article class="chart-card"><span>Revenue Trend</span><canvas id="chartRevenueTrend" width="420" height="220"></canvas></article>
                </div>
            </section>
            <?php endif; ?>

        <?php endif; ?>
    </main>
</div>

<script>
    window.ADMIN_BOOTSTRAP = {
        adminName: <?php echo json_encode($adminName, JSON_UNESCAPED_UNICODE); ?>,
        adminRole: <?php echo json_encode($adminRole, JSON_UNESCAPED_UNICODE); ?>,
        view: <?php echo json_encode($view, JSON_UNESCAPED_UNICODE); ?>
    };
</script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"></script>
<script src="admin_realtime.js?v=20260802-admin-performance1"></script>
<script src="../js/wow-change-password.js?v=20260730-1"></script>
<script src="admin_shell.js?v=20260730-1"></script>
<?php if ($isPassengerView): ?>
<script src="passenger_management.js?v=20260802-1"></script>
<?php else: ?>
<script src="dashboard_overview.js?v=20260915-scheduled-count2"></script>
<?php endif; ?>
</body>
</html>







