# Roadmap — BASE Monitor

Última atualização factual: 2026-09-11

## Objetivo

Evoluir o BASE Monitor para uma plataforma de consulta e inteligência de contratação pública, preservando primeiro a integridade dos dados, a segurança, o desempenho e a capacidade de recuperação.

## Estado resumido

| Bloco | Estado | Próxima ação |
|---|---|---|
| P0 — estabilização da pesquisa pública | FECHADO | Manter monitorização operacional |
| P1 — integridade e funcionalidades essenciais | PARCIALMENTE FECHADO | Classificar e preparar o P1-C2 |
| P2 — desempenho e experiência | INICIADO | Medir p50/p95 e tratar facetas caras |
| P3 — operação e monitorização | INICIADO | Automatizar reconciliação e testar recuperação |
| P4 — evolução funcional e comercial | FUTURO | Iniciar apenas após estabilização de P1–P3 |

## P0 — estabilização da pesquisa pública

Estado: **FECHADO**

Concluído e publicado:

- pesquisa pública canónica e server-side;
- deduplicação lógica da listagem;
- contagens, filtros, paginação e ordenação coerentes;
- prevenção atómica de novos duplicados através do registry;
- correção do importador e dos limites;
- proteção das RPC e isolamento por tenant;
- validação em produção.

Commits principais: `9b10ec2`, `3f4694a`, `f8e6b08` e `b675320`.

## P1 — integridade dos dados e funcionalidades essenciais

Estado: **PARCIALMENTE FECHADO**

### P1-A — reconciliação com o Portal BASE

Estado: **FECHADO**

- 61 contratos reconciliados;
- 34 contratos inseridos;
- 27 contratos atualizados;
- hashes oficiais validados;
- contagens e registry reconciliados;
- dois casos ausentes da API oficial corrente separados para decisão auditável.

### P1-B — dois contratos em quarentena

Estado: **FECHADO EM PRODUÇÃO**

Após autorização explícita do responsável:

- contrato BASE `15478168` removido integralmente;
- contrato BASE `15478327` removido integralmente;
- duas linhas físicas removidas no total;
- zero referências dependentes afetadas;
- entradas correspondentes do registry removidas pelos triggers;
- contador do tenant e invariantes globais validados;
- backup integral e compensação de restauro preservados.

Evidência e rollback: `/home/admin/p1b-removal-20260911`.

Esta autorização aplica-se exclusivamente a estes dois IDs e não constitui autorização geral para eliminar contratos ou duplicados.

### P1-C — saneamento físico dos duplicados

#### P1-C1 — duplicados estritamente idênticos e sem referências

Estado: **FECHADO EM PRODUÇÃO**

- 7.064 versões físicas removidas;
- 6.515 grupos tratados;
- nenhuma chave lógica ou linha canónica perdida;
- registry, referências, contadores e triggers validados;
- compensação de restauro testada.

#### P1-C2 — versões redundantes com payloads divergentes

Estado: **PENDENTE/DEFERIDO**

Último baseline antes do fecho P1-B:

- 1.274.663 linhas físicas;
- 1.188.407 contratos lógicos;
- 86.256 versões físicas redundantes.

Este conjunto exige classificação por risco, escolha de canónicos, tratamento de referências, ensaio isolado e revisão fail-closed. Não pode ser eliminado com a regra simples usada no P1-C1.

#### P1-C3 — unicidade definitiva

Estado: **PENDENTE**

Depois do P1-C2:

- confirmar zero duplicados físicos por tenant e ID BASE;
- criar a restrição ou índice único definitivo;
- avaliar a remoção do registry transitório;
- recalcular e validar todos os contadores.

### P1-D — robustez da ingestão manual

Estado: **FECHADO**

- corrigidos os timeouts da ingestão manual;
- corrigido o refresh de empresas;
- operações longas deixaram de depender do antigo timeout HTTP;
- respostas e histórico do pipeline validados;
- percurso real de anúncios e contratos confirmado.

