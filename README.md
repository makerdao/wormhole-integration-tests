# Wormhole integration tests

Gathers all related repos (`./repos`) and runs a suite of integration tests using forked networks.

## Running

```sh
git clone git@github.com:makerdao/wormhole-integration-tests.git # clone this repo

git submodule update --init --recursive # init submodules

./scripts/setup.sh # build submodules, copy artifacts, build this project

yarn node:l2 # runs Optimism fork mode
yarn test
```

## Tweaking smart contracts

If you wish to quickly test some changes in smart contract code, just tweak source in `repos` dir and re-run
`./scripts/setup.sh`.
