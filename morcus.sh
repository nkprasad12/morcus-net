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

COMMAND="node --max-old-space-size=4096 --env-file=.env node_modules/.bin/ts-node -P tsconfig.json -r tsconfig-paths/register --swc"
ARGS="$@"

if has_param '--node' "$@"; then
  # If node is explicitly specified, don't try anything else.
  true
elif has_param '--bun' "$@"; then
  COMMAND="bun"
elif command -v bun 2>&1 >/dev/null; then
  echo -e "\033[0;31mNote: bun detected, so automatically using bun. Pass --node to override this.\033[0m"
  COMMAND="bun"
  ARGS="$@ --bun"
fi

export NODE_ENV=production && $COMMAND src/scripts/run_morcus.ts $ARGS
