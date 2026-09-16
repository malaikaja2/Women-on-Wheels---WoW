<?php
declare(strict_types=1);session_start();require_once __DIR__.'/db.php';require_once __DIR__.'/auth_audit_service.php';header('Content-Type: application/json; charset=utf-8');
$input=json_decode((string)file_get_contents('php://input'),true);if(!is_array($input))$input=$_POST;$email=strtolower(trim((string)($input['email']??'')));$source=wow_auth_audit_source((string)($input['sourcePlatform']??''));$role=strtolower(trim((string)($input['role']??'unknown')));$generic='If an account exists for this email, password reset instructions have been sent.';
if(!filter_var($email,FILTER_VALIDATE_EMAIL)){http_response_code(422);echo json_encode(['ok'=>false,'message'=>'Please enter a valid email address.']);exit;}
$last=(int)($_SESSION['wow_reset_last']??0);if(time()-$last<10){echo json_encode(['ok'=>true,'message'=>$generic]);exit;}$_SESSION['wow_reset_last']=time();
wow_auth_audit_log(['email'=>$email,'role'=>$role,'eventType'=>'password_reset_requested','status'=>'pending','sourcePlatform'=>$source,'authProvider'=>'password']);
try{wow_auth_send_password_reset($email);wow_auth_audit_log(['email'=>$email,'role'=>$role,'eventType'=>'password_reset_email_sent','status'=>'successful','sourcePlatform'=>$source,'authProvider'=>'password']);}catch(Throwable$e){error_log('Password reset request failed: '.$e->getMessage());wow_auth_audit_log(['email'=>$email,'role'=>$role,'eventType'=>'password_reset_failed','status'=>'failed','sourcePlatform'=>$source,'authProvider'=>'password','failureReasonCode'=>wow_auth_failure_code($e)]);}
echo json_encode(['ok'=>true,'message'=>$generic]);
