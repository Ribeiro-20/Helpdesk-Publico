begin;

-- Deploy the previous application route before this rollback so it does not
-- call a function that no longer exists.
drop function if exists public.export_contracts_v1(
  uuid,text,text,text,text,numeric,numeric,date,date,text,integer
);

commit;
