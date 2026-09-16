<?php
declare(strict_types=1);
$escape = static fn($value): string => htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
$admin = $_SESSION['admin_auth'] ?? [];
$adminName = (string)($admin['full_name'] ?? 'Malaika Jawed');
$adminRole = (string)($admin['role'] ?? 'admin');
$adminInitial = strtoupper(substr($adminName, 0, 1));
$script = strtolower(basename((string)($_SERVER['SCRIPT_NAME'] ?? 'dashboard.php')));
$queryView = strtolower(trim((string)($_GET['view'] ?? '')));
$filter = strtolower(trim((string)($_GET['filter'] ?? '')));
$activeKey = match ($script) {
    'dashboard.php' => $queryView === 'passengers' ? 'passengers' : 'dashboard',
    'drivers.php' => $filter === 'pending' ? 'verification' : 'drivers',
    'rides.php' => $filter === 'scheduled' ? 'scheduled' : 'rides',
    'carpooling.php' => 'carpool', 'sos_monitoring.php' => 'sos',
    'lost_found.php' => 'lost', 'ratings_reviews.php' => 'reports',
    'payments.php' => 'payments', 'driver_earnings.php' => 'earnings',
    'fare_insights.php' => 'fare', 'ai_analytics.php' => 'analytics',
    'notifications.php' => 'notifications', 'auth_monitoring.php' => 'auth',
    'wow_assistant.php' => 'assistant',
    'settings.php' => 'settings', default => '',
};
$groups = [
    'Overview' => [['Dashboard','dashboard.php','dashboard']],
    'User Management' => [['Passengers','dashboard.php?view=passengers','passengers'],['Drivers','drivers.php','drivers'],['Driver Verification','drivers.php?filter=pending','verification']],
    'Ride Operations' => [['Ride Monitoring','rides.php','rides'],['Scheduled Rides','rides.php?filter=scheduled','scheduled'],['Carpool Management','carpooling.php','carpool']],
    'Safety and Support' => [['SOS Alerts','sos_monitoring.php','sos'],['Lost and Found','lost_found.php','lost'],['Ratings and Reviews','ratings_reviews.php','reports']],
    'Finance' => [['Payments','payments.php','payments'],['Fare Insights','fare_insights.php','fare'],['Driver Earnings','driver_earnings.php','earnings']],
    'Insights' => [['AI Analytics','ai_analytics.php','analytics'],['WOW Assistant','wow_assistant.php','assistant'],['Notifications','notifications.php','notifications'],['Authentication Monitoring','auth_monitoring.php','auth']],
];
$iconPaths = [
    'dashboard'=>'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
    'passengers'=>'M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4ZM8 14c-3.5 0-7 1.18-7 3v2h5v-2c0-1.16.76-2.18 2.08-3H8Z',
    'drivers'=>'M18.92 6a1.8 1.8 0 0 0-1.69-1.2H6.77A1.8 1.8 0 0 0 5.08 6L3 12v7h2a2 2 0 1 0 4 0h6a2 2 0 1 0 4 0h2v-7l-2.08-6ZM7 15.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm10 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
    'verification'=>'M12 2 4 5v6c0 5.25 3.44 10.22 8 11.73C16.56 21.22 20 16.25 20 11V5l-8-3Zm-1 15-4-4 1.41-1.41L11 14.17l4.59-4.58L17 11l-6 6Z',
    'rides'=>'M12 2a8 8 0 0 0-8 8c0 5.74 6.66 11.44 7.17 11.87a1.3 1.3 0 0 0 1.66 0C13.34 21.44 20 15.74 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
    'scheduled'=>'M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Z',
    'carpool'=>'M18.5 8H17l-1.2-2.7A2 2 0 0 0 13.97 4H7.03A2 2 0 0 0 5.2 5.3L4 8H2.5A1.5 1.5 0 0 0 1 9.5V14h2v3h4v-3h10v3h4v-3h2V9.5A1.5 1.5 0 0 0 21.5 8h-3ZM6 12a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 6 12Zm12 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 18 12Z',
    'sos'=>'M12 2 4 5v6c0 5.25 3.44 10.22 8 11.73C16.56 21.22 20 16.25 20 11V5l-8-3Zm1 16h-2v-5h2v5Zm-1-7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z',
    'lost'=>'M20 6h-8l-2-2H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm-7 11h-2v-2h2v2Zm1.9-7.5-.9.9c-.7.6-1 1.1-1 2.1h-2v-.5c0-1 .4-1.9 1.1-2.6l1.2-1.2a1.4 1.4 0 1 0-2.4-1H9a3.4 3.4 0 1 1 5.9 2.3Z',
    'reports'=>'m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2Z',
    'payments'=>'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V6Zm0 4h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    'fare'=>'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4v2h10V7H7Zm0 4v2h10v-2H7Zm0 4v2h6v-2H7Z',
    'earnings'=>'M12 2v2a6 6 0 1 0 6 6h2A8 8 0 1 1 12 2Zm2 0v6h6A8 8 0 0 0 14 2Z',
    'analytics'=>'M4 19h16v2H2V3h2v16Zm2-2v-5h3v5H6Zm5 0V7h3v10h-3Zm5 0V9h3v8h-3Z',
    'assistant'=>'M19 7h-3.17L14 4h-4L8.17 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-8 9H8v-2h3v2Zm5-4h-3v2h-2v-2H8v-2h3V8h2v2h3v2Z',
    'notifications'=>'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z',
    'auth'=>'M17 10h-1V7a4 4 0 1 0-8 0h2a2 2 0 1 1 4 0v3H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z',
    'settings'=>'m19.14 12.94.86-1.49-1.48-2.56-1.71.5a7 7 0 0 0-1.2-.69l-.25-1.78H9.64L9.39 8.7c-.42.17-.82.4-1.2.69l-1.71-.5L5 11.45l.86 1.49a7 7 0 0 0 0 1.86L5 16.29l1.48 2.56 1.71-.5c.38.29.78.52 1.2.69l.25 1.78h5.72l.25-1.78c.42-.17.82-.4 1.2-.69l1.71.5L20 16.29l-.86-1.49a7 7 0 0 0 0-1.86ZM12 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
    'logout'=>'M10 17v-2h4V9h-4V7h6v10h-6ZM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5Zm14.59 6L16 8.41 17.41 7l5 5-5 5L16 15.59 18.59 13H8v-2h10.59Z',
];
?>
<script>
try {
    if (window.matchMedia('(min-width:1081px)').matches && localStorage.getItem('wow_admin_sidebar') === 'collapsed') {
        document.body.classList.add('admin-sidebar-collapsed');
    }
} catch (error) {}
</script>
<aside class="sidebar v2-sidebar" data-admin-sidebar>
    <div class="sidebar-logo-wrap"><img src="../images/logo.png" alt="Women on Wheels" class="sidebar-logo" width="148" height="72" decoding="async"></div>
    <button type="button" class="drawer-toggle" aria-label="Toggle navigation" aria-expanded="true">&#8249;</button>
    <div class="sidebar-scroll">
        <?php foreach ($groups as $group => $items): ?><p class="sidebar-label"><?php echo $escape($group); ?></p><nav class="menu" aria-label="<?php echo $escape($group); ?>">
            <?php foreach ($items as [$label,$href,$key]): ?><a class="menu-item<?php echo $activeKey === $key ? ' active' : ''; ?>" href="<?php echo $escape($href); ?>"<?php echo $activeKey === $key ? ' aria-current="page"' : ''; ?>><span class="menu-icon v2-nav-icon" data-icon="<?php echo $escape($key); ?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="<?php echo $escape($iconPaths[$key] ?? $iconPaths['dashboard']); ?>"/></svg></span><span class="menu-text"><?php echo $escape($label); ?></span><?php if ($key === 'sos'): ?><span class="menu-badge" id="sidebarSosCount">0</span><?php endif; ?></a><?php endforeach; ?>
        </nav><?php endforeach; ?>
    </div>
    <div class="sidebar-footer"><p class="sidebar-label">System</p><nav class="menu" aria-label="System"><a class="menu-item<?php echo $activeKey === 'settings' ? ' active' : ''; ?>" href="settings.php"<?php echo $activeKey === 'settings' ? ' aria-current="page"' : ''; ?>><span class="menu-icon v2-nav-icon" data-icon="settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="<?php echo $escape($iconPaths['settings']); ?>"/></svg></span><span class="menu-text">Settings</span></a><a class="menu-item logout" href="logout.php"><span class="menu-icon v2-nav-icon" data-icon="logout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="<?php echo $escape($iconPaths['logout']); ?>"/></svg></span><span class="menu-text">Logout</span></a></nav><div class="sidebar-user"><div class="avatar"><?php echo $escape($adminInitial); ?></div><div><strong><?php echo $escape($adminName); ?></strong><span><?php echo $escape(ucwords(str_replace('_', ' ', $adminRole))); ?></span></div></div></div>
</aside>
