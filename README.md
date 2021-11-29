# Wormhole integration tests

Gathers all related repos (`./repos`) and runs a suite of integration tests using forked networks.

## Setup

```sh
git@github.com:makerdao/wormhole-integration-tests.git # clone this repo

git submodule update --init --recursive # init submodules

./scripts/setup.sh # build submodules, copy artifacts, build this project
```