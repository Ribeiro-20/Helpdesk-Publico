-- Monthly evolution: unique economic operators (winners) per month
CREATE OR REPLACE FUNCTION get_monthly_operators(p_tenant_id uuid, p_months int DEFAULT 13)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month), '[]'::json)
  FROM (
    SELECT
      to_char(date_trunc('month', COALESCE(c.signing_date, c.publication_date)), 'YYYY-MM') AS month,
      COUNT(DISTINCT winner_entry) AS unique_operators
    FROM contracts c,
    LATERAL jsonb_array_elements_text(c.winners) AS winner_entry
    WHERE c.tenant_id = p_tenant_id
      AND COALESCE(c.signing_date, c.publication_date) >= date_trunc('month', CURRENT_DATE - ((p_months - 1) || ' months')::interval)
      AND COALESCE(c.signing_date, c.publication_date) < date_trunc('month', CURRENT_DATE + '1 month'::interval)
    GROUP BY date_trunc('month', COALESCE(c.signing_date, c.publication_date))
    ORDER BY 1
  ) t;
$$;

-- Monthly evolution: unique contracting entities per month
CREATE OR REPLACE FUNCTION get_monthly_entities(p_tenant_id uuid, p_months int DEFAULT 13)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month), '[]'::json)
  FROM (
    SELECT
      to_char(date_trunc('month', COALESCE(c.signing_date, c.publication_date)), 'YYYY-MM') AS month,
      COUNT(DISTINCT entity_entry) AS unique_entities
    FROM contracts c,
    LATERAL jsonb_array_elements_text(c.contracting_entities) AS entity_entry
    WHERE c.tenant_id = p_tenant_id
      AND COALESCE(c.signing_date, c.publication_date) >= date_trunc('month', CURRENT_DATE - ((p_months - 1) || ' months')::interval)
      AND COALESCE(c.signing_date, c.publication_date) < date_trunc('month', CURRENT_DATE + '1 month'::interval)
    GROUP BY date_trunc('month', COALESCE(c.signing_date, c.publication_date))
    ORDER BY 1
  ) t;
$$;

-- Distribution by procedure type
CREATE OR REPLACE FUNCTION get_distribution_procedure(p_tenant_id uuid, p_limit int DEFAULT 10)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      COALESCE(procedure_type, 'Sem tipo') AS label,
      COUNT(*) AS count,
      COALESCE(SUM(contract_price) FILTER (WHERE contract_price > 0), 0) AS total_value
    FROM contracts
    WHERE tenant_id = p_tenant_id
    GROUP BY procedure_type
    ORDER BY count DESC
    LIMIT p_limit
  ) t;
$$;

-- Distribution by CPV (top N by count)
CREATE OR REPLACE FUNCTION get_distribution_cpv(p_tenant_id uuid, p_limit int DEFAULT 10)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      cpv_main AS cpv,
      COUNT(*) AS count,
      COALESCE(SUM(contract_price) FILTER (WHERE contract_price > 0), 0) AS total_value
    FROM contracts
    WHERE tenant_id = p_tenant_id AND cpv_main IS NOT NULL
    GROUP BY cpv_main
    ORDER BY count DESC
    LIMIT p_limit
  ) t;
$$;
