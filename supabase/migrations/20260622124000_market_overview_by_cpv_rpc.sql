-- RPC para agregação da visão geral de mercado por CPV.
-- Evita varrer todos os contratos no servidor web.

create or replace function market_overview_by_cpv(
  p_tenant_id uuid,
  p_limit int default null
)
returns table (
  cpv_code text,
  contracts bigint,
  total_value numeric,
  avg_contract_value numeric,
  avg_discount_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      upper(trim(split_part(c.cpv_main, ' - ', 1))) as cpv_code,
      c.contract_price,
      c.base_price
    from contracts c
    where c.tenant_id = p_tenant_id
      and c.cpv_main is not null
      and btrim(c.cpv_main) <> ''
  ),
  agg as (
    select
      n.cpv_code,
      count(*)::bigint as contracts,
      coalesce(sum(coalesce(n.contract_price, 0)), 0)::numeric as total_value,
      avg(n.contract_price)::numeric as avg_contract_value,
      avg(
        case
          when n.contract_price is not null and n.base_price is not null and n.base_price > 0
            then (1 - n.contract_price / n.base_price) * 100
          else null
        end
      )::numeric as avg_discount_pct
    from normalized n
    where n.cpv_code <> ''
    group by n.cpv_code
  )
  select
    a.cpv_code,
    a.contracts,
    a.total_value,
    a.avg_contract_value,
    a.avg_discount_pct
  from agg a
  order by a.contracts desc, a.total_value desc
  limit p_limit;
$$;
