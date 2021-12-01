import { MainnetSdk, OptimismSdk } from '@dethcrypto/eth-sdk-client'
import { constants, Signer } from 'ethers'

import { L2DAIWormholeBridge__factory } from '../typechain'
import { deployUsingFactory, getContractFactory } from './helpers'

interface BridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  mainnetSdk: MainnetSdk
  optimismSdk: OptimismSdk
  domain: string
}

export async function deployBridge(opts: BridgeDeployOpts) {
  const L2WormholeBridgeFactory = getContractFactory<L2DAIWormholeBridge__factory>('L2DAIWormholeBridge', opts.l2Signer)
  const l2WormholeBridge = await deployUsingFactory(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.optimismSdk.optimism.xDomainMessenger.address,
    opts.optimismSdk.dai.address,
    opts.mainnetSdk.dai.address,
    constants.AddressZero, // @todo
    opts.domain,
  ])
  // @todo wormhole bridge should be relied on DAI

  console.log('l2WormholeBridge deployed at:', l2WormholeBridge.address)

  return { l2WormholeBridge }
}
