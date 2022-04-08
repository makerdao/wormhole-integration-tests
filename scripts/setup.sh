#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

cd ../repos

echo "Setting up dss-wormhole"
cd dss-wormhole
git submodule update --init --recursive
dapp --use solc:0.8.13 build --extract
cd ..

echo "Setting up optimism-dai-bridge"
cd optimism-dai-bridge
yarn
yarn build
cd ..

echo "Setting up arbitrum-dai-bridge"
cd arbitrum-dai-bridge
yarn
yarn build
cd ..

cd ..

echo "Setting up local test contracts"
yarn build

echo "Setting up ./external-artifacts dir"
node ./scripts/copy-artifacts.js
yarn
yarn typechain
yarn eth-sdk