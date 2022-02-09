import { Signer } from 'ethers'

import { Dai, L1Escrow, L2AddWormholeDomainSpell__factory } from '../../typechain'
import { deployUsingFactory, getContractFactory, waitForTx } from '../helpers'

export type WormholeBridgeSdk = { l1WormholeBridge: any; l2WormholeBridge: any }
export type BaseBridgeSdk = { l2Dai: Dai; l1Escrow: L1Escrow }

export async function configureWormholeBridge({
  l2Signer,
  baseBridgeSdk,
  wormholeBridgeSdk,
  masterDomain,
}: {
  l2Signer: Signer
  wormholeBridgeSdk: WormholeBridgeSdk
  baseBridgeSdk: BaseBridgeSdk
  masterDomain: string
}) {
  const l2AddWormholeSpell = await deployUsingFactory(
    l2Signer,
    getContractFactory<L2AddWormholeDomainSpell__factory>('L2AddWormholeDomainSpell'),
    [baseBridgeSdk.l2Dai.address, wormholeBridgeSdk.l2WormholeBridge.address, masterDomain],
  )

  // we can do this b/c we didn't configure full fledged governance on L2
  await wormholeBridgeSdk.l2WormholeBridge.rely(l2AddWormholeSpell.address)
  await baseBridgeSdk.l2Dai.rely(l2AddWormholeSpell.address)
  await waitForTx(l2AddWormholeSpell.execute())
}
