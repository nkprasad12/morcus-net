#!/usr/bin/env python

import argparse
from dotenv import load_dotenv
import os
import subprocess

load_dotenv()

WEB_SERVER = ["web", "webserver"]
WORKER = ["worker"]
COMMANDS = WEB_SERVER + WORKER

parser = argparse.ArgumentParser()
parser.add_argument("command", help="The high level command to run.", choices=COMMANDS)
parser.add_argument(
    "-noc",
    "--no_client",
    help="If set, the client bundle will not be built.",
    action="store_true",
)
parser.add_argument(
    "-lss",
    "--ls_subset",
    help="If set, only a subset of LS will be loaded at startup.",
    action="store_true",
)
parser.add_argument(
    "-p",
    "--prod",
    help="If set, runs setup suitable for production.",
    action="store_true",
)
parser.add_argument(
    "-wt", "--worker_type", help="The worker type to start.", choices=["mac"]
)
args = parser.parse_args()

if args.command in WEB_SERVER:
    if not args.no_client:
        build_command = ["npm", "run", "build-client"]
        if args.prod:
            build_command.extend(["--", "--env", "production"])
        subprocess.run(build_command)

    my_env = os.environ.copy()
    if args.ls_subset:
        my_env["LS_PATH"] = "testdata/ls/subset.xml"
    if args.prod:
        my_env["NODE_ENV"] = "production"
    subprocess.run(
        " ".join(["npm", "run", "ts-node", "src/start_server.ts"]),
        shell=True,
        env=my_env,
    )
elif args.command in WORKER:
    my_env = os.environ.copy()
    socket_address = f"http://localhost:{my_env['PORT']}"
    if args.prod:
        socket_address = f"https://www.morcus.net"
        my_env["NODE_ENV"] = "production"
    my_env["SOCKET_ADDRESS"] = socket_address
    worker_file = ""
    if args.worker_type == "mac":
        worker_file = "src/web/workers/macronizer_processor.ts"

    subprocess.run(
        " ".join(["npm", "run", "ts-node", worker_file]),
        shell=True,
        env=my_env,
    )
