import os
import subprocess


BUILD_CLIENT = "npm run build-client -- --env production"
DOWNLOAD_LS = "npm run download-ls"
PROCESS_LS = "npm run ts-node src/scripts/process_ls.ts -- --verify"


def wait_and_check(proc: subprocess.Popen, message: str) -> None:
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(message)


build_client = subprocess.Popen(BUILD_CLIENT, shell=True)
download_ls = subprocess.Popen(DOWNLOAD_LS, shell=True)
wait_and_check(download_ls, "Failed to download raw LS file")

subproc_env = os.environ.copy()
subproc_env["LS_PATH"] = "ls.xml"
subproc_env["LS_PROCESSED_PATH"] = "lsp.txt"
subproc_env["PORT"] = "5757"

process_ls = subprocess.Popen(PROCESS_LS, shell=True, env=subproc_env)
wait_and_check(build_client, "Failed to build the client")
wait_and_check(process_ls, "Failed to process or verify LS")
