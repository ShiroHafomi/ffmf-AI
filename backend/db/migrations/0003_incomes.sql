-- FFMS incomes
-- Per-household income entries (salary, allowance, side income, ...).
-- Self-contained; the CREATE TABLE IF NOT EXISTS guard makes it re-runnable.

CREATE TABLE IF NOT EXISTS incomes (
  id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id  INT            NOT NULL,
  user_id       INT            NULL,
  amount        DECIMAL(14, 2) NOT NULL,
  source        VARCHAR(120)   NULL,
  income_date   DATE           NOT NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inc_household (household_id),
  INDEX idx_inc_date (household_id, income_date),
  CONSTRAINT fk_inc_household FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE CASCADE,
  CONSTRAINT fk_inc_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
