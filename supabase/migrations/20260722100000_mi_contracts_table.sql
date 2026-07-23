-- ============================================================
-- Migration: create mi_contracts table
-- Market Intelligence — tabela de contratos 75%-100%
-- Criada e populada automaticamente pelo cron das 02:00
-- ============================================================

CREATE TABLE IF NOT EXISTS mi_contracts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id             UUID NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  object                  TEXT,
  contracting_entities    JSONB,
  winners                 JSONB,
  contract_price          NUMERIC,
  signing_date            DATE,
  execution_deadline_days INTEGER,
  cpv_main                TEXT,
  progress                NUMERIC(5,4),        -- ex: 0.8523 = 85.23%
  reached_100_at          TIMESTAMPTZ,         -- quando o contrato atingiu 100% (para contar os 30 dias)
  ingested_at             TIMESTAMPTZ,         -- created_at original da tabela contracts (Projecto C)
  last_updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance nas queries da página MI e dos emails
CREATE INDEX IF NOT EXISTS idx_mi_contracts_progress
  ON mi_contracts (progress);

CREATE INDEX IF NOT EXISTS idx_mi_contracts_cpv
  ON mi_contracts (cpv_main);

CREATE INDEX IF NOT EXISTS idx_mi_contracts_ingested
  ON mi_contracts (ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_mi_contracts_reached_100
  ON mi_contracts (reached_100_at)
  WHERE reached_100_at IS NOT NULL;

-- ============================================================
-- Popular tabela com contratos actuais 75%-100%
-- Exclui contratos que estão a 100% há mais de 30 dias
-- ============================================================

INSERT INTO mi_contracts (
  contract_id,
  object,
  contracting_entities,
  winners,
  contract_price,
  signing_date,
  execution_deadline_days,
  cpv_main,
  progress,
  reached_100_at,
  ingested_at,
  last_updated_at
)
SELECT
  c.id                          AS contract_id,
  c.object,
  c.contracting_entities,
  c.winners,
  c.contract_price,
  c.signing_date,
  c.execution_deadline_days,
  c.cpv_main,
  -- Progresso calculado (máximo 1.0)
  LEAST(
    ROUND(
      EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
      / c.execution_deadline_days::numeric,
      4
    ),
    1.0000
  )                             AS progress,
  -- reached_100_at: data calculada de conclusão do contrato (só preenchida se já atingiu 100%)
  CASE
    WHEN EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
         >= c.execution_deadline_days::numeric
    THEN (c.signing_date + (c.execution_deadline_days || ' days')::interval)
    ELSE NULL
  END                           AS reached_100_at,
  c.created_at                  AS ingested_at,
  now()                         AS last_updated_at
FROM contracts c
WHERE
  c.status = 'active'
  AND c.signing_date IS NOT NULL
  AND c.execution_deadline_days IS NOT NULL
  AND c.execution_deadline_days > 0
  -- Progresso >= 75%
  AND EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
      / c.execution_deadline_days::numeric >= 0.75
  -- Excluir contratos a 100% há mais de 30 dias
  AND NOT (
    EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
      >= c.execution_deadline_days::numeric
    AND (c.signing_date + (c.execution_deadline_days || ' days')::interval)
      < (now() - interval '30 days')
  )
ON CONFLICT (contract_id) DO UPDATE SET
  progress        = EXCLUDED.progress,
  reached_100_at  = COALESCE(mi_contracts.reached_100_at, EXCLUDED.reached_100_at),
  last_updated_at = now();

-- Resultado: quantos contratos foram inseridos
SELECT
  COUNT(*)                                          AS total_mi_contracts,
  COUNT(*) FILTER (WHERE progress < 1.0)            AS em_progresso,
  COUNT(*) FILTER (WHERE progress >= 1.0)           AS concluidos_ultimos_30_dias
FROM mi_contracts;
