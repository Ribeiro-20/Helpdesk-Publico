Relatório Intermédio de Estágio
Curso: Engenharia Informática e Tecnologias de Informação e Comunicação
Projeto: BASE Monitor - Módulo de Inteligência de Mercado
Estagiário: Silvio Morgado
Local de Estágio: Helpdesk Público

1. Enquadramento da Empresa e do Estágio

1.1. Enquadramento da Empresa
O Helpdesk Público é uma plataforma e consultora especializada em capacitar entidades privadas, especialmente Micro, Pequenas e Médias Empresas, na identificação, concorrência e submissão de propostas a concursos públicos regulados pelo regime jurídico da contratação pública em Portugal.

1.2. Foco da Contribuição Individual no Estágio
No contexto do desenvolvimento da plataforma digital BASE Monitor, a minha contribuição e responsabilidade principal centrou-se na conceção, arquitetura, segurança e desenvolvimento do módulo de Inteligência de Mercado.

Este módulo constitui a área analítica e restrita do sistema, destinada a fornecer aos utilizadores finais informação em tempo real sobre a execução de contratos públicos em curso, identificando prazos de conclusão estimados, volumes transacionados e alertas de desvios orçamentais iminentes. As minhas atividades abrangeram desde a criação da página inicial de dados até à evolução completa do sistema de autenticação, passando por extensos processos de depuração, testes de integração, otimizações de desempenho e colaboração com os colegas na fusão de código entre ramos de desenvolvimento Git.

2. Descrição Detalhada das Atividades Desenvolvidas

As minhas atividades seguiram uma cronologia evolutiva ao longo das sessões de trabalho, divididas nos seguintes marcos técnicos:

2.1. Criação Inicial da Página de Inteligência de Mercado
Desenvolvi a primeira versão funcional da página que constitui o núcleo do módulo de Inteligência de Mercado. Esta página efetua uma consulta à base de dados no lado do servidor utilizando o cliente Supabase administrativo para consultar contratos com prazo de execução definido, permitindo a renderização no servidor. Implementei um algoritmo que cruza a data de celebração do contrato com o prazo de execução em dias para estimar a percentagem de progresso temporal do contrato. Apliquei também um filtro para exibir apenas contratos que atingiram 75 por cento do prazo de execução, revelando oportunidades de renovação iminentes. Os contratos são ordenados por progresso ascendente, facilitando a priorização pelo utilizador.

2.2. Sistema de Login e Controlo de Acessos
Implementei a primeira versão do sistema de controlo de acessos à área restrita, constituída por uma página de login com campos de email e palavra-passe, estilizada com design premium através de Tailwind CSS. Criei uma API REST que emite um cookie de sessão com expiração de 10 minutos. Desenvolvi um componente React que lê o cookie de sessão, calcula o tempo restante em tempo real e renderiza um relógio de contagem decrescente na interface. Ao atingir zero, executa a destruição do cookie e redireciona automaticamente o utilizador para a página de login. Adicionei lógica no middleware do Next.js que interceta pedidos e verifica a existência da sessão, protegendo a rota.

2.3. Evolução para Autenticação por Segundo Fator
Decidi evoluir o mecanismo para um sistema robusto de autenticação usando a API transacional da Brevo. Isto implicou a migração da infraestrutura de email devido a constrangimentos de bloqueio de portas SMTP em ambientes cloud. O utilizador submete o email e o servidor gera um código de 6 dígitos aleatório, armazenado em memória com expiração de 10 minutos. O código é enviado através de uma chamada HTTP à API da Brevo com um template HTML personalizado. O utilizador introduz o código recebido, o servidor valida a correspondência e, em caso de sucesso, emite o cookie seguro de sessão.

2.4. Desenvolvimento do Painel Otimizado
Extraí toda a lógica de renderização de dados para um componente React independente. Integrei um sistema de paginação no cliente e indicadores de progresso com cor dinâmica, desde o verde para execução estável até ao vermelho para contratos terminados. Implementei o carregamento assíncrono otimizado de códigos CPV que evita consultas pesadas à base de dados. Ao renderizar a tabela, o componente identifica apenas os códigos presentes na página atual e efetua uma única consulta consolidada, guardando as descrições em cache local. Integrei também um modal que se abre ao clicar numa linha da tabela com toda a informação do contrato selecionado.

2.5. Correção de Inconsistências de Dados da API BASE
Descobri que muitos contratos apareciam sem código CPV ou sem entidades associadas. A investigação revelou que a API BASE enviava dados com estruturas heterogéneas. Refatorei a função de mapeamento para aceitar vários formatos de forma defensiva, normalizando os dados automaticamente para arrays consistentes. Esta correção restaurou centenas de contratos que apareciam incompletos no painel.

2.6. Depuração e Resolução do Problema de Contratos Vazios
Realizei um extenso processo de depuração quando o painel não mostrava contratos. Verifiquei as políticas de segurança da base de dados e descobri que os contratos ingeridos não tinham o campo de estado preenchido corretamente. Criei scripts de diagnóstico em Node.js para analisar a distribuição de dados e ajustei o limiar de filtragem de 80 para 75 por cento para captar mais contratos relevantes.

2.7. Resolução de Problemas de Acesso e Memória
Ao testar a ingestão de contratos, deparei-me com o erro de falta de memória visto que a função tentava carregar todos os contratos de um ano inteiro de uma só vez. Implementei uma otimização do processamento em sub-blocos e libertação de memória. Além disso, corrigi um problema de acesso ao painel principal quando a base de dados local não estava em execução, adicionando um tratamento de erros no middleware para prevenir falhas no servidor.

3. Avaliação Crítica do Progresso Realizado

O módulo de Inteligência de Mercado evoluiu significativamente desde uma página estática com cálculo simples até um sistema completo com autenticação, sessões temporizadas, otimizações de performance e tratamento robusto de dados inconsistentes. Como aspetos a melhorar, a persistência dos códigos temporários atualmente em memória deve ser migrada para uma solução como Redis ou uma tabela Supabase para evitar falhas em produção.

4. Cronograma e Planeamento de Atividades

O planeamento das atividades do estágio teve o seu início a 2 de março. A evolução do trabalho decorreu da seguinte forma:

Primeiro, foi feito o planeamento e o levantamento de todos os requisitos necessários para o projeto.
De seguida, elaborei o desenho inicial da plataforma através da ferramenta Figma.
Após essa etapa, procedi à exportação do código do repositório Github e dos componentes do Figma.
Iniciei o processo de desenvolvimento técnico, começando pela implementação da página de Inteligência de Mercado.
Depois, desenvolvi toda a parte do sistema de login e mecanismos de segurança.
Por fim, durante este último mês, dediquei os meus esforços na realização de ajustes e na resolução dos erros encontrados no sistema.

5. Planeamento das Atividades Futuras até Julho

Para as próximas fases do projeto até ao mês de julho, estão planeadas as seguintes atividades:

Desenvolver a funcionalidade de envio automático de emails com o objetivo de alertar o utilizador assim que o contrato monitorizado atingir 75 por cento do seu prazo de execução.
Implementar filtros avançados na página de Inteligência de Mercado, permitindo uma pesquisa mais direcionada e eficiente.
Ajustar e afinar o código e as funcionalidades existentes, garantindo a estabilidade e o fecho adequado do projeto.

6. Conclusões Finais

O desenvolvimento do módulo representou uma oportunidade de aplicar conceitos avançados de engenharia de software num contexto real de produção, desde a otimização de bases de dados ao tratamento defensivo de APIs instáveis, evidenciando uma aprendizagem contínua e uma evolução crescente na resolução de problemas complexos.
