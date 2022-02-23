import { MainnetSdk, RinkebySdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, BigNumberish, Contract, Signer } from 'ethers'
import { ethers } from 'hardhat'
import { assert } from 'ts-essentials'

import {
  BasicRelay,
  BasicRelay__factory,
  L1ConfigureWormholeSpell__factory,
  WormholeConstantFee,
  WormholeConstantFee__factory,
  WormholeJoin,
  WormholeJoin__factory,
  WormholeOracleAuth,
  WormholeOracleAuth__factory,
  WormholeRouter,
  WormholeRouter__factory,
} from '../../typechain'
import { getContractFactory, waitForTx } from '../helpers'
import { RelayTxToL2Function } from './messages'
import { executeSpell } from './spell'

export const OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME = 60 * 60 * 24 * 8 // flush should happen more or less, 1 day after initWormhole, and should take 7 days to finalize

export async function deployWormhole({
  defaultSigner,
  sdk,
  ilk,
  joinDomain,
  globalFee,
  globalFeeTTL,
}: {
  defaultSigner: Signer
  sdk: MainnetSdk | RinkebySdk
  ilk: string
  joinDomain: string
  globalFee: BigNumberish
  globalFeeTTL: BigNumberish
}): Promise<{
  join: WormholeJoin
  oracleAuth: WormholeOracleAuth
  router: WormholeRouter
  constantFee: WormholeConstantFee
  relay: BasicRelay
}> {
  console.log('Deploying join...')
  const WormholeJoinFactory = getContractFactory<WormholeJoin__factory>('WormholeJoin', defaultSigner)
  const join = await WormholeJoinFactory.deploy(sdk.vat.address, sdk.dai_join.address, ilk, joinDomain)
  console.log('WormholeJoin deployed at: ', join.address)

  console.log('Deploying constantFee...')
  const ConstantFeeFactory = getContractFactory<WormholeConstantFee__factory>('WormholeConstantFee', defaultSigner)
  const constantFee = await ConstantFeeFactory.deploy(globalFee, globalFeeTTL)
  console.log('ConstantFee deployed at: ', constantFee.address)

  console.log('Deploying oracleAuth...')
  const WormholeOracleAuthFactory = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', defaultSigner)
  const oracleAuth = await WormholeOracleAuthFactory.deploy(join.address)
  console.log('WormholeOracleAuth deployed at: ', oracleAuth.address)

  console.log('Deploying router...')
  const WormholeRouterFactory = getContractFactory<WormholeRouter__factory>('WormholeRouter', defaultSigner)
  const router = await WormholeRouterFactory.deploy(sdk.dai.address)
  console.log('WormholeRouter deployed at: ', router.address)

  console.log('Deploying relay...')
  const BasicRelayFactory = getContractFactory<BasicRelay__factory>('BasicRelay', defaultSigner)
  const relay = await BasicRelayFactory.deploy(oracleAuth.address, sdk.dai_join.address, { gasLimit: 1500000 })
  console.log('BasicRelay deployed at: ', relay.address)

  console.log('Finalizing permissions...')
  await waitForTx(join.rely(oracleAuth.address))
  await waitForTx(join.rely(router.address))
  await waitForTx(join.rely(sdk.pause_proxy.address))
  await waitForTx(join.rely(sdk.esm.address))
  await waitForTx(join.deny(await defaultSigner.getAddress()))

  await waitForTx(oracleAuth.rely(sdk.pause_proxy.address))
  await waitForTx(oracleAuth.rely(sdk.esm.address))
  await waitForTx(oracleAuth.deny(await defaultSigner.getAddress()))

  await waitForTx(router.rely(sdk.pause_proxy.address))
  await waitForTx(router.rely(sdk.esm.address))
  await waitForTx(router.deny(await defaultSigner.getAddress()))

  return { join, oracleAuth, router, constantFee, relay }
}
export type WormholeSdk = Awaited<ReturnType<typeof deployWormhole>>

export async function configureWormhole({
  sdk,
  wormholeSdk,
  joinDomain,
  defaultSigner,
  domain,
  oracleAddresses,
  globalLine,
  relayTxToL2,
  addWormholeDomainSpell,
}: {
  sdk: MainnetSdk | RinkebySdk
  wormholeSdk: WormholeSdk
  joinDomain: string
  defaultSigner: Signer
  domain: string
  oracleAddresses: string[]
  globalLine: BigNumber
  relayTxToL2: RelayTxToL2Function
  addWormholeDomainSpell: Contract
}) {
  assert(oracleAddresses.length === 3, 'Expected exactly 3 oracles for tests')
  const L1ConfigureWormholeSpellFactory = getContractFactory<L1ConfigureWormholeSpell__factory>(
    'L1ConfigureWormholeSpell',
    defaultSigner,
  )
  console.log('Executing spell to configure wormhole')
  const configureSpell = await L1ConfigureWormholeSpellFactory.deploy(
    joinDomain,
    wormholeSdk.join.address,
    sdk.vow.address,
    sdk.vat.address,
    globalLine,
    wormholeSdk.router.address,
    wormholeSdk.oracleAuth.address,
    oracleAddresses[0],
    oracleAddresses[1],
    oracleAddresses[2],
  )
  await executeSpell(defaultSigner, sdk, configureSpell)

  console.log(`Executing spell to add domain ${ethers.utils.parseBytes32String(domain)}...`)
  const spellExecutionTx = await executeSpell(defaultSigner, sdk, addWormholeDomainSpell)

  console.log('Waiting for xchain spell to execute')
  await relayTxToL2(spellExecutionTx)
}
