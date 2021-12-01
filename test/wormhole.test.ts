import { getMainnetSdk, getOptimismSdk } from '@dethcrypto/eth-sdk-client'
import { ethers } from 'hardhat'

import { deployBridge } from './bridge'
import { formatWad, impersonateAccount, toEthersBigNumber, toRad, toRay, toWad } from './helpers'
import { deployWormhole } from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

// pause proxy address
const defaultSignerAddress = '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB'
const sourceDomain = bytes32('OPTIMISM-A')
const targetDomain = bytes32('MAINNET')
const ilk = bytes32('WORMHOLE')
const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))

const l2UserAddress = '0x784e7D6b6DC65b182aAAcF033f1d2F5f6508Ae22' // random acc with l2 dai

describe('Wormhole', () => {
  it('works', async () => {
    console.log('Running in forkmode')
    const l1Provider = ethers.provider
    const l1Signer = await impersonateAccount(defaultSignerAddress, l1Provider)
    const mainnetSdk = getMainnetSdk(l1Signer)

    const l2Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:9585/')
    const l2Signer = await impersonateAccount(defaultSignerAddress, l2Provider)
    const optimismSdk = getOptimismSdk(l2Signer)

    console.log('Current L1 block: ', (await l1Provider.getBlockNumber()).toString())
    console.log('Current L2 block: ', (await l2Provider.getBlockNumber()).toString())
    const { l2WormholeBridge } = await deployBridge({
      domain: sourceDomain,
      mainnetSdk,
      optimismSdk,
      l1Signer,
      l2Signer,
    })

    const l2User = await impersonateAccount(l2UserAddress, l2Provider)

    console.log('L2 DAI balance: ', formatWad(await optimismSdk.dai.balanceOf(l2UserAddress)))

    const amt = toEthersBigNumber(toWad(100))
    await optimismSdk.dai.connect(l2User).approve(l2WormholeBridge.address, amt)
    // here we need to intercept generated event and generate attestations for it
    await l2WormholeBridge.connect(l2User).initiateWormhole(targetDomain, l2UserAddress, amt, l2UserAddress)

    console.log('L2 DAI balance after: ', formatWad(await optimismSdk.dai.balanceOf(l2UserAddress)))

    const { join } = await deployWormhole({
      defaultSigner: l1Signer,
      sdk: mainnetSdk,
      ilk,
      joinDomain: targetDomain,
      line,
      spot,
      domainsCfg: {
        [sourceDomain]: { line },
      },
    })

    // this should use oracle auth
    await join.registerWormholeAndWithdraw(
      {
        sourceDomain: sourceDomain,
        targetDomain: targetDomain,
        receiver: defaultSignerAddress,
        operator: defaultSignerAddress,
        nonce: 0,
        amount: toEthersBigNumber(toWad(100)),
        timestamp: 0,
      },
      100,
    )
    console.log(`Balance after mint: ${formatWad(await mainnetSdk.dai.balanceOf(defaultSignerAddress))} DAI`)
  })
})
