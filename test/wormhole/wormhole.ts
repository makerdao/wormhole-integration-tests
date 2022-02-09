import { MainnetSdk, RinkebySdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, BigNumberish, Signer } from 'ethers'
import { assert, Dictionary } from 'ts-essentials'

import {
  BasicRelay,
  BasicRelay__factory,
  L1AddWormholeDomainSpell__factory,
  L1ConfigureWormholeSpell__factory,
  L1Escrow,
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
import { executeSpell } from './spell'

interface BaseBridgeSdk {
  l1Escrow: L1Escrow
}

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
  await waitForTx(join.deny(await defaultSigner.getAddress()))

  await waitForTx(oracleAuth.rely(sdk.pause_proxy.address))
  await waitForTx(oracleAuth.deny(await defaultSigner.getAddress()))

  await waitForTx(router.rely(sdk.pause_proxy.address))
  await waitForTx(router.deny(await defaultSigner.getAddress()))

  return { join, oracleAuth, router, constantFee, relay }
}
export type WormholeSdk = Awaited<ReturnType<typeof deployWormhole>>

export async function configureWormhole({
  sdk,
  wormholeSdk,
  joinDomain,
  defaultSigner,
  domainsCfg,
  oracleAddresses,
  globalLine,
  baseBridgeSdk,
}: {
  defaultSigner: Signer
  globalLine: BigNumber
  domainsCfg: Dictionary<{ line: BigNumber; l1Bridge: string }>
  joinDomain: string
  oracleAddresses: string[]
  sdk: MainnetSdk | RinkebySdk
  wormholeSdk: WormholeSdk
  baseBridgeSdk: BaseBridgeSdk
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

  for (const [domainName, domainCfg] of Object.entries(domainsCfg)) {
    const L1AddWormholeDomainSpellFactory = getContractFactory<L1AddWormholeDomainSpell__factory>(
      'L1AddWormholeDomainSpell',
      defaultSigner,
    )
    const addWormholeDomainSpell = await L1AddWormholeDomainSpellFactory.deploy(
      domainName,
      wormholeSdk.join.address,
      wormholeSdk.constantFee.address,
      domainCfg.line,
      wormholeSdk.router.address,
      domainCfg.l1Bridge,
      baseBridgeSdk.l1Escrow.address,
      sdk.dai.address,
    )
    console.log(`Executing spell to add domain ${domainName}...`)
    await executeSpell(defaultSigner, sdk, addWormholeDomainSpell)
  }
}
