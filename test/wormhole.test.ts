import { getMainnetSdk, getOptimismSdk } from '@dethcrypto/eth-sdk-client'
import { randomBytes } from '@ethersproject/random'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { ethers } from 'hardhat'

import { getAttestations } from './attestations'
import { deployBridges } from './bridge'
import { formatWad, impersonateAccount, toEthersBigNumber, toRad, toRay, toWad } from './helpers'
import { deployWormhole } from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const l1SignerAddress = '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB' // pause proxy
const l2SignerAddress = '0x10E6593CDda8c58a1d0f14C5164B376352a55f2F' // governance relay
const userAddress = '0x784e7D6b6DC65b182aAAcF033f1d2F5f6508Ae22' // random acc with l2 dai
const l1EscrowAddress = '0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65' // Optimism & Arbitrum L1 Dai escrow

const oracleWallets = [...Array(3)].map(() => Wallet.createRandom())

const optimismDomain = bytes32('OPTIMISM-A')
const mainnetDomain = bytes32('MAINNET')

const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))
const amt = toEthersBigNumber(toWad(10))

describe('Wormhole', () => {
  let l1Provider: any
  let l2Provider: any
  let l1User: any
  let l2User: any
  let l1Signer: any
  let l2Signer: any
  let l1WormholeBridge: any
  let l2WormholeBridge: any
  let oracleAuth: any
  let join: any
  let router: any
  let mainnetSdk: any
  let optimismSdk: any

  before(async () => {
    console.log('Running in forkmode')
    l1Provider = ethers.provider
    l2Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:9585/')
    console.log('Current L1 block: ', (await l1Provider.getBlockNumber()).toString())
    console.log('Current L2 block: ', (await l2Provider.getBlockNumber()).toString())

    l1Signer = await impersonateAccount(l1SignerAddress, l1Provider)
    l2Signer = await impersonateAccount(l2SignerAddress, l2Provider)
    mainnetSdk = getMainnetSdk(l1Signer)
    optimismSdk = getOptimismSdk(l2Signer)

    l1User = await impersonateAccount(userAddress, l1Provider)
    l2User = await impersonateAccount(userAddress, l2Provider)
    console.log('L2 DAI balance: ', formatWad(await optimismSdk.dai.balanceOf(userAddress)))
  })

  beforeEach(async () => {
    const wh = await deployWormhole({
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
    })
    ;({ join, oracleAuth, router } = wh)

    const bridges = await deployBridges({
      domain: optimismDomain,
      mainnetSdk,
      optimismSdk,
      l1Signer,
      l2Signer,
      wormholeRouter: router.address,
    })
    ;({ l1WormholeBridge, l2WormholeBridge } = bridges)

    console.log('Configuring router...')
    await router['file(bytes32,bytes32,address)'](bytes32('bridge'), mainnetDomain, l1WormholeBridge.address)
  })

  describe('fast path', () => {
    it('lets a user request minted DAI on L1 using oracle attestations', async () => {
      const l2BalanceBeforeBurn = await optimismSdk.dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      const { signHash, signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await optimismSdk.dai.balanceOf(userAddress)
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

      const l2BalanceBeforeBurn = await optimismSdk.dai.balanceOf(userAddress)
      const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
      const { signatures, wormholeGUID } = await getAttestations(
        await tx.wait(),
        l2WormholeBridge.interface,
        oracleWallets,
      )
      const l2BalanceAfterBurn = await optimismSdk.dai.balanceOf(userAddress)
      expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))

      const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)
      await (await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0)).wait()
      const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
      expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(line)) // only half the requested amount was minted (minted=line-debt=line)

      // hack to settle the join without going through the L1 bridge -- note: this is normally done via an L2 -> L1 crosschain message
      await l2WormholeBridge.connect(l2User).flush(optimismDomain)
      const l1EscrowSigner = await impersonateAccount(l1EscrowAddress, l1Provider)
      await (await mainnetSdk.dai.connect(l1EscrowSigner).transfer(join.address, line)).wait()
      await (await join.connect(l1Signer).settle(optimismDomain, line)).wait()

      await (await join.connect(l1User).withdrawPending(wormholeGUID, 0)).wait() // mint leftover amount
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
      const reversedSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.reverse()
        .join('')}`
      let reason = 'WormholeOracleAuth/bad-sig-order'
      await expect(oracleAuth.isValid(signHash, reversedSigs, oracleWallets.length)).to.be.revertedWith(reason)
      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, reversedSigs, 0)).to.be.revertedWith(reason)

      const tooFewSigs = `0x${signatures
        .slice(2)
        .match(/.{130}/g)
        ?.slice(1)
        .join('')}`
      reason = 'WormholeOracleAuth/not-enough-sig'
      await expect(oracleAuth.isValid(signHash, tooFewSigs, oracleWallets.length)).to.be.revertedWith(reason)
      await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, tooFewSigs, 0)).to.be.revertedWith(reason)

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
})
