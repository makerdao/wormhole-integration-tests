import { ContractReceipt, ContractTransaction } from 'ethers'

export async function waitForTx(tx: Promise<ContractTransaction>, _confirmations?: number): Promise<ContractReceipt> {
  const resolvedTx = await tx
  const confirmations = _confirmations ?? chainIdToConfirmationsNeededForFinalization(resolvedTx.chainId)

  // we retry .wait b/c sometimes it fails for the first time
  // this is really needed...
  try {
    return await resolvedTx.wait(confirmations)
  } catch (e) {}
  return await resolvedTx.wait(confirmations)
}

function chainIdToConfirmationsNeededForFinalization(chainId: number): number {
  const defaultWhenReorgsPossible = 3
  const defaultForInstantFinality = 0

  // covers mainnet and public testnets
  if (
    (chainId > 0 && chainId < 6) ||
    chainId === 42 // kovan
  ) {
    return defaultWhenReorgsPossible
  } else {
    return defaultForInstantFinality
  }
}
