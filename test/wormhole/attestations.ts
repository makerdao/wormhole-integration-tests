import { BigNumber, ContractReceipt, Event, Wallet } from 'ethers'
import { arrayify, hashMessage, keccak256 } from 'ethers/lib/utils'

import { L2DAIWormholeBridgeInterface } from '../../typechain/L2DAIWormholeBridge'

interface WormholeGUID {
  sourceDomain: string
  targetDomain: string
  receiver: string
  operator: string
  amount: string
  nonce: string
  timestamp: string
}

export async function getAttestations(
  txReceipt: ContractReceipt,
  l2WormholeBridgeInterface: L2DAIWormholeBridgeInterface,
  signers: Wallet[],
): Promise<{ signHash: string; signatures: string; wormholeGUID: WormholeGUID }> {
  const initEvent = txReceipt.events?.find((e: Event) => e.event === 'WormholeInitialized')!
  const wormholeGUID: WormholeGUID = l2WormholeBridgeInterface.parseLog(initEvent).args.wormhole
  const { signHash, signatures } = await signWormholeData(initEvent.data, signers)
  return { signHash, signatures, wormholeGUID }
}

async function signWormholeData(
  wormholeData: string,
  signers: Wallet[],
): Promise<{ signHash: string; signatures: string }> {
  signers = signers.sort((s1, s2) => {
    const bn1 = BigNumber.from(s1.address)
    const bn2 = BigNumber.from(s2.address)
    if (bn1.lt(bn2)) return -1
    if (bn1.gt(bn2)) return 1
    return 0
  })

  const guidHash = keccak256(wormholeData)
  const sigs = await Promise.all(signers.map((signer) => signer.signMessage(arrayify(guidHash))))
  const signatures = `0x${sigs.map((sig) => sig.slice(2)).join('')}`
  const signHash = hashMessage(arrayify(guidHash))
  return { signHash, signatures }
}
