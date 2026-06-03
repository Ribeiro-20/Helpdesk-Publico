CREATE OR REPLACE FUNCTION get_high_progress_contracts(min_pct numeric, max_pct numeric)
RETURNS TABLE (
  id uuid,
  object text,
  contracting_entities jsonb,
  winners jsonb,
  signing_date date,
  execution_deadline_days integer,
  contract_price numeric,
  cpv_main text,
  progress numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.object,
    c.contracting_entities,
    c.winners,
    c.signing_date,
    c.execution_deadline_days,
    c.contract_price,
    c.cpv_main,
    ROUND((EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric / c.execution_deadline_days::numeric), 4) as progress
  FROM contracts c
  WHERE 
    c.status = 'active'
    AND c.signing_date IS NOT NULL
    AND c.execution_deadline_days IS NOT NULL
    AND c.execution_deadline_days > 0
    AND (EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric / c.execution_deadline_days::numeric) >= min_pct
    AND (EXTRACT(DAY FROM (CURRENT_DATE::timestamp - c.signing_date::timestamp))::numeric / c.execution_deadline_days::numeric) < max_pct;
END;
$$;
