import { BigNumberish, ContractReceipt, Event, Signer, Wallet } from 'ethers'
import { arrayify, hexConcat, hexZeroPad, keccak256, splitSignature } from 'ethers/lib/utils'

import { BasicRelay } from '../../typechain'
import { L2DAIWormholeBridgeInterface } from '../../typechain/L2DAIWormholeBridge'
import { toEthersBigNumber, waitForTx } from '../helpers'
import { getAttestations } from './attestations'

interface CallRelayOpt {
  relay: BasicRelay
  txReceipt: ContractReceipt
  l2WormholeBridgeInterface: L2DAIWormholeBridgeInterface
  l1Signer: Signer
  receiver: Signer
  oracleWallets: Wallet[]
  expiry: BigNumberish
  gasFee: BigNumberish
  maxFeePercentage: BigNumberish
}

export async function callBasicRelay({
  relay,
  txReceipt,
  l2WormholeBridgeInterface,
  l1Signer,
  receiver,
  oracleWallets,
  expiry,
  gasFee,
  maxFeePercentage,
}: CallRelayOpt) {
  const { signatures, wormholeGUID } = await getAttestations(txReceipt, l2WormholeBridgeInterface, oracleWallets)
  const initEvent = txReceipt.events?.find((e: Event) => e.event === 'WormholeInitialized')!
  const guidHash = keccak256(initEvent!.data)
  const payload = arrayify(
    keccak256(
      hexConcat([
        guidHash,
        hexZeroPad(toEthersBigNumber(maxFeePercentage.toString()).toHexString(), 32),
        hexZeroPad(toEthersBigNumber(gasFee.toString()).toHexString(), 32),
        hexZeroPad(toEthersBigNumber(expiry.toString()).toHexString(), 32),
      ]),
    ),
  )
  const sig = await receiver.signMessage(payload)
  const { r, s, v } = splitSignature(sig)
  console.log('Calling BasicRelay.relay()...')
  return await waitForTx(
    relay.connect(l1Signer).relay(wormholeGUID, signatures, maxFeePercentage, gasFee, expiry, v, r, s),
  )
}
