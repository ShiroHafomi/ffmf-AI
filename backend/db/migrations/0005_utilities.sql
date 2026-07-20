-- FFMS utilities (meter readings)
-- Per-household utility meter readings (electricity, water, gas, ...).
-- `value` is the usage in the utility's native unit; cost is derived from a
-- per-type rate at read time (see utilityService.UTILITY_RATES).
-- Self-contained; the CREATE TABLE IF NOT EXISTS guard makes it re-runnable.

CREATE TABLE IF NOT EXISTS utility_readings (
  id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id  INT            NOT NULL,
  type          VARCHAR(40)    NOT NULL,
  value         DECIMAL(14, 2) NOT NULL,
  reading_date  DATE           NOT NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_util_household (household_id),
  INDEX idx_util_type_date (household_id, type, reading_date),
  CONSTRAINT fk_util_household FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
