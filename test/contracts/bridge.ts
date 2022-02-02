import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { constants, ethers, Signer } from 'ethers'

import {
  Dai__factory,
  L1DAITokenBridge__factory,
  L1DAIWormholeBridge__factory,
  L1Escrow__factory,
  L2DAITokenBridge__factory,
  L2DAIWormholeBridge__factory,
} from '../../typechain'
import { L2AddWormholeDomainSpell__factory } from '../../typechain/factories/L2AddWormholeDomainSpell__factory'
import { deployUsingFactory, getContractFactory, mintEther } from '../helpers'
import { OptimismAddresses, waitForTx } from '../helpers'
import { getAddressOfNextDeployedContract } from '../pe-utils/address'
import { WormholeSdk } from './wormholeJoin'

interface BridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  wormholeSdk: WormholeSdk
  baseBridgeSdk: BaseBridgeSdk
  optimismAddresses: OptimismAddresses
  domain: string
}

export async function deployBridge(opts: BridgeDeployOpts) {
  const futureL1WormholeBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismAddresses.l2.xDomainMessenger,
    opts.baseBridgeSdk.l2Dai.address,
    futureL1WormholeBridgeAddress,
    opts.domain,
  ])

  const L1WormholeBridgeFactory = getContractFactory<L1DAIWormholeBridge__factory>('L1DAIWormholeBridge')
  const l1WormholeBridge = await deployUsingFactory(opts.l1Signer, L1WormholeBridgeFactory, [
    opts.mainnetSdk.dai.address,
    l2WormholeBridge.address,
    opts.optimismAddresses.l1.xDomainMessenger,
    opts.baseBridgeSdk.l1Escrow.address,
    opts.wormholeSdk.router.address,
  ])
  expect(l1WormholeBridge.address).to.be.eq(futureL1WormholeBridgeAddress, 'Future address doesnt match actual address')

  return { l2WormholeBridge, l1WormholeBridge }
}
export type BridgeSdk = Awaited<ReturnType<typeof deployBridge>>

export async function configureWormholeBridge({
  l2Signer,
  baseBridgeSdk,
  bridgeSdk,
  masterDomain,
}: {
  l2Signer: Signer
  bridgeSdk: BridgeSdk
  baseBridgeSdk: BaseBridgeSdk
  masterDomain: string
}) {
  const l2AddWormholeSpell = await deployUsingFactory(
    l2Signer,
    getContractFactory<L2AddWormholeDomainSpell__factory>('L2AddWormholeDomainSpell'),
    [baseBridgeSdk.l2Dai.address, bridgeSdk.l2WormholeBridge.address, masterDomain],
  )

  // we can do this b/c we didn't configure full fledged governance on L2
  await bridgeSdk.l2WormholeBridge.rely(l2AddWormholeSpell.address)
  await baseBridgeSdk.l2Dai.rely(l2AddWormholeSpell.address)
  await waitForTx(l2AddWormholeSpell.execute())
}

interface BaseBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  sdk: MainnetSdk
  optimismAddresses: OptimismAddresses
}

export async function deployBaseBridge(opts: BaseBridgeDeployOpts) {
  const l1Provider = opts.l1Signer.provider! as ethers.providers.JsonRpcProvider
  const l1Escrow = await deployUsingFactory(opts.l1Signer, getContractFactory<L1Escrow__factory>('L1Escrow'), [])
  await mintEther(l1Escrow.address, l1Provider)

  const l2Dai = await deployUsingFactory(opts.l2Signer, getContractFactory<Dai__factory>('Dai', opts.l2Signer), [])

  const futureL1DAITokenBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2DaiTokenBridge = await deployUsingFactory(
    opts.l2Signer,
    getContractFactory<L2DAITokenBridge__factory>('L2DAITokenBridge'),
    [opts.optimismAddresses.l2.xDomainMessenger, l2Dai.address, opts.sdk.dai.address, futureL1DAITokenBridgeAddress],
  )
  await waitForTx(l2Dai.rely(l2DaiTokenBridge.address))

  const l1DaiTokenBridge = await deployUsingFactory(
    opts.l1Signer,
    getContractFactory<L1DAITokenBridge__factory>('L1DAITokenBridge'),
    [
      opts.sdk.dai.address,
      l2DaiTokenBridge.address,
      l2Dai.address,
      opts.optimismAddresses.l1.xDomainMessenger,
      l1Escrow.address,
    ],
  )
  expect(l1DaiTokenBridge.address).to.be.eq(futureL1DAITokenBridgeAddress, 'Future address doesnt match actual address')

  // bridge has to be approved on escrow because settling moves tokens
  await l1Escrow.approve(opts.sdk.dai.address, l1DaiTokenBridge.address, constants.MaxUint256)
  await l1Escrow.rely(opts.sdk.pause_proxy.address)

  return {
    l2Dai,
    l1DaiTokenBridge,
    l2DaiTokenBridge,
    l1Escrow,
  }
}
export type BaseBridgeSdk = Awaited<ReturnType<typeof deployBaseBridge>>
