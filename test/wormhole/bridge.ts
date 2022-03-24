import { Provider } from '@ethersproject/providers'
import { Contract } from 'ethers'
import { Signer } from 'ethers'
import { Interface } from 'ethers/lib/utils'

import { OptimismL1DaiWormholeGateway, OptimismL2DaiWormholeGateway } from '../../typechain'

export type L1WormholeBridgeLike = Pick<OptimismL1DaiWormholeGateway, 'address' | 'l1Token' | 'l1Escrow'>
export type L2WormholeBridgeLike = Pick<
  OptimismL2DaiWormholeGateway,
  | 'address'
  | 'l2Token'
  | 'deny'
  | 'rely'
  | 'batchedDaiToFlush'
  | 'flush'
  | 'initiateWormhole(bytes32,address,uint128)'
  | 'initiateWormhole(bytes32,address,uint128,address)'
> & { connect: (signerOrProvider: Signer | Provider | string) => L2WormholeBridgeLike; interface: Interface }

export type DaiLike = Contract
export type L1EscrowLike = Contract

export type WormholeBridgeSdk = { l1WormholeBridge: L1WormholeBridgeLike; l2WormholeBridge: L2WormholeBridgeLike }
export type BaseBridgeSdk = {
  l2Dai: DaiLike
  l1Escrow: L1EscrowLike
  l1GovRelay: Contract
  l2GovRelay: Contract
}
