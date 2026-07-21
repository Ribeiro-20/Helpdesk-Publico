#!/bin/bash
# Wrapper script para execucao da aplicacao via cron

PROJECT_DIR="/home/diogo/Documents/Github/estagio2026HelpDesk"

cd "$PROJECT_DIR" || exit 1

export PATH="$PROJECT_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin"

exec /usr/bin/make run >> "$PROJECT_DIR/helpdesk.log" 2>&1
