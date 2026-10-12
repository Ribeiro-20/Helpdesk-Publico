begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

alter function public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)
  reset plan_cache_mode;

-- Refuse to commit rollback if anything besides our setting has drifted.
do $$
begin
  if md5(pg_get_functiondef('public.search_contracts_v2(text,text,text,text,numeric,numeric,date,date,text,integer,integer)'::regprocedure))
    is distinct from '2f1a34693cbf3c858b6c027da415adc3' then
    raise exception 'search_contracts_v2 rollback did not restore the exact baseline';
  end if;
end;
$$;

commit;
