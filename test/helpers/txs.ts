import { providers } from 'ethers'

export async function waitForTx(tx: Promise<any>): Promise<providers.TransactionReceipt> {
  const resolvedTx = await tx
  return await resolvedTx.wait()
}
