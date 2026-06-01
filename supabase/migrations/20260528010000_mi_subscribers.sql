-- ============================================================
-- MI Subscribers & Contract Notifications
-- ============================================================

-- Subscritores do Market Intelligence
CREATE TABLE IF NOT EXISTS mi_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  cpv_filter TEXT,                              -- CPV prefix filter (opcional)
  min_progress NUMERIC(4,2) NOT NULL DEFAULT 0.75,  -- threshold mínimo de progresso
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notificações de contratos MI (deduplicação: 1 email por contrato por subscritor)
CREATE TABLE IF NOT EXISTS mi_contract_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES mi_subscribers(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  progress_at_send NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscriber_id, contract_id)
);

CREATE INDEX IF NOT EXISTS mi_cn_status_idx ON mi_contract_notifications(status);
CREATE INDEX IF NOT EXISTS mi_cn_subscriber_idx ON mi_contract_notifications(subscriber_id);

-- Seed test subscriber
INSERT INTO mi_subscribers (email, name, is_active, min_progress)
VALUES ('silviomorg19@gmail.com', 'Silvio (Test)', true, 0.75)
ON CONFLICT (email) DO NOTHING;
