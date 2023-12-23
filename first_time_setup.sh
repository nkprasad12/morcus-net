#!/bin/bash

MORCUS_DIR="morcus"
APP_NAME="Morcus Latin Tools"
PORT="5757"

echo "This script will set up $APP_NAME in a new '$MORCUS_DIR' subdirectory of current directory."
read -p "Enter y to continue, or any key to exit: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[y]$ ]]
then
    # return 1 from a function. We can check via
    # [[ "$0" = "$BASH_SOURCE" ]]
    exit 1
fi

echo "Cloning the repo in a new '$MORCUS_DIR' directory."
mkdir $MORCUS_DIR
cd $MORCUS_DIR
git clone https://github.com/nkprasad12/morcus-net.git

echo "Installing JS / TS dependencies from NPM."
cd morcus-net
npm install
# Return to the $MORCUS_DIR directory.
cd ..

echo "Setting up raw data for dictionaries."
echo "Downloading Lewis and Short. This may take some time."
git clone https://github.com/nkprasad12/lexica.git

echo "Downloading Smith and Hall."
git clone https://github.com/nkprasad12/smithandhall.git
cd smithandhall
git checkout v1edits
cd ..

echo "Downloading Latin Inflection data."
git clone https://github.com/nkprasad12/morcus-raw-data.git

echo "Populating '.env' file for $APP_NAME."
dot_env="morcus-net/.env"
touch $dot_env
echo "PORT=$PORT" >> $dot_env
echo "LS_PATH=$PWD/lexica/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml" >> $dot_env
echo "SH_RAW_PATH=$PWD/smithandhall/sh_F2_latest.txt" >> $dot_env
echo "RAW_LATIN_WORDS=$PWD/morcus-raw-data/morpheus_out_aug1_suff_removed.txt" >> $dot_env

echo "Processing raw dictionary files, building the client, and starting the server."
cd morcus-net
./morcus.sh web -b_ls -b_sh -b_li -b_ll --prod
