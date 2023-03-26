# morcus.net

Source code for morcus.net, a collection of digital tools for Latin.

[![CI Status](https://github.com/nkprasad12/morcus-net/actions/workflows/ci-workflow.yaml/badge.svg)](https://github.com/nkprasad12/morcus-net/actions)
[![Coverage](https://codecov.io/gh/nkprasad12/morcus-net/branch/main/graph/badge.svg?token=G65VJM8B56)](https://codecov.io/gh/nkprasad12/morcus-net)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

**First Time Setup**

1. Run `npm install` to set up your environment for `Typescript` code.
2. Run `npm run setup-alatius` to set up the macronizer for local use.
3. Set up a Python `venv` and install the `requirements.txt`.
4. To run the models, you may also need to install `stanza` and `cltk` from `pip`.

For common commands, see `package.json`.

---

**Contribution Guidelines**

1. File an issue (or accept an existing one) for tracking purposes
2. Make sure to write unit tests verifying your change, if applicable
3. Run `npm run pre-commit` to run all formatting checks, tests, and builds.
4. Send a Pull Request to merge to `main`

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
