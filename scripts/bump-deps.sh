#!/usr/bin/env bash
set -ex
cd "$(dirname "$0")"

# git submodule update --init --recursive

cd ../repos/

cd dss-wormhole
git checkout master
git pull
cd ..

cd optimism-dai-bridge
git checkout master
git pull
cd ..

echo "Dependencies bumped..."