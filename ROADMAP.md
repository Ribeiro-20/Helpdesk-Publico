# Roadmap — Plataforma de Inteligencia de Contratacao Publica

> Evolucao do BASE Monitor de sistema de alertas para plataforma completa de inteligencia de contratacao publica portuguesa.

**Ultima atualizacao:** 2026-03-05 (sessao 4)

---

## Visao Geral

O BASE Monitor comecou como um sistema simples de monitorizacao de anuncios do portal BASE (base.gov.pt), com matching por codigos CPV e envio de notificacoes por email. O objetivo agora e transformar o produto numa **plataforma de inteligencia** que oferece perfis de entidades, perfis de empresas, analytics de mercado, alertas inteligentes e features premium de apoio a decisao.

A API BASE v2 disponibiliza **4 endpoints** que serao consumidos progressivamente:

| Endpoint             | Estado       | Descricao                                     |
| -------------------- | ------------ | --------------------------------------------- |
| `GetInfoAnuncio`     | Implementado | Anuncios de procedimentos (ja em producao)    |
| `GetInfoContrato`    | Implementado | Contratos celebrados com vencedores e precos  |
| `GetInfoModContrat`  | Implementado | Modificacoes contratuais (adendas, rescisoes) |
| `GetInfoEntidades`   | Fase 2       | Detalhes de entidades publicas por NIF        |

---

## Estado actual (pos-Fase 2)

### Ja implementado e funcional

- Ingestao de anuncios da API BASE (`ingest-base`)
- Matching CPV automatico por regras de cliente (`match-and-queue`)
- Envio de emails com resumo de anuncios (`send-emails`)
- Dashboard com 4 seccoes separadas: Anuncios, Contratos, Entidades & Empresas, Notificacoes
- Pagina de anuncios com listagem, filtros e detalhe
- Pagina de contratos com listagem, filtros (CPV, procedimento, valor) e paginacao
- Pagina de detalhe de contrato com precos, entidades, vencedores, cronologia, CPVs, locais, modificacoes, raw JSON
- Ingestao de contratos da API BASE (`ingest-contracts`) — fetch, map, hash, dedup, batch upsert com criacao automatica de entidades/empresas e linking a anuncios
- Ingestao de modificacoes contratuais (`ingest-contract-mods`) — fetch por ano, link a contratos existentes, calculo de deltas de preco
- Gestao de clientes e regras CPV
- Autenticacao multi-tenant com RLS
- Taxonomia completa de 9 454 codigos CPV
- Cron local para execucao periodica (anuncios cada 2h, contratos cada 2h, extraccao cada 2h, modificacoes diariamente as 04:00)
- Pagina de Definicoes com todos os botoes de ingestao e extraccao
- **Extraccao de entidades (`extract-entities`)** — scan de anuncios e contratos, inferencia de tipo (municipio, ministerio, saude, ensino, etc.), localizacao, estatisticas (total contratos, valor, top CPVs)
- **Extraccao de empresas (`extract-companies`)** — scan de contratos (vencedores + concorrentes), calculo de metricas (contratos ganhos, valor total, taxa de vitoria, especializacao CPV, top entidades)
- **Pagina de listagem de entidades** — filtros por nome, tipo, localizacao; ordenacao por valor/contratos/nome; tabela paginada com badges de tipo
- **Pagina de detalhe de entidade** — KPIs, info, top CPVs, top empresas, contratos recentes, anuncios recentes
- **Pagina de listagem de empresas** — filtros por nome, localizacao; ordenacao por valor/contratos/taxa vitoria; tabela com win_rate color-coded
- **Pagina de detalhe de empresa** — KPIs, win_rate badge, especializacao CPV, top entidades, contratos recentes

### Infraestrutura para Fase 3

- Tabela `cpv_stats` ja existe (com RLS, indexes, triggers)
- Edge Function stub `compute-stats` documentado
- Pagina placeholder Mercado no frontend
- Sidebar organizada em 3 seccoes: Monitorizacao, Inteligencia, Gestao
- Dados ricos de entidades e empresas disponiveis para analytics

