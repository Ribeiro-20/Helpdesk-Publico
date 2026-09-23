begin;

drop function if exists public.search_public_contract_pages(
  uuid,text,text,text,text[],text[],text,text,text,numeric,numeric,date,date,text,text,integer,integer
);

commit;
