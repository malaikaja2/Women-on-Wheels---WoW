<?php
include 'db.php';

$email = $_POST['email'];
$new_password = $_POST['new_password'];

$sql = "UPDATE users SET password='$new_password' WHERE email='$email'";

if ($conn->query($sql) === TRUE) {
    echo "Password Updated Successfully!";
} else {
    echo "Error updating password.";
}

$conn->close();
?>