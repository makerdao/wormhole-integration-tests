import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { ethers, Wallet } from 'ethers'

import { AnyNumber, mintEther, toEthersBigNumber, toMyBigNumber, toWad } from '../helpers'
import { defaultL2Data, defaultL2Gas, OptimismAddresses, WaitToRelayTxsToL2 } from '.'

// mints ether using hardhat rpc and then transfers to l2
export async function mintL2Ether(
  waitToRelayTxsToL2: WaitToRelayTxsToL2,
  mainnetSdk: MainnetSdk,
  optimismAddresses: OptimismAddresses,
  l1Provider: ethers.providers.JsonRpcProvider,
  address: string,
  amt: AnyNumber = toWad(100),
) {
  const randomWallet = Wallet.createRandom().connect(l1Provider)
  await mintEther(randomWallet.address, l1Provider, toMyBigNumber(amt).plus(toWad(0.1))) // we need to account for l1 gas cost

  await waitToRelayTxsToL2(
    mainnetSdk.optimism.l1StandardBridge
      .attach(optimismAddresses.l1.standardBridge)
      .connect(randomWallet)
      .depositETHTo(address, defaultL2Gas, defaultL2Data, { value: toEthersBigNumber(toMyBigNumber(amt)) }),
  )
}
