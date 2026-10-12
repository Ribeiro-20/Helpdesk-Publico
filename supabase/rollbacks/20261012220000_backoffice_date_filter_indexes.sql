begin;
set local lock_timeout='3s';
set local statement_timeout='8s';
do $guard$ begin
  if md5(pg_get_functiondef('public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)'::regprocedure)) is distinct from '87be339e0b57b613cb0f7fbfdab967f5' then
    raise exception 'Unexpected search_contracts_v2 baseline; refusing date-filter change';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.search_contracts_v2(p_entity text DEFAULT NULL::text, p_winner text DEFAULT NULL::text, p_cpv text DEFAULT NULL::text, p_procedure text DEFAULT NULL::text, p_min_value numeric DEFAULT NULL::numeric, p_max_value numeric DEFAULT NULL::numeric, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_sort text DEFAULT 'signing_date'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS TABLE(rows jsonb, total_count bigint, has_more boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_total_count bigint := null;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000000);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_has_filters boolean :=
    p_entity is not null or p_winner is not null or p_cpv is not null or
    p_procedure is not null or p_min_value is not null or p_max_value is not null or
    p_from_date is not null or p_to_date is not null;
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not v_has_filters then
    select c.total_count into v_total_count
      from public.contract_tenant_counts c
     where c.tenant_id = v_tenant_id;
    v_total_count := coalesce(v_total_count, 0);
  end if;

  with filtered as materialized (
    select c.id, c.base_contract_id, c.object, c.procedure_type,
           c.publication_date, c.signing_date, c.cpv_main, c.contract_price,
           c.base_price, c.effective_price, c.currency, c.status,
           c.contracting_entities, c.winners,
           row_number() over (order by
             case when p_sort = 'signing_date' then coalesce(c.signing_date, c.publication_date) end desc nulls last,
             case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
             case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
             case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
             c.publication_date desc nulls last,
             c.id desc
           ) as page_ordinal
      from public.contracts c
     where c.tenant_id = v_tenant_id
       and (
         p_entity is null or
         case when p_entity ~ '^\d{9}$'
           then c.contracting_entities @> jsonb_build_array(jsonb_build_object('nif', p_entity))
           else c.contracting_entities::text ilike '%' || p_entity || '%'
         end
       )
       and (
         p_winner is null or
         case when p_winner ~ '^\d{9}$'
           then c.winners @> jsonb_build_array(jsonb_build_object('nif', p_winner))
           else c.winners::text ilike '%' || p_winner || '%'
         end
       )
       and (p_cpv is null or c.cpv_main like p_cpv || '%')
       and (p_procedure is null or c.procedure_type ilike '%' || p_procedure || '%')
       and (p_min_value is null or c.contract_price >= p_min_value)
       and (p_max_value is null or c.contract_price <= p_max_value)
       and (p_from_date is null or coalesce(c.signing_date, c.publication_date) >= p_from_date)
       and (p_to_date is null or coalesce(c.signing_date, c.publication_date) <= p_to_date)
     order by
       case when p_sort = 'signing_date' then coalesce(c.signing_date, c.publication_date) end desc nulls last,
       case when p_sort = 'publication_date' then c.publication_date end desc nulls last,
       case when p_sort = 'value_desc' then c.contract_price end desc nulls last,
       case when p_sort = 'value_asc' then c.contract_price end asc nulls last,
       c.publication_date desc nulls last,
       c.id desc
     offset v_offset
     limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(to_jsonb(page_rows) - 'page_ordinal' order by page_ordinal), '[]'::jsonb),
    (select count(*) > v_limit from filtered)
  into v_rows, v_has_more
  from (select * from filtered order by page_ordinal limit v_limit) page_rows;

  return query select v_rows, v_total_count, v_has_more;
end;
$function$
;

do $verify$ begin
  if md5(pg_get_functiondef('public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)'::regprocedure)) is distinct from '7b42204ff34d8861253a9540de9de48b' then
    raise exception 'Date-filter function verification failed';
  end if;
end $verify$;
commit;
