begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

-- Pin planning for this RPC only. Generic plans cannot simplify the parameterized
-- sort/filter CASE expressions and can exceed the authenticated caller's budget.
-- No rows, privileges, query predicates or timeouts are changed.
do $$
begin
  if md5(pg_get_functiondef('public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)'::regprocedure))
    is distinct from '2f1a34693cbf3c858b6c027da415adc3' then
    raise exception 'unexpected search_contracts_v2 baseline; do not apply';
  end if;
end;
$$;

alter function public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)
  set plan_cache_mode = 'force_custom_plan';

commit;
