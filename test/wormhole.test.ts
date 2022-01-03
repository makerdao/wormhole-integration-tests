import { getMainnetSdk, MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { Watcher } from '@eth-optimism/core-utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { randomBytes } from '@ethersproject/random'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { ethers } from 'hardhat'

import {
  Dai,
  L1DAIWormholeBridge,
  L2DAIWormholeBridge,
  WormholeJoin,
  WormholeOracleAuth,
  WormholeRouter,
} from '../typechain'
import { getAttestations } from './attestations'
import { deployBaseBridge, deployBridge } from './bridge'
import { mintDai } from './dai'
import {
  formatWad,
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
import { deployWormhole } from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const oracleWallets = [...Array(3)].map(() => Wallet.createRandom())

const optimismDomain = bytes32('OPTIMISM-A')
const mainnetDomain = bytes32('MAINNET')

const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))
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
  let l1Signer: Wallet
  let l2Signer: Wallet
  let l1WormholeBridge: L1DAIWormholeBridge
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

  beforeEach(async () => {
    ;({ join, oracleAuth, router } = await deployWormhole({
      defaultSigner: l1Signer,
      sdk: mainnetSdk,
      ilk: bytes32('WH_' + Buffer.from(randomBytes(14)).toString('hex')), // appending a random id allows for multiple deployments in the same vat
      joinDomain: mainnetDomain,
      line,
      spot,
      domainsCfg: {
        [optimismDomain]: { line },
      },
      oracleAddresses: oracleWallets.map((or) => or.address),
    }))
    const baseBridge = await deployBaseBridge({ l1Signer, l2Signer, mainnetSdk, optimismAddresses })
    l2Dai = baseBridge.l2Dai
    l1Escrow = baseBridge.l1Escrow
    ;({ l1WormholeBridge, l2WormholeBridge } = await deployBridge({
      domain: optimismDomain,
      mainnetSdk,
      optimismAddresses,
      l1Signer,
      l2Signer,
      wormholeRouter: router.address,
      l1Escrow,
      l2Dai,
    }))

    console.log('Configuring router...')
    await waitForTx(router.file(bytes32('gateway'), optimismDomain, l1WormholeBridge.address))
    await waitForTx(l2WormholeBridge.file(bytes32('validDomains'), mainnetDomain, 1))

    console.log('Moving some DAI to L2')
    await mainnetSdk.dai.connect(l1User).approve(baseBridge.l1DaiTokenBridge.address, amt)
    await waitToRelayTxsToL2(
      baseBridge.l1DaiTokenBridge
        .connect(l1User)
        .depositERC20(mainnetSdk.dai.address, l2Dai.address, amt, defaultL2Gas, defaultL2Data),
    )
    console.log('L2 DAI balance: ', formatWad(await l2Dai.balanceOf(userAddress)))
  })

  describe('fast path', () => {
    it('lets a user request minted DAI on L1 using oracle attestations', async () => {
      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      const { signHash, signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
      expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)

      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0)).wait()

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
    })

    it('allows partial mints using oracle attestations when the amount withdrawn exceeds the maximum additional debt', async () => {
      const line = amt.div(2) // withdrawing an amount that is twice the debt ceiling
      await join['file(bytes32,bytes32,uint256)'](bytes32('line'), optimismDomain, line)
      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      const { signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)

      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0)).wait() // mint maximum possible

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(line)) // only half the requested amount was minted (minted=line-debt=line)

      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(amt)
      const escrowedDaiBeforeFlush = await mainnetSdk.dai.balanceOf(l1Escrow.address)
      expect(escrowedDaiBeforeFlush).to.equal(amt)
      // Withdraw L2 DAI and pay back debt
      // Usually relaying this message would take 7 days
      await relayMessagesToL1(l2WormholeBridge.connect(l2User).flush(mainnetDomain))

      expect(await l2WormholeBridge.batchedDaiToFlush(mainnetDomain)).to.be.eq(0)
      const escrowedDaiAfterFlush = await mainnetSdk.dai.balanceOf(l1Escrow.address)
      expect(escrowedDaiAfterFlush).to.equal(0)

      expect(await mainnetSdk.dai.balanceOf(router.address)).to.be.eq(0)
      expect(await mainnetSdk.dai.balanceOf(join.address)).to.be.eq(0)

      await waitForTx(join.connect(l1User).mintPending(wormholeGUID, 0)) // mint leftover amount

      const l1BalanceAfterWithdraw = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterWithdraw).to.be.eq(l1BalanceBeforeMint.add(amt)) // the full amount has now been minted
    })

    it('reverts when a user requests minted DAI on L1 using bad attestations', async () => {
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
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

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, reversedSigs, 0)).to.be.revertedWith(reason)

      // Some signatures missing
      const tooFewSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.slice(1)
        .join('')}`
      reason = 'WormholeOracleAuth/not-enough-sig'
      await expect(oracleAuth.isValid(signHash, tooFewSigs, oracleWallets.length)).to.be.revertedWith(reason)

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, tooFewSigs, 0)).to.be.revertedWith(reason)

      // Some signatures invalid
      const badVSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.map((s) => `${s.slice(0, -2)}00`)
        .join('')}`
      reason = 'WormholeOracleAuth/bad-v'
      await expect(oracleAuth.isValid(signHash, badVSigs, oracleWallets.length)).to.be.revertedWith(reason)

      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, badVSigs, 0)).to.be.revertedWith(reason)
    })

    it('reverts when non-operator requests minted DAI on L1 using oracle attestations', async () => {
      const txReceipt = await (
        await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      ).wait()
      const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)

      await expect(oracleAuth.connect(l1Signer).requestMint(wormholeGUID, signatures, 0)).to.be.revertedWith(
        'WormholeOracleAuth/not-operator',
      )
    })
  })

  describe('slow path', () => {
    it('mints DAI without oracles', async () => {
      const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))

      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)
      const l1RelayMessages = await relayMessagesToL1(tx)
      expect(l1RelayMessages.length).to.be.eq(1)

      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
    })
  })

  describe('flush', () => {
    it('pays back debt')
    it("can't flush not-configured domain")
  })

  describe('bad debt', () => {
    it('governance pushed bad debt')
  })

  describe('emergency shutdown', () => {
    it('allows to retrieve DAI from open wormholes')
  })
})
