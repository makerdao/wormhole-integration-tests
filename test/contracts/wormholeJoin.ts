import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, BigNumberish, Signer } from 'ethers'
import { hexlify, hexZeroPad } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { Dictionary } from 'ts-essentials'

import {
  L1AddWormholeDomainSpell__factory,
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
import { getContractFactory, impersonateAccount, waitForTx } from '../helpers'
import { BaseBridgeSdk } from './bridge'
import { executeSpell } from './spell'

const bytes32 = ethers.utils.formatBytes32String

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
  sdk: MainnetSdk
  ilk: string
  joinDomain: string
  globalFee: BigNumberish
  globalFeeTTL: BigNumberish
}): Promise<{
  join: WormholeJoin
  oracleAuth: WormholeOracleAuth
  router: WormholeRouter
  constantFee: WormholeConstantFee
}> {
  const WormholeJoinFactory = getContractFactory<WormholeJoin__factory>('WormholeJoin', defaultSigner)
  const join = await WormholeJoinFactory.deploy(sdk.vat.address, sdk.dai_join.address, ilk, joinDomain)
  console.log('WormholeJoin deployed at: ', join.address)

  const ConstantFeeFactory = getContractFactory<WormholeConstantFee__factory>('WormholeConstantFee', defaultSigner)
  const constantFee = await ConstantFeeFactory.deploy(globalFee, globalFeeTTL)
  console.log('ConstantFee deployed at: ', constantFee.address)

  const WormholeOracleAuthFactory = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', defaultSigner)
  const oracleAuth = await WormholeOracleAuthFactory.deploy(join.address)

  console.log('Deploying router...')
  const WormholeRouterFactory = getContractFactory<WormholeRouter__factory>('WormholeRouter', defaultSigner)
  const router = await WormholeRouterFactory.deploy(sdk.dai.address)

  console.log('Finalizing permissions...')
  await waitForTx(join.rely(oracleAuth.address))
  await waitForTx(join.rely(router.address))
  await waitForTx(join.rely(sdk.pause_proxy.address))
  await waitForTx(join.deny(await defaultSigner.getAddress()))

  await waitForTx(oracleAuth.rely(sdk.pause_proxy.address))
  await waitForTx(oracleAuth.deny(await defaultSigner.getAddress()))

  await waitForTx(router.rely(sdk.pause_proxy.address))
  await waitForTx(router.deny(await defaultSigner.getAddress()))

  return { join, oracleAuth, router, constantFee }
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
  sdk: MainnetSdk
  wormholeSdk: WormholeSdk
  baseBridgeSdk: BaseBridgeSdk
}) {
  const L1ConfigureWormholeSpellFactory = getContractFactory<L1ConfigureWormholeSpell__factory>(
    'L1ConfigureWormholeSpell',
    defaultSigner,
  )
  const configureSpell = await L1ConfigureWormholeSpellFactory.deploy(
    joinDomain,
    wormholeSdk.join.address,
    sdk.vow.address,
    sdk.vat.address,
    globalLine,
    wormholeSdk.router.address,
  )

  await executeSpell(sdk, configureSpell)

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
    console.log('Executing spell to add a new domain...')
    await executeSpell(sdk, addWormholeDomainSpell)
  }

  console.log('Configuring oracleAuth...')
  const govImpersonator = await impersonateAccount(sdk.pause_proxy.address, sdk.dai.provider as any)
  await wormholeSdk.oracleAuth
    .connect(govImpersonator)
    .file(bytes32('threshold'), hexZeroPad(hexlify(oracleAddresses.length), 32))
  await wormholeSdk.oracleAuth.connect(govImpersonator).addSigners(oracleAddresses)
}
