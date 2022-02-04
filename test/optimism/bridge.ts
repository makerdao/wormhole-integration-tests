import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { constants, ethers, Signer } from 'ethers'

import {
  Dai__factory,
  L1DAITokenBridge__factory,
  L1DAIWormholeBridge__factory,
  L1Escrow__factory,
  L1GovernanceRelay__factory,
  L2DAITokenBridge__factory,
  L2DAIWormholeBridge__factory,
  L2GovernanceRelay__factory,
} from '../../typechain'
import { deployUsingFactory, getContractFactory, mintEther } from '../helpers'
import { OptimismAddresses, waitForTx } from '../helpers'
import { getAddressOfNextDeployedContract } from '../pe-utils/address'
import { WormholeSdk } from '../wormhole/wormhole'

interface OptimismWormholeBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  wormholeSdk: WormholeSdk
  baseBridgeSdk: OptimismBaseBridgeSdk
  optimismAddresses: OptimismAddresses
  domain: string
}

export async function deployOptimismWormholeBridge(opts: OptimismWormholeBridgeDeployOpts) {
  console.log('Deploying Optimism Wormhole Bridge...')
  const futureL1WormholeBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismAddresses.l2.xDomainMessenger,
    opts.baseBridgeSdk.l2Dai.address,
    futureL1WormholeBridgeAddress,
    opts.domain,
  ])
  console.log('L2DAIWormholeBridge deployed at: ', l2WormholeBridge.address)

  const L1WormholeBridgeFactory = getContractFactory<L1DAIWormholeBridge__factory>('L1DAIWormholeBridge')
  const l1WormholeBridge = await deployUsingFactory(opts.l1Signer, L1WormholeBridgeFactory, [
    opts.mainnetSdk.dai.address,
    l2WormholeBridge.address,
    opts.optimismAddresses.l1.xDomainMessenger,
    opts.baseBridgeSdk.l1Escrow.address,
    opts.wormholeSdk.router.address,
  ])
  expect(l1WormholeBridge.address).to.be.eq(futureL1WormholeBridgeAddress, 'Future address doesnt match actual address')

  await l2WormholeBridge.rely(opts.baseBridgeSdk.l2GovRelay.address)
  await l2WormholeBridge.deny(await opts.l2Signer.getAddress())

  return { l2WormholeBridge, l1WormholeBridge }
}
export type OptimismWormholeBridgeSdk = Awaited<ReturnType<typeof deployOptimismWormholeBridge>>

interface OptimismBaseBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  sdk: MainnetSdk
  optimismAddresses: OptimismAddresses
}

export async function deployOptimismBaseBridge(opts: OptimismBaseBridgeDeployOpts) {
  const l1Escrow = await deployUsingFactory(opts.l1Signer, getContractFactory<L1Escrow__factory>('L1Escrow'), [])
  console.log('L1Escrow deployed at: ', l1Escrow.address)

  const l1Provider = opts.l1Signer.provider! as ethers.providers.JsonRpcProvider
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

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2GovRelay = await deployUsingFactory(
    opts.l2Signer,
    getContractFactory<L2GovernanceRelay__factory>('L2GovernanceRelay'),
    [opts.optimismAddresses.l2.xDomainMessenger, futureL1GovRelayAddress],
  )
  const l1GovRelay = await deployUsingFactory(
    opts.l1Signer,
    getContractFactory<L1GovernanceRelay__factory>('L1GovernanceRelay'),
    [l2GovRelay.address, opts.optimismAddresses.l1.xDomainMessenger],
  )
  expect(l1GovRelay.address).to.be.eq(futureL1GovRelayAddress, 'Future address doesnt match actual address')

  // bridge has to be approved on escrow because settling moves tokens
  await waitForTx(l1Escrow.approve(opts.sdk.dai.address, l1DaiTokenBridge.address, constants.MaxUint256))
  await waitForTx(l1Escrow.rely(opts.sdk.pause_proxy.address))

  await l1GovRelay.rely(opts.sdk.pause_proxy.address)
  await l1GovRelay.deny(await opts.l1Signer.getAddress())

  await l2Dai.rely(l2GovRelay.address)
  await l2Dai.deny(await opts.l2Signer.getAddress())

  await l2DaiTokenBridge.rely(l2GovRelay.address)
  await l2DaiTokenBridge.deny(await opts.l2Signer.getAddress())

  return {
    l2Dai,
    l1DaiTokenBridge,
    l2DaiTokenBridge,
    l1Escrow,
    l1GovRelay,
    l2GovRelay,
  }
}
export type OptimismBaseBridgeSdk = Awaited<ReturnType<typeof deployOptimismBaseBridge>>
