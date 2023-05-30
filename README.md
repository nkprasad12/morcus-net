# morcus.net

Source code for [morcus.net](https://www.morcus.net), a collection of digital tools for Latin.

[![CI Status](https://github.com/nkprasad12/morcus-net/actions/workflows/ci-workflow.yaml/badge.svg)](https://github.com/nkprasad12/morcus-net/actions)
[![Coverage](https://codecov.io/gh/nkprasad12/morcus-net/branch/main/graph/badge.svg?token=G65VJM8B56)](https://codecov.io/gh/nkprasad12/morcus-net)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

**First Time Setup**

1. Run `npm install` to set up your environment for `Typescript` code.
2. Set up a Python `venv` and install the `requirements.txt`.

Specific steps for:

_Python ML Code_

1. Run `npm run setup-alatius` to set up the macronizer for local use.
2. To run NLP models, you may also need to install `stanza` and `cltk` from `pip`.

_morcus.net Server and Client_

1. Clone https://github.com/nkprasad12/lexica
2. Create a `.env` file in the root directory (see the next section for contents).
3. Run `./run.py web -p --build_ls`. This will build the LS processed data file and start the server.

For common commands, see `package.json` or `run.py`.

---

**Environment Variables**

| Name                | Content                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | The port number on which the server will listen. Example: `5757`.                                                                        |
| `LS_PATH`           | The path to the raw Lewis and Short XML file. Example: `[PATH_TO_LEXICA_REPO]/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml` |
| `LS_PROCESSED_PATH` | The path where the processed Lewis and Short file will be. Example: `lsp.data`                                                           |

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
