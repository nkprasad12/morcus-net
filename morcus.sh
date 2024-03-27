#!/bin/bash

if echo "$*" | grep -e "--bun" -q
then
  COMMAND="bun"
  BUN_FLAG="1"
else
  COMMAND="npm run ts-node --transpile_only"
  BUN_FLAG="0"
fi
export BUN=$BUN_FLAG && $COMMAND src/scripts/run_morcus.ts -- "$@"
