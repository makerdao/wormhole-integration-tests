import { getMainnetSdk, getOptimismSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { ethers } from 'hardhat'

import { getAttestations } from './attestations'
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

    const l1User = await impersonateAccount(userAddress, l1Provider)
    const l2User = await impersonateAccount(userAddress, l2Provider)

    console.log('L2 DAI balance: ', formatWad(await optimismSdk.dai.balanceOf(userAddress)))

    const amt = toEthersBigNumber(toWad(1))

    const oracleWallets = [...Array(3)].map(() => Wallet.createRandom())

    const { oracleAuth } = await deployWormhole({
      defaultSigner: l1Signer,
      sdk: mainnetSdk,
      ilk,
      joinDomain: mainnetDomain,
      line,
      spot,
      domainsCfg: {
        [optimismDomain]: { line },
      },
      oracleAddresses: oracleWallets.map((or) => or.address),
    })

    const tx = await l2WormholeBridge.connect(l2User).initiateWormhole(mainnetDomain, userAddress, amt, userAddress)
    const { signHash, signatures, wormholeGUID } = await getAttestations(
      await tx.wait(),
      l2WormholeBridge.interface,
      oracleWallets,
    )
    expect(await oracleAuth.isValid(signHash, signatures, oracleWallets.length)).to.be.true

    const l1BalanceBeforeMint = await mainnetSdk.dai.balanceOf(userAddress)
    await oracleAuth.connect(l1User).requestMint(wormholeGUID, signatures, 0)
    const l1BalanceAfterMint = await mainnetSdk.dai.balanceOf(userAddress)
    expect(l1BalanceAfterMint).to.be.eq(l1BalanceBeforeMint.add(amt))
  })
})
