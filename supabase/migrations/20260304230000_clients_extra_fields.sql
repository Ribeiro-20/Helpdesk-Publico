alter table clients
  add column if not exists company_name text,
  add column if not exists contact_name text,
  add column if not exists phone        text;

-- backfill: move current "name" into company_name if company_name is null
update clients set company_name = name where company_name is null;
