#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

cd ../repos

echo "Setting up dss-wormhole"
cd dss-wormhole
git submodule update --init --recursive
dapp --use solc:0.8.9 build --extract
cd ..

echo "Setting up optimism-dai-bridge"
cd optimism-dai-bridge
yarn
yarn build
cd ..

echo "Setting up optimism monorepo"
cp -f ../scripts/l1_chain.env ./optimism-monorepo/ops/envs/l1_chain.env

cd ..

echo "Setting up ./tests dir"
node ./scripts/copy-artifacts.js
yarn
yarn typechain
yarn eth-sdk