#!/usr/bin/env bash
set -ex
cd "$(dirname "$0")"

# git submodule update --init --recursive

cd ../repos/

cd dss-wormhole
git pull origin master
cd ..

cd optimism-dai-bridge
git pull origin kk/wormhole-bridge
cd ..

echo "Dependencies bumped..."