#!/bin/bash

# Schedule this script via `crontab`
docker compose pull
docker compose up -d --remove-orphans
yes | docker image prune
