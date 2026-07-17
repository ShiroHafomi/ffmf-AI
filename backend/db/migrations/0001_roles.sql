-- FFMS RBAC migration — role decentralization
-- admin (global) -> household(owner) -> parent -> child
--
-- Idempotent & re-runnable. Normalizes legacy role values, then constrains
-- household_members.role to the supported set and adds a lookup index.

-- 1) Normalize legacy values to the new lowercase scheme.
--    'Owner'  -> 'owner'   (household head)
--    'Member' -> 'parent'  (full member; preserves prior capabilities)
UPDATE household_members SET role = 'owner'  WHERE role = 'Owner';
UPDATE household_members SET role = 'parent' WHERE role = 'Member';

-- 2) Apply constraint + index only if they don't already exist.
DROP PROCEDURE IF EXISTS apply_rbac_migration;
DELIMITER //
CREATE PROCEDURE apply_rbac_migration()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'chk_hm_role'
      AND TABLE_NAME = 'household_members'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    ALTER TABLE household_members
      ADD CONSTRAINT chk_hm_role
      CHECK (role IS NULL OR role IN ('owner', 'parent', 'child'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE INDEX_NAME = 'idx_hm_user_household'
      AND TABLE_NAME = 'household_members'
      AND TABLE_SCHEMA = DATABASE()
  ) THEN
    CREATE INDEX idx_hm_user_household
      ON household_members (user_id, household_id);
  END IF;
END //
DELIMITER ;
CALL apply_rbac_migration();
DROP PROCEDURE IF EXISTS apply_rbac_migration;

-- 3) Promote the first admin manually (replace <id> with a real user id):
--    UPDATE users SET role_id = 1 WHERE id = <id>;
--    role_id convention: 1 = ADMIN (global superuser), 3 = MEMBER (default).
