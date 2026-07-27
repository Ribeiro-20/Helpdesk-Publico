CREATE OR REPLACE FUNCTION get_distinct_contract_filters(p_tenant_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'contract_types', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (
        SELECT DISTINCT contract_type AS v
        FROM contracts
        WHERE tenant_id = p_tenant_id
          AND contract_type IS NOT NULL
      ) t
    ),
    'procedure_types', (
      SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
      FROM (
        SELECT DISTINCT procedure_type AS v
        FROM contracts
        WHERE tenant_id = p_tenant_id
          AND procedure_type IS NOT NULL
      ) t
    )
  );
$$;

CREATE OR REPLACE FUNCTION get_contract_kpis(p_tenant_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_contracts', COUNT(*),
    'total_value',     COALESCE(SUM(contract_price) FILTER (WHERE contract_price > 0), 0),
    'avg_value',       AVG(contract_price)           FILTER (WHERE contract_price > 0),
    'max_value',       MAX(contract_price)           FILTER (WHERE contract_price > 0),
    'min_value',       MIN(contract_price)           FILTER (WHERE contract_price > 0),
    'avg_discount_pct', AVG(
      CASE
        WHEN base_price > 0
         AND contract_price IS NOT NULL
         AND contract_price >= 0
         AND contract_price <= base_price
        THEN (1.0 - contract_price / base_price) * 100
      END
    )
  )
  FROM contracts
  WHERE tenant_id = p_tenant_id;
$$;
