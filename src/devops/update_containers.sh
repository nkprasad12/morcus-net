#!/bin/bash

# Schedule this script via `crontab`
# Run: `crontab -e`, then add:
# * * * * * cd /root/morcus2 && ./update_container.sh
# @reboot cd /root/morcus2 && ./update_container.sh

echo -e "\n==== Checking for updates ===="
docker compose pull
docker compose up -d --remove-orphans
yes | docker image prune
