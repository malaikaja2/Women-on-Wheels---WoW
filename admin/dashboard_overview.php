<section class="v2-page-head">
    <div><p class="v2-eyebrow">Operations overview</p><h1>Admin Dashboard</h1><p id="welcomeText">Welcome, <?php echo h($adminName); ?>. Here is what needs your attention today.</p></div>
    <span class="v2-updated" id="dashboardUpdated">Updating live data…</span>
</section>

<section class="v2-kpis" aria-label="Primary metrics">
    <?php
    $kpis = [
        ['statTotalUsers','Total Passengers','Registered passenger accounts','dashboard.php?view=passengers','users'],
        ['statTotalDrivers','Total Drivers','All driver accounts','drivers.php','car'],
        ['statActiveRides','Active Rides','Currently in progress','rides.php?filter=active','route'],
        ['statPendingDriverApplications','Pending Verifications','Awaiting admin review','drivers.php?filter=pending','check'],
        ['statActiveSosAlerts','Active SOS Alerts','Requires immediate attention','sos_monitoring.php','shield'],
        ['statEarnings','WOW Commission Earnings','30% platform commission','payments.php','wallet'],
    ];
    foreach ($kpis as [$id,$label,$support,$href,$icon]): ?>
    <a class="v2-kpi is-loading" href="<?php echo h($href); ?>">
        <span class="v2-kpi-icon" data-icon="<?php echo h($icon); ?>"></span>
        <span><small><?php echo h($label); ?></small><strong id="<?php echo h($id); ?>">--</strong><em><?php echo h($support); ?></em></span>
        <b aria-hidden="true">→</b>
    </a>
    <?php endforeach; ?>
</section>

<section class="v2-top-grid">
    <article class="v2-panel v2-operations">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">Real-time</p><h2>Live Operations</h2></div></div>
        <div class="v2-operation-grid">
            <a href="rides.php?filter=active"><span>Active rides</span><strong id="opActiveRides">--</strong></a>
            <a href="drivers.php?filter=online"><span>Online drivers</span><strong id="opOnlineDrivers">--</strong></a>
            <a href="rides.php?filter=waiting"><span>Waiting requests</span><strong id="opWaitingRides">--</strong></a>
            <a href="rides.php?filter=scheduled"><span>Scheduled rides</span><strong id="opScheduledRides">--</strong></a>
            <a href="sos_monitoring.php"><span>Emergency rides</span><strong id="opEmergencyRides">--</strong></a>
        </div>
    </article>
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">Action queue</p><h2>Needs Attention</h2></div></div>
        <div class="v2-attention" id="attentionList"><div class="v2-skeleton rows"></div></div>
    </article>
</section>

<section class="v2-middle-grid">
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">Ride health</p><h2>Ride Summary</h2></div><a href="rides.php">View rides</a></div>
        <div class="v2-ride-summary" id="rideSummary"><div class="v2-skeleton chart"></div></div>
    </article>
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">Financial performance</p><h2>Revenue Overview</h2></div><div class="v2-finance-actions"><select id="financialDateFilter" aria-label="Financial date range"><option value="today">Today</option><option value="last_7_days">Last 7 Days</option><option value="last_30_days">Last 30 Days</option><option value="this_month">This Month</option><option value="this_year">This Year</option><option value="all" selected>All Time</option></select><a href="payments.php">View payments</a></div></div>
        <div class="v2-revenue-grid" id="revenueOverview"><div class="v2-skeleton rows"></div></div>
    </article>
</section>

<section class="v2-panel v2-activity-panel">
    <div class="v2-panel-head"><div><p class="v2-eyebrow">Latest updates</p><h2>Recent Activity</h2></div><a class="v2-button" href="rides.php?view=activity">View All Activity</a></div>
    <div class="v2-table-wrap"><table><thead><tr><th>Activity type</th><th>User</th><th>Details</th><th>Status</th><th>Time</th><th>Action</th></tr></thead><tbody id="recentActivityBody"><tr><td colspan="6"><div class="v2-skeleton line"></div></td></tr></tbody></table></div>
</section>

<section class="v2-three-grid">
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">Verification</p><h2>Pending Drivers</h2></div><a href="drivers.php?filter=pending">View all</a></div>
        <div class="v2-compact-list" id="pendingDriversList"><div class="v2-skeleton rows"></div></div>
    </article>
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow danger">Safety</p><h2>Active SOS Alerts</h2></div><a href="sos_monitoring.php">View all</a></div>
        <div class="v2-compact-list" id="activeSosList"><div class="v2-skeleton rows"></div></div>
    </article>
    <article class="v2-panel">
        <div class="v2-panel-head"><div><p class="v2-eyebrow">AI insights</p><h2>Demand Snapshot</h2></div><a href="ai_analytics.php">Full analytics</a></div>
        <div class="v2-insights" id="aiInsights"><div class="v2-skeleton rows"></div></div>
    </article>
</section>

<section class="v2-panel">
    <div class="v2-panel-head"><div><p class="v2-eyebrow">Customer support</p><h2>Lost and Found</h2></div><a href="lost_found.php">View all cases</a></div>
    <div class="v2-lost-counts" id="lostFoundCounts"></div>
    <div class="v2-table-wrap"><table><thead><tr><th>Item</th><th>Ride ID</th><th>Passenger</th><th>Driver</th><th>Status</th><th>Action</th></tr></thead><tbody id="lostFoundBody"><tr><td colspan="6"><div class="v2-skeleton line"></div></td></tr></tbody></table></div>
</section>

<div class="v2-toast" id="dashboardMessage" hidden></div>