---

## Fase 1 — Ingestao de contratos + Pagina Contratos ✓ CONCLUIDA

**Prioridade:** Alta
**Estado:** Concluida
**Desbloqueia:** Dados de vencedores, precos reais, concorrentes, localizacao
**Dependencias:** Nenhuma (infraestrutura ja existe)

### Objectivo

Consumir os endpoints `GetInfoContrato` e `GetInfoModContrat` da API BASE para ter dados completos de contratos celebrados, incluindo quem ganhou, a que preco, quem concorreu, e onde sera executado.

### Tarefas

#### 1.1 Implementar `ingest-contracts` Edge Function ✓

- ✅ Consumir `GET /GetInfoContrato` com paginacao (500 registos/pagina)
- ✅ Extrair campos: `idContrato`, `adjudicante[]`, `adjudicatarios[]`, `concorrentes[]`, `precoContratual`, `precoBaseProcedimento`, `PrecoTotalEfetivo`, `cpv[]`, `localExecucao[]`, datas do ciclo de vida
- ✅ Parsear formato `"NIF - Nome"` para separar NIF e nome de entidades/empresas (`parseNifNome()` em `baseApi.ts`)
- ✅ Deduplicar por hash SHA-256 do payload canonico (padrao existente)
- ✅ Linkar a anuncios existentes via `idAnuncio` quando disponivel
- ✅ Upsert de entidades e empresas referenciadas (criar registos basicos se nao existirem)
- ✅ Suportar parametros `from_date`, `to_date`, `dry_run`
- ✅ Frequencia: cada 2 horas (alinhado com `ingest-base`)
- Ficheiro: `supabase/functions/ingest-contracts/index.ts` (~425 linhas)

#### 1.2 Implementar `ingest-contract-mods` Edge Function ✓

- ✅ Consumir `GET /GetInfoModContrat`
- ✅ Registar modificacoes com delta de preco (`price_delta = new_price - old_price`)
- ✅ Classificar tipo: `aditamento`, `revisao_preco`, `rescisao`, `cessao`, `outro`
- ✅ Linkar a contratos existentes
- ✅ Frequencia: diariamente as 04:00
- Ficheiro: `supabase/functions/ingest-contract-mods/index.ts` (~220 linhas)

#### 1.3 Construir pagina de listagem de contratos ✓

- ✅ Tabela paginada com colunas: objecto, entidade, empresa, valor, CPV, data, estado
- ✅ Filtros: por CPV, tipo procedimento, intervalo de valor
- ✅ Paginacao completa com navegacao por paginas
- ✅ Badges visuais para estado (activo, fechado, modificado)
- ✅ Indicador de "desconto" (preco contratual vs. preco base, em percentagem)
- ✅ Seguir padroes de UI existentes (Tailwind, rounded-xl, shadow-card)
- Ficheiro: `apps/web/src/app/(dashboard)/contracts/page.tsx`
- Nota: filtros por entidade/vencedor usam campo `object` como proxy (JSONB arrays nao suportam `ilike` directo no Supabase JS)

#### 1.4 Construir pagina de detalhe de contrato ✓

- ✅ Rota: `/contracts/[id]`
- ✅ Seccoes: informacao geral, resumo de precos (base/contratual/efectivo), entidades adjudicantes, empresas adjudicatarias, concorrentes, CPVs, locais de execucao, cronologia (publicacao/celebracao/fecho), modificacoes
- ✅ Link de volta ao anuncio original (se existir)
- ✅ Dados brutos (raw payload) acessiveis em painel colapsavel
- Ficheiro: `apps/web/src/app/(dashboard)/contracts/[id]/page.tsx`

#### 1.5 Integrar no cron e admin ✓

- ✅ Adicionar `ingest-contracts` e `ingest-contract-mods` ao agendador local (`supabase/cron/run.ts`)
- ✅ Adicionar botoes "Ingerir Contratos" e "Ingerir Modificacoes" no Dashboard
- ✅ Adicionar todos os botoes de ingestao na pagina de Definicoes (`/settings`)
- ✅ Dashboard separado em 3 seccoes claras: Anuncios, Contratos, Notificacoes (com KPI cards clicaveis)

