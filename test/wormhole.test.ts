import { MainnetSdk, RinkebySdk } from '@dethcrypto/eth-sdk-client'
import { JsonRpcProvider } from '@ethersproject/providers'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

import {
  BasicRelay,
  BasicRelay__factory,
  Dai,
  L1Escrow,
  L2DAIWormholeBridge,
  WormholeJoin,
  WormholeOracleAuth,
  WormholeRouter,
} from '../typechain'
import { deployUsingFactory, getContractFactory, toEthersBigNumber, toRad, toRay, toWad, waitForTx } from './helpers'
import {
  callBasicRelay,
  deployFileJoinFeesSpell,
  deployFileJoinLineSpell,
  deployPushBadDebtSpell,
  DomainSetupFunction,
  ForwardTimeFunction,
  getAttestations,
  RelayTxToL1Function,
  setupTest,
} from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const oracleWallets = [...Array(3)].map(() => Wallet.createRandom())
const masterDomain = bytes32('L1')
const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))
const amt = toEthersBigNumber(toWad(10))

export function runWormholeTests(domain: string, setupDomain: DomainSetupFunction) {
  describe(`Wormhole on ${ethers.utils.parseBytes32String(domain)}`, () => {
    let l1Provider: JsonRpcProvider
    let relayTxToL1: RelayTxToL1Function
    let l1User: Wallet
    let l2User: Wallet
    let userAddress: string // both l1 and l2 user should have the same address
    let ilk: string
    let l1Signer: Wallet
    let l2WormholeBridge: L2DAIWormholeBridge
    let oracleAuth: WormholeOracleAuth
    let join: WormholeJoin
    let router: WormholeRouter
    let l2Dai: Dai
    let l1Sdk: MainnetSdk | RinkebySdk
    let l1Escrow: L1Escrow
    let ttl: number
    let forwardTimeToAfterFinalization: ForwardTimeFunction

    // Note: we use before() instead of beforeEach() for the test setup and perform some manual cleanup at
    // the end of some tests (in `finally` blocks) in order to minimize the running time and testnet ETH cost
    // of the Arbitrum tests running on the Rinkeby network. This should be changed once Arbitrum supports
    // running a local blockchain.
    before(async () => {
      ;({
        ilk,
        router,
        join,
        oracleAuth,
        l2Dai,
        l2WormholeBridge,
        l1Escrow,
        l1Provider,
        l1Signer,
        l1User,
        l2User,
        l1Sdk,
        relayTxToL1,
        ttl,
        forwardTimeToAfterFinalization,
      } = await setupTest({
        domain,
        line,
        spot,
        fee: 0,
        l2DaiAmount: amt.mul(100),
        oracleAddresses: oracleWallets.map((or) => or.address),
        setupDomain,
      }))
      userAddress = l2User.address
    })

    describe('fast path', () => {
      it('lets a user request minted DAI on L1 using oracle attestations', async () => {
        const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signHash, signatures, wormholeGUID } = await getAttestations(
          txReceipt,
          l2WormholeBridge.interface,
          oracleWallets,
        )
        try {
          const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
          expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
          expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true
          const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)

          await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))

          const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
          expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
        } finally {
          // cleanup
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
        }
      })

      it('lets a user request minted DAI on L1 using oracle attestations when fees are non 0', async () => {
        const fee = toEthersBigNumber(toWad(1))
        const feeInRad = toEthersBigNumber(toRad(1))
        const maxFeePerc = toEthersBigNumber(toWad(0.1)) // 10%

        // Change Wormhole fee
        const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
          l1Signer,
          sdk: l1Sdk,
          wormholeJoinAddress: join.address,
          sourceDomain: domain,
          fee,
          ttl,
        })
        await castFileJoinFeesSpell()

        try {
          const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
          const vowDaiBalanceBefore = await l1Sdk.vat.dai(l1Sdk.vow.address)
          const txReceipt = await waitForTx(
            l2WormholeBridge
              .connect(l2User)
              ['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
          )
          const { signHash, signatures, wormholeGUID } = await getAttestations(
            txReceipt,
            l2WormholeBridge.interface,
            oracleWallets,
          )
          try {
            const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
            expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
            expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true
            const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)

            await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, maxFeePerc, 0))

            const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
            expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt).sub(fee))
            const vowDaiBalanceAfterMint = await l1Sdk.vat.dai(l1Sdk.vow.address)
            expect(vowDaiBalanceAfterMint).to.be.eq(vowDaiBalanceBefore.add(feeInRad))
          } finally {
            // cleanup
            await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
          }
        } finally {
          // cleanup: reset Wormhole fee to 0
          const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
            l1Signer,
            sdk: l1Sdk,
            wormholeJoinAddress: join.address,
            sourceDomain: domain,
            fee: 0,
            ttl,
          })
          await castFileJoinFeesSpell()
        }
      })

      it('allows partial mints using oracle attestations when the amount withdrawn exceeds the maximum additional debt', async () => {
        const newLine = amt.div(2) // withdrawing an amount that is twice the debt ceiling

        // Change the line for the domain
        const { castFileJoinLineSpell } = await deployFileJoinLineSpell({
          l1Signer,
          sdk: l1Sdk,
          wormholeJoinAddress: join.address,
          sourceDomain: domain,
          line: newLine,
        })
        await castFileJoinLineSpell()

        try {
          const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
          const txReceipt = await waitForTx(
            l2WormholeBridge
              .connect(l2User)
              ['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
          )
          const { signatures, wormholeGUID } = await getAttestations(
            txReceipt,
            l2WormholeBridge.interface,
            oracleWallets,
          )
          const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
          expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
          const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)

          await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0)) // mint maximum possible

          const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
          expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(newLine)) // only half the requested amount was minted (minted=newLine-debt=newLine)

          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain)) // pay back debt. Usually relaying this message would take 7 days
          await waitForTx(join.connect(l1User).mintPending(wormholeGUID, 0, 0)) // mint leftover amount

          const l1BalanceAfterWithdraw = await l1Sdk.dai.balanceOf(userAddress)
          expect(l1BalanceAfterWithdraw).to.be.eq(l1BalanceBeforeMint.add(amt)) // the full amount has now been minted
        } finally {
          // cleanup: reset domain line to previous value
          const { castFileJoinLineSpell } = await deployFileJoinLineSpell({
            l1Signer,
            sdk: l1Sdk,
            wormholeJoinAddress: join.address,
            sourceDomain: domain,
            line,
          })
          await castFileJoinLineSpell()
        }
      })

      it('reverts when a user requests minted DAI on L1 using bad attestations', async () => {
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signHash, signatures, wormholeGUID } = await getAttestations(
          txReceipt,
          l2WormholeBridge.interface,
          oracleWallets,
        )

        try {
          // Signatures in bad order
          const reversedSigs = `0x${signatures
            .slice(2)
            .match(/.{130}/g)
            ?.reverse()
            .join('')}`
          let reason = 'WormholeOracleAuth/bad-sig-order'
          await expect(oracleAuth.isValid(signHash, reversedSigs, oracleWallets.length)).to.be.revertedWith(reason)

          await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, reversedSigs, 0, 0)).to.be.revertedWith(
            reason,
          )

          // Some signatures missing
          const tooFewSigs = `0x${signatures
            .slice(2)
            .match(/.{130}/g)
            ?.slice(1)
            .join('')}`
          reason = 'WormholeOracleAuth/not-enough-sig'
          await expect(oracleAuth.isValid(signHash, tooFewSigs, oracleWallets.length)).to.be.revertedWith(reason)

          await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, tooFewSigs, 0, 0)).to.be.revertedWith(
            reason,
          )

          // Some signatures invalid
          const badVSigs = `0x${signatures
            .slice(2)
            .match(/.{130}/g)
            ?.map((s) => `${s.slice(0, -2)}00`)
            .join('')}`
          reason = 'WormholeOracleAuth/bad-v'
          await expect(oracleAuth.isValid(signHash, badVSigs, oracleWallets.length)).to.be.revertedWith(reason)

          await expect(oracleAuth.connect(l1User).requestMint(wormholeGUID, badVSigs, 0, 0)).to.be.revertedWith(reason)
        } finally {
          // cleanup
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
          await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))
        }
      })

      it('reverts when non-operator requests minted DAI on L1 using oracle attestations', async () => {
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)

        try {
          await expect(oracleAuth.connect(l1Signer).requestMint(wormholeGUID, signatures, 0, 0)).to.be.revertedWith(
            'WormholeOracleAuth/not-receiver-nor-operator',
          )
        } finally {
          // cleanup
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
          await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))
        }
      })
    })

    describe('slow path', () => {
      it('mints DAI without oracles', async () => {
        const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        try {
          const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
          expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
          const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)

          const l1RelayMessages = await relayTxToL1(txReceipt)

          expect(l1RelayMessages.length).to.be.eq(1)
          const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
          expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
        } finally {
          // cleanup
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
        }
      })

      it('mints DAI without oracles when fees are non 0', async () => {
        // Change Wormhole fee
        const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
          l1Signer,
          sdk: l1Sdk,
          wormholeJoinAddress: join.address,
          sourceDomain: domain,
          fee: toEthersBigNumber(toWad(1)),
          ttl,
        })
        await castFileJoinFeesSpell()

        try {
          const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
          const txReceipt = await waitForTx(
            l2WormholeBridge
              .connect(l2User)
              ['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
          )

          try {
            const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
            expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
            await forwardTimeToAfterFinalization(l1Provider)
            const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)

            const l1RelayMessages = await relayTxToL1(txReceipt)

            expect(l1RelayMessages.length).to.be.eq(1)
            const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
            expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt)) // note: fee shouldn't be applied as this is slow path
          } finally {
            // cleanup
            await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
          }
        } finally {
          // cleanup: reset Wormhole fee to 0
          const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
            l1Signer,
            sdk: l1Sdk,
            wormholeJoinAddress: join.address,
            sourceDomain: domain,
            fee: 0,
            ttl,
          })
          await castFileJoinFeesSpell()
        }
      })
    })

    describe('flush', () => {
      it('pays back debt (negative debt)', async () => {
        // Burn L2 DAI (without withdrawing DAI on L1)
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)
        try {
          expect(await l2WormholeBridge.batchedDaiToFlush(masterDomain)).to.be.eq(amt)
          const l1EscrowDaiBefore = await l1Sdk.dai.balanceOf(l1Escrow.address)
          const debtBefore = await join.debt(domain)
          const vatDaiBefore = await l1Sdk.vat.dai(join.address)
          let urn = await l1Sdk.vat.urns(ilk, join.address)
          expect(urn.art).to.be.eq(0)
          expect(urn.ink).to.be.eq(0)

          // Pay back (not yet incurred) debt. Usually relaying this message would take 7 days
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))

          expect(await l2WormholeBridge.batchedDaiToFlush(masterDomain)).to.be.eq(0)
          const debtAfter = await join.debt(domain)
          expect(debtBefore.sub(debtAfter)).to.be.eq(amt)
          urn = await l1Sdk.vat.urns(ilk, join.address)
          expect(urn.art).to.be.eq(0)
          expect(urn.ink).to.be.eq(0)
          const vatDaiAfter = await l1Sdk.vat.dai(join.address)
          expect(vatDaiAfter.sub(vatDaiBefore)).to.be.eq(amt.mul(toEthersBigNumber(toRay(1))))
          const l1EscrowDaiAfter = await l1Sdk.dai.balanceOf(l1Escrow.address)
          expect(l1EscrowDaiBefore.sub(l1EscrowDaiAfter)).to.be.eq(amt)
          expect(await l1Sdk.dai.balanceOf(router.address)).to.be.eq(0)
          expect(await l1Sdk.dai.balanceOf(join.address)).to.be.eq(0)
        } finally {
          // cleanup
          await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))
        }
      })

      it('pays back debt (positive debt)', async () => {
        // Burn L2 DAI AND withdraw DAI on L1
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)
        await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))
        expect(await l2WormholeBridge.batchedDaiToFlush(masterDomain)).to.be.eq(amt)
        const l1EscrowDaiBefore = await l1Sdk.dai.balanceOf(l1Escrow.address)
        const debtBefore = await join.debt(domain)
        let urn = await l1Sdk.vat.urns(ilk, join.address)
        expect(urn.art).to.be.eq(amt)
        expect(urn.ink).to.be.eq(amt)

        // Pay back (already incurred) debt. Usually relaying this message would take 7 days
        await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))

        expect(await l2WormholeBridge.batchedDaiToFlush(masterDomain)).to.be.eq(0)
        const debtAfter = await join.debt(domain)
        expect(debtBefore.sub(debtAfter)).to.be.eq(amt)
        urn = await l1Sdk.vat.urns(ilk, join.address)
        expect(urn.art).to.be.eq(0)
        expect(urn.ink).to.be.eq(0)
        expect(await l1Sdk.vat.dai(join.address)).to.be.eq(0)
        const l1EscrowDaiAfter = await l1Sdk.dai.balanceOf(l1Escrow.address)
        expect(l1EscrowDaiBefore.sub(l1EscrowDaiAfter)).to.be.eq(amt)
        expect(await l1Sdk.dai.balanceOf(router.address)).to.be.eq(0)
        expect(await l1Sdk.dai.balanceOf(join.address)).to.be.eq(0)
      })
    })

    describe('bad debt', () => {
      it('allows governance to push bad debt to the vow', async () => {
        // Incur some debt on L1
        const txReceipt = await waitForTx(
          l2WormholeBridge.connect(l2User)['initiateWormhole(bytes32,address,uint128)'](masterDomain, userAddress, amt),
        )
        const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridge.interface, oracleWallets)
        await waitForTx(oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0, 0))
        const sinBefore = await l1Sdk.vat.sin(l1Sdk.vow.address)
        const debtBefore = await join.debt(domain)

        // Deploy and cast bad debt reconciliation spell on L1
        const { castBadDebtPushSpell } = await deployPushBadDebtSpell({
          l1Signer,
          sdk: l1Sdk,
          wormholeJoinAddress: join.address,
          sourceDomain: domain,
          badDebt: amt,
        })
        await castBadDebtPushSpell() // such spell would only be cast if the incurred debt isn't repaid after some period

        const sinAfter = await l1Sdk.vat.sin(l1Sdk.vow.address)
        expect(sinAfter.sub(sinBefore)).to.be.eq(amt.mul(toEthersBigNumber(toRay(1))))
        const debtAfter = await join.debt(domain)
        expect(debtBefore.sub(debtAfter)).to.be.eq(amt)
      })
    })

    describe('relay', () => {
      let relay: BasicRelay
      const expiry = '10000000000'
      const gasFee = parseEther('1.0')

      before(async () => {
        console.log('Deploying BasicRelay...')
        relay = await deployUsingFactory(l1Signer, getContractFactory<BasicRelay__factory>('BasicRelay'), [
          oracleAuth.address,
          l1Sdk.dai_join.address,
        ])
        console.log('BasicRelay deployed at:', relay.address)
      })

      it('lets a user obtain minted DAI on L1 using oracle attestations via a relayer contract', async () => {
        const maxFeePercentage = 0
        const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
        const txReceipt = await waitForTx(
          l2WormholeBridge
            .connect(l2User)
            ['initiateWormhole(bytes32,address,uint128,address)'](masterDomain, userAddress, amt, relay.address),
        )
        try {
          const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
          expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
          const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)
          const relayCallerBeforeMint = await l1Sdk.dai.balanceOf(l1Signer.address)

          await callBasicRelay({
            relay,
            txReceipt,
            l2WormholeBridgeInterface: l2WormholeBridge.interface,
            l1Signer,
            receiver: l1User,
            oracleWallets,
            expiry,
            gasFee,
            maxFeePercentage,
          })

          const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
          expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt).sub(gasFee))
          const relayCallerAfterMint = await l1Sdk.dai.balanceOf(l1Signer.address)
          expect(relayCallerAfterMint).to.be.eq(relayCallerBeforeMint.add(gasFee))
        } finally {
          // cleanup
          await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
        }
      })

      it('lets a user obtain minted DAI on L1 using oracle attestations via a relayer contract when fees are non 0', async () => {
        const fee = toEthersBigNumber(toWad(1))
        const feeInRad = toEthersBigNumber(toRad(1))
        const maxFeePercentage = toEthersBigNumber(toWad(0.1)) // 10%

        // Change Wormhole fee
        const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
          l1Signer,
          sdk: l1Sdk,
          wormholeJoinAddress: join.address,
          sourceDomain: domain,
          fee,
          ttl,
        })
        await castFileJoinFeesSpell()

        try {
          const l2BalanceBeforeBurn = await l2Dai.balanceOf(userAddress)
          const txReceipt = await waitForTx(
            l2WormholeBridge
              .connect(l2User)
              ['initiateWormhole(bytes32,address,uint128,address)'](masterDomain, userAddress, amt, relay.address),
          )
          try {
            const l2BalanceAfterBurn = await l2Dai.balanceOf(userAddress)
            expect(l2BalanceAfterBurn).to.be.eq(l2BalanceBeforeBurn.sub(amt))
            const vowDaiBalanceBefore = await l1Sdk.vat.dai(l1Sdk.vow.address)
            const l1BalanceBeforeMint = await l1Sdk.dai.balanceOf(userAddress)
            const relayCallerBeforeMint = await l1Sdk.dai.balanceOf(l1Signer.address)

            await callBasicRelay({
              relay,
              txReceipt,
              l2WormholeBridgeInterface: l2WormholeBridge.interface,
              l1Signer,
              receiver: l1User,
              oracleWallets,
              expiry,
              gasFee,
              maxFeePercentage,
            })

            const vowDaiBalanceAfterMint = await l1Sdk.vat.dai(l1Sdk.vow.address)
            expect(vowDaiBalanceAfterMint).to.be.eq(vowDaiBalanceBefore.add(feeInRad))
            const l1BalanceAfterMint = await l1Sdk.dai.balanceOf(userAddress)
            expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt).sub(gasFee).sub(fee))
            const relayCallerAfterMint = await l1Sdk.dai.balanceOf(l1Signer.address)
            expect(relayCallerAfterMint).to.be.eq(relayCallerBeforeMint.add(gasFee))
          } finally {
            // cleanup
            await relayTxToL1(l2WormholeBridge.connect(l2User).flush(masterDomain))
          }
        } finally {
          // cleanup: reset Wormhole fee to 0
          const { castFileJoinFeesSpell } = await deployFileJoinFeesSpell({
            l1Signer,
            sdk: l1Sdk,
            wormholeJoinAddress: join.address,
            sourceDomain: domain,
            fee: 0,
            ttl,
          })
          await castFileJoinFeesSpell()
        }
      })
    })

    describe('emergency shutdown', () => {
      it('allows to retrieve DAI from open wormholes')
    })
  })
}
