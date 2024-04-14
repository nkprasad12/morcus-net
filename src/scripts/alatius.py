import os
import subprocess


def check_dir(expected: str) -> None:
    full_path = os.getcwd()
    current_dir = full_path.split(os.path.sep)[-1]
    assert current_dir == expected


def check_root() -> None:
    check_dir("morcus-net")


def install_deps() -> None:
    deps = [
        "build-essential",
        "libfl-dev python3-psycopg2",
        "unzip postgresql",
        "python-is-python3",
    ]
    for dep in deps:
        subprocess.run(f"sudo apt install {dep}", shell=True)


def setup_macronizer_repo() -> None:
    check_root()
    os.chdir("src/libs")
    subprocess.run(
        ["git", "clone", "https://github.com/nkprasad12/latin-macronizer.git"]
    )
    os.rename("latin-macronizer", "latin_macronizer")
    os.chdir("latin_macronizer")
    subprocess.run(["git", "checkout", "morcus"])
    os.chdir("../../..")
    check_root()


def setup_morpheus() -> None:
    check_root()
    os.chdir("src/libs/latin_macronizer")
    subprocess.run(["git", "clone", "https://github.com/Alatius/morpheus.git"])
    os.chdir("morpheus/src")
    subprocess.run("make", shell=True)
    subprocess.run("make install", shell=True)
    os.chdir("..")
    subprocess.run("./update.sh", shell=True)
    subprocess.run("./update.sh", shell=True)
    print("Verifying that `salve` is parsed correctly:")
    subprocess.run('echo "salve" | MORPHLIB=stemlib bin/cruncher -L', shell=True)
    os.chdir("../../../..")
    check_root()


def setup_rftagger() -> None:
    check_root()
    os.chdir("src/libs/latin_macronizer")
    subprocess.run(["git", "clone", "https://github.com/Alatius/treebank_data.git"])
    if not os.path.isfile("RFTagger.zip"):
        subprocess.run(
            "wget https://www.cis.uni-muenchen.de/~schmid/tools/RFTagger/data/RFTagger.zip",
            shell=True,
        )
    subprocess.run("unzip RFTagger.zip", shell=True)
    os.chdir("RFTagger/src")
    subprocess.run("make", shell=True)
    subprocess.run("sudo make install", shell=True)
    os.chdir("../..")
    subprocess.run("./train-rftagger.sh", shell=True)
    os.chdir("../../..")
    check_root()


def setup_postgres() -> None:
    check_root()
    os.chdir("src/libs/latin_macronizer")
    create_user_command = "create user theusername password 'thepassword';"
    try:
        subprocess.run(f'sudo -u postgres psql -c "{create_user_command}"', shell=True)
    except:
        print("Skipping")
    create_db_command = "create database macronizer encoding 'UTF8' owner theusername;"
    try:
        subprocess.run(f"sudo -u postgres psql -c '{create_db_command}'", shell=True)
    except:
        print("Skipping")
    os.chdir("../../..")
    check_root()


def initialize_macronizer() -> None:
    check_root()
    os.chdir("src/libs/latin_macronizer")
    subprocess.run("python macronize.py --initialize", shell=True)
    subprocess.run("python macronize.py --test", shell=True)
    os.chdir("../../..")
    check_root()


def rename_imports() -> None:
    check_root()
    with open("src/libs/latin_macronizer/macronizer.py", "r") as file:
        filedata = file.read()
    filedata = filedata.replace("from lemmas import", "from .lemmas import")
    filedata = filedata.replace(
        "from macronized_endings import", "from .macronized_endings import"
    )
    filedata = filedata.replace("import postags", "from . import postags")
    with open("src/libs/latin_macronizer/macronizer_modified.py", "w") as file:
        file.write(filedata)


def setup_macronizer() -> None:
    check_root()
    install_deps()
    setup_macronizer_repo()
    setup_morpheus()
    setup_rftagger()
    setup_postgres()
    initialize_macronizer()
    rename_imports()


if __name__ == "__main__":
    setup_macronizer()