### Dados-chave do endpoint `GetInfoContrato`

```
adjudicante[].NIF, adjudicante[].Nome
adjudicatarios[].NIF, adjudicatarios[].Nome
concorrentes[].NIF, concorrentes[].Nome
precoContratual          -- preco final acordado
precoBaseProcedimento    -- preco base do procedimento
PrecoTotalEfetivo        -- valor total efetivo (com modificacoes)
cpv[].Codigo, cpv[].Descricao
localExecucao[].Pais, localExecucao[].Distrito, localExecucao[].Concelho
dataPublicacao, dataCelebracaoContrato, dataFechoContrato
fundamentacao, objectoContrato, tipoProcedimento
```

### Criterios de conclusao

- [x] `ingest-contracts` processa pelo menos 1 semana de dados sem erros
- [x] `ingest-contract-mods` processa modificacoes e calcula deltas correctamente
- [x] Pagina de listagem mostra contratos com filtros funcionais
- [x] Pagina de detalhe exibe toda a informacao do contrato
- [x] Build passa sem erros
- [x] Botoes de ingestao disponiveis no Dashboard e nas Definicoes

---

## Fase 2 — Entidades e Empresas ✓ CONCLUIDA

**Prioridade:** Alta
**Estado:** Concluida
**Desbloqueia:** Perfis de entidades publicas, perfis de empresas, "Crunchbase da contratacao publica"
**Dependencias:** Fase 1 ✓ (concluida — contratos ja disponiveis com dados ricos)
**Pre-requisitos ja prontos:** Tabelas `entities` e `companies` ja existem com registos basicos criados automaticamente por `ingest-contracts`

### Objectivo

Construir perfis completos de entidades publicas (quem compra) e empresas (quem vende), com estatisticas, historico, e relacoes. Transformar o BASE Monitor no "Crunchbase da contratacao publica portuguesa".

### Tarefas

#### 2.1 Implementar `extract-entities` Edge Function ✓

- ✅ Processar contratos recentes para extrair entidades adjudicantes
- ✅ Enriquecer com dados do endpoint `GetInfoEntidades` (por NIF) — usa dados ja ingeridos em vez de endpoint separado
- ✅ Classificar tipo: municipio, ministerio, instituto, empresa publica, saude, ensino, freguesia, autoridade, defesa, outro
- ✅ Extrair localizacao a partir dos contratos (`localExecucao[]`)
- ✅ Calcular estatisticas: total_announcements, total_contracts, total_value, avg_contract_value, top_cpvs, last_activity_at
- ✅ Suportar parametro `since_hours` para processamento incremental
- ✅ Frequencia: apos cada execucao de `ingest-contracts` (no pipeline cron)
- Ficheiro: `supabase/functions/extract-entities/index.ts` (~280 linhas)

#### 2.2 Implementar `extract-companies` Edge Function ✓

- ✅ Processar contratos para extrair empresas adjudicatarias e concorrentes
- ✅ Calcular metricas basicas: numero de contratos ganhos, valor total, taxa de vitoria
- ✅ Identificar especializacao CPV (top 10 CPVs por frequencia e valor)
- ✅ Calcular top_entities (top 10 entidades cliente)
- ✅ Suportar parametro `since_hours` para processamento incremental
- ✅ Frequencia: apos `extract-entities` (no pipeline cron)
- Ficheiro: `supabase/functions/extract-companies/index.ts` (~290 linhas)

#### 2.3 Construir pagina de listagem de entidades ✓

- ✅ Tabela: nome, tipo, localizacao, total contratos, valor total, total anuncios
- ✅ Filtros: por nome, tipo (dropdown), localizacao
- ✅ Ordenacao por valor total, numero de contratos, anuncios, nome
- ✅ Paginacao completa com navegacao por paginas
- ✅ Badges visuais para tipo de entidade (municipio, ministerio, saude, etc.)
- ✅ Seguir padroes de UI existentes (Tailwind, rounded-xl, shadow-card)
- Ficheiro: `apps/web/src/app/(dashboard)/entities/page.tsx`

