import { BigNumberish, ContractReceipt, Signer, Wallet } from 'ethers'
import { arrayify, hexConcat, hexZeroPad, Interface, keccak256, splitSignature } from 'ethers/lib/utils'

import { BasicRelay } from '../../typechain'
import { toEthersBigNumber, waitForTx } from '../helpers'
import { getAttestations } from './attestations'

interface CallRelayOpt {
  relay: BasicRelay
  txReceipt: ContractReceipt
  l2WormholeBridgeInterface: Interface
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
  const { signatures, wormholeGUID, guidHash } = await getAttestations(
    txReceipt,
    l2WormholeBridgeInterface,
    oracleWallets,
  )
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
  const { r, s, v } = splitSignature(await receiver.signMessage(payload))
  console.log('Calling BasicRelay.relay()...')
  return await waitForTx(
    relay.connect(l1Signer).relay(wormholeGUID, signatures, maxFeePercentage, gasFee, expiry, v, r, s),
  )
}
