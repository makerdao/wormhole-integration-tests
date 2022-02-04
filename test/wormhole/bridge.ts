import { Dai, L1Escrow, L1GovernanceRelay, L2GovernanceRelay } from '../../typechain'

export type WormholeBridgeSdk = { l1WormholeBridge: any; l2WormholeBridge: any }
export type BaseBridgeSdk = {
  l2Dai: Dai
  l1Escrow: L1Escrow
  l1GovRelay: L1GovernanceRelay
  l2GovRelay: L2GovernanceRelay
}
