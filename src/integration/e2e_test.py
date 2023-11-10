import json
import os
import requests
import subprocess
import time
from urllib import parse


BUILD_CLIENT = "npm run build-client -- --env production"
DOWNLOAD_LS = "npm run download-ls"
DOWNLOAD_SH = "npm run download-sh"
DOWNLOAD_LAT_WORDS = "npm run download-lat-infl-raw"
PROCESS_LS = "npm run ts-node src/scripts/process_ls.ts -- --verify"
PROCESS_SH = "npm run ts-node src/scripts/process_sh.ts -- --verify"
MAKE_LAT_DB = "npm run ts-node src/scripts/latin_inflections.ts"
START_SERVER = "npm run ts-node src/start_server.ts"
PORT = 5757


subproc_env = os.environ.copy()
subproc_env["LS_PATH"] = "ls.xml"
subproc_env["LS_PROCESSED_PATH"] = "lsp.txt"
subproc_env["SH_RAW_PATH"] = "sh_raw.txt"
subproc_env["SH_PROCESSED_PATH"] = "shp.db"
subproc_env["PORT"] = f"{PORT}"
subproc_env["CONSOLE_TELEMETRY"] = "yes"
subproc_env["RAW_LATIN_WORDS"] = "lat_raw.txt"
subproc_env["LATIN_INFLECTION_DB"] = "latin_inflect.db"

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
    download_sh = start_process(DOWNLOAD_SH)
    download_lat_words = start_process(DOWNLOAD_LAT_WORDS)
    wait_and_check(download_ls, "Failed to download raw LS file")
    wait_and_check(download_sh, "Failed to download raw SH file")
    wait_and_check(download_lat_words, "Failed to download Latin word dump")

    make_lat_db = start_process(MAKE_LAT_DB)
    wait_and_check(make_lat_db, "Failed to make the Latin Inflections DB.")

    process_ls = start_process(PROCESS_LS)
    process_sh = start_process(PROCESS_SH)

    wait_and_check(build_client, "Failed to build the client")
    wait_and_check(process_ls, "Failed to process or verify LS")
    wait_and_check(process_ls, "Failed to process or verify SH")

    start_server = start_process(START_SERVER)
    time.sleep(10)

    arg = parse.quote(json.dumps({"w": {"query": "influence", "dicts": ["S&H"]}}))
    route = f"http://localhost:{PORT}/api/dicts/fused/{arg}"
    print(route)
    api_result = requests.get(route, timeout=5)
    print(api_result.text)
    if "Power exerted" not in api_result.text:
        raise RuntimeError("Failed SH lookup")

    arg = parse.quote(json.dumps({"w": {"query": "canaba", "dicts": ["L&S"]}}))
    route = f"http://localhost:{PORT}/api/dicts/fused/{arg}"
    print(route)
    api_result = requests.get(route, timeout=5)
    print(api_result.text)
    if "cannăba" not in api_result.text:
        raise RuntimeError("Failed LS lookup")

    arg = parse.quote(
        json.dumps({"w": {"query": "undarum", "dicts": ["L&S"], "mode": 1}})
    )
    route = f"http://localhost:{PORT}/api/dicts/fused/{arg}"
    print(route)
    api_result = requests.get(route, timeout=5)
    print(api_result.text)
    if "unda" not in api_result.text:
        raise RuntimeError("Failed LS inflected lookup")
finally:
    print(f"Cleaning up {len(processes)} processes.")
    for process in processes:
        try:
            process.kill()
        except:
            pass
