import { Contract } from 'ethers'

import { Dai, L1Escrow } from '../../typechain'

export type WormholeBridgeSdk = { l1WormholeBridge: Contract; l2WormholeBridge: Contract }
export type BaseBridgeSdk = {
  l2Dai: Dai
  l1Escrow: L1Escrow
  l1GovRelay: Contract
  l2GovRelay: Contract
}
