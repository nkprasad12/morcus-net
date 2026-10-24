#!/bin/bash

set -e

function env_var() {
  variable=$(grep ^"${1}"= "$(pwd)/.env" | xargs)
  IFS="=" read -ra variable <<< "${variable}"
  echo "${variable[1]}"
}

if ! [ -x "$(command -v docker)" ]; then
  echo 'Error: docker is not installed.' >&2
  exit 1
fi

if ! [ -e ".env" ]
then
    echo "No .env file found! See 'src/devops/.env.template' in the Morcus repo for instructions." >&2
    exit 1
fi

ENV_LOGS_DIR=$(env_var "LOGS_DIR")
LOGS_DIR=$(readlink -f "$ENV_LOGS_DIR")
mkdir -p "$LOGS_DIR"
touch "$LOGS_DIR"/access.log
touch "$LOGS_DIR"/error.log

# The telemetry pruner (see src/devops/monitoring.md) archives old telemetry
# weeks here by default before deleting them from MongoDB. It runs as UID 1000
# inside its container, so the directory must be owned by that UID on the host.
# Without it, the pruner refuses to start (and deletes nothing).
ARCHIVES_DIR="$LOGS_DIR/archives"
echo "Creating the telemetry archive directory $ARCHIVES_DIR (owned by UID 1000; may ask for sudo)."
sudo install -d -o 1000 -g 1000 "$ARCHIVES_DIR"
echo -e "\n==> Telemetry archives (gzipped JSONL, a few MB per week) will be written to:\n    $ARCHIVES_DIR\n    This is the ONLY copy once the week is deleted from MongoDB. Set PRUNE_BACKUP_URI\n    in .env to use S3/R2 instead (see src/devops/.env.template).\n"

docker compose up -d
echo -e "\nStarted services successfully with 'docker compose up -d'
Use 'docker compose logs' to view logs, or 'docker compose down' to stop.\n"

read -p "Automatically restart services on reboot? [Press y to confirm or any other key to skip]: " -n 1 -r
echo
if [[ $REPLY =~ ^[y]$ ]]
then
  echo "Attempting to add a crontab entry."
  echo "You may see output like 'no crontab for username' - this is OK."
  crontab -l | crontab
  RESTART_ON_REBOOT="@reboot cd $(pwd) && docker compose up -d"
  ! (crontab -l | grep -q "$RESTART_ON_REBOOT") && (crontab -l; echo "$RESTART_ON_REBOOT") | crontab
  echo -e "Entry added! You can remove it by running 'crontab -e' and removing the line '$RESTART_ON_REBOOT'.\n"
else
  echo -e "Skipping automatic restarts on reboot.\n"
fi

echo "Setup complete!"
