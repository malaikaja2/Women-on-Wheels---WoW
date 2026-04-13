CREATE DATABASE IF NOT EXISTS women_on_wheels_db;
USE women_on_wheels_db;

CREATE TABLE IF NOT EXISTS passengers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,/WomenonWheels/signup.html
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  vehicle_type VARCHAR(50),
  vehicle_number VARCHAR(20),
  cnic VARCHAR(20),
  cnic_upload VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(25) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_emergency_contacts_user (user_id)
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role ENUM('passenger', 'driver') NOT NULL,
  ride_id VARCHAR(64) NULL,
  location TEXT NOT NULL,
  status ENUM('active', 'resolved') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sos_alerts_status_created (status, created_at),
  INDEX idx_sos_alerts_user_role (user_id, role),
  INDEX idx_sos_alerts_role_status_created (role, status, created_at)
);
