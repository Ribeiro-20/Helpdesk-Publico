# SETUP.md — Guia de Instalação para Alunos

Este guia explica como configurar o ambiente local para correr o projecto **BASE Monitor** no Windows.

---

## Pré-requisitos

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — necessário para o Supabase correr localmente
- **Supabase CLI** — ver opções abaixo

---

## 1. Instalar o Supabase CLI no Windows

### Opção 1 — via npm (se já tiveres Node.js 20+)

> O Supabase CLI não suporta `npm install -g`. Instala como dependência do projecto:

```powershell
npm install supabase --save-dev
```

Verificar:

```powershell
npx supabase --version
```

> ⚠️ Com esta opção usa sempre `npx supabase` em vez de `supabase`.

---

### Opção 2 — via Scoop ✅ Recomendada

Instala o [Scoop](https://scoop.sh) (gestor de pacotes para Windows):

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

Instala o Supabase CLI:

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Verificar:

```powershell
supabase --version
```

---

### Opção 3 — Download direto (fallback)

Vai à página de [releases do Supabase CLI](https://github.com/supabase/cli/releases) e escolhe a versão mais recente, ou corre este script PowerShell:

```powershell
$version = "v2.75.0"
$url = "https://github.com/supabase/cli/releases/download/$version/supabase_windows_amd64.tar.gz"
$dest = "$env:USERPROFILE\AppData\Local\supabase"
$tarPath = "$env:TEMP\supabase.tar.gz"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Invoke-WebRequest -Uri $url -OutFile $tarPath
tar -xzf $tarPath -C $dest

$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$dest*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$dest", "User")
    Write-Output "Adicionado ao PATH: $dest"
}

& "$dest\supabase.exe" --version
```

Fecha e abre um novo terminal e verifica:

```powershell
supabase --version
```

---

## 2. Clonar o repositório

```powershell
git clone https://github.com/marioamorim85/base-monitor.git
cd base-monitor
```

---

## 3. Configurar variáveis de ambiente

```powershell
Copy-Item .env.example .env
notepad .env
```

Preenche os campos obrigatórios (ver descrição em [README.md](README.md#variáveis-de-ambiente--referência-completa)).  
Os campos `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são obtidos após correr `npm run setup` no passo seguinte.

---

## 4. Instalar e inicializar tudo

```powershell
npm install
npm run setup
```

O `npm run setup` faz automaticamente:

| Passo                            | O que faz                                                               |
| -------------------------------- | ----------------------------------------------------------------------- |
| `supabase start`                 | Arranca o Supabase local (Docker)                                       |
| `supabase db reset`              | Cria a base de dados e aplica as migrations                             |
| `npx tsx scripts/import-cpvs.ts` | Popula os 9 454 códigos CPV (**obrigatório** para o matching funcionar) |

> ⚠️ **Atenção:** `supabase db reset` apaga todos os dados locais da base de dados. Usa só na primeira instalação ou quando queiras recomeçar do zero.

Após o `supabase start`, copia os valores de **API anon key** e **Service role key** para o ficheiro `.env`.

---

## 5. Iniciar o frontend

```powershell
npm run dev
```

Abre **http://localhost:3001** no browser.

---

## 6. Iniciar as Edge Functions

```powershell
# Numa PowerShell separada:
npm run functions
```

---

## 7. Primeiro login

1. Vai a http://localhost:3001/login
2. Cria uma conta (email + password)
3. Faz login
4. No Dashboard, clica em **"Inicializar Sistema"**

---

## Resumo dos comandos

```powershell
# Depois de clonar o repo:
npm install         # instala dependências
npm run setup       # arranca Supabase + cria BD + popula CPVs
npm run dev         # inicia o frontend (http://localhost:3001)
npm run functions   # inicia as edge functions (numa janela separada)
```

---

## Troubleshooting

**"supabase: command not found"**  
→ Usa a Opção 1 (`npx supabase`) ou reinicia o terminal após instalar pelo Scoop.

**Docker não está a correr**  
→ Abre o Docker Desktop e aguarda que esteja pronto antes de correr `npm run setup`.

**Porta 54321 já em uso**  
→ Corre `supabase stop` e depois `supabase start`.

**Chaves erradas no .env**  
→ Corre `supabase status` para ver as chaves actuais do serviço local.
