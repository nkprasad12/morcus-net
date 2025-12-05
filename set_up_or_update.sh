#!/bin/bash
set -e

# Color codes
COLOR_INFO="\033[1;34m"
COLOR_WARN="\033[1;33m"
COLOR_ERR="\033[1;31m"
COLOR_RESET="\033[0m"
INDENT="  "

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
  ["LIB_XML_ROOT"]="canonical-latinlit https://github.com/nkprasad12/canonical-latinlit.git"
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
    echo -e "${COLOR_INFO}Cloning repo '$dir' from $url...${COLOR_RESET}"
    git clone "$url" "$dir"
    if [ -n "$branch" ]; then
      cd "$dir"
      echo -e "${INDENT}${COLOR_INFO}Checking out branch '$branch' in '$dir'...${COLOR_RESET}"
      git checkout "$branch"
      cd ..
    fi
    echo -e "${COLOR_INFO}Repo '$dir' cloned.${COLOR_RESET}"
  fi
}

function download_file {
  local url=$1
  local out=$2
  if [ ! -f "$out" ]; then
    echo -e "${COLOR_INFO}Downloading file '$out' from $url...${COLOR_RESET}"
    curl -L "$url" -o "$out"
    echo -e "${COLOR_INFO}File '$out' downloaded.${COLOR_RESET}"
  fi
}

function get_env_var {
  grep "^$1=" "$ENV_PATH" | cut -d'=' -f2-
}

function check_and_pull_repo {
  local dir=$1
  local expected_branch=$2
  if [ -d "$dir" ]; then
    echo -e "${COLOR_INFO}Found existing repo '$dir', checking if it is up to date...${COLOR_RESET}"
    cd "$dir"
    if [ -n "$expected_branch" ]; then
      current_branch=$(git rev-parse --abbrev-ref HEAD)
      if [ "$current_branch" != "$expected_branch" ]; then
        # Check for pending changes
        if [ -z "$(git status --porcelain)" ]; then
          echo -e "${COLOR_WARN}Repo '$dir' is on branch '$current_branch', expected '$expected_branch'.${COLOR_RESET}"
          read -p "${INDENT}No pending changes detected. Switch to branch '$expected_branch'? [y/N]: " yn
          if [[ "$yn" =~ ^[Yy]$ ]]; then
            echo -e "${INDENT}${COLOR_INFO}Switching '$dir' to branch '$expected_branch'...${COLOR_RESET}"
            git checkout "$expected_branch"
            echo -e "${INDENT}${COLOR_INFO}Switched '$dir' to branch '$expected_branch'.${COLOR_RESET}"
          else
            echo -e "${COLOR_ERR}Aborting setup. Please switch branch manually.${COLOR_RESET}"
            exit 1
          fi
        else
          echo -e "${COLOR_ERR}ERROR: '$dir' is on branch '$current_branch', expected '$expected_branch', and has pending changes.${COLOR_RESET}"
          echo -e "${INDENT}${COLOR_ERR}Please commit or stash your changes and switch branch manually.${COLOR_RESET}"
          exit 1
        fi
      fi
    fi
    echo -e "${INDENT}${COLOR_INFO}Pulling changes from repo '$dir'...${COLOR_RESET}"
    git pull
    echo -e "${INDENT}${COLOR_INFO}Repo '$dir' is up to date.${COLOR_RESET}"
    cd "$MORCUS_DIR"
  fi
}

