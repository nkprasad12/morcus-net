#!/bin/bash

has_param() {
    local term="$1"
    shift
    for arg; do
        if [[ $arg == "$term" ]]; then
            return 0
        fi
    done
    return 1
}

COMMAND="npm run ts-node --transpile_only"
BUN_FLAG="0"
ARGS="$@"

if has_param '--node' "$@"; then
  # If node is explicitly specified, don't try anything else.
  true
elif has_param '--bun' "$@"; then
  COMMAND="bun"
  BUN_FLAG="1"
elif command -v bun 2>&1 >/dev/null; then
  echo -e "\033[0;31mNote: bun detected, so automatically using bun. Pass --node to override this.\033[0m"
  COMMAND="bun"
  BUN_FLAG="1"
  ARGS="$@ --bun"
fi

export BUN=$BUN_FLAG && $COMMAND src/scripts/run_morcus.ts -- $ARGS
