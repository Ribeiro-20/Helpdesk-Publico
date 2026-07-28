-- Filter-aware versions of all market analytics RPCs
-- Each function now accepts optional filter params; NULL means "no filter"

CREATE OR REPLACE FUNCTION get_distribution_district(
  p_tenant_id       uuid,
  p_limit           int     DEFAULT 10,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_year            int     DEFAULT NULL,
  p_month           int     DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      split_part(execution_locations->>0, ', ', 2) AS district,
      COUNT(*) AS count,
      COALESCE(SUM(contract_price) FILTER (WHERE contract_price > 0), 0) AS total_value
    FROM contracts
    WHERE tenant_id = p_tenant_id
      AND execution_locations IS NOT NULL
      AND jsonb_array_length(execution_locations) > 0
      AND split_part(execution_locations->>0, ', ', 2) != ''
      AND (p_date_from IS NULL OR COALESCE(signing_date, publication_date) >= p_date_from)
      AND (p_date_to   IS NULL OR COALESCE(signing_date, publication_date) <= p_date_to)
      AND (p_year  IS NULL OR EXTRACT(YEAR  FROM COALESCE(signing_date, publication_date))::int = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM COALESCE(signing_date, publication_date))::int = p_month)
      AND (p_contract_types  IS NULL OR contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND contract_price > 1000000)
        )
      )
    GROUP BY split_part(execution_locations->>0, ', ', 2)
    ORDER BY total_value DESC
    LIMIT p_limit
  ) t;
$$;

CREATE OR REPLACE FUNCTION get_distribution_contract_type(
  p_tenant_id       uuid,
  p_limit           int     DEFAULT 10,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_year            int     DEFAULT NULL,
  p_month           int     DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      COALESCE(contract_type, 'Sem tipo') AS label,
      COUNT(*) AS count,
      COALESCE(SUM(contract_price) FILTER (WHERE contract_price > 0), 0) AS total_value
    FROM contracts
    WHERE tenant_id = p_tenant_id
      AND (p_date_from IS NULL OR COALESCE(signing_date, publication_date) >= p_date_from)
      AND (p_date_to   IS NULL OR COALESCE(signing_date, publication_date) <= p_date_to)
      AND (p_year  IS NULL OR EXTRACT(YEAR  FROM COALESCE(signing_date, publication_date))::int = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM COALESCE(signing_date, publication_date))::int = p_month)
      AND (p_contract_types  IS NULL OR contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND contract_price > 1000000)
        )
      )
    GROUP BY contract_type
    ORDER BY total_value DESC
    LIMIT p_limit
  ) t;
$$;

CREATE OR REPLACE FUNCTION get_contract_kpis(
  p_tenant_id       uuid,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_year            int     DEFAULT NULL,
  p_month           int     DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
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
  WHERE tenant_id = p_tenant_id
    AND (p_date_from IS NULL OR COALESCE(signing_date, publication_date) >= p_date_from)
    AND (p_date_to   IS NULL OR COALESCE(signing_date, publication_date) <= p_date_to)
    AND (p_year  IS NULL OR EXTRACT(YEAR  FROM COALESCE(signing_date, publication_date))::int = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM COALESCE(signing_date, publication_date))::int = p_month)
    AND (p_contract_types  IS NULL OR contract_type  = ANY(p_contract_types))
    AND (p_procedure_types IS NULL OR procedure_type = ANY(p_procedure_types))
    AND (p_cpv_prefix IS NULL OR cpv_main LIKE p_cpv_prefix || '%')
    AND (
      p_value_brackets IS NULL OR (
        ('0-5000'         = ANY(p_value_brackets) AND contract_price <= 5000) OR
        ('5001-25000'     = ANY(p_value_brackets) AND contract_price BETWEEN 5001 AND 25000) OR
        ('25001-75000'    = ANY(p_value_brackets) AND contract_price BETWEEN 25001 AND 75000) OR
        ('75001-200000'   = ANY(p_value_brackets) AND contract_price BETWEEN 75001 AND 200000) OR
        ('200001-1000000' = ANY(p_value_brackets) AND contract_price BETWEEN 200001 AND 1000000) OR
        ('1000001+'       = ANY(p_value_brackets) AND contract_price > 1000000)
      )
    );
$$;

