#!/bin/bash
set -e

MORCUS_DIR="morcus"
APP_NAME="Morcus Latin Tools"
PORT="5757"

echo "This script will set up $APP_NAME in a '$MORCUS_DIR' subdirectory of current directory."
echo "Cloning the repo in a new '$MORCUS_DIR' directory."
mkdir $MORCUS_DIR
cd $MORCUS_DIR
git clone https://github.com/nkprasad12/morcus-net.git

echo "Installing JS / TS dependencies from NPM."
cd morcus-net
git checkout dev
npm install

echo "Setting up git hooks"
git config --local core.hooksPath .githooks/
# Return to the $MORCUS_DIR directory.
cd ..

echo "Setting up raw data for dictionaries."
echo "Downloading Lewis and Short. This may take some time."
git clone https://github.com/nkprasad12/lexica.git

echo "Downloading Riddle Arnold. This may take some time."
git clone https://github.com/nkprasad12/riddle-arnold.git

echo "Downloading Georges. This may take some time."
git clone https://github.com/nkprasad12/Georges1910.git
cd Georges1910
git checkout morcus-net-branch
cd ..

echo "Downloading Smith and Hall."
git clone https://github.com/nkprasad12/smithandhall.git
cd smithandhall
git checkout v1edits
cd ..

echo "Downloading Gesner."
git clone https://github.com/nkprasad12/gesner.git

echo "Downloading Nikita Moor's dicts. This may take some time."
git clone https://github.com/nkprasad12/latin-dictionary.git
cd latin-dictionary
git checkout morcus
cd ..

echo "Downloading the Perseus Library."
git clone https://github.com/nkprasad12/canonical-latinlit

echo "Downloading the Hypotactic library. This may take some time."
git clone https://github.com/nkprasad12/hypotactic.git

echo "Downloading Gaffiot dictionary JS file."
curl -L https://raw.githubusercontent.com/nkprasad12/gaffiot/refs/heads/main/gaffiot.js -o gaffiot.js

echo "Populating '.env' file for $APP_NAME."
dot_env="morcus-net/.env"
touch $dot_env
echo "PORT=$PORT" >> $dot_env

echo "LS_PATH=$PWD/lexica/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml" >> $dot_env
echo "RA_PATH=$PWD/riddle-arnold/riddle-arnold.tsv" >> $dot_env
echo "GESNER_RAW_PATH=$PWD/gesner/gesner.json" >> $dot_env
echo "SH_RAW_PATH=$PWD/smithandhall/sh_F2_latest.txt" >> $dot_env
echo "GEORGES_RAW_PATH=$PWD/Georges1910/Georges1910-ger-lat.xml" >> $dot_env
echo "POZO_RAW_PATH=$PWD/latin-dictionary/LopezPozo1997/diccionario.txt" >> $dot_env
echo "LIB_XML_ROOT=$PWD/canonical-latinlit" >> $dot_env
echo "HYPOTACTIC_ROOT=$PWD/hypotactic" >> $dot_env
echo "GAFFIOT_RAW_PATH=$PWD/gaffiot.js" >> $dot_env

echo "Processing raw dictionary files, building the client, and starting the server."
cd morcus-net
./morcus.sh web --build_all --minify
