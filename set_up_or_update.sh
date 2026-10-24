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

LOCK_PATH="$MORCUS_NET_DIR/upstream_sources.lock.json"

# Prints "<source> <env var> <file or -> <repo>" for each upstream data source
# in the lock file, which pins each repo to a commit. Each source is cloned
# into "$MORCUS_DIR/<source>", and its env var points at <file> in the clone
# (or at the clone itself). `./morcus.sh upstream sync` then checks out the
# pinned commits, leaving any local work alone.
function list_sources {
  node -e '
    const { sources } = require(process.argv[1]);
    for (const [name, s] of Object.entries(sources)) {
      console.log([name, s.env, s.file || "-", s.repo].join(" "));
    }
  ' "$LOCK_PATH"
}

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

function replace_env_var {
  local tmp
  tmp="$(mktemp)"
  grep -v "^$1=" "$ENV_PATH" > "$tmp" || true
  echo "$1=$2" >> "$tmp"
  # Rewrite in place, keeping the file's permissions.
  cat "$tmp" > "$ENV_PATH"
  rm "$tmp"
}

function clone_repo {
  local dir=$1
  local url=$2
  if [ ! -d "$dir" ]; then
    echo -e "${COLOR_INFO}Cloning repo '$dir' from $url...${COLOR_RESET}"
    git clone "$url" "$dir"
    echo -e "${COLOR_INFO}Repo '$dir' cloned.${COLOR_RESET}"
  fi
}

function get_env_var {
  grep "^$1=" "$ENV_PATH" | cut -d'=' -f2-
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
  # With no version argument, nvm uses the version in `.nvmrc`, which matches
  # the version used in CI and the production image.
  echo -e "${INDENT}${COLOR_INFO}Installing and using the Node.js version from .nvmrc with nvm...${COLOR_RESET}"
  nvm install
  nvm use
}

function warn_on_node_version_mismatch {
  command -v node >/dev/null 2>&1 || return 0
  local expected actual
  expected="$(tr -d '[:space:]v' < .nvmrc)"
  actual="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$actual" != "$expected" ]; then
    echo -e "${COLOR_WARN}Node.js $actual detected, but Morcus uses Node.js $expected (see .nvmrc).${COLOR_RESET}"
    echo -e "${INDENT}If you use nvm, run 'nvm install && nvm use' in the morcus-net directory."
  fi
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

ensure_node_and_npm
warn_on_node_version_mismatch

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

SOURCES="$(list_sources)"

# Older versions of this script downloaded gaffiot.js on its own rather than
# cloning its repo. Switch those setups to a clone, which `./morcus.sh
# upstream` can check and keep at the pinned commit.
LEGACY_GAFFIOT="$MORCUS_DIR/gaffiot.js"
if [ "$(get_env_var GAFFIOT_RAW_PATH)" == "$LEGACY_GAFFIOT" ]; then
  echo -e "${COLOR_INFO}Switching Gaffiot from a downloaded file to a clone of its repo...${COLOR_RESET}"
  clone_repo gaffiot "$(echo "$SOURCES" | awk '$1 == "gaffiot" { print $4 }')"
  if [ -f "$LEGACY_GAFFIOT" ] && ! cmp -s "$LEGACY_GAFFIOT" "gaffiot/gaffiot.js"; then
    echo -e "${INDENT}${COLOR_WARN}Note: $LEGACY_GAFFIOT differs from the cloned gaffiot.js.${COLOR_RESET}"
  fi
  replace_env_var GAFFIOT_RAW_PATH "$MORCUS_DIR/gaffiot/gaffiot.js"
  echo -e "${INDENT}${COLOR_INFO}$LEGACY_GAFFIOT is no longer used; delete it whenever you like.${COLOR_RESET}"
fi

while read -r SOURCE VAR FILE URL; do
  # An env var that's already set may point at a clone somewhere else, which
  # this script leaves alone.
  if ! env_has_var "$VAR"; then
    clone_repo "$SOURCE" "$URL"
    if [ "$FILE" == "-" ]; then
      set_env_var "$VAR" "$MORCUS_DIR/$SOURCE"
    else
      set_env_var "$VAR" "$MORCUS_DIR/$SOURCE/$FILE"
    fi
  fi
done <<< "$SOURCES"

cd "$MORCUS_NET_DIR"

echo -e "${COLOR_INFO}Checking out the pinned upstream data commits...${COLOR_RESET}"
if ! ./morcus.sh upstream sync --node; then
  echo -e "${COLOR_WARN}Some upstream data clones couldn't be synced; see above.${COLOR_RESET}"
fi

if ensure_rust_and_cargo; then
  echo -e "${COLOR_INFO}Rust and Cargo detected. Building Rust bindings...${COLOR_RESET}"
  npm run setup-node-bindgen
fi

echo "Processing raw dictionary files, building the client, and starting the server."
./morcus.sh web --build_all --minify
