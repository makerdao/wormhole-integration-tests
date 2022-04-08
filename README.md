# Wormhole integration tests

Gathers all related repos (`./repos`) and runs a suite of integration tests using forked networks.

## Running

```sh
git clone git@github.com:makerdao/wormhole-integration-tests.git # clone this repo

git submodule update --init --recursive # init submodules

./scripts/setup.sh # build submodules, copy artifacts, build this project

./scripts/build-infra.sh # builds dockerized optimism infrastructure (l1+l2)
./scripts/run-infra.sh # runs infrastructure
yarn test
```

## Tweaking smart contracts

If you wish to quickly test some changes in smart contract code, just tweak source in `repos` dir and re-run
`./scripts/setup.sh`.

# Wormhole test deployment

## Arbitrum testnet

1. Set the name of the new ilk in `deployment/rinkeby/deploy-wormhole.ts` then run
   `npx hardhat run deployment/rinkeby/deploy-wormhole.ts` to deploy `dss-wormhole` and `arbitrum-dai-bridge` Wormhole
   contracts.

2. Set the address of the newly deployed `wormholeBridge` (L2WormholeGateway) in
   `contracts/deploy/rinkeby/L2RinkebyAddWormholeDomainSpell.sol` and deploy this L2 spell on arbitrum-testnet.

3. Run `npx hardhat run deployment/rinkeby/print-relay-params.ts` and copy the printed values into
   `contracts/deploy/rinkeby/L1RinkebyAddWormholeDomainSpell.sol`.

4. Set the addresses of the newly deployed `wormholeJoin`, `router` (WormholeRouter), `oracleAuth` (WormholeOracleAuth),
   `constantFees` (WormholeConstantFees), `slaveDomainBridge` (L1WormholeGateway) and `l2ConfigureDomainSpell`
   (L2RinkebyAddWormholeDomainSpell) in `contracts/deploy/rinkeby/L1RinkebyAddWormholeDomainSpell.sol`.

5. Run `npx hardhat run deployment/rinkeby/cast-l1-spell.ts` to deploy and cast the L1 spell on rinkeby. Wait ~5 minutes
   for the execution of the L2 spell to be confirmed.

6. To validate the resulting changes, copy the addresses of the newly deployed `oracleAuth` and `l2WormholeGateway` into
   `deployment/rinkeby/test-e2e.ts` and run `npx hardhat run deployment/rinkeby/test-e2e.ts`.

### Latest deployment

```
{
   "Wormhole": {
      "join": "0x894DB23D804c626f1aAA89a2Bc3280052e6c4750",
      "oracleAuth": "0x1E7722E502D3dCbB0704f99c75c99a5402598f13",
      "router": "0x26266ff35E2d69C6a2DC3fAE9FA71456043a0611",
      "constantFee": "0xeFf66D2A040097919A1A36D9D8816c21acC3C6C0",
      "relay": "0xC35787975484A858B878032B045B6E0B6EfE2e2c"
   }

   "Arbitrum wormhole gateways": {
      "l2WormholeGateway": "0x327c2f7aCd799f31535880Af54C2bCAB1384Ecc3",
      "l1WormholeGateway": "0x7b84fFac4A71fE09b14CfF4E0A6429dFfa78630D"
   }

   "Legacy (slow) Dai withdrawal bridge": {
      "l1Dai": "0x17B729a6Ac1f265090cbb4AecBdd53E34664C00e",
      "l2Dai": "0x78e59654Bc33dBbFf9FfF83703743566B1a0eA15",
      "l1DaiGateway": "0xb1cfD43BD287B2E94bf00140091A9Cca47f462cC",
      "l2DaiGateway": "0x7DC1e34e97c990f2B7d46777a47Fa47D069A8825"
   }

   "Spells": {
      "l1": "0x419D6a7603975fcFE5A2d21d7C0ef33D240eA27c",
      "l2": "0x65adb7A66759304b5A081506Baad5408F8ceb650"
   }
}
```

## Kovan testnet

### Instructions

1. Set the name of the new ilk in `deployment/kovan/deploy-wormhole.ts` then run
   `npx hardhat run deployment/kovan/deploy-wormhole.ts` to deploy `dss-wormhole` and `optimism-dai-bridge` Wormhole
   contracts.

2. Set the address of the newly deployed `wormholeGateway` (L2WormholeGateway) in
   `contracts/deploy/kovan/L2KovanAddWormholeDomainSpell.sol` and deploy this L2 spell on optimistic-kovan.

3. Set the addresses of the newly deployed `wormholeJoin`, `router` (WormholeRouter), `oracleAuth` (WormholeOracleAuth),
   `constantFees` (WormholeConstantFees), `slaveDomainGateway` (L1WormholeGateway) and `l2ConfigureDomainSpell`
   (L2RinkebyAddWormholeDomainSpell) in `contracts/deploy/kovan/L1KovanAddWormholeDomainSpell.sol` and deploy this L1
   spell on kovan.

4. To test the L2 spell, copy the addresses of the newly deployed `l2Spell` and `l2WormholeGateway` into
   `deployment/kovan/test-l2-spell.ts`, spin up a local hardhark fork of optimistic-kovan and run
   `npx hardhat run deployment/kovan/test-l2-spell.ts --network localhost`

5. To test the L1 spell, copy the addresses of the newly deployed `oracleAuth` and `l1Spell` into
   `deployment/kovan/test-l1-spell.ts`, spin up a local hardhark fork of kovan and run
   `npx hardhat run deployment/kovan/test-l1-spell.ts --network localhost`

6. Cast the L1 spell

7. To validate the resulting changes, copy the addresses of the newly deployed `oracleAuth` and `l2WormholeGateway` into
   `deployment/kovan/test-e2e.ts` and run `npx hardhat run deployment/kovan/test-e2e.ts`.

### Latest deployment

```
{
   "Wormhole": {
      "join": "0x556D9076A42Bba1892E3F4cA331daE587185Cef9",
      "oracleAuth": "0x0b0D629e294Af96A6cc245a89A5CEa92C8Be9da4",
      "router": "0xb15e4cfb29C587c924f547c4Fcbf440B195f3EF8",
      "constantFee": "0xf61A6F9d13aF9BBf4df95657Db5698c04A97EF85",
      "relay": "0x5B3363996Bd8164F07315faAf3F96B72D192382c"
   },

   "Optimism wormhole gateways": {
      "l2WormholeGateway": "0x0aeDbEf4105fdfc0db5A3Cd8C827bE2efA93ebe0",
      "l1WormholeGateway": "0xBD8605d11b8D3557b7399eFE1866992Eed6F9A7c"
   }

   "Spells": {
      "l1Spell": "0xC48b714c3Ce421671801a248d94cE1a5ef14AF8f",
      "l2Spell": "0xEd326504C77Dcd0Ffbb554a7925338EEd3F5fE01"
   }
}
```
