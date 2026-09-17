begin;

-- Dedicated service-role export RPC. The HTTP route authenticates a backoffice
-- user, applies the shared atomic rate limit, and passes only that user's tenant.
create or replace function public.export_contracts_v1(
  p_tenant_id uuid,
  p_entity text default null,
  p_winner text default null,
  p_cpv text default null,
  p_procedure text default null,
  p_min_value numeric default null,
  p_max_value numeric default null,
  p_from_date date default null,
  p_to_date date default null,
  p_sort text default 'signing_date',
  p_limit integer default 5001
)
returns table(rows jsonb, has_more boolean)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
set statement_timeout = '30s'
set plan_cache_mode = 'force_custom_plan'
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_limit integer := least(greatest(coalesce(p_limit, 5001), 1), 5001);
begin
  if p_tenant_id is null then
    raise exception 'tenant required' using errcode = '22023';
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
     where c.tenant_id = p_tenant_id
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
     limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(to_jsonb(page_rows) - 'page_ordinal' order by page_ordinal), '[]'::jsonb),
    (select count(*) > v_limit from filtered)
  into v_rows, v_has_more
  from (select * from filtered order by page_ordinal limit v_limit) page_rows;

  return query select v_rows, v_has_more;
end;
$$;

revoke execute on function public.export_contracts_v1(uuid,text,text,text,text,numeric,numeric,date,date,text,integer) from public, anon, authenticated;
grant execute on function public.export_contracts_v1(uuid,text,text,text,text,numeric,numeric,date,date,text,integer) to service_role;

commit;
