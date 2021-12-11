import { MainnetSdk, OptimismSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { constants, ethers, Signer, Wallet } from 'ethers'

import {
  Dai__factory,
  L1DAITokenBridge__factory,
  L1DAIWormholeBridge__factory,
  L2DAITokenBridge__factory,
  L2DAIWormholeBridge__factory,
} from '../typechain'
import { deployUsingFactory, getContractFactory, mintEther } from './helpers'
import { OptimismAddresses, waitForTx } from './helpers'
import { getAddressOfNextDeployedContract } from './pe-utils/address'

interface BridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  optimismSdk: OptimismSdk
  domain: string
}

export async function deployBridge(opts: BridgeDeployOpts) {
  const futureL1WormholeBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismSdk.optimism.xDomainMessenger.address,
    opts.optimismSdk.dai.address,
    opts.mainnetSdk.dai.address,
    futureL1WormholeBridgeAddress,
    opts.domain,
  ])
  // wormhole bridge has to have burn rights
  await opts.optimismSdk.dai.rely(l2WormholeBridge.address)

  const L1WormholeBridgeFactory = getContractFactory<L1DAIWormholeBridge__factory>('L1DAIWormholeBridge', opts.l1Signer)
  const l1WormholeBridge = await deployUsingFactory(opts.l2Signer, L1WormholeBridgeFactory, [
    opts.mainnetSdk.dai.address,
    l2WormholeBridge.address,
    opts.optimismSdk.dai.address,

    opts.optimismSdk.optimism.xDomainMessenger.address,
    futureL1WormholeBridgeAddress,
    opts.domain,
  ])
  expect(l1WormholeBridge.address).to.be.eq(futureL1WormholeBridgeAddress, 'Future address doesnt match actual address')

  return { l2WormholeBridge, l1WormholeBridge }
}

export async function deployBaseBridge(opts: BridgeDeployOpts, addresses: OptimismAddresses) {
  const l1Provider = opts.l1Signer.provider! as ethers.providers.JsonRpcProvider
  const l1Escrow = Wallet.createRandom().connect(l1Provider)
  await mintEther(l1Escrow.address, l1Provider)

  const l2Dai = await deployUsingFactory(opts.l2Signer, getContractFactory<Dai__factory>('dai', opts.l2Signer), [])

  const futureL1DAITokenBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2DaiTokenBridge = await deployUsingFactory(
    opts.l2Signer,
    getContractFactory<L2DAITokenBridge__factory>('L2DAITokenBridge'),
    [addresses.l2.xDomainMessenger, l2Dai.address, opts.mainnetSdk.dai.address, futureL1DAITokenBridgeAddress],
  )
  await waitForTx(l2Dai.rely(l2DaiTokenBridge.address))

  const l1DaiTokenBridge = await deployUsingFactory(
    opts.l1Signer,
    getContractFactory<L1DAITokenBridge__factory>('L1DAITokenBridge'),
    [
      opts.mainnetSdk.dai.address,
      l2DaiTokenBridge.address,
      l2Dai.address,
      addresses.l1.xDomainMessenger,
      await l1Escrow.getAddress(),
    ],
  )
  expect(l1DaiTokenBridge.address).to.be.eq(futureL1DAITokenBridgeAddress, 'Future address doesnt match actual address')

  await opts.mainnetSdk.dai.connect(l1Escrow).approve(l1DaiTokenBridge.address, constants.MaxUint256)

  return {
    l2Dai,
    l1DaiTokenBridge,
    l2DaiTokenBridge,
    l1Escrow,
  }
}
