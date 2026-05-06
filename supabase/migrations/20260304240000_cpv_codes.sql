-- Enable trigram extension for text search
create extension if not exists pg_trgm;

-- CPV codes reference table
create table if not exists cpv_codes (
  id text primary key,
  descricao text not null,
  created_at timestamptz not null default now()
);

-- Indexes for search
create index cpv_codes_id_pattern_idx on cpv_codes (id text_pattern_ops);
create index cpv_codes_descricao_lower_idx on cpv_codes using gin (lower(descricao) gin_trgm_ops);

-- RLS: any authenticated user can read CPV codes
alter table cpv_codes enable row level security;
create policy cpv_codes_read on cpv_codes for select using (true);
