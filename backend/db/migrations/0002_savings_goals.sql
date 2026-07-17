-- FFMS savings goals
-- Self-contained table for per-household savings goals. Run once; the
-- CREATE TABLE IF NOT EXISTS guard makes it re-runnable.

CREATE TABLE IF NOT EXISTS savings_goals (
  id             INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id   INT            NOT NULL,
  name           VARCHAR(120)   NOT NULL,
  target_amount  DECIMAL(14, 2) NOT NULL,
  current_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sg_household (household_id),
  CONSTRAINT fk_sg_household FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
