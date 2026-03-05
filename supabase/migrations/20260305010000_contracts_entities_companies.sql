-- ============================================================================
-- Migration: contracts, contract_modifications, entities, companies, cpv_stats
-- Extends BASE Monitor from announcement-only to full procurement intelligence
-- ============================================================================

-- ============================================================================
-- 1. ENTITIES (Entidades Públicas)
--    Fonte: extraído de anúncios/contratos + endpoint GetInfoEntidades
--    Representa: municípios, ministérios, institutos, empresas públicas
-- ============================================================================
create table if not exists entities (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  nif             text not null,                        -- NIF da entidade (ex: "600015000")
  name            text not null,                        -- Nome oficial (ex: "Câmara Municipal de Lisboa")
  entity_type     text null,                            -- Tipo: município, ministério, instituto, empresa_publica, outro
  location        text null,                            -- Localização (distrito/concelho extraído de contratos)
  sector          text null,                            -- Sector de actividade (saúde, educação, obras, etc.)
  detail_url      text null,                            -- URL no portal BASE
  raw_payload     jsonb not null default '{}'::jsonb,   -- Payload original da API GetInfoEntidades
  -- Estatísticas desnormalizadas (atualizadas por compute-stats)
  total_announcements   int not null default 0,         -- Total de anúncios publicados
  total_contracts       int not null default 0,         -- Total de contratos celebrados
  total_value           numeric(16,2) not null default 0, -- Valor total contratado (EUR)
  avg_contract_value    numeric(14,2) null,             -- Valor médio por contrato
  last_activity_at      timestamptz null,               -- Data do último anúncio/contrato
  top_cpvs              jsonb not null default '[]'::jsonb, -- CPVs mais frequentes [{code, count, description}]
  top_companies         jsonb not null default '[]'::jsonb, -- Empresas mais adjudicadas [{nif, name, count, value}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um NIF por tenant (deduplicação)
create unique index if not exists entities_tenant_nif_idx
  on entities(tenant_id, nif);

create index if not exists entities_tenant_name_idx
  on entities(tenant_id, name);

create index if not exists entities_tenant_type_idx
  on entities(tenant_id, entity_type)
  where entity_type is not null;

create index if not exists entities_tenant_location_idx
  on entities(tenant_id, location)
  where location is not null;

-- Trigger updated_at
drop trigger if exists trg_entities_updated_at on entities;
create trigger trg_entities_updated_at
  before update on entities
  for each row execute function set_updated_at();

-- RLS
alter table entities enable row level security;

create policy entities_read on entities
  for select using (tenant_id = current_tenant_id());


-- ============================================================================
-- 2. COMPANIES (Empresas Adjudicatárias)
--    Fonte: extraído dos campos adjudicatarios/concorrentes de GetInfoContrato
--    Representa: empresas que participam/ganham concursos públicos
-- ============================================================================
create table if not exists companies (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  nif             text not null,                        -- NIF da empresa (ex: "509000001")
  name            text not null,                        -- Nome da empresa
  location        text null,                            -- Localização (se disponível dos contratos)
  detail_url      text null,                            -- URL no portal BASE
  raw_payload     jsonb not null default '{}'::jsonb,   -- Dados originais
  -- Estatísticas desnormalizadas (atualizadas por compute-stats)
  contracts_won         int not null default 0,         -- Contratos ganhos
  contracts_participated int not null default 0,        -- Contratos em que participou como concorrente
  total_value_won       numeric(16,2) not null default 0, -- Valor total de contratos ganhos
  avg_contract_value    numeric(14,2) null,             -- Valor médio por contrato ganho
  win_rate              numeric(5,2) null,              -- Taxa de vitória (%) = won / participated * 100
  last_win_at           timestamptz null,               -- Data do último contrato ganho
  cpv_specialization    jsonb not null default '[]'::jsonb, -- Especialização CPV [{code, count, value, description}]
  top_entities          jsonb not null default '[]'::jsonb, -- Entidades com quem mais contrata [{nif, name, count, value}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um NIF por tenant
create unique index if not exists companies_tenant_nif_idx
  on companies(tenant_id, nif);

create index if not exists companies_tenant_name_idx
  on companies(tenant_id, name);

create index if not exists companies_tenant_value_idx
  on companies(tenant_id, total_value_won desc);

-- Trigger updated_at
drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at
  before update on companies
  for each row execute function set_updated_at();

-- RLS
alter table companies enable row level security;

create policy companies_read on companies
  for select using (tenant_id = current_tenant_id());


-- ============================================================================
-- 3. CONTRACTS (Contratos Celebrados)
--    Fonte: endpoint GetInfoContrato
--    Representa: contratos adjudicados após concurso público
-- ============================================================================
create table if not exists contracts (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  source                text not null default 'BASE_API',
  -- Identificadores BASE
  base_contract_id      text null,                      -- idContrato da API
  base_procedure_id     text null,                      -- idprocedimento
  base_announcement_no  text null,                      -- nAnuncio (liga ao anúncio)
  base_incm_id          text null,                      -- idINCM
  -- Relação com anúncio (se existir no sistema)
  announcement_id       uuid null references announcements(id) on delete set null,
  -- Dados do contrato
  object                text null,                      -- objectoContrato: objecto do contrato
  description           text null,                      -- descContrato: descrição completa
  procedure_type        text null,                      -- tipoprocedimento: Concurso Público, Ajuste Directo, etc.
  contract_type         text null,                      -- tipoContrato[0]
  announcement_type     text null,                      -- TipoAnuncio
  legal_regime          text null,                      -- regime jurídico
  legal_basis           text null,                      -- fundamentacao
  -- Datas
  publication_date      date null,                      -- dataPublicacao
  award_date            date null,                      -- dataDecisaoAdjudicacao: data da decisão de adjudicação
  signing_date          date null,                      -- dataCelebracaoContrato: data de celebração
  close_date            date null,                      -- dataFechoContrato: data de fecho
  -- Valores financeiros
  base_price            numeric(14,2) null,             -- precoBaseProcedimento: preço base do procedimento
  contract_price        numeric(14,2) null,             -- precoContratual: preço contratual (o que se paga)
  effective_price       numeric(14,2) null,             -- PrecoTotalEfetivo: preço total efetivo
  currency              text not null default 'EUR',
  -- Participantes
  contracting_entities  jsonb not null default '[]'::jsonb, -- adjudicante[]: entidades adjudicantes ["NIF - Nome"]
  winners               jsonb not null default '[]'::jsonb, -- adjudicatarios[]: empresas vencedoras ["NIF - Nome"]
  competitors           text null,                      -- concorrentes: lista de concorrentes
  -- CPVs
  cpv_main              text null,                      -- Primeiro CPV
  cpv_list              jsonb not null default '[]'::jsonb, -- Todos os CPVs
  -- Execução
  execution_deadline_days int null,                     -- prazoExecucao em dias
  execution_locations   jsonb not null default '[]'::jsonb, -- localExecucao[]: ["País, Distrito, Concelho"]
  -- Outros
  framework_agreement   text null,                      -- DescrAcordoQuadro
  is_centralized        boolean not null default false,  -- ProcedimentoCentralizado == "Sim"
  is_ecological         boolean not null default false,  -- ContratEcologico == "Sim"
  end_type              text null,                      -- tipoFimContrato
  procedure_docs_url    text null,                      -- linkPecasProc
  observations          text null,                      -- Observacoes
  -- Relações com entidades/empresas extraídas
  entity_id             uuid null references entities(id) on delete set null,
  winner_company_id     uuid null references companies(id) on delete set null,
  -- Meta
  raw_payload           jsonb not null,
  raw_hash              text not null,
  status                text not null default 'active'
                        check (status in ('active','closed','modified')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Deduplicação por base_contract_id
create unique index if not exists contracts_tenant_base_id_idx
  on contracts(tenant_id, base_contract_id)
  where base_contract_id is not null;

-- Pesquisa por anúncio
create index if not exists contracts_tenant_announcement_idx
  on contracts(tenant_id, base_announcement_no)
  where base_announcement_no is not null;

-- Pesquisa por procedimento
create index if not exists contracts_tenant_procedure_idx
  on contracts(tenant_id, base_procedure_id)
  where base_procedure_id is not null;

-- Pesquisa por datas
create index if not exists contracts_tenant_pubdate_idx
  on contracts(tenant_id, publication_date desc);

create index if not exists contracts_tenant_award_date_idx
  on contracts(tenant_id, award_date desc)
  where award_date is not null;

-- Pesquisa por CPV
create index if not exists contracts_tenant_cpv_main_idx
  on contracts(tenant_id, cpv_main);

create index if not exists contracts_cpv_list_gin_idx
  on contracts using gin (cpv_list);

-- Pesquisa por hash (deduplicação)
create index if not exists contracts_tenant_raw_hash_idx
  on contracts(tenant_id, raw_hash);

-- Pesquisa por entidade/empresa
create index if not exists contracts_tenant_entity_idx
  on contracts(tenant_id, entity_id)
  where entity_id is not null;

create index if not exists contracts_tenant_winner_idx
  on contracts(tenant_id, winner_company_id)
  where winner_company_id is not null;

-- GIN nos participantes (para pesquisar por NIF dentro do JSONB)
create index if not exists contracts_winners_gin_idx
  on contracts using gin (winners);

create index if not exists contracts_entities_gin_idx
  on contracts using gin (contracting_entities);

-- Trigger updated_at
drop trigger if exists trg_contracts_updated_at on contracts;
create trigger trg_contracts_updated_at
  before update on contracts
  for each row execute function set_updated_at();

-- RLS
alter table contracts enable row level security;

create policy contracts_read on contracts
  for select using (tenant_id = current_tenant_id());


-- ============================================================================
-- 4. CONTRACT_MODIFICATIONS (Modificações Contratuais)
--    Fonte: endpoint GetInfoModContrat
--    Representa: alterações a contratos existentes (aditamentos, etc.)
-- ============================================================================
create table if not exists contract_modifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  contract_id     uuid not null references contracts(id) on delete cascade,
  base_contract_id text null,                           -- idContrato original
  modification_no  int not null default 1,              -- Número sequencial da modificação
  -- Dados da modificação
  description     text null,                            -- Descrição da alteração
  reason          text null,                            -- Motivo/fundamentação
  -- Valores
  previous_price  numeric(14,2) null,                   -- Preço anterior
  new_price       numeric(14,2) null,                   -- Novo preço
  price_delta     numeric(14,2) null,                   -- Diferença (pode ser negativo)
  -- Datas
  modification_date date null,                          -- Data da modificação
  -- Meta
  raw_payload     jsonb not null,
  raw_hash        text not null,
  created_at      timestamptz not null default now()
);

create index if not exists contract_mods_tenant_contract_idx
  on contract_modifications(tenant_id, contract_id);

create index if not exists contract_mods_base_id_idx
  on contract_modifications(tenant_id, base_contract_id)
  where base_contract_id is not null;

-- RLS
alter table contract_modifications enable row level security;

create policy contract_mods_read on contract_modifications
  for select using (tenant_id = current_tenant_id());


-- ============================================================================
-- 5. CPV_STATS (Estatísticas Agregadas por CPV)
--    Materializada periodicamente por compute-stats Edge Function
--    Representa: visão analítica do mercado por sector CPV
-- ============================================================================
create table if not exists cpv_stats (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  cpv_code              text not null,                  -- Código CPV (ex: "71240000-2")
  cpv_description       text null,                      -- Descrição (de cpv_codes)
  cpv_division          text null,                      -- Divisão (2 primeiros dígitos, ex: "71")
  -- Estatísticas de anúncios
  total_announcements   int not null default 0,
  announcements_last_30d int not null default 0,
  announcements_last_365d int not null default 0,
  -- Estatísticas de contratos
  total_contracts       int not null default 0,
  contracts_last_30d    int not null default 0,
  contracts_last_365d   int not null default 0,
  -- Valores
  total_value           numeric(16,2) not null default 0,   -- Valor total contratado
  avg_contract_value    numeric(14,2) null,                 -- Valor médio por contrato
  min_contract_value    numeric(14,2) null,                 -- Menor contrato
  max_contract_value    numeric(14,2) null,                 -- Maior contrato
  median_contract_value numeric(14,2) null,                 -- Mediana (calculada por compute-stats)
  -- Análise preço base vs preço contratual
  avg_price_ratio       numeric(5,2) null,                  -- Rácio médio preço_contratual / preço_base
  avg_discount_pct      numeric(5,2) null,                  -- Desconto médio (%) = (1 - ratio) * 100
  -- Participantes
  total_entities        int not null default 0,             -- Entidades que compram neste CPV
  total_companies       int not null default 0,             -- Empresas que ganham neste CPV
  top_entities          jsonb not null default '[]'::jsonb, -- Top 10 entidades [{nif, name, count, value}]
  top_companies         jsonb not null default '[]'::jsonb, -- Top 10 empresas [{nif, name, count, value}]
  -- Tendência
  yoy_growth_pct        numeric(5,2) null,                  -- Crescimento anual (%)
  -- Meta
  computed_at           timestamptz not null default now(), -- Última computação
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Um registo por CPV por tenant
create unique index if not exists cpv_stats_tenant_cpv_idx
  on cpv_stats(tenant_id, cpv_code);

create index if not exists cpv_stats_tenant_division_idx
  on cpv_stats(tenant_id, cpv_division);

create index if not exists cpv_stats_tenant_value_idx
  on cpv_stats(tenant_id, total_value desc);

create index if not exists cpv_stats_tenant_announcements_idx
  on cpv_stats(tenant_id, total_announcements desc);

-- Trigger updated_at
drop trigger if exists trg_cpv_stats_updated_at on cpv_stats;
create trigger trg_cpv_stats_updated_at
  before update on cpv_stats
  for each row execute function set_updated_at();

-- RLS
alter table cpv_stats enable row level security;

create policy cpv_stats_read on cpv_stats
  for select using (tenant_id = current_tenant_id());
