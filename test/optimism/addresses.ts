import fetch from 'node-fetch'
import { assert } from 'ts-essentials'


export async function getOptimismAddresses() {
  const addresses = await (await fetch('http://localhost:8080/addresses.json')).json()

  return {
    l1: {
      xDomainMessenger: getOrThrow(addresses, 'Proxy__OVM_L1CrossDomainMessenger') as string,
      standardBridge: getOrThrow(addresses, 'Proxy__OVM_L1StandardBridge') as string,
      stateCommitmentChain: getOrThrow(addresses, 'StateCommitmentChain') as string,
    },
    l2: {
      xDomainMessenger: '0x4200000000000000000000000000000000000007',
      standardBridge: '0x4200000000000000000000000000000000000010',
    },
  }
}

function getOrThrow(obj: any, key: string): any {
  const value = obj[key]
  assert(value !== undefined, 'Key is missing')

  return value
}

export type OptimismAddresses = Awaited<ReturnType<typeof getOptimismAddresses>>
