CREATE TABLE IF NOT EXISTS fare_training_data (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  pickup_lat DECIMAL(10,7) NULL,
  pickup_lng DECIMAL(10,7) NULL,
  drop_lat DECIMAL(10,7) NULL,
  drop_lng DECIMAL(10,7) NULL,
  distance_km DECIMAL(8,3) NOT NULL,
  duration_min DECIMAL(8,2) NOT NULL,
  vehicle_type VARCHAR(20) NOT NULL,
  traffic_level VARCHAR(10) NOT NULL,
  time_of_day VARCHAR(10) NOT NULL,
  fare DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fare_created_at (created_at),
  INDEX idx_fare_vehicle_time (vehicle_type, traffic_level, time_of_day),
  INDEX idx_fare_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

