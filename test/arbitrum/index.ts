import { RinkebySdk } from '@dethcrypto/eth-sdk-client'

export * from './addresses'
export * from './bridge'
export * from './contracts'
export * from './deposit'
export * from './messages'
export * from './setup'

export type ArbitrumSdk = RinkebySdk['arbitrum']
