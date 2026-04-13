<?php
session_start(); include 'db.php';
function se($e,$r='passenger'){ $rr=$r==='driver'?'driver':'passenger'; header('Location: ../signup.html?error='.urlencode($e).'&role='.urlencode($rr)); exit(); }
function strong($p){ return preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$/',$p)===1; }
$role=$_POST['role']??''; $name=trim($_POST['name']??''); $email=trim($_POST['email']??''); $phone=trim($_POST['phone']??''); $password=$_POST['password']??''; $confirm=$_POST['confirm_password']??'';
if(!in_array($role,['passenger','driver'],true)) se('invalid_role');
if($name===''||$email===''||$phone===''||$password===''||$confirm==='') se('missing_fields',$role);
if($password!==$confirm) se('password_mismatch',$role);
if(!strong($password)) se('weak_password',$role);
if(!filter_var($email,FILTER_VALIDATE_EMAIL)) se('missing_fields',$role);
$hash=password_hash($password,PASSWORD_BCRYPT);
if($role==='driver'){
  $vt=trim($_POST['vehicle_type']??''); $vn=trim($_POST['vehicle_number']??''); $cnic=trim($_POST['cnic']??'');
  if($vt===''||$vn===''||$cnic==='') se('missing_fields',$role);
  if(!preg_match('/^\\d{5}-\\d{7}-\\d{1}$/',$cnic)) se('invalid_cnic',$role);
  $chk=$conn->prepare('SELECT id FROM drivers WHERE email=? LIMIT 1'); $chk->bind_param('s',$email); $chk->execute(); $ex=$chk->get_result(); if($ex&&$ex->num_rows>0) se('email_exists',$role);
  if(!isset($_FILES['cnic_upload'])||$_FILES['cnic_upload']['error']!==0) se('cnic_upload_required',$role);
  $allowed=['jpg','jpeg','png','pdf']; $ext=strtolower(pathinfo($_FILES['cnic_upload']['name'],PATHINFO_EXTENSION)); if(!in_array($ext,$allowed,true)) se('invalid_file_type',$role);
  $filename=uniqid('cnic_',true).'.'.$ext; $target=__DIR__.'/uploads/'.$filename; if(!move_uploaded_file($_FILES['cnic_upload']['tmp_name'],$target)) se('cnic_upload_failed',$role);
  $up='uploads/'.$filename; $stmt=$conn->prepare('INSERT INTO drivers (name,email,password,phone,vehicle_type,vehicle_number,cnic,cnic_upload) VALUES (?,?,?,?,?,?,?,?)');
  $stmt->bind_param('ssssssss',$name,$email,$hash,$phone,$vt,$vn,$cnic,$up);
}else{
  $chk=$conn->prepare('SELECT id FROM passengers WHERE email=? LIMIT 1'); $chk->bind_param('s',$email); $chk->execute(); $ex=$chk->get_result(); if($ex&&$ex->num_rows>0) se('email_exists',$role);
  $stmt=$conn->prepare('INSERT INTO passengers (name,email,password,phone) VALUES (?,?,?,?)'); $stmt->bind_param('ssss',$name,$email,$hash,$phone);
}
if($stmt->execute()){ $_SESSION['user_name']=$name; $_SESSION['role']=$role; header('Location: ../login.html?signup=success&role='.urlencode($role)); exit(); }
if($conn->errno===1062) se('email_exists',$role); se('missing_fields',$role);
?>