#### 2.4 Construir pagina de detalhe de entidade ✓

- ✅ Rota: `/entities/[id]`
- ✅ Seccoes: KPI cards (anuncios, contratos, valor total, valor medio), informacao geral, top CPVs, top empresas adjudicatarias, contratos recentes (linked), anuncios recentes (por NIF)
- ✅ Link para contratos associados
- Ficheiro: `apps/web/src/app/(dashboard)/entities/[id]/page.tsx`

#### 2.5 Construir pagina de listagem de empresas ✓

- ✅ Tabela: nome, NIF, localizacao, contratos ganhos, participacoes, taxa de vitoria (color-coded), valor total
- ✅ Filtros: por nome, localizacao
- ✅ Ordenacao por valor, contratos, taxa de vitoria, nome
- ✅ Paginacao completa com navegacao por paginas
- Ficheiro: `apps/web/src/app/(dashboard)/companies/page.tsx`

#### 2.6 Construir pagina de detalhe de empresa ✓

- ✅ Rota: `/companies/[id]`
- ✅ Seccoes: KPI cards (contratos ganhos, participacoes, valor total, valor medio), win_rate badge no header, informacao geral, especializacao CPV, top entidades, contratos recentes
- Ficheiro: `apps/web/src/app/(dashboard)/companies/[id]/page.tsx`

#### 2.7 Integrar no cron e admin ✓

- ✅ Adicionar `extract-entities` e `extract-companies` ao pipeline cron (apos `ingest-contracts`, antes de `match-and-queue`)
- ✅ Adicionar botoes "Extrair Entidades" e "Extrair Empresas" no Dashboard
- ✅ Adicionar botoes "Extrair Entidades" e "Extrair Empresas" na pagina de Definicoes
- ✅ Dashboard com nova seccao "Entidades & Empresas" (4 KPI cards: total entidades, municipios, total empresas, com contratos)
- ✅ Instrucoes "Como comecar" actualizadas com passo de extraccao

### Criterios de conclusao

- [x] `extract-entities` cria/atualiza perfis de entidades automaticamente (365 entidades extraidas em teste com inferencia de tipo)
- [x] `extract-companies` cria/atualiza perfis de empresas com metricas
- [x] Paginas de listagem mostram dados reais com filtros funcionais
- [x] Paginas de detalhe exibem perfis completos com KPIs e relacoes
- [x] Navegacao cruzada funcional: entidade → contratos → empresa
- [x] Build passa sem erros
- [x] Botoes de extraccao disponiveis no Dashboard e nas Definicoes
- [x] Pipeline cron actualizado com extract-entities e extract-companies

---

## Fase 3 — Analytics de Mercado (PROXIMA)

**Prioridade:** Media
**Desbloqueia:** Visao macro do mercado, tendencias CPV, diferenciacao real do produto
**Dependencias:** Fase 2 ✓ (concluida — entidades e empresas com estatisticas disponiveis)

### Objectivo

Criar um dashboard analitico que oferece visao global do mercado de contratacao publica: volumes por CPV, tendencias temporais, distribuicao geografica, concentracao de mercado, e benchmarks de precos.

### Tarefas

#### 3.1 Implementar `compute-stats` Edge Function

- Agregar dados de contratos, entidades e empresas na tabela `cpv_stats`
- Calcular por CPV: total de contratos, valor total, valor medio, numero de entidades compradoras, numero de empresas fornecedoras, top entidades, top empresas
- Calcular metricas temporais: volume mensal, tendencia YoY
- Frequencia: diariamente as 03:00

#### 3.2 Construir pagina Mercado — visao geral

- KPIs globais: total de contratos, valor total, numero de entidades, numero de empresas
- Grafico de evolucao mensal de valor contratado
- Top 10 CPVs por valor
- Mapa de calor geografico (por distrito)
- Distribuicao por tipo de procedimento (concurso publico, ajuste directo, etc.)

#### 3.3 Pagina Mercado — detalhe CPV

