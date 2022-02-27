import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { JsonRpcProvider } from '@ethersproject/providers'
import { randomBytes } from '@ethersproject/random'
import { getOptionalEnv, getRequiredEnv } from '@makerdao/hardhat-utils'
import { BigNumber, BigNumberish, Contract, Wallet } from 'ethers'
import { ethers } from 'hardhat'

import {
  BasicRelay,
  Dai,
  L1Escrow,
  WormholeConstantFee,
  WormholeJoin,
  WormholeOracleAuth,
  WormholeRouter,
} from '../../typechain'
import { RetryProvider } from '../helpers/RetryProvider'
import { BaseBridgeSdk, WormholeBridgeSdk } from './bridge'
import { performSanityChecks } from './checks'
import { RelayTxToL1Function, RelayTxToL2Function } from './messages'
import { configureWormhole, WormholeSdk } from './wormhole'

const bytes32 = ethers.utils.formatBytes32String

const masterDomain = bytes32('L1')

export type MakerSdk = MainnetSdk['maker']

export interface DomainSetupOpts {
  l1Signer: Wallet
  l2Signer: Wallet
  l1User: Wallet
  l1Provider: JsonRpcProvider
  l2Provider: JsonRpcProvider
  l2DaiAmount: BigNumberish
  domain: string
  masterDomain: string
  ilk: string
  fee: BigNumberish
  line: BigNumberish
}

export interface DomainSetupResult {
  makerSdk: MakerSdk
  wormholeSdk: WormholeSdk
  relayTxToL1: RelayTxToL1Function
  relayTxToL2: RelayTxToL2Function
  wormholeBridgeSdk: WormholeBridgeSdk
  baseBridgeSdk: BaseBridgeSdk
  ttl: number
  forwardTimeToAfterFinalization: ForwardTimeFunction
  addWormholeDomainSpell: Contract
}

export type ForwardTimeFunction = (l1Provider: JsonRpcProvider) => Promise<void>
export type DomainSetupFunction = (opts: DomainSetupOpts) => Promise<DomainSetupResult>

interface SetupTestOpts {
  domain: string
  line: BigNumber
  spot: BigNumberish
  fee: BigNumberish
  l2DaiAmount: BigNumberish
  oracleAddresses: Array<string>
  setupDomain: DomainSetupFunction
}

interface SetupTestResult {
  l1Signer: Wallet
  l1Provider: JsonRpcProvider
  l1User: Wallet
  l2User: Wallet
  ilk: string
  join: WormholeJoin
  oracleAuth: WormholeOracleAuth
  router: WormholeRouter
  constantFee: WormholeConstantFee
  relay: BasicRelay
  l2Dai: Dai
  l1Escrow: L1Escrow
  l2WormholeBridge: any
  relayTxToL1: RelayTxToL1Function
  makerSdk: MakerSdk
  ttl: number
  forwardTimeToAfterFinalization: ForwardTimeFunction
}

export async function setupTest({
  domain,
  line,
  fee,
  l2DaiAmount,
  oracleAddresses,
  setupDomain,
}: SetupTestOpts): Promise<SetupTestResult> {
  const pkey = getRequiredEnv('DEPLOYER_PRIV_KEY')
  const pkey2 = getOptionalEnv('USER_PRIV_KEY')
  const l1Rpc = getRequiredEnv(`${ethers.utils.parseBytes32String(domain).split('-')[0].toUpperCase()}_L1_RPC_URL`)
  const l2Rpc = getRequiredEnv(`${ethers.utils.parseBytes32String(domain).split('-')[0].toUpperCase()}_L2_RPC_URL`)

  const l1Provider = new ethers.providers.JsonRpcProvider(l1Rpc)
  const l2Provider = new RetryProvider(5, l2Rpc)
  const l1StartingBlock = await l1Provider.getBlockNumber()
  const l2StartingBlock = await l2Provider.getBlockNumber()
  console.log('Current L1 block: ', l1StartingBlock)
  console.log('Current L2 block: ', l2StartingBlock)

  const l1Signer = new ethers.Wallet(pkey, l1Provider)
  const l2Signer = new ethers.Wallet(pkey, l2Provider)
  const l1User = pkey2 ? new ethers.Wallet(pkey2, l1Provider) : Wallet.createRandom().connect(l1Provider)
  const l2User = l1User.connect(l2Provider)
  console.log('l1Signer:', l1Signer.address)
  console.log('l1User:', l1User.address)

  const ilk: string = bytes32('WH_' + Buffer.from(randomBytes(14)).toString('hex'))

  const {
    makerSdk: l1Sdk,
    relayTxToL1,
    relayTxToL2,
    wormholeBridgeSdk,
    baseBridgeSdk,
    wormholeSdk,
    ttl,
    forwardTimeToAfterFinalization,
    addWormholeDomainSpell,
  } = await setupDomain({
    l1Signer,
    l2Signer,
    l1User,
    l1Provider,
    l2Provider,
    l2DaiAmount,
    domain,
    masterDomain,
    ilk,
    fee,
    line,
  })

  await configureWormhole({
    makerSdk: l1Sdk,
    wormholeSdk,
    joinDomain: masterDomain,
    defaultSigner: l1Signer,
    domain,
    oracleAddresses,
    globalLine: line,
    relayTxToL2,
    addWormholeDomainSpell,
  })

  await performSanityChecks(
    l1Signer,
    l1Sdk,
    wormholeSdk,
    baseBridgeSdk,
    wormholeBridgeSdk,
    l1StartingBlock,
    l2StartingBlock,
    false,
  )

  console.log('Setup complete.')

  return {
    makerSdk: l1Sdk,
    l1Signer,
    l1Provider,
    l1User,
    l2User,
    ilk,
    ...wormholeSdk,
    ...baseBridgeSdk,
    ...wormholeBridgeSdk,
    relayTxToL1,
    ttl,
    forwardTimeToAfterFinalization,
  }
}
