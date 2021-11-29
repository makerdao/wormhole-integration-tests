import { getMainnetSdk } from '@dethcrypto/eth-sdk-client'
import { ethers } from 'hardhat'

import { deployWormhole } from './deploy'
import { formatWad, impersonateAccount, toEthersBigNumber, toRad, toRay, toWad } from './helpers'

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR) // turn off warnings
const bytes32 = ethers.utils.formatBytes32String

// pause proxy address
const defaultSignerAddress = '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB'
const sourceDomain = bytes32('OPTIMISM-A')
const targetDomain = bytes32('MAINNET')
const ilk = bytes32('WORMHOLE')
const line = toEthersBigNumber(toRad(10_000_000)) // 10M debt ceiling
const spot = toEthersBigNumber(toRay(1))

describe('Wormhole', () => {
  it('works', async () => {
    console.log('Running in forkmode')
    const defaultSigner = await impersonateAccount(defaultSignerAddress, {
      setBalance: true,
    })
    const sdk = getMainnetSdk(defaultSigner)

    const { join } = await deployWormhole({
      defaultSigner,
      sdk,
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
    console.log(`Balance after mint: ${formatWad(await sdk.dai.balanceOf(defaultSignerAddress))} DAI`)
  })
})