CREATE OR REPLACE FUNCTION get_distribution_procedure(
  p_tenant_id       uuid,
  p_limit           int     DEFAULT 10,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_year            int     DEFAULT NULL,
  p_month           int     DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
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
      AND (p_date_from IS NULL OR COALESCE(signing_date, publication_date) >= p_date_from)
      AND (p_date_to   IS NULL OR COALESCE(signing_date, publication_date) <= p_date_to)
      AND (p_year  IS NULL OR EXTRACT(YEAR  FROM COALESCE(signing_date, publication_date))::int = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM COALESCE(signing_date, publication_date))::int = p_month)
      AND (p_contract_types  IS NULL OR contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND contract_price > 1000000)
        )
      )
    GROUP BY procedure_type
    ORDER BY count DESC
    LIMIT p_limit
  ) t;
$$;

CREATE OR REPLACE FUNCTION get_distribution_cpv(
  p_tenant_id       uuid,
  p_limit           int     DEFAULT 10,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_year            int     DEFAULT NULL,
  p_month           int     DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
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
    WHERE tenant_id = p_tenant_id
      AND cpv_main IS NOT NULL
      AND (p_date_from IS NULL OR COALESCE(signing_date, publication_date) >= p_date_from)
      AND (p_date_to   IS NULL OR COALESCE(signing_date, publication_date) <= p_date_to)
      AND (p_year  IS NULL OR EXTRACT(YEAR  FROM COALESCE(signing_date, publication_date))::int = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM COALESCE(signing_date, publication_date))::int = p_month)
      AND (p_contract_types  IS NULL OR contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND contract_price > 1000000)
        )
      )
    GROUP BY cpv_main
    ORDER BY count DESC
    LIMIT p_limit
  ) t;
$$;

CREATE OR REPLACE FUNCTION get_monthly_operators(
  p_tenant_id       uuid,
  p_months          int     DEFAULT 13,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
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
      AND COALESCE(c.signing_date, c.publication_date) >= COALESCE(
        p_date_from,
        date_trunc('month', CURRENT_DATE - ((p_months - 1) || ' months')::interval)::date
      )
      AND COALESCE(c.signing_date, c.publication_date) <= COALESCE(
        p_date_to,
        (date_trunc('month', CURRENT_DATE + '1 month'::interval) - interval '1 day')::date
      )
      AND (p_contract_types  IS NULL OR c.contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR c.procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR c.cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND c.contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND c.contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND c.contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND c.contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND c.contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND c.contract_price > 1000000)
        )
      )
    GROUP BY date_trunc('month', COALESCE(c.signing_date, c.publication_date))
    ORDER BY 1
  ) t;
$$;

CREATE OR REPLACE FUNCTION get_monthly_entities(
  p_tenant_id       uuid,
  p_months          int     DEFAULT 13,
  p_date_from       date    DEFAULT NULL,
  p_date_to         date    DEFAULT NULL,
  p_contract_types  text[]  DEFAULT NULL,
  p_procedure_types text[]  DEFAULT NULL,
  p_cpv_prefix      text    DEFAULT NULL,
  p_value_brackets  text[]  DEFAULT NULL
)
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
      AND COALESCE(c.signing_date, c.publication_date) >= COALESCE(
        p_date_from,
        date_trunc('month', CURRENT_DATE - ((p_months - 1) || ' months')::interval)::date
      )
      AND COALESCE(c.signing_date, c.publication_date) <= COALESCE(
        p_date_to,
        (date_trunc('month', CURRENT_DATE + '1 month'::interval) - interval '1 day')::date
      )
      AND (p_contract_types  IS NULL OR c.contract_type  = ANY(p_contract_types))
      AND (p_procedure_types IS NULL OR c.procedure_type = ANY(p_procedure_types))
      AND (p_cpv_prefix IS NULL OR c.cpv_main LIKE p_cpv_prefix || '%')
      AND (
        p_value_brackets IS NULL OR (
          ('0-5000'         = ANY(p_value_brackets) AND c.contract_price <= 5000) OR
          ('5001-25000'     = ANY(p_value_brackets) AND c.contract_price BETWEEN 5001 AND 25000) OR
          ('25001-75000'    = ANY(p_value_brackets) AND c.contract_price BETWEEN 25001 AND 75000) OR
          ('75001-200000'   = ANY(p_value_brackets) AND c.contract_price BETWEEN 75001 AND 200000) OR
          ('200001-1000000' = ANY(p_value_brackets) AND c.contract_price BETWEEN 200001 AND 1000000) OR
          ('1000001+'       = ANY(p_value_brackets) AND c.contract_price > 1000000)
        )
      )
    GROUP BY date_trunc('month', COALESCE(c.signing_date, c.publication_date))
    ORDER BY 1
  ) t;
$$;
