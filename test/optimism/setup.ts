import { getMainnetSdk, MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { JsonRpcProvider } from '@ethersproject/providers'

import { forwardTime, getOptimismAddresses, mintEther, toEthersBigNumber } from '../helpers'
import {
  deployWormhole,
  DomainSetupOpts,
  DomainSetupResult,
  mintDai,
  OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME,
} from '../wormhole'
import {
  defaultL2Data,
  defaultL2Gas,
  deployOptimismBaseBridge,
  deployOptimismWormholeBridge,
  makeRelayMessagesToL1,
  makeWaitToRelayTxsToL2,
  makeWatcher,
  mintL2Ether,
} from './index'

const TTL = OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME

export async function setupOptimismTests({
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
  const l1Sdk = getMainnetSdk(l1Signer)
  const mainnetSdk = l1Sdk as MainnetSdk
  const optimismAddresses = await getOptimismAddresses()
  const watcher = makeWatcher(l1Provider, l2Provider, optimismAddresses)
  const relayTxToL2 = makeWaitToRelayTxsToL2(watcher)
  const relayTxToL1 = makeRelayMessagesToL1(watcher, l1Signer, optimismAddresses)

  console.log('Funding l1Signer ETH balance...')
  await mintEther(l1Signer.address, l1Provider)
  console.log('Funding l2Signer ETH balance...')
  await mintL2Ether(relayTxToL2, l1Sdk as MainnetSdk, optimismAddresses, l1Provider, l2Signer.address)

  console.log('Funding l1User ETH balance...')
  await mintEther(l1User.address, l1Provider)
  console.log('Funding l2User ETH balance...')
  await mintL2Ether(relayTxToL2, l1Sdk as MainnetSdk, optimismAddresses, l1Provider, l1User.address)

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    sdk: l1Sdk,
    ilk,
    joinDomain: masterDomain,
    globalFee: fee,
    globalFeeTTL: TTL,
  })

  const baseBridgeSdk = await deployOptimismBaseBridge({
    l1Signer,
    l2Signer,
    sdk: mainnetSdk,
    optimismAddresses,
  })
  const wormholeBridgeSdk = await deployOptimismWormholeBridge({
    mainnetSdk,
    l1Signer,
    l2Signer,
    wormholeSdk,
    baseBridgeSdk,
    domain,
    optimismAddresses,
  })

  console.log('Moving some DAI to L2...')
  await mintDai(l1Sdk as MainnetSdk, l1User.address, toEthersBigNumber(l2DaiAmount.toString()))
  await mainnetSdk.dai.connect(l1User).approve(baseBridgeSdk.l1DaiTokenBridge.address, l2DaiAmount)
  await relayTxToL2(
    baseBridgeSdk.l1DaiTokenBridge
      .connect(l1User)
      .depositERC20(mainnetSdk.dai.address, baseBridgeSdk.l2Dai.address, l2DaiAmount, defaultL2Gas, defaultL2Data),
  )
  console.log('Optimism setup complete.')
  return {
    l1Sdk,
    relayTxToL1,
    relayTxToL2,
    wormholeBridgeSdk,
    baseBridgeSdk,
    wormholeSdk,
    ttl: TTL,
    forwardTimeToAfterFinalization,
  }
}

async function forwardTimeToAfterFinalization(l1Provider: JsonRpcProvider) {
  await forwardTime(l1Provider, TTL)
}
