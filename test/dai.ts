import { MainnetSdk } from '@dethcrypto/eth-sdk-client'

import { AnyNumber, impersonateAccount, toEthersBigNumber } from './helpers'

export async function mintDai(mainnet: MainnetSdk, to: string, amt: AnyNumber) {
  const daiJoinImpersonator = await impersonateAccount(mainnet.dai_join.address, mainnet.dai_join.provider as any)

  await mainnet.dai.connect(daiJoinImpersonator).mint(to, toEthersBigNumber(amt))
}
