#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

cd ../repos/

cd dss-wormhole
git pull
cd ..

cd optimism-dai-bridge
git pull
cd ..

echo "Dependencies bumped..."