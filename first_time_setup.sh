#!/bin/bash

MORCUS_DIR="morcus"
APP_NAME="Morcus Latin Tools"
PORT="5757"

echo "This script will set up $APP_NAME in a '$MORCUS_DIR' subdirectory of current directory."
echo "Cloning the repo in a new '$MORCUS_DIR' directory."
mkdir $MORCUS_DIR
cd $MORCUS_DIR || exit
git clone https://github.com/nkprasad12/morcus-net.git

echo "Installing JS / TS dependencies from NPM."
cd morcus-net || exit
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

echo "Downloading Smith and Hall."
git clone https://github.com/nkprasad12/smithandhall.git
cd smithandhall || exit
git checkout v1edits
cd ..

echo "Downloading the Perseus Library."
git clone https://github.com/nkprasad12/canonical-latinlit

echo "Populating '.env' file for $APP_NAME."
dot_env="morcus-net/.env"
touch $dot_env
echo "PORT=$PORT" >> $dot_env
echo "LS_PATH=$PWD/lexica/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml" >> $dot_env
echo "RA_PATH=$PWD/riddle-arnold/riddle-arnold.tsv" >> $dot_env
echo "SH_RAW_PATH=$PWD/smithandhall/sh_F2_latest.txt" >> $dot_env
ecoo "GEORGES_RAW_PATH=$PWD/Georges1910/Georges1910-ger-lat.xml" >> $dot_env
echo "LIB_XML_ROOT=$PWD/canonical-latinlit" >> $dot_env

echo "Processing raw dictionary files, building the client, and starting the server."
cd morcus-net || exit
./morcus.sh web -b_ls -b_sh -b_li -b_ll -m
