#!/bin/bash
# Script para instalacao automatica da entrada no crontab (@reboot)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_CRON_SCRIPT="$SCRIPT_DIR/run_cron.sh"

chmod +x "$RUN_CRON_SCRIPT"

CRON_JOB="@reboot $RUN_CRON_SCRIPT"

(crontab -l 2>/dev/null | grep -v "$RUN_CRON_SCRIPT"; echo "$CRON_JOB") | crontab -

echo "Entrada cron adicionada com sucesso no crontab do utilizador."
echo "Para verificar: crontab -l"
