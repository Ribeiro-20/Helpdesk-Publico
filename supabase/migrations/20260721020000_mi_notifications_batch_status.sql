-- ============================================================
-- MI Contract Notifications: expand status check constraint
-- Adds PENDING_MORNING and PENDING_EVENING for split-batch sending
-- ============================================================

ALTER TABLE mi_contract_notifications
  DROP CONSTRAINT IF EXISTS mi_contract_notifications_status_check;

ALTER TABLE mi_contract_notifications
  ADD CONSTRAINT mi_contract_notifications_status_check
  CHECK (status IN ('PENDING', 'PENDING_MORNING', 'PENDING_EVENING', 'SENT', 'FAILED'));
