import { ContractReceipt, ContractTransaction } from 'ethers'

export async function waitForTx(tx: Promise<ContractTransaction>): Promise<ContractReceipt> {
  const resolvedTx = await tx
  return await resolvedTx.wait()
}
