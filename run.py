#!/usr/bin/env python

import argparse
import atexit
from dotenv import load_dotenv
import os
import subprocess

load_dotenv()

WEB_SERVER = ["web"]
WORKER = ["worker"]
WORKERS = ["workers"]
COMMANDS = WEB_SERVER + WORKER + WORKERS


def start_worker(args, worker_type):
    my_env = os.environ.copy()
    socket_address = f"http://localhost:{my_env['PORT']}"
    if args.prod:
        socket_address = f"https://www.morcus.net"
        my_env["NODE_ENV"] = "production"
    if args.staging:
        socket_address = f"https://dev.morcus.net"
        my_env["NODE_ENV"] = "production"

    my_env["SOCKET_ADDRESS"] = socket_address
    worker_file = ""
    if worker_type == "mac":
        worker_file = "src/web/workers/macronizer_processor.ts"
    if worker_type == "ls":
        worker_file = "src/web/workers/ls_worker.ts"
        if args.ls_subset:
            my_env["LS_PATH"] = "testdata/ls/subset.xml"
    if args.gpu:
        my_env["ALLOW_WORKERS_GPU"] = "true"
    if args.keep or args.prod:
        my_env["KEEP_WORKERS_ON_DISCONNECT"] = "true"
    p = subprocess.Popen(
        " ".join(["npm", "run", "ts-node", worker_file]),
        shell=True,
        env=my_env,
    )

    def cleanup():
        print(f"[run.py] Cleaning up {worker_type}")
        p.kill()

    atexit.register(cleanup)
    return p


parser = argparse.ArgumentParser()
parser.add_argument("command", help="The high level command to run.", choices=COMMANDS)
parser.add_argument(
    "-no_bc",
    "--no_build_client",
    help="If set, the client bundle will not be built.",
    action="store_true",
)
parser.add_argument(
    "-b_ls",
    "--build_ls",
    help="If set, re-processes LS.",
    action="store_true",
)
parser.add_argument(
    "-to",
    "--transpile_only",
    help="If set, skips type checking for the client bundle.",
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
    "--staging",
    help="If set, runs setup suitable for staging.",
    action="store_true",
)
parser.add_argument(
    "-k",
    "--keep",
    help="If set, keeps the worker on disconnect.",
    action="store_true",
)
parser.add_argument(
    "--gpu",
    help="If set, allows GPU acceleration.",
    action="store_true",
)
parser.add_argument(
    "-wt", "--worker_type", help="The worker type to start.", choices=["mac", "ls"]
)
args = parser.parse_args()

if args.command in WEB_SERVER:
    setup_processes: "list[subprocess.Popen]" = []

    if not args.no_build_client:
        build_command = ["npm", "run", "build-client"]
        extra_args = []

        if args.prod or args.staging:
            extra_args.append(["--env", "production"])
        if args.transpile_only:
            extra_args.append(["--env", "transpileOnly"])
        if extra_args:
            build_command.append("--")
        for extra_arg in extra_args:
            build_command.extend(extra_arg)

        p = subprocess.Popen(" ".join(build_command), shell=True)
        setup_processes.append(p)

    if args.build_ls:
        my_env = os.environ.copy()
        build_command = ["npm", "run", "ts-node", "src/scripts/process_ls.ts"]
        if args.ls_subset:
            my_env["LS_PATH"] = "testdata/ls/subset.xml"
        p = subprocess.Popen(" ".join(build_command), shell=True, env=my_env)
        setup_processes.append(p)

    for setup_process in setup_processes:
        return_code = setup_process.wait()
        if return_code != 0:
            raise Exception("Setup process failed.")

    my_env = os.environ.copy()
    if args.prod:
        my_env["NODE_ENV"] = "production"
    subprocess.run(
        " ".join(["npm", "run", "ts-node", "src/start_server.ts"]),
        shell=True,
        env=my_env,
    )
elif args.command in WORKER:
    start_worker(args, args.worker_type).wait()

elif args.command in WORKERS:
    children = [start_worker(args, "mac")]
    for child in children:
        child.wait()