function ensure_rust_and_cargo {
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    return 0
  fi

  echo -e "${COLOR_WARN}Rust and/or Cargo not detected.${COLOR_RESET}"
  echo -e "${INDENT}To install Rust and Cargo, the following command will be run:"
  echo -e "${INDENT}${COLOR_INFO}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${COLOR_RESET}"
  read -p "${INDENT}Would you like to install Rust and Cargo now? [y/N]: " yn
  if [[ ! "$yn" =~ ^[Yy]$ ]]; then
    echo -e "${COLOR_WARN}Some features will not work without Rust and Cargo.${COLOR_RESET}"
    echo -e "${INDENT}See: https://rust-lang.org/ for install instructions."
    return 1
  fi

  echo -e "${INDENT}${COLOR_INFO}Installing Rust and Cargo using rustup...${COLOR_RESET}"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  read -p "${INDENT}Can this script source \$HOME/.cargo/env and continue? [y/N]: " srcyn
  if [[ "$srcyn" =~ ^[Yy]$ ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
    if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
      return 0
    else
      echo -e "${COLOR_ERR}Rust/Cargo still not detected after sourcing. Please check your installation.${COLOR_RESET}"
      echo -e "${INDENT}See: https://rust-lang.org/ for install instructions."
      return 1
    fi
  else
    echo -e "${COLOR_INFO}Please restart your shell or run 'source \$HOME/.cargo/env' before rerunning this script.${COLOR_RESET}"
    exit 0
  fi
}

function source_nvm {
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
}

function install_and_use_lts_node {
  echo -e "${INDENT}${COLOR_INFO}Installing and using latest LTS version of Node.js with nvm...${COLOR_RESET}"
  nvm install --lts
  nvm use --lts
}

function ensure_node_and_npm {
  local missing_node=0
  local missing_npm=0

  if ! command -v node >/dev/null 2>&1; then
    missing_node=1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    missing_npm=1
  fi

  if (( !missing_node && !missing_npm )); then
    return 0
  fi

  # If nvm is already installed, use it to install node
  if command -v nvm >/dev/null 2>&1 || [ -f "$HOME/.nvm/nvm.sh" ]; then
    if ! command -v nvm >/dev/null 2>&1; then
      source_nvm
    fi
    install_and_use_lts_node
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
      return 0
    else
      echo -e "${COLOR_ERR}Node.js/npm still not detected after nvm install. Please check your installation.${COLOR_RESET}"
      echo -e "${INDENT}See: https://github.com/nvm-sh/nvm for nvm instructions."
      echo -e "${INDENT}Or visit https://nodejs.org for direct Node.js installers."
      exit 1
    fi
  fi

  echo -e "${COLOR_ERR}Error: Node.js and/or npm is not installed.${COLOR_RESET}"
  echo -e "${INDENT}This script can install Node.js for you using nvm (Node Version Manager)."
  echo -e "${INDENT}The following command will be run to install nvm:"
  echo -e "${INDENT}${COLOR_INFO}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash${COLOR_RESET}"
  read -p "${INDENT}Would you like to install nvm and use it to install Node.js? [y/N]: " yn
  if [[ ! "$yn" =~ ^[Yy]$ ]]; then
    echo -e "${COLOR_ERR}Node.js and npm are required to run Morcus.net.${COLOR_RESET}"
    echo -e "${INDENT}See: https://github.com/nvm-sh/nvm for nvm instructions."
    echo -e "${INDENT}Or visit https://nodejs.org for direct Node.js installers."
    exit 1
  fi

  echo -e "${INDENT}${COLOR_INFO}Installing nvm...${COLOR_RESET}"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

  read -p "${INDENT}Can this script source \$HOME/.nvm/nvm.sh and continue? [y/N]: " srcyn
  if [[ "$srcyn" =~ ^[Yy]$ ]]; then
    source_nvm
    install_and_use_lts_node
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
      return 0
    else
      echo -e "${COLOR_ERR}Node.js/npm still not detected after sourcing and installing. Please check your installation.${COLOR_RESET}"
      echo -e "${INDENT}See: https://github.com/nvm-sh/nvm for nvm instructions."
      echo -e "${INDENT}Or visit https://nodejs.org for direct Node.js installers."
      exit 1
    fi
  else
    echo -e "${COLOR_INFO}Please restart your shell or run 'source \$HOME/.nvm/nvm.sh' before rerunning this script.${COLOR_RESET}"
    exit 0
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

# Prompt before switching to dev branch if not already on dev
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "dev" ]; then
  echo -e "${COLOR_WARN}You are currently on branch '$current_branch' in morcus-net.${COLOR_RESET}"
  read -p "${INDENT}Switch to branch 'dev'? [y/N]: " yn
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    echo -e "${INDENT}${COLOR_INFO}Switching to branch 'dev'...${COLOR_RESET}"
    git checkout dev
  else
    echo -e "${COLOR_WARN}Continuing setup on branch '$current_branch' (not 'dev').${COLOR_RESET}"
  fi
fi

# Prompt before running npm ci if node_modules exists
if [ -d "node_modules" ]; then
  echo -e "${COLOR_WARN}Directory 'node_modules' already exists in morcus-net.${COLOR_RESET}"
  read -p "${INDENT}Run 'npm ci' anyway? This will remove and reinstall all modules. [y/N]: " yn
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    echo -e "${INDENT}${COLOR_INFO}Running 'npm ci'...${COLOR_RESET}"
    npm ci
  else
    echo -e "${COLOR_INFO}Skipping 'npm ci'.${COLOR_RESET}"
  fi
else
  echo -e "${COLOR_INFO}Running 'npm ci'...${COLOR_RESET}"
  npm ci
fi

echo "Setting up git hooks"
git config --local core.hooksPath .githooks/
cd "$MORCUS_DIR"

ensure_env

for VAR in "${!RESOURCES[@]}"; do
  IFS=' ' read -r DIR URL FILE BRANCH <<< "${RESOURCES[$VAR]}"
  if env_has_var "$VAR"; then
    if [[ "$URL" == *.git ]]; then
      check_and_pull_repo "$DIR" "$BRANCH"
    fi
    continue
  fi
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
done

cd "$MORCUS_NET_DIR"

if ensure_rust_and_cargo; then
  echo -e "${COLOR_INFO}Rust and Cargo detected. Building Rust bindings...${COLOR_RESET}"
  npm run setup-node-bindgen
fi

echo "Processing raw dictionary files, building the client, and starting the server."
./morcus.sh web --build_all --minify
