#!/bin/bash
# Script para instalacao do servico systemd a nivel de utilizador

SERVICE_NAME="helpdesk.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/.config/systemd/user"

mkdir -p "$TARGET_DIR"

cp "$SCRIPT_DIR/$SERVICE_NAME" "$TARGET_DIR/$SERVICE_NAME"

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"

echo "Servico $SERVICE_NAME instalado e ativado com sucesso."
echo "Para verificar o estado: systemctl --user status $SERVICE_NAME"
echo "Para ver os logs: journalctl --user -u $SERVICE_NAME -f"
