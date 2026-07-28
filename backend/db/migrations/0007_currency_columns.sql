-- FFMS multi-currency support
-- Adds a `currency` column to expense, income, and savings-goal tables so each
-- entry can be recorded in its native currency. The default is 'VND' (Vietnamese
-- đồng), matching the existing convention where all amounts are implicitly VND.
-- Self-contained & re-runnable: uses a conditional ALTER TABLE via a stored
-- procedure that checks for the column first.

DROP PROCEDURE IF EXISTS apply_currency_columns;
DELIMITER //
CREATE PROCEDURE apply_currency_columns()
BEGIN
  -- expenses
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'expenses'
      AND COLUMN_NAME = 'currency'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'VND'
      COMMENT 'ISO 4217 currency code (VND, USD, EUR, JPY, ...)';
  END IF;

  -- incomes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'incomes'
      AND COLUMN_NAME = 'currency'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    ALTER TABLE incomes
      ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'VND'
      COMMENT 'ISO 4217 currency code (VND, USD, EUR, JPY, ...)';
  END IF;

  -- savings_goals (both target and current amounts share the same currency)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'savings_goals'
      AND COLUMN_NAME = 'currency'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    ALTER TABLE savings_goals
      ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'VND'
      COMMENT 'ISO 4217 currency code (VND, USD, EUR, JPY, ...)';
  END IF;

  -- debts_loans (if created by 0006)
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_NAME = 'debts_loans'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_NAME = 'debts_loans'
        AND COLUMN_NAME = 'currency'
        AND TABLE_SCHEMA = DATABASE()
    ) THEN
      ALTER TABLE debts_loans
        ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'VND'
        COMMENT 'ISO 4217 currency code (VND, USD, EUR, JPY, ...)';
    END IF;
  END IF;
END //
DELIMITER ;
CALL apply_currency_columns();
DROP PROCEDURE IF EXISTS apply_currency_columns;