- Rota: `/market/cpv/[code]`
- Metricas do CPV: volume, tendencia, preco medio, numero de participantes
- Top entidades compradoras neste CPV
- Top empresas fornecedoras neste CPV
- Histograma de distribuicao de valores
- Evolucao temporal

#### 3.4 Pagina Mercado — analise geografica

- Vista por distrito/concelho
- Volume e valor de contratacao por regiao
- Entidades activas por regiao
- Empresas dominantes por regiao

#### 3.5 Actualizar dashboard principal

- Adicionar widgets com dados de contratos e mercado
- Mini-graficos de tendencia
- "Destaques da semana" (maiores contratos, novas entidades, etc.)

### Criterios de conclusao

- [ ] `compute-stats` gera estatisticas CPV completas
- [ ] Pagina Mercado mostra visao global com graficos interactivos
- [ ] Detalhe CPV disponivel com metricas relevantes
- [ ] Dashboard actualizado com dados de inteligencia

---

## Fase 4 — Alertas Inteligentes + Relatorio Semanal

**Prioridade:** Media
**Desbloqueia:** Valor directo para clientes, retencao, upsell
**Dependencias:** Fase 2 ✓ (concluida — precisa de entidades e empresas para alertas por entidade)

### Objectivo

Expandir o sistema de notificacoes para alem do matching CPV simples. Permitir alertas por entidade especifica, faixa de valor, regiao geografica, e tipo de procedimento. Adicionar relatorio semanal automatico com resumo de actividade.

### Tarefas

#### 4.1 Novos tipos de regras de alerta

- Alerta por entidade: "Avisar quando a Camara de Lisboa publicar qualquer anuncio"
- Alerta por faixa de valor: "Contratos acima de 500.000 EUR no meu CPV"
- Alerta por regiao: "Qualquer contrato no distrito de Lisboa"
- Alerta por tipo de procedimento: "Todos os concursos publicos no CPV 45000000"
- Combinacoes: CPV + valor + regiao

#### 4.2 Schema de regras expandido

- Nova tabela ou extensao de `client_cpv_rules` para suportar regras compostas
- Campos: `rule_type` (cpv, entity, value, region, combined), `conditions` (JSONB)
- UI de criacao de regras com builder visual

#### 4.3 Motor de matching expandido

- Refactor de `match-and-queue` para suportar novos tipos de regras
- Matching sobre contratos (nao apenas anuncios)
- Prioridade/severidade de alertas

#### 4.4 Relatorio semanal automatico

- Template de email com resumo: novos anuncios, contratos celebrados, movimentos de entidades monitorizadas
- Estatisticas da semana: total valor, top contratos, novas oportunidades
- Configuravel por cliente: activar/desactivar, dia da semana, conteudos incluidos
- Edge Function dedicada: `send-weekly-report`
- Frequencia: semanal (segunda-feira 08:00)

#### 4.5 Centro de notificacoes no frontend

- Pagina com historico de todas as notificacoes enviadas
- Filtros por tipo, data, estado (lida/nao lida)
- Marcar como lida/favorita
- Link directo para o anuncio/contrato relevante

### Criterios de conclusao

- [ ] Clientes conseguem criar regras de alerta por entidade, valor e regiao
- [ ] Motor de matching processa todos os tipos de regras
- [ ] Relatorio semanal enviado automaticamente
- [ ] Centro de notificacoes funcional no frontend

---

## Fase 5 — Features Premium

**Prioridade:** Baixa (requer volume de dados historicos)
**Desbloqueia:** Diferenciacao premium, monetizacao, competitive moat
**Dependencias:** Fases 1-4 completas + volume significativo de dados historicos

### Objectivo

Features avancadas de apoio a decisao que requerem volume de dados e possivelmente modelos estatisticos: radar de oportunidades, estimativa de preco justo, e probabilidade de vitoria.

### Tarefas

#### 5.1 Radar de oportunidades

