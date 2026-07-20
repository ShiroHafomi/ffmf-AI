-- FFMS notifications
-- Per-user in-app notifications (admin-sent, e.g. budget alerts, reminders).
-- Self-contained; the CREATE TABLE IF NOT EXISTS guard makes it re-runnable.

CREATE TABLE IF NOT EXISTS notifications (
  id         INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    INT            NOT NULL,
  message    VARCHAR(500)   NOT NULL,
  is_read    TINYINT(1)     NOT NULL DEFAULT 0,
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id),
  INDEX idx_notif_unread (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
