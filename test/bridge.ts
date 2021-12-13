import { MainnetSdk, OptimismSdk } from '@dethcrypto/eth-sdk-client'
import { Signer } from 'ethers'
import { getContractAddress } from 'ethers/lib/utils'

import { L1DAIWormholeBridge__factory, L1Escrow__factory, L2DAIWormholeBridge__factory } from '../typechain'
import { deployUsingFactory, getContractFactory } from './helpers'

interface BridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  optimismSdk: OptimismSdk
  domain: string
  wormholeRouter: string
}

export async function deployBridges(opts: BridgeDeployOpts) {
  const futureL2BridgeAddress = getContractAddress({
    from: await opts.l2Signer.getAddress(),
    nonce: await opts.l2Signer.getTransactionCount(),
  })

  const L1EscrowFactory = getContractFactory<L1Escrow__factory>('L1Escrow', opts.l1Signer)
  const l1Escrow = await deployUsingFactory(opts.l1Signer, L1EscrowFactory, [])
  console.log('l1Escrow deployed at:', l1Escrow.address)

  const L1WormholeBridgeFactory = getContractFactory<L1DAIWormholeBridge__factory>('L1DAIWormholeBridge', opts.l1Signer)
  const l1WormholeBridge = await deployUsingFactory(opts.l1Signer, L1WormholeBridgeFactory, [
    opts.mainnetSdk.dai.address,
    futureL2BridgeAddress,
    opts.optimismSdk.dai.address,
    opts.mainnetSdk.optimism.l1xDomainMessenger.address,
    l1Escrow.address,
    opts.wormholeRouter,
  ])
  console.log('l1WormholeBridge deployed at:', l1WormholeBridge.address)

  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismSdk.optimism.xDomainMessenger.address,
    opts.optimismSdk.dai.address,
    opts.mainnetSdk.dai.address,
    l1WormholeBridge.address,
    opts.domain,
  ])
  await opts.optimismSdk.dai.rely(l2WormholeBridge.address)
  console.log('l2WormholeBridge deployed at:', l2WormholeBridge.address)

  return { l2WormholeBridge, l1WormholeBridge }
}
