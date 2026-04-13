USE women_on_wheels_db;

ALTER TABLE sos_alerts
  ADD INDEX idx_sos_alerts_role_status_created (role, status, created_at);
