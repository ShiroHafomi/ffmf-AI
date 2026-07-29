-- FFMS Blocklist — admin-controlled user blocking
-- Admins can block users to prevent login. Blocked users remain in the DB
-- but cannot authenticate. The block is reversible (is_active flag).
--
-- Idempotent & re-runnable.

CREATE TABLE IF NOT EXISTS user_blocklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  blocked_by INT NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_by) REFERENCES users(id),
  UNIQUE KEY uq_blocked_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;