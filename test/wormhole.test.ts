import { getMainnetSdk, MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { Watcher } from '@eth-optimism/core-utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { randomBytes } from '@ethersproject/random'
import { expect } from 'chai'
import { BigNumberish, Wallet } from 'ethers'
import { ethers } from 'hardhat'

import { Dai, L2DAIWormholeBridge, WormholeJoin, WormholeOracleAuth, WormholeRouter } from '../typechain'
import { getAttestations } from './contracts/attestations'
import { configureWormholeBridge, deployBaseBridge, deployBridge } from './contracts/bridge'
import { mintDai } from './contracts/dai'
import { deploySpell } from './contracts/spell'
import { configureWormhole, deployWormhole, OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME } from './contracts/wormholeJoin'
import {
  forwardTime,
  getOptimismAddresses,
  mintEther,
  OptimismAddresses,
  toEthersBigNumber,
  toRad,
  toRay,
  toWad,
  waitForTx,
} from './helpers'
import {
  defaultL2Data,
  defaultL2Gas,
  makeRelayMessagesToL1,
  makeWaitToRelayTxsToL2,
  makeWatcher,
  mintL2Ether,
  RelayMessagesToL1,
  WaitToRelayTxsToL2,
} from './optimism'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const oracleWallets = [...Array(3)].map(() => Wallet.createRandom())

const optimismDomain = bytes32('OPTIMISM-A')
const mainnetDomain = bytes32('MAINNET')

const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const amt = toEthersBigNumber(toWad(10))

describe('Wormhole', () => {
  let l1Provider: JsonRpcProvider
  let l2Provider: JsonRpcProvider
  let watcher: Watcher
  let waitToRelayTxsToL2: WaitToRelayTxsToL2
  let relayMessagesToL1: RelayMessagesToL1
  let l1User: Wallet
  let l2User: Wallet
  let userAddress: string // both l1 and l2 user should have the same address
  let ilk: string
  let l1Signer: Wallet
  let l2Signer: Wallet
  let l2WormholeBridge: L2DAIWormholeBridge
  let oracleAuth: WormholeOracleAuth
  let join: WormholeJoin
  let router: WormholeRouter
  let mainnetSdk: MainnetSdk
  let optimismAddresses: OptimismAddresses
  let l2Dai: Dai
  let l1Escrow: Wallet

  before(async () => {
    l1Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:9545')
    l1Signer = Wallet.createRandom().connect(l1Provider)
    l2Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545')
    l2Signer = l1Signer.connect(l2Provider)

    console.log('Current L1 block: ', (await l1Provider.getBlockNumber()).toString())
    console.log('Current L2 block: ', (await l2Provider.getBlockNumber()).toString())

    mainnetSdk = getMainnetSdk(l1Signer)
    optimismAddresses = await getOptimismAddresses()

    watcher = makeWatcher(l1Provider, l2Provider, optimismAddresses)
    waitToRelayTxsToL2 = makeWaitToRelayTxsToL2(watcher)
    relayMessagesToL1 = makeRelayMessagesToL1(watcher, l1Signer, optimismAddresses)

    await mintEther(l1Signer.address, l1Provider)
    await mintL2Ether(waitToRelayTxsToL2, mainnetSdk, optimismAddresses, l1Provider, l2Signer.address)

    l1User = Wallet.createRandom().connect(l1Provider)
    l2User = l1User.connect(l2Provider)
    userAddress = l1User.address
    await mintEther(l1User.address, l1Provider)
    await mintL2Ether(waitToRelayTxsToL2, mainnetSdk, optimismAddresses, l1Provider, userAddress)
    await mintDai(mainnetSdk, l1User.address, toEthersBigNumber(toWad(20_000)))
  })

  describe('fast path', () => {
    it('lets a user request minted DAI on L1 using oracle attestations', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signHash, signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
      expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)

      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0)).wait()

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
    })

    it('lets a user request minted DAI on L1 using oracle attestations when fees are non 0', async () => {
      const fee = toEthersBigNumber(toWad(1))
      const feeInRad = toEthersBigNumber(toRad(1))
      const maxFeePerc = toEthersBigNumber(toWad(0.1)) // 10%
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee,
      }))

      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const vowDaiBalanceBefore = await mainnetSdk.vat.dai(mainnetSdk.vow.address)
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signHash, signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
      expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)

      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, maxFeePerc, 0)).wait()

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt).sub(fee))

      const vowDaiBalanceAfterMint = await mainnetSdk.vat.dai(mainnetSdk.vow.address)
      expect(vowDaiBalanceAfterMint).to.be.eq(vowDaiBalanceBefore.add(feeInRad))
    })

    it('allows partial mints using oracle attestations when the amount withdrawn exceeds the maximum additional debt', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      const line = amt.div(2) // withdrawing an amount that is twice the debt ceiling
      await join['file(bytes32,bytes32,uint256)'](bytes32('line'), optimismDomain, line)
      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)

      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0)).wait() // mint maximum possible

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(line)) // only half the requested amount was minted (minted=line-debt=line)

      await relayMessagesToL1(l2WormholeBridge.connect(l2User).flush(mainnetDomain)) // pay back debt. Usually relaying this message would take 7 days
      await waitForTx(join.connect(l1User).mintPending(wormholeGUID, 0, 0)) // mint leftover amount

      const l1BalanceAfterWithdraw = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterWithdraw).to.be.eq(l1BalanceBeforeMint.add(amt)) // the full amount has now been minted
    })

    it('reverts when a user requests minted DAI on L1 using bad attestations', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signHash, signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )

      // Signatures in bad order
      const reversedSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.reverse()
        .join('')}`
      let reason = 'WormholeOracleAuth/bad-sig-order'
      await expect(oracleAuth.isValid(signHash, reversedSigs, oracleWallets.length)).to.be.revertedWith(reason)

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, reversedSigs, 0, 0)).to.be.revertedWith(reason)

      // Some signatures missing
      const tooFewSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.slice(1)
        .join('')}`
      reason = 'WormholeOracleAuth/not-enough-sig'
      await expect(oracleAuth.isValid(signHash, tooFewSigs, oracleWallets.length)).to.be.revertedWith(reason)

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, tooFewSigs, 0, 0)).to.be.revertedWith(reason)

      // Some signatures invalid
      const badVSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.map((s) => `${s.slice(0, -2)}00`)
        .join('')}`
      reason = 'WormholeOracleAuth/bad-v'
      await expect(oracleAuth.isValid(signHash, badVSigs, oracleWallets.length)).to.be.revertedWith(reason)

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, badVSigs, 0, 0)).to.be.revertedWith(reason)
    })

    it('reverts when non-operator requests minted DAI on L1 using oracle attestations', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      const txReceipt = await (
        await l2WormholeBridge
          .connect(l2User)
          ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      ).wait()
      const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)

      await expect(oracleAuth.connect(l1Signer).requestMint(wormholeGUID, signatures, 0, 0)).to.be.revertedWith(
        'WormholeOracleAuth/not-receiver-nor-operator',
      )
    })
  })

  describe('slow path', () => {
    it('mints DAI without oracles', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))

      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)
      const l1RelayMessages = await relayMessagesToL1(tx)
      expect(l1RelayMessages.length).to.be.eq(1)

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
    })

    it('mints DAI without oracles when fees are non 0', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: toEthersBigNumber(toWad(1)),
      }))

      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))

      await forwardTime(l1Provider, OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME)
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)
      const l1RelayMessages = await relayMessagesToL1(tx)
      expect(l1RelayMessages.length).to.be.eq(1)

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt)) // note: fee shouldn't be applied as this is slow path
    })
  })

  describe('flush', () => {
    it('pays back debt (negative debt)', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      // Burn L2 DAI (without withdrawing DAI on L1)
      await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(amt)
      expect(await mainnetSdk.dai.balanceOf(l1Escrow.address)).to.be.eq(amt)
      expect(await join.debt(optimismDomain)).to.be.eq(0)
      let urn = await mainnetSdk.vat.urns(ilk, join.address)
      expect(urn.art).to.be.eq(0)
      expect(urn.ink).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(l1Escrow.address)).to.be.eq(amt)

      // Pay back (not yet incurred) debt. Usually relaying this message would take 7 days
      await relayMessagesToL1(l2WormholeBridge.connect(l2User).flush(mainnetDomain))

      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(0)
      expect(toEthersBigNumber(0).sub(await join.debt(optimismDomain))).to.be.eq(amt) // debt should be negative
      urn = await mainnetSdk.vat.urns(ilk, join.address)
      expect(urn.art).to.be.eq(0)
      expect(urn.ink).to.be.eq(0)
      expect(await mainnetSdk.vat.dai(join.address)).to.be.eq(amt.mul(toEthersBigNumber(toRay(1))))
      expect(await mainnetSdk.dai.balanceOf(l1Escrow.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(router.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(join.address)).to.be.eq(0)
    })

    it('pays back debt (positive debt)', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      // Burn L2 DAI AND withdraw DAI on L1
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0)).wait()
      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(amt)
      expect(await join.debt(optimismDomain)).to.be.eq(amt)
      let urn = await mainnetSdk.vat.urns(ilk, join.address)
      expect(urn.art).to.be.eq(amt)
      expect(urn.ink).to.be.eq(amt)
      expect(await mainnetSdk.dai.balanceOf(l1Escrow.address)).to.be.eq(amt)

      // Pay back (already incurred) debt. Usually relaying this message would take 7 days
      await relayMessagesToL1(l2WormholeBridge.connect(l2User).flush(mainnetDomain))

      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(0)
      expect(await join.debt(optimismDomain)).to.be.eq(0)
      urn = await mainnetSdk.vat.urns(ilk, join.address)
      expect(urn.art).to.be.eq(0)
      expect(urn.ink).to.be.eq(0)
      expect(await mainnetSdk.vat.dai(join.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(l1Escrow.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(router.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(join.address)).to.be.eq(0)
    })
  })

  describe('bad debt', () => {
    it('allows governance to push bad debt to the vow', async () => {
      ;({ ilk, join, oracleAuth, router, l2Dai, l1Escrow, l2WormholeBridge } = await setupTest({
        l1Signer,
        l2Signer,
        mainnetSdk,
        optimismAddresses,
        waitToRelayTxsToL2,
        l1User,
        fee: 0,
      }))

      // Incur some debt on L1
      const tx = await l2WormholeBridge
        .connect(l2User)
        ['initiateWormhole(bytes32,address,uint128)'](mainnetDomain, userAddress, amt)
      const { signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0)).wait()
      const sinBefore = await mainnetSdk.vat.sin(mainnetSdk.vow.address)
      expect(await join.debt(optimismDomain)).to.be.eq(amt)

      // Deploy and cast bad debt reconciliation spell on L1
      const { castBadDebtPushSpell } = await deploySpell({
        l1Signer,
        sdk: mainnetSdk,
        wormholeJoinAddress: join.address,
        sourceDomain: optimismDomain,
        badDebt: amt,
      })
      await castBadDebtPushSpell() // such spell would only be cast if the incurred debt isn't repaid after some period

      const sinAfter = await mainnetSdk.vat.sin(mainnetSdk.vow.address)
      expect(sinAfter.sub(sinBefore)).to.be.eq(amt.mul(toEthersBigNumber(toRay(1))))
      expect(await join.debt(optimismDomain)).to.be.eq(0)
    })
  })

  describe('emergency shutdown', () => {
    it('allows to retrieve DAI from open wormholes')
  })
})

interface SetupTestOpts {
  l1Signer: Wallet
  l2Signer: Wallet
  mainnetSdk: MainnetSdk
  optimismAddresses: OptimismAddresses
  waitToRelayTxsToL2: WaitToRelayTxsToL2
  l1User: Wallet
  fee: BigNumberish
}

async function setupTest({
  l1Signer,
  l2Signer,
  mainnetSdk,
  optimismAddresses,
  waitToRelayTxsToL2,
  l1User,
  fee,
}: SetupTestOpts) {
  const ilk = bytes32('WH_' + Buffer.from(randomBytes(14)).toString('hex')) // appending a random id allows for multiple deployments in the same vat

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    sdk: mainnetSdk,
    ilk,
    joinDomain: mainnetDomain,
    globalFee: fee,
    globalFeeTTL: OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME,
  })
  const baseBridgeSdk = await deployBaseBridge({ l1Signer, l2Signer, mainnetSdk, optimismAddresses })
  const bridgeSdk = await deployBridge({
    domain: optimismDomain,
    optimismAddresses,
    l1Signer,
    l2Signer,
    mainnetSdk,
    wormholeSdk,
    baseBridgeSdk,
  })

  await configureWormhole({
    defaultSigner: l1Signer,
    sdk: mainnetSdk,
    wormholeSdk,
    joinDomain: mainnetDomain,
    globalLine: line,
    domainsCfg: {
      [optimismDomain]: { line, l1Bridge: bridgeSdk.l1WormholeBridge.address },
    },
    oracleAddresses: oracleWallets.map((or) => or.address),
  })
  await configureWormholeBridge({ sdk: mainnetSdk, baseBridgeSdk, bridgeSdk, mainnetDomain })

  console.log('Moving some DAI to L2')
  await mainnetSdk.dai.connect(l1User).approve(baseBridgeSdk.l1DaiTokenBridge.address, amt)
  await waitToRelayTxsToL2(
    baseBridgeSdk.l1DaiTokenBridge
      .connect(l1User)
      .depositERC20(mainnetSdk.dai.address, baseBridgeSdk.l2Dai.address, amt, defaultL2Gas, defaultL2Data),
  )

  return {
    ilk,
    ...bridgeSdk,
    ...baseBridgeSdk,
    ...wormholeSdk,
  }
}
