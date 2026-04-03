ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE billing_audit_logs
  DROP CONSTRAINT IF EXISTS billing_audit_logs_action_check;

ALTER TABLE billing_audit_logs
  ADD CONSTRAINT billing_audit_logs_action_check CHECK (
    action IN (
      'invoice_created',
      'invoice_updated',
      'invoice_issued',
      'payment_recorded',
      'payment_refunded',
      'invoice_marked_paid',
      'invoice_deleted'
    )
  );
