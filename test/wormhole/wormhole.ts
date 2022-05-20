import { BigNumber, BigNumberish, Contract, Signer } from 'ethers'
import { ethers } from 'hardhat'
import { assert } from 'ts-essentials'

import {
  BasicRelay,
  BasicRelay__factory,
  L1ConfigureWormholeSpell__factory,
  TrustedRelay,
  TrustedRelay__factory,
  WormholeConstantFee,
  WormholeConstantFee__factory,
  WormholeJoin,
  WormholeJoin__factory,
  WormholeOracleAuth,
  WormholeOracleAuth__factory,
  WormholeRouter,
  WormholeRouter__factory,
} from '../../typechain'
import { deployUsingFactoryAndVerify, getContractFactory, waitForTx } from '../helpers'
import { RelayTxToL2Function } from './messages'
import { MakerSdk } from './setup'
import { executeSpell } from './spell'

export const OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME = 60 * 60 * 24 * 8 // flush should happen more or less, 1 day after initWormhole, and should take 7 days to finalize

export async function deployWormhole({
  defaultSigner,
  makerSdk,
  ilk,
  joinDomain,
  globalFee,
  globalFeeTTL,
}: {
  defaultSigner: Signer
  makerSdk: MakerSdk
  ilk: string
  joinDomain: string
  globalFee: BigNumberish
  globalFeeTTL: BigNumberish
}): Promise<{
  join: WormholeJoin
  oracleAuth: WormholeOracleAuth
  router: WormholeRouter
  constantFee: WormholeConstantFee
  basicRelay: BasicRelay
  trustedRelay: TrustedRelay
}> {
  console.log('Deploying join...')
  const WormholeJoinFactory = getContractFactory<WormholeJoin__factory>('WormholeJoin')
  const join = await deployUsingFactoryAndVerify(defaultSigner, WormholeJoinFactory, [
    makerSdk.vat.address,
    makerSdk.dai_join.address,
    ilk,
    joinDomain,
  ])
  console.log('WormholeJoin deployed at: ', join.address)

  console.log('Deploying constantFee...')
  const ConstantFeeFactory = getContractFactory<WormholeConstantFee__factory>('WormholeConstantFee')
  const constantFee = await deployUsingFactoryAndVerify(defaultSigner, ConstantFeeFactory, [globalFee, globalFeeTTL])
  console.log('ConstantFee deployed at: ', constantFee.address)

  console.log('Deploying oracleAuth...')
  const WormholeOracleAuthFactory = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth')
  const oracleAuth = await deployUsingFactoryAndVerify(defaultSigner, WormholeOracleAuthFactory, [join.address])
  console.log('WormholeOracleAuth deployed at: ', oracleAuth.address)

  console.log('Deploying router...')
  const WormholeRouterFactory = getContractFactory<WormholeRouter__factory>('WormholeRouter')
  const router = await deployUsingFactoryAndVerify(defaultSigner, WormholeRouterFactory, [makerSdk.dai.address])
  console.log('WormholeRouter deployed at: ', router.address)

  console.log('Deploying basicRelay...')
  const BasicRelayFactory = getContractFactory<BasicRelay__factory>('BasicRelay')
  const basicRelay = await deployUsingFactoryAndVerify(defaultSigner, BasicRelayFactory, [
    oracleAuth.address,
    makerSdk.dai_join.address,
    { gasLimit: 1500000 },
  ])
  console.log('BasicRelay deployed at: ', basicRelay.address)

  console.log('Deploying trustedRelay...')
  const TrustedRelayFactory = getContractFactory<TrustedRelay__factory>('TrustedRelay')
  const trustedRelay = await deployUsingFactoryAndVerify(defaultSigner, TrustedRelayFactory, [
    oracleAuth.address,
    makerSdk.dai_join.address,
    makerSdk.median_ethusd.address,
    { gasLimit: 1500000 },
  ])
  console.log('TrustedRelay deployed at: ', trustedRelay.address)

  console.log('Finalizing permissions...')
  await waitForTx(join.rely(oracleAuth.address))
  await waitForTx(join.rely(router.address))
  await waitForTx(join.rely(makerSdk.pause_proxy.address))
  await waitForTx(join.rely(makerSdk.esm.address))
  await waitForTx(join.deny(await defaultSigner.getAddress()))

  await waitForTx(oracleAuth.rely(makerSdk.pause_proxy.address))
  await waitForTx(oracleAuth.rely(makerSdk.esm.address))
  await waitForTx(oracleAuth.deny(await defaultSigner.getAddress()))

  await waitForTx(router.rely(makerSdk.pause_proxy.address))
  await waitForTx(router.rely(makerSdk.esm.address))
  await waitForTx(router.deny(await defaultSigner.getAddress()))

  await waitForTx(trustedRelay.rely(makerSdk.pause_proxy.address))
  await waitForTx(trustedRelay.rely(makerSdk.esm.address))
  await waitForTx(trustedRelay.deny(await defaultSigner.getAddress()))

  return { join, oracleAuth, router, constantFee, basicRelay, trustedRelay }
}
export type WormholeSdk = Awaited<ReturnType<typeof deployWormhole>>

export async function configureWormhole({
  makerSdk,
  wormholeSdk,
  joinDomain,
  defaultSigner,
  domain,
  oracleAddresses,
  globalLine,
  relayTxToL2,
  addWormholeDomainSpell,
}: {
  makerSdk: MakerSdk
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
    makerSdk.vow.address,
    makerSdk.vat.address,
    globalLine,
    wormholeSdk.router.address,
    wormholeSdk.oracleAuth.address,
    oracleAddresses[0],
    oracleAddresses[1],
    oracleAddresses[2],
  )
  await executeSpell(defaultSigner, makerSdk, configureSpell)

  console.log(`Executing spell to add domain ${ethers.utils.parseBytes32String(domain)}...`)
  const spellExecutionTx = await executeSpell(defaultSigner, makerSdk, addWormholeDomainSpell)

  console.log('Waiting for xchain spell to execute')
  await relayTxToL2(spellExecutionTx)
}
