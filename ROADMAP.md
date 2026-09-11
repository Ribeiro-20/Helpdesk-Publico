# Roadmap — BASE Monitor

Última atualização factual: 2026-09-10

## Objetivo

Evoluir o BASE Monitor para uma plataforma de consulta e inteligência de contratação pública, preservando primeiro a correção dos dados, a segurança e o desempenho.

## Estado resumido

| Bloco | Estado verificável | Próxima ação |
|---|---|---|
| P0 — pesquisa pública e prevenção de duplicados | Implementado no histórico Git com testes de regressão no repositório | Manter monitorização operacional |
| P1-B — análise de duplicados | Decisão fail-closed documentada | Não apagar sem evidência adicional |
| P1-C1 / V3.2 — ingestão manual e timeouts | Fechado com evidência operacional | Integrar a branch remota no fluxo principal |
| Exportação CSV privada | Em curso nesta branch | Rever, validar e publicar por PR |
| P2 — desempenho da consulta pública | Seguinte | Medir antes de otimizar |
| Analytics, alertas e funcionalidades premium | Futuro | Só iniciar após P2 |

## 1. Trabalho concluído ou documentado

### P0 — pesquisa pública e prevenção de novos duplicados

O histórico Git contém as implementações e os respetivos testes no repositório:

- `f8e6b08` — segurança dos dados de mercado e ingestão histórica;
- `9b10ec2` — pesquisa pública server-only e prevenção de duplicados;
- `3f4694a` — proteção da pesquisa pública e dos IDs BASE;
- `b675320` — correção de regressões de acesso e ingestão.

Este roadmap não usa estes commits, por si só, como prova de validação operacional atual em produção. Essa monitorização mantém-se necessária.

### P1-B — duplicados

A decisão em `/home/admin/p1b-analysis-20260908/DECISAO-P1B.md` mantém-se fail-closed:

- `15478168`: permanece integralmente em quarentena;
- `15478327`: mantém uma linha canónica; nenhuma remoção foi autorizada nesta fase;
- não existe autorização geral para eliminação de duplicados.

### P1-C1 / V3.2 — ingestão manual e timeouts

Fechado com o commit `bb9b221e49c1dc2d48013d0cc202b30e1b985703`, publicado na branch remota `fix/admin-company-refresh-timeout-v3.2`.

A evidência operacional, incluindo percurso real da interface, respostas HTTP, duração acima do antigo timeout e rollback, está em:

- `/home/admin/p1c1-v3.2-ingestion-hotfix-20260910/execution-report.md`

## 2. Em curso — exportação CSV privada

A indicação transmitida ao Rui é explícita:

- os botões de download ficam apenas no backoffice autenticado do BASE Monitor;
- existem exportações para contratos e para anúncios;
- visitantes da Página Mercado não podem ver botões nem usar endpoints de download.

Localização dos botões:

- anúncios: listagem privada `/announcements`;
- contratos: listagem privada `/contracts`;
- os botões ficam no cabeçalho de cada listagem, junto das ações da página.

Âmbito desta entrega:

- endpoints `GET /api/announcements/export` e `GET /api/contracts/export` protegidos pelo middleware e por autenticação explícita no handler;
- validação do utilizador em `app_users` e presença de tenant;
- isolamento efetivo através da sessão autenticada e das políticas/RPC tenant-aware;
- rate limit partilhado e atómico em PostgreSQL, por tenant e utilizador autenticado;
- preservação dos filtros e ordenação das duas listagens privadas;
- máximo de 5.000 registos por ficheiro, com erro para restringir os filtros;
- proteção contra formula injection em Excel/LibreOffice;
- respostas CSV e erros com `Cache-Control: private, no-store`;
- mensagens públicas constantes, sem detalhes internos do Supabase.

### Critérios de conclusão

- [x] Testes focados da exportação passam.
- [x] TypeScript passa sem erros.
- [x] Build de produção passa.
- [x] Revisão independente de segurança e lógica sem bloqueadores.
- [ ] Teste autenticado real dos dois downloads com filtros preservados.
- [x] Pedidos anónimos aos endpoints são redirecionados para `/mp/login`.
- [x] As páginas públicas não apresentam botões nem ligações de download.
- [ ] Publicação numa branch dedicada e integração por PR.

A exportação permanece “em curso” enquanto revisão, percurso autenticado e PR não estiverem fechados.

## 3. Seguinte — P2 de desempenho

Só avança depois da exportação estar fechada.

Objetivos:

1. medir p50 e p95 da página e da RPC pública;
2. registar duração, total, filtros e erros sem dados pessoais;
3. mover filtros ainda caros para SQL/RPC;
4. substituir facetas obtidas por amostragem por agregações próprias;
5. aplicar cache curta às facetas quando for seguro;
6. manter paginação e ordenação estáveis;
7. nunca apresentar timeouts como zero resultados.

## 4. Trabalho futuro

### Analytics

- evolução de gasto por CPV, entidade, fornecedor, procedimento e geografia;
- comparação entre períodos;
- concentração de fornecedores;
- tendências de adjudicação.

### Alertas e monitorização

- alertas por entidade, CPV, fornecedor, valor e localização;
- resumos periódicos;
- histórico e estado de entrega;
- canais adicionais de notificação.

### Funcionalidades premium

- dashboards guardados;
- relatórios recorrentes;
- exportações avançadas;
- API autenticada;
- equipas, permissões e limites por plano.

## 5. Regra de passagem entre fases

Nenhum bloco é dado como fechado apenas por estar implementado. Para encerrar uma fase são necessários:

1. testes relevantes;
2. type-check e build;
3. revisão sem bloqueadores;
4. validação pelo percurso real da interface quando aplicável;
5. publicação e integração identificadas por branch/PR;
6. evidência operacional separada quando houver alteração de produção.
