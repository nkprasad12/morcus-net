#!/bin/bash
set -e

# Determine working directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUR_DIR="$(basename "$PWD")"

if [[ "$CUR_DIR" == "morcus-net" ]]; then
  MORCUS_NET_DIR="$PWD"
  MORCUS_DIR="$(dirname "$PWD")"
elif [[ "$CUR_DIR" == "morcus" ]]; then
  MORCUS_DIR="$PWD"
  if [ -d "$PWD/morcus-net" ]; then
    MORCUS_NET_DIR="$PWD/morcus-net"
  else
    MORCUS_NET_DIR="$PWD/morcus-net"
    mkdir -p "$MORCUS_NET_DIR"
  fi
else
  MORCUS_DIR="$PWD/morcus"
  MORCUS_NET_DIR="$MORCUS_DIR/morcus-net"
fi

APP_NAME="Morcus Latin Tools"
PORT="5757"
ENV_PATH="$MORCUS_NET_DIR/.env"

declare -A RESOURCES=(
  ["LS_PATH"]="lexica https://github.com/nkprasad12/lexica.git CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml"
  ["RA_PATH"]="riddle-arnold https://github.com/nkprasad12/riddle-arnold.git riddle-arnold.tsv"
  ["GESNER_RAW_PATH"]="gesner https://github.com/nkprasad12/gesner.git gesner.json"
  ["SH_RAW_PATH"]="smithandhall https://github.com/nkprasad12/smithandhall.git sh_F2_latest.txt v1edits"
  ["GEORGES_RAW_PATH"]="Georges1910 https://github.com/nkprasad12/Georges1910.git Georges1910-ger-lat.xml morcus-net-branch"
  ["POZO_RAW_PATH"]="latin-dictionary https://github.com/nkprasad12/latin-dictionary.git LopezPozo1997/diccionario.txt morcus"
  ["LIB_XML_ROOT"]="canonical-latinlit https://github.com/nkprasad12/canonical-latinlit"
  ["HYPOTACTIC_ROOT"]="hypotactic https://github.com/nkprasad12/hypotactic.git"
  ["PHI_JSON_ROOT"]="phi-public-domain-json https://github.com/nkprasad12/phi-public-domain-json.git"
  ["GAFFIOT_RAW_PATH"]="gaffiot.js https://raw.githubusercontent.com/nkprasad12/gaffiot/refs/heads/main/gaffiot.js"
)

function ensure_env {
  if [ ! -f "$ENV_PATH" ]; then
    mkdir -p "$(dirname "$ENV_PATH")"
    touch "$ENV_PATH"
    echo "PORT=$PORT" >> "$ENV_PATH"
  fi
}

function env_has_var {
  grep -q "^$1=" "$ENV_PATH"
}

function set_env_var {
  echo "$1=$2" >> "$ENV_PATH"
}

function clone_repo {
  local dir=$1
  local url=$2
  local branch=$3
  if [ ! -d "$dir" ]; then
    git clone "$url" "$dir"
    if [ -n "$branch" ]; then
      cd "$dir"
      git checkout "$branch"
      cd ..
    fi
  fi
}

function download_file {
  local url=$1
  local out=$2
  if [ ! -f "$out" ]; then
    curl -L "$url" -o "$out"
  fi
}

echo "This script will set up $APP_NAME in a '$MORCUS_DIR' subdirectory of current directory."
if [ ! -d "$MORCUS_DIR" ]; then
  mkdir -p "$MORCUS_DIR"
fi

cd "$MORCUS_DIR"

if [ ! -d "morcus-net" ]; then
  git clone https://github.com/nkprasad12/morcus-net.git
fi

cd "$MORCUS_NET_DIR"
git checkout dev
npm ci

echo "Setting up git hooks"
git config --local core.hooksPath .githooks/
cd "$MORCUS_DIR"

ensure_env

for VAR in "${!RESOURCES[@]}"; do
  if ! env_has_var "$VAR"; then
    IFS=' ' read -r DIR URL FILE BRANCH <<< "${RESOURCES[$VAR]}"
    if [[ "$URL" == *.git ]]; then
      clone_repo "$DIR" "$URL" "$BRANCH"
      # Compose path for env variable
      if [ "$VAR" == "LS_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "RA_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "GESNER_RAW_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "SH_RAW_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "GEORGES_RAW_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "POZO_RAW_PATH" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR/$FILE"
      elif [ "$VAR" == "LIB_XML_ROOT" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR"
      elif [ "$VAR" == "HYPOTACTIC_ROOT" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR"
      elif [ "$VAR" == "PHI_JSON_ROOT" ]; then
        set_env_var "$VAR" "$MORCUS_DIR/$DIR"
      fi
    else
      download_file "$URL" "$DIR"
      set_env_var "$VAR" "$MORCUS_DIR/$DIR"
    fi
  fi
done

echo "Processing raw dictionary files, building the client, and starting the server."
cd "$MORCUS_NET_DIR"
./morcus.sh web --build_all --minify