Commits principais: `b675320` e `bb9b221`.

### P1-E — exportação CSV privada

Estado: **FECHADO EM PRODUÇÃO**

Concluído:

- exportação privada de anúncios e contratos;
- botões apenas no backoffice autenticado;
- endpoints autenticados e isolados por tenant;
- máximo de 5.000 linhas;
- rate limit atómico;
- proteção contra formula injection;
- preservação dos filtros e ordenação;
- ID BASE no CSV, sem exposição do UUID interno;
- páginas públicas sem botões de download;
- testes, TypeScript, ESLint, build e revisão independente aprovados;
- publicação no commit `28bab97`;
- os dois downloads foram testados pelo responsável e confirmados como funcionais.

## P2 — desempenho e experiência

Estado: **INICIADO**

### P2-A — navegação dos contratos e layout dos filtros

Estado: **FECHADO EM PRODUÇÃO**

- navegação das páginas seguintes reduzida de dezenas de segundos para dezenas de milissegundos;
- índice alinhado com a ordenação predefinida;
- filtros de valor compactados;
- ações mantidas dentro do card;
- botão “Exportar CSV” sem quebra;
- anúncios não alterados.

Commit: `943d712`.

### P2-B — medição e observabilidade

Estado: **PENDENTE**

- medir p50 e p95 das páginas e RPC;
- separar medições públicas e do backoffice;
- registar consultas lentas e timeouts;
- acompanhar desempenho após ingestões;
- definir limites objetivos de regressão.

### P2-C — facetas e filtros caros

Estado: **PENDENTE**

- substituir facetas baseadas em amostras;
- criar agregações próprias;
- normalizar país, distrito e município;
- criar apenas índices comprovadamente úteis;
- aplicar cache curta onde for seguro.

### P2-D — experiência de utilização

Estado: **PARCIAL/PENDENTE**

- rever etiquetas dos filtros ativos;
- melhorar estados de carregamento e repetição após erro;
- indicar a última atualização;
- distinguir zero resultados de falha técnica;
- garantir consistência dos filtros no URL;
- validar todos os breakpoints responsivos.

## P3 — operação e monitorização

Estado: **INICIADO**

### P3-A — watchdog de integridade e saúde

Estado: **FECHADO**

- falso timeout eliminado;
- fase SQL reduzida de cerca de 78 para 5,6 segundos;
- execução completa em aproximadamente 30 segundos;
- monitorização recorrente de registry, referências, triggers, permissões, PM2 e páginas públicas.

### P3-B — reconciliação automática

Estado: **PENDENTE**

- comparação periódica com o Portal BASE;
- alertas de ingestões incompletas;
- deteção de diferenças por ID;
- relatório automático de inseridos, atualizados e ausentes.

### P3-C — continuidade e recuperação

Estado: **PENDENTE**

- testar periodicamente backup e restauro;
- simular recuperação;
- definir retenção e limpeza de evidências;
- monitorizar espaço, logs e swap;
- consolidar documentação operacional.

## P4 — evolução funcional e comercial

Estado: **FUTURO**

- analytics avançados;
- pesquisas guardadas;
- alertas personalizados;
- relatórios recorrentes;
- exportações agendadas;
- API para clientes;
- equipas, permissões e planos;
- comparação de entidades, fornecedores, CPV e regiões.

## Ordem recomendada

1. Classificar o universo P1-C2 e selecionar a primeira tranche segura.
2. Preparar P1-C2 com backup, compensação, ensaio isolado e revisão independente.
3. Fechar P1-C3 após o saneamento físico.
4. Implementar métricas p50/p95 do P2-B.
5. Tratar facetas, normalização geográfica e cache no P2-C.
6. Avançar com reconciliação automática e testes de recuperação do P3.

## Regra de fecho

Nenhum bloco é dado como fechado apenas por estar implementado. Conforme o tipo de alteração, o fecho exige testes, revisão independente, validação do percurso real, publicação identificada, monitorização e evidência de rollback ou compensação.
