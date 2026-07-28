-- FFMS debts & loans tracking
-- Per-household debt/loan records with payment tracking and amortization support.
-- Self-contained; CREATE TABLE IF NOT EXISTS guards make it re-runnable.
--
-- type:  'DEBT' = money owed BY the household (nợ phải trả)
--        'LOAN' = money lent TO others (tiền cho vay)
-- payment_frequency: MONTHLY | QUARTERLY | ONE_TIME
-- status: ACTIVE | PAID | OVERDUE

CREATE TABLE IF NOT EXISTS debts_loans (
  id                INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id      INT            NOT NULL,
  `type`            VARCHAR(10)    NOT NULL COMMENT 'DEBT or LOAN',
  title             VARCHAR(200)   NOT NULL,
  total_amount      DECIMAL(14, 2) NOT NULL,
  remaining_amount  DECIMAL(14, 2) NOT NULL,
  interest_rate     FLOAT          NOT NULL DEFAULT 0 COMMENT 'Annual interest rate (%)',
  interest_type     VARCHAR(20)    NOT NULL DEFAULT 'REDUCING_BALANCE'
                    COMMENT 'REDUCING_BALANCE or FLAT (dư nợ giảm dần / dư nợ ban đầu)',
  start_date        DATE           NOT NULL,
  due_date          DATE           NOT NULL,
  payment_frequency ENUM('MONTHLY','QUARTERLY','ONE_TIME') NOT NULL DEFAULT 'MONTHLY',
  status            ENUM('ACTIVE','PAID','OVERDUE') NOT NULL DEFAULT 'ACTIVE',
  notes             TEXT           NULL,
  created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dl_household (household_id),
  INDEX idx_dl_status (household_id, status),
  INDEX idx_dl_due_date (due_date),
  CONSTRAINT fk_dl_household FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Individual payment records against a debt/loan
CREATE TABLE IF NOT EXISTS debt_payments (
  id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  debt_id       INT            NOT NULL,
  amount_paid   DECIMAL(14, 2) NOT NULL,
  payment_date  DATE           NOT NULL,
  notes         VARCHAR(500)   NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dp_debt (debt_id),
  INDEX idx_dp_date (debt_id, payment_date),
  CONSTRAINT fk_dp_debt FOREIGN KEY (debt_id)
    REFERENCES debts_loans (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Notification helper: a view that surfaces debts due within 3 days
-- (used by the notification worker / on-login check; optional)
CREATE OR REPLACE VIEW v_debts_due_soon AS
SELECT
  dl.id               AS debt_id,
  dl.household_id,
  dl.title,
  dl.remaining_amount,
  dl.due_date,
  dl.payment_frequency,
  DATEDIFF(dl.due_date, CURDATE()) AS days_until_due
FROM debts_loans dl
WHERE dl.status = 'ACTIVE'
  AND dl.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY);