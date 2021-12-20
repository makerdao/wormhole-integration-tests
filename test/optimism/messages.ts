import { getContractDefinition } from '@eth-optimism/contracts'
import { Watcher } from '@eth-optimism/core-utils'
import { getMessagesAndProofsForL2Transaction } from '@eth-optimism/message-relayer'
import { Contract, ContractReceipt, ContractTransaction, ethers, providers, Signer } from 'ethers'

import { OptimismAddresses, waitForTx } from '../helpers'

export async function waitToRelayTxsToL2(l1OriginatingTx: Promise<ContractTransaction>, watcher: Watcher) {
  const res = await l1OriginatingTx
  await res.wait()

  const [l2ToL1XDomainMsgHash] = await watcher.getMessageHashesFromL1Tx(res.hash)
  await watcher.getL2TransactionReceipt(l2ToL1XDomainMsgHash)
}

export function makeWaitToRelayTxsToL2(watcher: Watcher) {
  return (l1OriginatingTx: Promise<ContractTransaction>) => waitToRelayTxsToL2(l1OriginatingTx, watcher)
}
export type WaitToRelayTxsToL2 = ReturnType<typeof makeWaitToRelayTxsToL2>

// manually relies L2 -> L1 messages as dockerized optimism doesnt do it anymore
export async function relayMessagesToL1(
  watcher: Watcher,
  l1Signer: Signer,
  optimismAddresses: OptimismAddresses,
  l2OriginatingTx: Promise<ContractTransaction> | ContractTransaction | ContractReceipt,
) {
  const txHash = await waitAndGetTxHash(l2OriginatingTx)
  const [l2ToL1XDomainMsgHash] = await watcher.getMessageHashesFromL2Tx(txHash)
  console.log(`Found cross-domain message ${l2ToL1XDomainMsgHash} in L2 tx.  Waiting for relay to L1...`)

  const l1RelayMessages = await relayMessages(l1Signer, txHash, optimismAddresses)
  await watcher.getL1TransactionReceipt(l2ToL1XDomainMsgHash)

  return {
    l1RelayMessages,
    l2OriginatingTx,
  }
}

async function waitAndGetTxHash(tx: Promise<ContractTransaction> | ContractTransaction | ContractReceipt) {
  const res: any = await tx
  await res.wait()
  return res.hash
}

export function makeRelayMessagesToL1(watcher: Watcher, l1Signer: Signer, optimismAddresses: OptimismAddresses) {
  return (l2OriginatingTx: Promise<ContractTransaction> | ContractTransaction | ContractReceipt) =>
    relayMessagesToL1(watcher, l1Signer, optimismAddresses, l2OriginatingTx)
}

export type RelayMessagesToL1 = ReturnType<typeof makeRelayMessagesToL1>

export async function relayMessages(
  l1Signer: Signer,
  l2TxHash: string,
  optimismAddresses: OptimismAddresses,
): Promise<providers.TransactionReceipt[]> {
  const messagePairs = await retry(
    () =>
      getMessagesAndProofsForL2Transaction(
        'http://localhost:9545',
        'http://localhost:8545',
        optimismAddresses.l1.stateCommitmentChain,
        optimismAddresses.l2.xDomainMessenger,
        l2TxHash,
      ),
    15,
  )

  const l1XdomainMessenger = new Contract(
    optimismAddresses.l1.xDomainMessenger,
    getContractDefinition('L1CrossDomainMessenger').abi,
    l1Signer,
  )
  const txs: providers.TransactionReceipt[] = []
  for (const { message, proof } of messagePairs) {
    console.log('Relaying  L2 -> L1 message...')
    const tx = await waitForTx(
      l1XdomainMessenger.relayMessage(message.target, message.sender, message.message, message.messageNonce, proof),
    )

    // xchain relayer won't revert but will emit an event in case of revert
    for (const log of tx.logs) {
      const parsed = tryOrDefault(() => l1XdomainMessenger.interface.parseLog(log), undefined)
      if (parsed && parsed.name === 'FailedRelayedMessage') {
        throw new Error(`Failed to relay message! ${JSON.stringify(parsed)}`)
      }
    }

    txs.push(tx)
  }

  return txs
}

function tryOrDefault<T, K>(fn: () => T, defaultValue: K): T | K {
  try {
    return fn()
  } catch {
    return defaultValue
  }
}

function delay(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration))
}

async function retry<T>(fn: () => Promise<T>, maxRetries: number = 5): Promise<T> {
  const sleepBetweenRetries = 1000
  let retryCount = 0

  do {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = retryCount === maxRetries
      if (isLastAttempt) {
        throw error
      }
      console.log('retry...')
    }
    await delay(sleepBetweenRetries)
  } while (retryCount++ < maxRetries)

  throw new Error('Unreachable')
}

export function makeWatcher(
  l1Provider: ethers.providers.BaseProvider,
  l2Provider: ethers.providers.BaseProvider,
  optimismAddresses: OptimismAddresses,
): Watcher {
  return new Watcher({
    l1: {
      provider: l1Provider,
      messengerAddress: optimismAddresses.l1.xDomainMessenger,
    },
    l2: {
      provider: l2Provider,
      messengerAddress: optimismAddresses.l2.xDomainMessenger,
    },
  })
}
