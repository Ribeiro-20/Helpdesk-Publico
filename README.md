# estagio2026HelpDesk

Plataforma de gestão de pagamentos e suporte desenvolvida em Django para integração com passarelas de pagamento (EuPago), serviços de CRM (HubSpot) e plataformas de faturação (TOCOnline).

## Índice

- [Visão Geral](#visão-geral)
- [Arquitetura e Módulos](#arquitetura-e-módulos)
- [Requisitos e Instalação](#requisitos-e-instalação)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Execução e Comandos Make](#execução-e-comandos-make)
- [Endpoints da API](#endpoints-da-api)
- [Comandos de Gestão (Management Commands)](#comandos-de-gestão-management-commands)
- [Testes e Qualidade de Código](#testes-e-qualidade-de-código)
- [Implantação e Serviços (Systemd / Cron)](#implantação-e-serviços-systemd--cron)

---

## Visão Geral

O projeto centraliza o fluxo de checkout e o processamento de pagamentos em Portugal (MBWay, Multibanco, Cartão de Crédito e Débito Direto), gerindo notificações via webhook e sincronização com plataformas externas de CRM e faturação.

---

## Arquitetura e Módulos

A aplicação Django está estruturada nas seguintes apps principais:

- **core**: Modelos de dados globais e registo de transações (`Transaction`, `TransactionStatus`).
- **eupago**: Cliente HTTP, mappers, DTOs, handlers por método de pagamento e receção de webhooks da EuPago.
- **checkout**: Orquestração do fluxo de checkout, validação de formulários e despacho dinâmico via `PaymentDispatcher`.
- **hubspot**: Cliente de integração com a API do HubSpot CRM.
- **toconline**: Cliente de integração com autenticação OAuth2 (Authorization Code Flow) para a plataforma TOCOnline.

---

## Requisitos e Instalação

Pré-requisitos:
- Python 3.10+
- Ambiente virtual (`.venv`)

### Instalação de dependências:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ou via Makefile:

```bash
make install
```

---

## Variáveis de Ambiente

Crie o ficheiro `.env` na raiz do projeto com base no `.env.example`:

```ini
# HubSpot Configuration
HAPI_KEY="your_hubspot_api_key"
HENDPOINT="https://api.hubapi.com/"

# EuPago Configuration
EAPI_KEY="your_eupago_api_key"
EENDPOINT="https://sandbox.eupago.pt/"

# TOCOnline Configuration
TENDPOINT="https://api.toconline.pt/"
TENDPOINT_OAUTH="https://api.toconline.pt/oauth"
TCLIENTID="your_client_id"
TCLIENT_SECRET="your_client_secret"
TREDIRECT_OAUTH="https://your-redirect-url.com/callback"
```

---

## Execução e Comandos Make

Aplicar migrações e iniciar o servidor de desenvolvimento:

```bash
make fullmigrate
make run
```

Ou usando diretamente os comandos Django:

```bash
python helpdeskMain/manage.py migrate
python helpdeskMain/manage.py runserver
```

O servidor ficará disponível por defeito em `http://127.0.0.1:8000/`.

---

## Endpoints da API

- **POST /checkout/**
  Recebe os dados do formulário de checkout, valida as informações, constrói os DTOs necessários e despacha o pagamento para a passarela correspondente.

- **POST /eupago/webhook/**
  Endpoint assíncrono para receção de notificações da EuPago sobre mudanças de estado de pagamentos (PAID, ERROR, REFUNDED, CANCELED, EXPIRED).

- **GET /admin/**
  Painel de administração do Django para consulta de transações registadas na base de dados.

---

## Comandos de Gestão (Management Commands)

Execução a partir de `helpdeskMain/`:

1. **MBWay**:
```bash
python manage.py create_mbway_payment \
  --identifier "order-123" \
  --amount 25.50 \
  --currency "EUR" \
  --customer-phone 912345678 \
  --country-code 351 \
  --customer-name "Nome Cliente" \
  --email "cliente@email.com" \
  --payment-phone 912345678
```

2. **Multibanco**:
```bash
python manage.py create_multibanco_payment \
  --valor 25.50 \
  --id "PAY-12345" \
  --data_inicio 2026-07-01 \
  --data_fim 2026-07-31 \
  --valor_maximo 100 \
  --valor_minimo 1 \
  --per_dup 0 \
  --failOver "email" \
  --email "cliente@email.com" \
  --contacto "912345678" \
  --userID "USR001"
```

3. **Cartão de Crédito**:
```bash
python manage.py create_creditcard_payment \
  --identifier "order-456" \
  --amount 25.50 \
  --currency "EUR" \
  --success-url "https://exemplo.com/sucesso" \
  --fail-url "https://exemplo.com/falha" \
  --back-url "https://exemplo.com/cancelado" \
  --lang "PT" \
  --customer-email "cliente@email.com"
```

---

## Testes e Qualidade de Código

Para executar a pipeline completa de validação:

```bash
make pipeline
```

Comandos individuais:
- **Testes automatizados**: `make test` (pytest)
- **Análise estática de código**: `make lint` (pylint)
- **Verificação de tipos**: `make pyrefly` (pyrefly check)

---

## Implantação e Serviços (Systemd / Cron)

O projeto inclui ficheiros auxiliares em `scripts/` para automação de execução:

- **Systemd Service**: Ficheiro `scripts/helpdesk.service` pronto para instalação como serviço de utilizador (`~/.config/systemd/user/`) ou de sistema.
- **Cron Job**: Exemplo de entrada `@reboot` para inicialização automática ao ligar o sistema.

Consulte o ficheiro `commands.md` e a Ficha Técnica em `ficha_tecnica_estagio2026HelpDesk.docx` para informações detalhadas adicionais.
