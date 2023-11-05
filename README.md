# morcus.net

Source code for [morcus.net](https://www.morcus.net), a collection of digital tools for Latin.

[![CI Status](https://github.com/nkprasad12/morcus-net/actions/workflows/ci-workflow.yaml/badge.svg)](https://github.com/nkprasad12/morcus-net/actions)
[![Coverage](https://codecov.io/gh/nkprasad12/morcus-net/branch/main/graph/badge.svg?token=G65VJM8B56)](https://codecov.io/gh/nkprasad12/morcus-net)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

**First Time Setup**

morcus.net development is currently done only on Linux machines.
To get started, install `git`, `npm`, `node` (other Node versions will likely work, but only version `20` is run in CI and guaranteed to work) and `python3.8` (other Python versions may work, but only `3.8` is run in CI and guaranteed to work.)

Then, clone this repo, install `typescript` dependencies, set up a `Python` virtual environment and install `Python` dependencies.

1. `mkdir morcus`
2. `git clone https://github.com/nkprasad12/morcus-net.git && cd morcus-net`
3. `npm install`
4. `python3.8 -m venv venv`
5. `source venv/bin/activate && python3.8 -m pip install -r requirements.txt`

To run the morcus.net server and client, download repos for the dictionaries.

6. `cd ..` (i.e return to the `morcus` directory)
7. `git clone https://github.com/nkprasad12/lexica.git`
8. `git clone https://github.com/nkprasad12/smithandhall.git`
9. `cd smithandhall && git checkout v1edits && cd ..`
10. `cd morcus-net && touch .env`
11. Populate the `.env` file with the following:

```
PORT=5757
LS_PATH={PATH TO morcus DIRECTORY}/morcus/lexica/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml
LS_PROCESSED_PATH=lsp.data
SH_RAW_PATH={PATH TO morcus DIRECTORY}/morcus/smithandhall/sh_F2_latest.txt
SH_PROCESSED_PATH=shp.db
```

Make sure to replace `{PATH TO morcus DIRECTORY}` with the actual path to the `morcus` directory from Step 1.
See the `Environment Variables` section for full details and other variables you may need to add in the future.

Finally, process the dictionary raw files, build the client, and start the server. 12. `./run.py web --build_ls --build_sh`

You will eventually see in the logs a link to see the local server, for example:

```
[start_server] Local server: http://localhost:5757/
```

In the future, you can run just `./run.py web` to build the client and start the server.
Common arguments for this script (run `./run.py --help` for full options):

| Flag               | Explanation                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--build_ls`       | This processes Lewis and Short for use by the server. This needs to be run the first time and whenever you modify the Lewis and Short raw XML file. This is slow.                              |
| `--build_sh`       | This processes Smith and Hall for use by the server. This needs to be run the first time and whenever you modify the Smith and Hall raw text file or any of the processing code. This is slow. |
| `--prod`           | Builds the client and runs the server in production mode. This is slower.                                                                                                                      |
| `--transpile_only` | Skips `typescript` type checking. This is _faster_.                                                                                                                                            |

Other parts of the code require further setup:

_Python ML Code_

1. Run `npm run setup-alatius` to set up the macronizer for local use.
2. To run NLP models, you may also need to install `stanza` and `cltk` from `pip`.

---

**Environment Variables**

| Name                      | Content                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | The port number on which the server will listen. Example: `5757`.                                                                   |
| `LS_PATH`                 | The path to the raw Lewis and Short XML file. Example: `[Path to lexica]/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml` |
| `LS_PROCESSED_PATH`       | The path where the processed Lewis and Short file will be. Example: `lsp.data`                                                      |
| `SH_PROCESSED_PATH`       | blah                                                                                                                                |
| `SH_RAW_PATH`             | blag                                                                                                                                |
| `MONGODB_URI`             | MongoDB database URI for metrics.                                                                                                   |
| `DB_SOURCE`               | Tag used for metrics written to MongoDB. Example: `local`.                                                                          |
| `PROCESSING_SERVER_TOKEN` | A token used to authenticate workers with the server. Should be long and random.                                                    |
| `RAW_LATIN_WORDS`         | Path to a raw list of Latin words. Used for some processing.                                                                        |
| `RAW_ENGLISH_WORDS`       | Path to a raw list of English words. Used for some processing.                                                                      |
| `LATIN_INFLECTION_DB`     | Path to the processed database of Latin inflection data. Used for some processing. Suggestion: `latin_inflect.db`                   |

---

**Contribution Guidelines**

1. File an issue (or accept an existing one) for tracking purposes
2. Make sure to write unit tests verifying your change, if applicable
3. Run `npm run pre-commit` to run all formatting checks, tests, and builds.
4. Send a Pull Request to merge to `dev`

---

**License Details**

Work in this repository is provided under the terms of the `LICENSE` file in the root directory. Work in the `texts` and `libs` directories are provided under their original licenses.

---

**VS Code - Setting up formatting**

After initial setup, run `npm install` to ensure you have the latest prettier config. Then, install the
[Prettier VS Code plugin](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).
The project settings are already configured to use `prettier` as the default formatting for Typescript and Javascript, and `black`
as the default formatter for Python. This will also turn on format on save.

**VS Code - Integrating Jest**

After initial setup, install the [Jest Runner VS Code plugin](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner).
This will allow you to run and debug unit tests from within the VS Code UI when browsing a test file.
