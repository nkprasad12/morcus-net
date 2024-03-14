#!/bin/bash

echo "This script will set up all services required for Morcus Latin Tools in the current directory."


if [ -e ".env" ]
then
    echo "Error: '.env' file already exists and would be overwritten."
    exit 1
fi
echo "Enter absolute path to directory with SSL certificate and private key."
read -p "These must be named 'origin_cert.pem' and 'private_key.pem': " SSL_DIR
if ! [ -x "$(command -v docker)" ]; then
  echo 'Error: docker is not installed.' >&2
  exit 1
fi
if [ ! -e "${SSL_DIR}/origin_cert.pem" ]
then
    echo "Error: You must have an SSL certificate named 'origin_cert.pem' in the target directory."
    exit 1
fi
if [ ! -e "${SSL_DIR}/private_key.pem" ]
then
    echo "Error: You must have a private key named 'private_key.pem' in the target directory."
    exit 1
fi


mkdir -p logs
LOGS_DIR=$(readlink -f logs)
touch logs/access.log
touch logs/error.log

read -p "Enter container registry from which to pull images: " CONTAINER_REGISTRY

echo "Populating .env file."
touch .env
echo "SSL_CERT_DIR=${SSL_DIR}" >> .env
echo "CONTAINER_REGISTRY=${CONTAINER_REGISTRY}" >> .env
echo "LOGS_DIR=${LOGS_DIR}" >> .env

echo "Starting services with 'docker compose up'."
docker compose up
