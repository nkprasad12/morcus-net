import json
import os
import requests
import subprocess
import time
from urllib import parse


BUILD_CLIENT = "npm run build-client -- --env production"
DOWNLOAD_LS = "npm run download-ls"
PROCESS_LS = "npm run ts-node src/scripts/process_ls.ts -- --verify"
START_SERVER = "npm run ts-node src/start_server.ts"
PORT = 5757


subproc_env = os.environ.copy()
subproc_env["LS_PATH"] = "ls.xml"
subproc_env["LS_PROCESSED_PATH"] = "lsp.txt"
subproc_env["PORT"] = f"{PORT}"


processes: "list[subprocess.Popen]" = []


def wait_and_check(proc: subprocess.Popen, message: str) -> None:
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(message)


def start_process(command: str) -> None:
    result = subprocess.Popen(command, shell=True, env=subproc_env)
    processes.append(result)
    return result


try:
    build_client = start_process(BUILD_CLIENT)
    download_ls = start_process(DOWNLOAD_LS)
    wait_and_check(download_ls, "Failed to download raw LS file")

    process_ls = start_process(PROCESS_LS)
    wait_and_check(build_client, "Failed to build the client")
    wait_and_check(process_ls, "Failed to process or verify LS")

    start_server = start_process(START_SERVER)
    time.sleep(15)

    arg = parse.quote(json.dumps({"w": "canaba"}))
    route = f"http://localhost:{PORT}/api/dict/ls/{arg}"
    print(route)
    api_result = requests.get(route, timeout=5)
    print(api_result.text)
    assert "cannăba" in api_result.text
finally:
    print(f"Cleaning up {len(processes)} processes.")
    for process in processes:
        try:
            process.kill()
        except:
            pass
