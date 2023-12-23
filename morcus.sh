if echo $* | grep -e "--bun" -q
then
  COMMAND="bun run"
else
  COMMAND="npm run ts-node --transpile_only"
fi
$COMMAND src/scripts/run_morcus.ts -- "$@"
