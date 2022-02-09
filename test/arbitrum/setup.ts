import { getRinkebySdk, RinkebySdk } from '@dethcrypto/eth-sdk-client'
import { sleep } from '@eth-optimism/core-utils'
import { ethers } from 'hardhat'

import { waitForTx } from '../helpers'
import { deployWormhole, DomainSetupOpts, DomainSetupResult } from '../wormhole'
import {
  deployArbitrumBaseBridge,
  deployArbitrumWormholeBridge,
  depositToStandardBridge,
  getArbitrumAddresses,
  makeRelayTxToL1,
  waitToRelayTxsToL2 as waitToRelayTxsToArbitrumL2,
} from './index'

const TTL = 300

export async function setupArbitrumTests({
  l1Signer,
  l2Signer,
  l1User,
  l1Provider,
  l2Provider,
  l2DaiAmount,
  domain,
  masterDomain,
  ilk,
  fee,
}: DomainSetupOpts): Promise<DomainSetupResult> {
  const l1Sdk = getRinkebySdk(l1Signer)
  const rinkebySdk = l1Sdk as RinkebySdk
  const arbitrumAddresses = getArbitrumAddresses()

  const userEthAmount = ethers.utils.parseEther('0.1')
  if ((await l1User.getBalance()).lt(userEthAmount)) {
    console.log('Funding l1User ETH balance...')
    await l1Signer.sendTransaction({ to: l1User.address, value: userEthAmount })
  }
  if ((await l2Provider.getBalance(l1User.address)).lt(userEthAmount)) {
    console.log('Funding l2User ETH balance...')
    await l2Signer.sendTransaction({ to: l1User.address, value: userEthAmount })
  }
  if ((await l1Sdk.dai.balanceOf(l1User.address)).lt(l2DaiAmount)) {
    console.log('Funding l1User DAI balance...')
    await l1Sdk.dai.transfer(l1User.address, l2DaiAmount)
  }

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    sdk: l1Sdk,
    ilk,
    joinDomain: masterDomain,
    globalFee: fee,
    globalFeeTTL: TTL,
  })

  const baseBridgeSdk = await deployArbitrumBaseBridge({
    l1Signer,
    l2Signer,
    sdk: rinkebySdk,
    arbitrumAddresses,
  })
  const wormholeBridgeSdk = await deployArbitrumWormholeBridge({
    rinkebySdk,
    l1Signer,
    l2Signer,
    wormholeSdk,
    baseBridgeSdk,
    domain,
    arbitrumAddresses,
  })
  const relayMessagesToL1 = makeRelayTxToL1(wormholeBridgeSdk.l2WormholeBridge, l1Sdk, l1Signer)

  console.log('Moving some DAI to L2...')
  await waitForTx(l1Sdk.dai.connect(l1Signer).transfer(l1User.address, l2DaiAmount))
  await waitForTx(l1Sdk.dai.connect(l1User).approve(baseBridgeSdk.l1DaiTokenBridge.address, l2DaiAmount))
  await waitToRelayTxsToArbitrumL2(
    depositToStandardBridge({
      l2Provider: l2Provider,
      from: l1User,
      to: l1User.address,
      l1Gateway: baseBridgeSdk.l1DaiTokenBridge,
      l1TokenAddress: l1Sdk.dai.address,
      l2GatewayAddress: baseBridgeSdk.l2DaiTokenBridge.address,
      deposit: l2DaiAmount.toString(),
    }),
    arbitrumAddresses.l1.inbox,
    l1Provider,
    l2Provider,
  )
  console.log('Arbitrum setup complete.')
  return {
    l1Sdk,
    relayMessagesToL1,
    wormholeSdk,
    baseBridgeSdk,
    wormholeBridgeSdk,
    ttl: TTL,
    forwardTimeToAfterFinalization,
  }
}

async function forwardTimeToAfterFinalization() {
  await sleep(TTL * 1000 + 30000)
}
