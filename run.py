#!/usr/bin/env python

import argparse
from dotenv import load_dotenv
import os
import subprocess

load_dotenv()

WEB_SERVER = ["ws", "webserver"]
NLP_SERVER = ["ns", "nlpserver"]
COMMANDS = WEB_SERVER + NLP_SERVER

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
    subprocess.run(
        " ".join(["npm", "run", "ts-node", "src/start_server.ts"]),
        shell=True,
        env=my_env,
    )
elif args.command in NLP_SERVER:
    my_env = os.environ.copy()
    socket_address = f"http://localhost:{my_env['PORT']}"
    if args.prod:
        socket_address = f"http://www.morcus.net"
    my_env["SOCKET_ADDRESS"] = socket_address
    subprocess.run(
        " ".join(["npm", "run", "ts-node", "src/web/nlp/processing_server.ts"]),
        shell=True,
        env=my_env,
    )
