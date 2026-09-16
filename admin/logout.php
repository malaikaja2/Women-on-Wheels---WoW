<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once dirname(__DIR__) . '/php/auth_audit_service.php';

$auditAdmin=$_SESSION['admin_auth']??[];if($auditAdmin)wow_auth_audit_log(['userId'=>(string)($auditAdmin['uid']??$auditAdmin['id']??''),'email'=>(string)($auditAdmin['email']??''),'role'=>'admin','eventType'=>'logout','status'=>'successful','sourcePlatform'=>'admin_website']);
admin_logout_and_destroy_session();
header('Location: login.php?logout=success');
exit();






