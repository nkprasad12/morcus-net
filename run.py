#!/usr/bin/env python

import os
import subprocess
import sys

args = sys.argv[1:]

prod = "--prod" in args
ls_subset = "--ls_s" in args
build_client = "--no_c" not in args

if args[0] == "ws":
    if build_client:
        build_command = ["npm", "run", "build-client"]
        if prod:
            build_command.extend(["--", "--env", "production"])
        subprocess.run(build_command)

    my_env = os.environ.copy()
    if ls_subset:
        my_env["LS_PATH"] = "testdata/ls/subset.xml"
    subprocess.run(
        " ".join(["npm", "run", "ts-node", "src/start_server.ts"]),
        shell=True,
        env=my_env,
    )
