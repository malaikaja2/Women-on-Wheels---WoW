USE women_on_wheels_db;

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
