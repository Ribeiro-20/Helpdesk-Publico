-- ============================================================
-- Migration: criar função refresh_mi_contracts()
-- Faz o refresh da tabela mi_contracts num único INSERT SQL
-- sem transferir dados para Node.js (muito mais rápido)
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_mi_contracts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted  int := 0;
  v_purged    int := 0;
  v_cutoff    timestamptz := now() - interval '30 days';
BEGIN
  -- 1. Inserir contratos novos (75-100%) que ainda não existem em mi_contracts
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
    c.id,
    c.object,
    c.contracting_entities,
    c.winners,
    c.contract_price,
    c.signing_date,
    c.execution_deadline_days,
    c.cpv_main,
    LEAST(
      ROUND(
        EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
        / c.execution_deadline_days::numeric,
        4
      ),
      1.0000
    ) AS progress,
    CASE
      WHEN EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
           >= c.execution_deadline_days::numeric
      THEN (c.signing_date + (c.execution_deadline_days || ' days')::interval)
      ELSE NULL
    END AS reached_100_at,
    now() AS ingested_at,
    now() AS last_updated_at
  FROM contracts c
  LEFT JOIN mi_contracts mc ON mc.contract_id = c.id
  WHERE
    mc.contract_id IS NULL   -- só contratos novos
    AND c.status = 'active'
    AND c.signing_date IS NOT NULL
    AND c.execution_deadline_days IS NOT NULL
    AND c.execution_deadline_days > 0
    AND EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
        / c.execution_deadline_days::numeric >= 0.75
    -- Excluir contratos que já estão a 100% há mais de 30 dias
    AND NOT (
      EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric
        >= c.execution_deadline_days::numeric
      AND (c.signing_date + (c.execution_deadline_days || ' days')::interval) < v_cutoff
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 2. Purgar contratos que atingiram 100% há mais de 30 dias
  DELETE FROM mi_contracts
  WHERE reached_100_at IS NOT NULL
    AND reached_100_at < v_cutoff;

  GET DIAGNOSTICS v_purged = ROW_COUNT;

  RETURN json_build_object(
    'ok',       true,
    'inserted', v_inserted,
    'purged',   v_purged,
    'ts',       now()
  );
END;
$$;
