# morcus.net

Source code for [morcus.net](https://www.morcus.net), a collection of digital tools for Latin.

[![Coverage](https://codecov.io/gh/nkprasad12/morcus-net/branch/main/graph/badge.svg?token=G65VJM8B56)](https://codecov.io/gh/nkprasad12/morcus-net)
[![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

---

## First Time Setup

morcus.net development is currently done only on Linux machines.
Before you get started, install `git` and:

- If you want to work on the Typescript code: `npm`, `node` (other Node versions will likely work, but only version `20` is run in CI and guaranteed to work)
- If you want to work on the Python code: `python3.12` (other Python versions may work, but only `3.12` is run in CI and guaranteed to work.)

### Typescript Code (Client, Server, Workers)

To start, download and run the setup script. This will clone all required repositories, perform all required setup, build the client, and start the server locally.

```
curl https://raw.githubusercontent.com/nkprasad12/morcus-net/dev/first_time_setup.sh | bash
```

In the future, you can run `./morcus.sh web` from `morcus-net` to build the client and start the server.
Common arguments for this script (run `./morcus.sh --help` for full options):

| Flag               | Explanation                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--build_ls`       | This processes Lewis and Short for use by the server. This needs to be run the first time and whenever you modify the Lewis and Short raw XML file. This is slow.                              |
| `--build_sh`       | This processes Smith and Hall for use by the server. This needs to be run the first time and whenever you modify the Smith and Hall raw text file or any of the processing code. This is slow. |
| `--prod`           | Builds the client and runs the server in production mode. This is slower.                                                                                                                      |
| `--transpile_only` | Skips `typescript` type checking. This is _faster_.                                                                                                                                            |

### Python Code (ML)

From the `morcus-net` root directory, set up a `Python` virtual environment and install `Python` dependencies.

1. `python3.12 -m venv venv`
2. `source venv/bin/activate && python3.12 -m pip install -r requirements.txt`
3. Run `npm run setup-alatius` to set up the macronizer for local use.
4. To run NLP models, you may also need to install `stanza` and `cltk` from `pip`.

---

### Environment Variables

| Name                      | Content                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | The port number on which the server will listen. Example: `5757`.                                                                   |
| `LS_PATH`                 | The path to the raw Lewis and Short XML file. Example: `[Path to lexica]/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml` |
| `LS_PROCESSED_PATH`       | An optional file name of the processed database of Lewis and Short entries.                                                         |
| `RA_PATH`                 | The path to the Riddle-Arnold raw TSV file.                                                                                         |
| `RA_PROCESSED_PATH`       | An optional file name of the processed database of Riddle-Arnold entries.                                                           |
| `SH_RAW_PATH`             | A raw path to the Smith and Hall text file.                                                                                         |
| `SH_PROCESSED_PATH`       | An optional file name of the processed database of Smith and Hall entries.                                                          |
| `MONGODB_URI`             | MongoDB database URI for metrics.                                                                                                   |
| `DB_SOURCE`               | Tag used for metrics written to MongoDB. Example: `local`.                                                                          |
| `PROCESSING_SERVER_TOKEN` | A token used to authenticate workers with the server. Should be long and random.                                                    |
| `RAW_ENGLISH_WORDS`       | Path to a raw list of English words. Used for some processing.                                                                      |

---

## Contribution Guidelines

1. File an issue (or accept an existing one) for tracking purposes
2. Make sure to write unit tests verifying your change, if applicable
3. Run `npm run pre-commit` to run all formatting checks, tests, and builds.
4. Send a Pull Request to merge to `dev`

---

## License Details

Work in this repository is provided under the terms of the `LICENSE` file in the root directory. Work in the `texts` and `libs` directories are provided under their original licenses.

---

## VS Code

### Setting up formatting

After initial setup, run `npm install` to ensure you have the latest prettier config. Then, install the
[Prettier VS Code plugin](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) by
by pressing Ctrl+P and entering `ext install esbenp.prettier-vscode`.
The project settings are already configured to use `prettier` as the default formatting for Typescript and Javascript, and `black`
as the default formatter for Python. This will also turn on format on save.

### Integrating Jest

After initial setup, install the [Jest Runner VS Code plugin](https://marketplace.visualstudio.com/items?itemName=firsttris.vscode-jest-runner) by pressing Ctrl+P and entering `ext install firsttris.vscode-jest-runner`.
This will allow you to run and debug unit tests from within the VS Code UI when browsing a test file.

### ESLint Plugin

Install the [ESLint plugin](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint). This will add
warnings within VSCode for any ESLint errors in the code.

---

## Deployment

### Heroku

There is a `Procfile` in the root directory for use with Heroku. There are some environment variables that can be set, but all are optional.

1. `MONGODB_URI` - The URI to a MongoDB database. If set, system health and usage metrics will be written to this database. Otherwise, they will be logged locally.
2. `DB_SOURCE` - Only used if `MONGODB_URI` is present. If set, this will be used to disambiguate records from different deployments (e.g. use `dev` for staging).
3. `GITHUB_TOKEN` - A GitHub token with Issue creation permissions. If set, issue reports will be written to GitHub Issues. Otherwise, they will be logged locally.
4. `APPNAME` - set to `Dev` for a staging / dev deployment.
5. `NPM_CONFIG_OMIT` - set to `optional` as an optimization to avoid installing integration test dependencies.

### Docker Images

Docker images are generated for each push. These can be downloaded from the registry at ghcr.io/nkprasad12/morcus. There are four tags of note:

1. `main-latest` is the most up-to-date image of the `main` branch.
2. `main-previous` is a backup of the previous `main-latest`.
3. `dev-latest` is the most up-to-date image of the `dev` branch.
4. `dev-previous` is a backup of the previous `dev-latest`.

Note that the `latest` tag is not used.

### Self-hosted Setup

This guide assumes you are using a Linux machine with the following prerequisites:

1. The Docker CLI has been installed.
2. Your SSL certificate and private key files are on the machine.

Run the following command and follow the resulting directions to:

1. Create or download all required configuration files
2. Start containers for a prod Morcus instance, a dev Morcus instance, a reverse proxy, and a job that updates all containers.
3. (Optionally) add a cron job to restart all containers on reboot.

```
MORCUS_REPO=https://raw.githubusercontent.com/nkprasad12/morcus-net/dev/src/devops && \
curl $MORCUS_REPO/docker-compose.yaml -o docker-compose.yaml && \
curl $MORCUS_REPO/vm_setup.sh -o vm_setup.sh && chmod +x vm_setup.sh && \
curl $MORCUS_REPO/.env.template -o .env && \
echo -e "\n\nSetup files downloaded. Open '.env' and follow the instructions." ; \
unset MORCUS_REPO
```

#### Local testing

If you don't have an SSL certificate and key, you can generate one for local testing with the following:

```
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 3650 -nodes -subj "/CN=your.domain"
```

By default, the reverse proxy will only proxy traffic coming from the hosts specified by `PROD_HOST_NAMES` and `DEV_HOST_NAMES` (as specified in the `.env` file - see instructions there for more details) and will error on all other requests. For local testing, you can map these hosts to the loopback address in your hosts file (generally `/etc/hosts` on a Unix-like OS). For example:

in your `.env` file:

```
PROD_HOST_NAMES=foo.morcus.net
```

in your hosts file:

```
127.0.0.1 foo.morcus.net
```

#### Updating the Reverse Proxy image

This is updated so infrequently that doing it as part of the CI workflow (where it would rebuild with every commit) was not really worth it. In order to update:

1. `cd src/devops/reverse_proxy`
2. `docker build ./ -t ghcr.io/nkprasad12/morcus-proxy:latest`
3. `docker push ghcr.io/nkprasad12/morcus-proxy:latest`

### Play Store

There is a Play Store app at https://play.google.com/store/apps/details?id=net.morcus.pwa. This is packaged using PWA builder - see instructions at https://docs.pwabuilder.com/#/builder/android?id=update-existing-pwa to update.

- Current version: `1.0.1`
- Current version code: `10`
- Signing key information is in a file called `signing-key-info.txt`

## Code Guide

### Overview

Morcus Latin Tools is a web application (it is also available in the Play Store, but this is just a packaged PWA). There are four high level components to the code:

1. A _client_, which is developed in `Typescript`. This is currently a single page application written using vanilla `React`.
2. A _backend_, which is also developed in `Typescript`. This is a `Node.js` based `HTTP` server that uses `Express`.
3. _preprocessing_ code, which is also developed in `Typescript`. This is responsible for transforming raw files (often XML or plain text files) into structured data that can be served by the backend.
4. _NLP_ code, which is developed in `Python`. This is currently used for the macronizer.

TODO: add subsections for all of these, and explain the build step.

## Misc

### Running the Morceus analyzer

To run the analyzer on the given word (e.g. `habes`), use:

```
npm run ts-node src/morceus/cli.ts analyzeWord habes
```

(if you have `bun` installed, you can replace `npm run ts-node` with `bun run`, which is much faster)

### Analyzing the library for unknown words

To run the analyzer and determine unknown words for the current library, run

```
DEBUG_OUT=./ ./morcus.sh build --build_latin_library
```

This will create files in the specified directory called `<name of work>.debug.txt` which contains lists of words that were
not known to the analyzer.

You can update the list `ALL_WORKS` in `src/common/process_library.ts` to add or remove a work. Currently only DBG and Phaedrus run by
default as they are checked in to the repo as test data, but Amores, Germania, and Satires are also known to work.

### Expanding all Morceus tables

```
npm run ts-node src/morceus/cli.ts buildTables
```

## Python Sadness

### Updating packages

This may be required when updating Python versions.

1. `sed -i 's/==/>=/g' requirements.txt` (don't pin to exact versions so the upgrade can work)
2. `venv/bin/pip install -r requirements.txt --upgrade`
3. `venv/bin/pip freeze > requirements.txt`
