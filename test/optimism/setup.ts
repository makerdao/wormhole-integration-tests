import { getMainnetSdk } from '@dethcrypto/eth-sdk-client'
import { JsonRpcProvider } from '@ethersproject/providers'

import { L1AddWormholeOptimismSpell__factory, L2AddWormholeDomainSpell__factory } from '../../typechain'
import { deployUsingFactory, forwardTime, getContractFactory, mintEther, toEthersBigNumber } from '../helpers'
import {
  deployWormhole,
  DomainSetupOpts,
  DomainSetupResult,
  mintDai,
  OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME,
} from '../wormhole'
import { getDynamicOptimismRollupSdk } from '.'
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
  line,
}: DomainSetupOpts): Promise<DomainSetupResult> {
  const l1Sdk = getMainnetSdk(l1Signer)
  const makerSdk = l1Sdk.maker
  const optimismRollupSdk = await getDynamicOptimismRollupSdk(l1Signer, l2Signer)
  const watcher = makeWatcher(l1Provider, l2Provider, optimismRollupSdk)
  const relayTxToL2 = makeWaitToRelayTxsToL2(watcher)
  const relayTxToL1 = makeRelayMessagesToL1(watcher, l1Signer, optimismRollupSdk)

  console.log('Funding l1Signer ETH balance...')
  await mintEther(l1Signer.address, l1Provider)
  console.log('Funding l2Signer ETH balance...')
  await mintL2Ether(relayTxToL2, optimismRollupSdk, l1Provider, l2Signer.address)

  console.log('Funding l1User ETH balance...')
  await mintEther(l1User.address, l1Provider)
  console.log('Funding l2User ETH balance...')
  await mintL2Ether(relayTxToL2, optimismRollupSdk, l1Provider, l1User.address)

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    makerSdk: l1Sdk.maker,
    ilk,
    joinDomain: masterDomain,
    globalFee: fee,
    globalFeeTTL: TTL,
  })

  const baseBridgeSdk = await deployOptimismBaseBridge({
    l1Signer,
    l2Signer,
    makerSdk,
    optimismRollupSdk,
  })
  const wormholeBridgeSdk = await deployOptimismWormholeBridge({
    makerSdk: makerSdk,
    l1Signer,
    l2Signer,
    wormholeSdk,
    baseBridgeSdk,
    slaveDomain: domain,
    optimismRollupSdk,
  })

  console.log('Deploy Optimism L2 spell...')
  const l2AddWormholeDomainSpell = await deployUsingFactory(
    l2Signer,
    getContractFactory<L2AddWormholeDomainSpell__factory>('L2AddWormholeDomainSpell'),
    [baseBridgeSdk.l2Dai.address, wormholeBridgeSdk.l2WormholeBridge.address, masterDomain],
  )
  console.log('Deploy Optimism L1 spell...')
  const L1AddWormholeOptimismSpellFactory = getContractFactory<L1AddWormholeOptimismSpell__factory>(
    'L1AddWormholeOptimismSpell',
    l1Signer,
  )
  const addWormholeDomainSpell = await L1AddWormholeOptimismSpellFactory.deploy(
    domain,
    wormholeSdk.join.address,
    wormholeSdk.constantFee.address,
    line,
    wormholeSdk.router.address,
    wormholeBridgeSdk.l1WormholeBridge.address,
    baseBridgeSdk.l1Escrow.address,
    makerSdk.dai.address,
    baseBridgeSdk.l1GovRelay.address,
    l2AddWormholeDomainSpell.address,
  )

  console.log('Moving some DAI to L2...')
  await mintDai(makerSdk, l1User.address, toEthersBigNumber(l2DaiAmount.toString()))
  await makerSdk.dai.connect(l1User).approve(baseBridgeSdk.l1DaiTokenBridge.address, l2DaiAmount)
  await relayTxToL2(
    baseBridgeSdk.l1DaiTokenBridge
      .connect(l1User)
      .depositERC20(makerSdk.dai.address, baseBridgeSdk.l2Dai.address, l2DaiAmount, defaultL2Gas, defaultL2Data),
  )
  console.log('Optimism setup complete.')
  return {
    makerSdk,
    relayTxToL1,
    relayTxToL2,
    wormholeBridgeSdk,
    baseBridgeSdk,
    wormholeSdk,
    ttl: TTL,
    forwardTimeToAfterFinalization,
    addWormholeDomainSpell,
  }
}

async function forwardTimeToAfterFinalization(l1Provider: JsonRpcProvider) {
  await forwardTime(l1Provider, TTL)
}
