import { Contract } from 'ethers'

import { Dai, L1DAIWormholeBridge, L1Escrow, L2DAIWormholeBridge } from '../../typechain'

type L1WormholeBridgeLike = Pick<L1DAIWormholeBridge, 'address' | 'l1Token' | 'escrow'>
type L2WormholeBridgeLike = Pick<L2DAIWormholeBridge, 'address' | 'l2Token' | 'deny' | 'rely'>

export type WormholeBridgeSdk = { l1WormholeBridge: L1WormholeBridgeLike; l2WormholeBridge: L2WormholeBridgeLike }
export type BaseBridgeSdk = {
  l2Dai: Dai
  l1Escrow: L1Escrow
  l1GovRelay: Contract
  l2GovRelay: Contract
}