- Analise automatica de padroes de compra recorrente por entidade
- Previsao de quando uma entidade ira lancar novo concurso (baseado em historico)
- Score de "oportunidade" para cada combinacao empresa × entidade × CPV
- Notificacao proactiva: "A Camara de Lisboa costuma lancar concurso de limpeza em Marco — prepare-se"

#### 5.2 Estimativa de preco justo

- Modelo estatistico baseado em historico de precos por CPV, regiao e dimensao
- Input: CPV + localizacao + tipo de procedimento
- Output: intervalo de preco estimado (percentil 25, mediana, percentil 75)
- Comparacao com preco base do procedimento ("este preco base esta acima/abaixo do mercado")

#### 5.3 Probabilidade de vitoria

- Analise de historico de concorrencia por CPV e entidade
- Factores: numero tipico de concorrentes, taxa de vitoria da empresa, relacao historica com a entidade
- Score de 0-100 com explicacao dos factores
- Util para decisao go/no-go em concursos

#### 5.4 Benchmarking competitivo

- Comparar empresa do cliente com concorrentes directos
- Metricas: quota de mercado por CPV, taxa de vitoria relativa, cobertura geografica
- "Quem esta a ganhar contratos que eu poderia ganhar?"

#### 5.5 API publica (opcional)

- REST API para integracao com sistemas de terceiros
- Endpoints: pesquisa de contratos, perfil de entidade, perfil de empresa, estatisticas CPV
- Autenticacao por API key
- Rate limiting e planos de acesso

### Criterios de conclusao

- [ ] Radar de oportunidades identifica padroes recorrentes com precisao razoavel
- [ ] Estimativa de preco produz intervalos uteis para os CPVs com mais dados
- [ ] Score de probabilidade de vitoria funcional com explicacao de factores
- [ ] Benchmarking competitivo disponivel para empresas com historico suficiente

---

## Resumo de timeline

```
Fase 1 ████████████████████████████████  Concluida ✓
Fase 2 ████████████████████████████████  Concluida ✓
Fase 3 ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Proxima (entidades e empresas prontas)
Fase 4 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Planeada
Fase 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Planeada (requer dados historicos)
```

| Fase | Prioridade | Dependencias         | Estado    | Resultado principal                         |
| ---- | ---------- | -------------------- | --------- | ------------------------------------------- |
| 1    | Alta       | Nenhuma              | Concluida | Contratos com vencedores e precos           |
| 2    | Alta       | Fase 1               | Concluida | Perfis de entidades e empresas              |
| 3    | Media      | Fase 2               | Proxima   | Analytics de mercado e tendencias CPV       |
| 4    | Media      | Fase 2               | Planeada  | Alertas inteligentes e relatorio semanal    |
| 5    | Baixa      | Fases 1-4 + dados    | Planeada  | Radar, estimativa de preco, prob. de vitoria|

---

## Notas tecnicas

- **Todas as tabelas** usam `tenant_id` com RLS policies via `current_tenant_id()`
- **Deduplicacao** por hash SHA-256 de payload canonico (padrao de `ingest-base`)
- **API BASE v2** usa header `_AcessToken` (misspelled no lado da API)
- **Formato entidades/empresas** na API: `"NIF - Nome"` (ex: `"509000001 - Empresa Exemplo, Lda."`)
- **UI** inteiramente em portugues (pt-PT), design system Tailwind com cores brand/surface/accent
- **Padroes de codigo**: Server Components para paginas, Client Components para interactividade
- **Edge Functions**: Deno runtime, `SUPABASE_SERVICE_ROLE_KEY` para bypass de RLS
- **Supabase JS e JSONB**: Colunas JSONB (arrays de strings como `contracting_entities`, `winners`) nao suportam `ilike` directo no Supabase JS client — usar campo de texto como proxy ou RPC para casts
- **Edge Runtime**: Se o container `supabase_edge_runtime` estiver parado, todas as Edge Functions devolvem 503 — resolver com `supabase stop && supabase start`
- **AdminActions**: Componente reutilizado no Dashboard e Definicoes — aceita array de actions com `fn`, `label`, `variant`, `body`; aplica automaticamente `from_date`/`to_date` para `ingest-base` e `ingest-contracts`
