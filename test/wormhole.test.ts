import { getMainnetSdk, getOptimismSdk } from '@dethcrypto/eth-sdk-client'
import { Wallet } from 'ethers'
import { ethers } from 'hardhat'

import { deployBaseBridge, deployBridge } from './bridge'
import { mintDai } from './dai'
import { formatWad, impersonateAccount, mintEther, toEthersBigNumber, toRad, toRay, toWad } from './helpers'
import {
  defaultL2Data,
  defaultL2Gas,
  getOptimismAddresses,
  makeRelayMessagesToL1,
  makeWaitToRelayTxsToL2,
  makeWatcher,
  mintL2Ether,
} from './optimism'
import { deployWormhole } from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const pauseProxyAddress = '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB' // pause proxy

const optimismDomain = bytes32('OPTIMISM-A')
const mainnetDomain = bytes32('MAINNET')

const ilk = bytes32('WORMHOLE')
const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))

const amt = toEthersBigNumber(toWad(100))

describe('Wormhole', () => {
  it('works', async () => {
    const l1Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:9545')
    const l1Signer = Wallet.createRandom().connect(l1Provider)
    const l2Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545')
    const l2Signer = l1Signer.connect(l2Provider)

    console.log('Current L1 block: ', (await l1Provider.getBlockNumber()).toString())
    console.log('Current L2 block: ', (await l2Provider.getBlockNumber()).toString())

    const mainnetSdk = getMainnetSdk(l1Signer)
    const optimismAddresses = await getOptimismAddresses()
    const optimismSdk = getOptimismSdk(l2Signer)

    const watcher = makeWatcher(l1Provider, l2Provider, optimismAddresses)
    const waitToRelayTxsToL2 = makeWaitToRelayTxsToL2(watcher)
    const relayMessagesToL1 = makeRelayMessagesToL1(watcher, l1Signer, optimismAddresses)

    await mintEther(l1Signer.address, l1Provider)
    await mintL2Ether(waitToRelayTxsToL2, mainnetSdk, optimismAddresses, l1Provider, l2Signer.address)

    const l1User = Wallet.createRandom().connect(l1Provider)
    const l2User = l1User.connect(l2Provider)
    await mintEther(l1User.address, l1Provider)
    await mintL2Ether(waitToRelayTxsToL2, mainnetSdk, optimismAddresses, l1Provider, l2User.address)
    await mintDai(mainnetSdk, l1User.address, amt)

    const { l1DaiTokenBridge, l2Dai, l2DaiTokenBridge, l1Escrow } = await deployBaseBridge(
      {
        domain: optimismDomain,
        mainnetSdk,
        optimismSdk: null as any,
        l1Signer,
        l2Signer,
      },
      optimismAddresses,
    )

    console.log('Depositing DAI...')
    await mainnetSdk.dai.connect(l1User).approve(l1DaiTokenBridge.address, amt)
    await waitToRelayTxsToL2(
      l1DaiTokenBridge
        .connect(l1User)
        .depositERC20(mainnetSdk.dai.address, l2Dai.address, amt, defaultL2Gas, defaultL2Data),
    )

    console.log('L1 escrow balance: ', formatWad(await mainnetSdk.dai.balanceOf(l1Escrow.address)))
    console.log('L1 DAI balance: ', formatWad(await mainnetSdk.dai.balanceOf(l1User.address)))
    console.log('L2 DAI balance: ', formatWad(await l2Dai.balanceOf(l1User.address)))

    const { l2WormholeBridge } = await deployBridge({
      domain: optimismDomain,
      mainnetSdk,
      optimismSdk,
      l1Signer,
      l2Signer,
    })

    const { join } = await deployWormhole({
      defaultSigner: l1Signer,
      sdk: mainnetSdk,
      ilk,
      joinDomain: mainnetDomain,
      line,
      spot,
      domainsCfg: {
        [optimismDomain]: { line },
      },
    })

    // here we need to intercept generated event and generate attestations for it
    await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, l2User.address, amt, l2User.address)

    console.log('L2 DAI balance after: ', formatWad(await optimismSdk.dai.balanceOf(l2User.address)))

    // this should use oracle auth
    const pauseProxyImpersonator = await impersonateAccount(pauseProxyAddress, l1Provider)
    await join.connect(pauseProxyImpersonator).registerWormholeAndWithdraw(
      {
        sourceDomain: optimismDomain,
        targetDomain: mainnetDomain,
        receiver: l2User.address,
        operator: l2User.address,
        nonce: 0,
        amount: amt,
        timestamp: 0,
      },
      100,
    )
    console.log(`Balance after mint: ${formatWad(await mainnetSdk.dai.balanceOf(l2User.address))} DAI`)
  })
})
