import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { constants, ethers, Signer, Wallet } from 'ethers'

import {
  Dai,
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
  optimismAddresses: OptimismAddresses
  domain: string
  wormholeRouter: string
  l1EscrowAddress: string
  l2Dai: Dai
}

export async function deployBridge(opts: BridgeDeployOpts) {
  const futureL1WormholeBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismAddresses.l2.xDomainMessenger,
    opts.l2Dai.address,
    opts.mainnetSdk.dai.address,
    futureL1WormholeBridgeAddress,
    opts.domain,
  ])
  // wormhole bridge has to have burn rights
  await opts.l2Dai.rely(l2WormholeBridge.address)

  const L1WormholeBridgeFactory = getContractFactory<L1DAIWormholeBridge__factory>('L1DAIWormholeBridge')
  const l1WormholeBridge = await deployUsingFactory(opts.l1Signer, L1WormholeBridgeFactory, [
    opts.mainnetSdk.dai.address,
    l2WormholeBridge.address,
    opts.l2Dai.address,
    opts.optimismAddresses.l2.xDomainMessenger,
    opts.l1EscrowAddress,
    opts.wormholeRouter,
  ])
  expect(l1WormholeBridge.address).to.be.eq(futureL1WormholeBridgeAddress, 'Future address doesnt match actual address')

  return { l2WormholeBridge, l1WormholeBridge }
}

interface BaseBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  optimismAddresses: OptimismAddresses
}

export async function deployBaseBridge(opts: BaseBridgeDeployOpts) {
  const l1Provider = opts.l1Signer.provider! as ethers.providers.JsonRpcProvider
  const l1Escrow = Wallet.createRandom().connect(l1Provider)
  await mintEther(l1Escrow.address, l1Provider)

  const l2Dai = await deployUsingFactory(opts.l2Signer, getContractFactory<Dai__factory>('Dai', opts.l2Signer), [])

  const futureL1DAITokenBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2DaiTokenBridge = await deployUsingFactory(
    opts.l2Signer,
    getContractFactory<L2DAITokenBridge__factory>('L2DAITokenBridge'),
    [
      opts.optimismAddresses.l2.xDomainMessenger,
      l2Dai.address,
      opts.mainnetSdk.dai.address,
      futureL1DAITokenBridgeAddress,
    ],
  )
  await waitForTx(l2Dai.rely(l2DaiTokenBridge.address))

  const l1DaiTokenBridge = await deployUsingFactory(
    opts.l1Signer,
    getContractFactory<L1DAITokenBridge__factory>('L1DAITokenBridge'),
    [
      opts.mainnetSdk.dai.address,
      l2DaiTokenBridge.address,
      l2Dai.address,
      opts.optimismAddresses.l1.xDomainMessenger,
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
