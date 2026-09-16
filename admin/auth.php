<?php
declare(strict_types=1);

function admin_is_https(): bool
{
    return isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
}

function admin_session_cookie_path(): string
{
    $scriptName = (string)($_SERVER['SCRIPT_NAME'] ?? '');

    if (preg_match('#^(.*?/admin)(?:/|$)#i', $scriptName, $matches) === 1) {
        $path = rtrim($matches[1], '/');
        return $path === '' ? '/' : $path;
    }

    return '/';
}

function admin_start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    ini_set('session.cookie_secure', admin_is_https() ? '1' : '0');

    session_name('wow_admin_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => admin_session_cookie_path(),
        'secure' => admin_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();

    if (!isset($_SESSION['admin_session_initialized'])) {
        session_regenerate_id(true);
        $_SESSION['admin_session_initialized'] = true;
        $_SESSION['admin_last_activity'] = time();
    }
}

function admin_current_fingerprint(): string
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ip . '|' . $ua);
}

function admin_csrf_token(): string
{
    if (empty($_SESSION['admin_csrf_token'])) {
        $_SESSION['admin_csrf_token'] = bin2hex(random_bytes(32));
    }

    return (string)$_SESSION['admin_csrf_token'];
}

function admin_verify_csrf_token(string $token): bool
{
    $stored = $_SESSION['admin_csrf_token'] ?? '';
    return is_string($stored) && $stored !== '' && hash_equals($stored, $token);
}

function admin_is_authenticated(): bool
{
    return isset($_SESSION['admin_auth']) && is_array($_SESSION['admin_auth']) && isset($_SESSION['admin_auth']['id']);
}

function admin_establish_login(array $admin): void
{
    session_regenerate_id(true);
    $_SESSION['admin_auth'] = [
        'id' => (string)($admin['uid'] ?? $admin['id']),
        'uid' => (string)($admin['uid'] ?? $admin['id']),
        'full_name' => (string)($admin['full_name'] ?? $admin['fullName'] ?? ''),
        'email' => (string)$admin['email'],
        'role' => (string)$admin['role'],
    ];
    $_SESSION['admin_fingerprint'] = admin_current_fingerprint();
    $_SESSION['admin_last_activity'] = time();
    admin_enable_shared_shell();
}

function admin_enable_shared_shell(): void
{
    static $enabled = false;
    $script = strtolower((string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($enabled || (PHP_SAPI === 'cli' && getenv('WOW_ADMIN_RENDER_TEST') !== '1') || str_contains($script, '_data.php') || str_contains($script, '_api.php') || str_contains($script, '_actions.php') || str_contains($script, 'firebase_custom_token.php')) return;
    $enabled = true;
    ob_start(); require __DIR__ . '/shared_sidebar.php'; $sharedSidebar = (string)ob_get_clean();
    ob_start(); require __DIR__ . '/shared_header.php'; $sharedHeader = (string)ob_get_clean();
    ob_start(static function (string $html) use ($sharedSidebar, $sharedHeader): string {
        if (stripos($html, '<aside class="sidebar') === false) return $html;
        $html = (string)preg_replace('#<aside class="sidebar[^>]*>.*?</aside>#si', $sharedSidebar, $html, 1);
        $html = (string)preg_replace('#<header\s+class=["\'][^"\']*topbar[^"\']*["\'][^>]*>.*?</header>#si', $sharedHeader, $html, 1);
        if (stripos($html, 'id="adminSharedHeader"') === false) {
            $html = (string)preg_replace('#(<main\s+class=["\'][^"\']*content[^"\']*["\'][^>]*>)#i', '$1' . $sharedHeader, $html, 1);
        }
        if (stripos($html, 'dashboard_v2.css') === false) $html = str_ireplace('</head>', '<link rel="stylesheet" href="dashboard_v2.css?v=20260802-shared-sidebar1"></head>', $html);
        if (stripos($html, 'admin_header.css') === false) $html = str_ireplace('</head>', '<link rel="stylesheet" href="admin_header.css?v=20260802-shared1"><link rel="stylesheet" href="../css/wow-change-password.css?v=20260730-1"></head>', $html);
        $scripts = '';
        if (stripos($html, 'firebase-app-compat.js') === false) $scripts .= '<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"></script>';
        if (stripos($html, 'admin_data_utils.js') === false) {
            $utilityScript = '<script src="admin_data_utils.js?v=20260803-integration1"></script>';
            if (stripos($html, 'admin_shell.js') !== false) {
                $html = (string)preg_replace('#(<script[^>]+src=["\'][^"\']*admin_shell\.js[^>]*>)#i', $utilityScript . '$1', $html, 1);
            } else $scripts .= $utilityScript;
        }
        if (stripos($html, 'admin_realtime.js') === false) $scripts .= '<script src="admin_realtime.js?v=20260802-shared-header1"></script>';
        if (stripos($html, 'wow-change-password.js') === false) $scripts .= '<script src="../js/wow-change-password.js?v=20260730-1"></script>';
        if (stripos($html, 'admin_shell.js') === false) $scripts .= '<script src="admin_shell.js?v=20260803-enterprise-header2"></script>';
        if ($scripts !== '') $html = str_ireplace('</body>', $scripts . '</body>', $html);
        $html = (string)preg_replace('#admin_shell\.js\?v=[^"\']+#i', 'admin_shell.js?v=20260803-enterprise-header2', $html);
        $html = (string)preg_replace('#admin_realtime\.js\?v=[^"\']+#i', 'admin_realtime.js?v=20260802-shared-header1', $html);
        $html = (string)preg_replace('#admin_header\.css\?v=[^"\']+#i', 'admin_header.css?v=20260803-enterprise-header2', $html);
        return $html;
    });
}

function admin_logout_and_destroy_session(): void
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }

    session_destroy();
}

function admin_require_auth(): void
{
    if (!admin_is_authenticated()) {
        header('Location: login.php?error=auth_required');
        exit();
    }

    $role = strtolower((string)($_SESSION['admin_auth']['role'] ?? ''));
    if (!in_array($role, ['admin', 'super_admin', 'owner'], true)) {
        admin_logout_and_destroy_session();
        header('Location: login.php?error=auth_required');
        exit();
    }

    $fingerprint = $_SESSION['admin_fingerprint'] ?? '';
    if (!is_string($fingerprint) || !hash_equals($fingerprint, admin_current_fingerprint())) {
        admin_logout_and_destroy_session();
        header('Location: login.php?error=session_expired');
        exit();
    }

    $maxIdleSeconds = 1800;
    $lastActivity = (int)($_SESSION['admin_last_activity'] ?? 0);
    if ($lastActivity > 0 && (time() - $lastActivity) > $maxIdleSeconds) {
        admin_logout_and_destroy_session();
        header('Location: login.php?error=session_timeout');
        exit();
    }

    $_SESSION['admin_last_activity'] = time();
    admin_enable_shared_shell();
}

admin_start_secure_session();





