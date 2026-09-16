<?php
declare(strict_types=1);
require_once __DIR__.'/auth.php'; require_once __DIR__.'/db.php';
admin_require_auth();
$admin=$_SESSION['admin_auth']??[]; $uid=(string)($admin['uid']??$admin['id']??'');
$profile=$uid!==''?(wow_doc_data('admins',$uid)?:[]):[];
$adminName=(string)($profile['fullName']??$admin['full_name']??'Admin');
$adminRole=(string)($admin['role']??$profile['role']??'admin'); $adminInitial=strtoupper(substr($adminName,0,1)); $view='settings';
?>
<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Settings - Women on Wheels</title>
<link rel="stylesheet" href="dashboard.css?v=20260719-lovable1"><link rel="stylesheet" href="dashboard_v2.css?v=20260802-admin-layout2"><link rel="stylesheet" href="settings.css?v=20260803-1"><link rel="stylesheet" href="../css/wow-change-password.css?v=20260730-1">
</head><body><div class="admin-layout"><?php require __DIR__.'/shared_sidebar.php'; ?><main class="content"><?php require __DIR__.'/shared_header.php'; ?>
<section class="set-head"><div><p>System configuration</p><h1>Admin Settings</h1><span>Manage your account, ride configuration, safety rules and platform preferences.</span></div><div class="set-connection" id="setConnection"><i></i><span>Connecting</span></div></section>
<div class="set-shell" data-api="settings_data.php" data-csrf="<?=htmlspecialchars(admin_csrf_token(),ENT_QUOTES)?>">
<aside class="set-nav" aria-label="Settings sections"></aside><section class="set-workspace"><div id="setLoading" class="set-loading"><i></i><i></i><i></i><p>Loading settings…</p></div><div id="setError" class="set-error" hidden><strong>Settings could not be loaded.</strong><button type="button" data-retry>Retry</button></div><form id="setForm" hidden novalidate><div id="setPanel"></div></form></section>
</div>
<div class="set-savebar" id="setSavebar" hidden><div><strong>Unsaved changes</strong><span id="setChangeSummary">Review changes before saving.</span></div><button class="set-btn ghost" type="button" id="setDiscard">Discard Changes</button><button class="set-btn primary" type="submit" form="setForm" id="setSave">Save Changes</button></div>
<div class="set-modal-backdrop" id="setConfirm" hidden><section class="set-modal" role="dialog" aria-modal="true" aria-labelledby="setConfirmTitle"><header><div><small>Confirm critical change</small><h2 id="setConfirmTitle">Confirm changes</h2></div><button type="button" data-close aria-label="Close">×</button></header><div id="setConfirmBody"></div><label id="setReasonWrap">Reason for change<textarea id="setReason" maxlength="300" placeholder="Explain why this critical setting is changing"></textarea></label><footer><button type="button" class="set-btn ghost" data-close>Cancel</button><button type="button" class="set-btn danger" id="setConfirmSave">Confirm & Save</button></footer></section></div>
<div class="set-toast" id="setToast" hidden></div>
</main></div>
<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script><script src="admin_realtime.js?v=20260802-admin-performance1"></script><script src="../js/wow-change-password.js?v=20260730-1"></script><script src="settings.js?v=20260803-1"></script>
</body></html>
