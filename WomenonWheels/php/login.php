<?php
session_start();
include 'db.php';

function redirect_login_error($code, $role = 'passenger') {
    $safeRole = $role === 'driver' ? 'driver' : 'passenger';
    header('Location: ../login.html?error=' . urlencode($code) . '&role=' . urlencode($safeRole));
    exit();
}

$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';
$role = $_POST['role'] ?? '';

if ($email === '' || $password === '' || $role === '') {
    redirect_login_error('missing_fields', $role);
}

if (!in_array($role, ['passenger', 'driver'], true)) {
    redirect_login_error('invalid_role', 'passenger');
}

if ($role === 'driver') {
    $stmt = $conn->prepare('SELECT * FROM drivers WHERE email = ? LIMIT 1');
} else {
    $stmt = $conn->prepare('SELECT * FROM passengers WHERE email = ? LIMIT 1');
}

$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result && $result->num_rows > 0) {
    $row = $result->fetch_assoc();
    $validPassword = password_verify($password, $row['password']);

    if ($validPassword) {
        $_SESSION['user_id'] = (int)$row['id'];
        $_SESSION['user_name'] = $row['name'];
        $_SESSION['user_email'] = $row['email'];
        $_SESSION['role'] = $role;
        $redirect = $role === 'driver' ? '../driver-dashboard.html' : '../app-home.html';
        echo "<script>
          localStorage.setItem('wow_logged_in','true');
          localStorage.setItem('wow_user_id'," . json_encode((int)$row['id']) . ");
          localStorage.setItem('wow_user_name'," . json_encode($row['name']) . ");
          localStorage.setItem('wow_user_email'," . json_encode($row['email']) . ");
          localStorage.setItem('wow_user_role'," . json_encode($role) . ");
          const postLogin = localStorage.getItem('wow_post_login_redirect');
          const userRole = " . json_encode($role) . ";
          localStorage.removeItem('wow_post_login_redirect');
          if (postLogin && userRole !== 'driver') {
            window.location.href = postLogin;
          } else {
            window.location.href = " . json_encode($redirect) . ";
          }
        </script>";
        exit();
    }

    redirect_login_error('invalid_credentials', $role);
} else {
    redirect_login_error('invalid_credentials', $role);
}

$conn->close();
?>

