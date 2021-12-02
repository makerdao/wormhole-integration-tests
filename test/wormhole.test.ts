import { getMainnetSdk, getOptimismSdk } from '@dethcrypto/eth-sdk-client'
import { ethers } from 'hardhat'

import { deployBridge } from './bridge'
import { formatWad, impersonateAccount, toEthersBigNumber, toRad, toRay, toWad } from './helpers'
import { deployWormhole } from './wormhole'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

const l1SignerAddress = '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB' // pause proxy
const l2SignerAddress = '0x10E6593CDda8c58a1d0f14C5164B376352a55f2F' // governance relay
const userAddress = '0x784e7D6b6DC65b182aAAcF033f1d2F5f6508Ae22' // random acc with l2 dai

const optimismDomain = bytes32('OPTIMISM-A')
const mainnetDomain = bytes32('MAINNET')

const ilk = bytes32('WORMHOLE')
const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))

describe('Wormhole', () => {
  it('works', async () => {
    console.log('Running in forkmode')
    const l1Provider = ethers.provider
    const l1Signer = await impersonateAccount(l1SignerAddress, l1Provider)
    const mainnetSdk = getMainnetSdk(l1Signer)

    const l2Provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:9585/')
    const l2Signer = await impersonateAccount(l2SignerAddress, l2Provider)
    const optimismSdk = getOptimismSdk(l2Signer)

    console.log('Current L1 block: ', (await l1Provider.getBlockNumber()).toString())
    console.log('Current L2 block: ', (await l2Provider.getBlockNumber()).toString())

    const { l2WormholeBridge } = await deployBridge({
      domain: optimismDomain,
      mainnetSdk,
      optimismSdk,
      l1Signer,
      l2Signer,
    })

    const user = await impersonateAccount(userAddress, l2Provider)

    console.log('L2 DAI balance: ', formatWad(await optimismSdk.dai.balanceOf(userAddress)))

    const amt = toEthersBigNumber(toWad(100))
    // here we need to intercept generated event and generate attestations for it
    await l2WormholeBridge.connect(user).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)

    console.log('L2 DAI balance after: ', formatWad(await optimismSdk.dai.balanceOf(userAddress)))

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

    // this should use oracle auth
    await join.registerWormholeAndWithdraw(
      {
        sourceDomain: optimismDomain,
        targetDomain: mainnetDomain,
        receiver: l1SignerAddress,
        operator: l1SignerAddress,
        nonce: 0,
        amount: toEthersBigNumber(toWad(100)),
        timestamp: 0,
      },
      100,
    )
    console.log(`Balance after mint: ${formatWad(await mainnetSdk.dai.balanceOf(l1SignerAddress))} DAI`)
  })
})
