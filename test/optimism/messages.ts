import { getContractDefinition } from '@eth-optimism/contracts'
import { Watcher } from '@eth-optimism/core-utils'
import { getMessagesAndProofsForL2Transaction } from '@eth-optimism/message-relayer'
import { Contract, ContractTransaction, ethers, Signer } from 'ethers'

import { OptimismAddresses } from '../helpers'

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
  l2OriginatingTx: Promise<ContractTransaction>,
) {
  console.log('Using watcher to wait for L2->L1 relay...')
  const res = await l2OriginatingTx
  await res.wait()

  const [l2ToL1XDomainMsgHash] = await watcher.getMessageHashesFromL2Tx(res.hash)
  console.log(`Found cross-domain message ${l2ToL1XDomainMsgHash} in L2 tx.  Waiting for relay to L1...`)

  await relayMessages(l1Signer, res.hash, optimismAddresses)
  await watcher.getL1TransactionReceipt(l2ToL1XDomainMsgHash)
}

export function makeRelayMessagesToL1(watcher: Watcher, l1Signer: Signer, optimismAddresses: OptimismAddresses) {
  return (l2OriginatingTx: Promise<ContractTransaction>) =>
    relayMessagesToL1(watcher, l1Signer, optimismAddresses, l2OriginatingTx)
}

export type RelayMessagesToL1 = ReturnType<typeof relayMessagesToL1>

export async function relayMessages(l1Deployer: Signer, l2TxHash: string, optimismAddresses: OptimismAddresses) {
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
    l1Deployer,
  )
  for (const { message, proof } of messagePairs) {
    console.log('Relaying  L2 -> L1 message...')
    await l1XdomainMessenger.relayMessage(message.target, message.sender, message.message, message.messageNonce, proof)
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
