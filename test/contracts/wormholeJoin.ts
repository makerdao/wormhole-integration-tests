import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, BigNumberish, Signer } from 'ethers'
import { hexlify, hexZeroPad } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { Dictionary } from 'ts-essentials'

import {
  WormholeConstantFee,
  WormholeConstantFee__factory,
  WormholeJoin,
  WormholeJoin__factory,
  WormholeOracleAuth,
  WormholeOracleAuth__factory,
  WormholeRouter,
  WormholeRouter__factory,
} from '../../typechain'
import { getContractFactory, impersonateAccount, toEthersBigNumber, toRay, waitForTx } from '../helpers'

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
  await join.rely(oracleAuth.address)

  console.log('Deploying router...')
  const WormholeRouterFactory = getContractFactory<WormholeRouter__factory>('WormholeRouter', defaultSigner)
  const router = await WormholeRouterFactory.deploy(sdk.dai.address)
  await join.rely(router.address)

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
}: {
  defaultSigner: Signer
  globalLine: BigNumber
  domainsCfg: Dictionary<{ line: BigNumber; l1Bridge: string }>
  joinDomain: string
  oracleAddresses: string[]
  sdk: MainnetSdk
  wormholeSdk: WormholeSdk
}) {
  console.log('Configuring join...')
  await wormholeSdk.join['file(bytes32,address)'](bytes32('vow'), sdk.vow.address)

  for (const [domainName, domainCfg] of Object.entries(domainsCfg)) {
    await wormholeSdk.join['file(bytes32,bytes32,address)'](
      bytes32('fees'),
      domainName,
      wormholeSdk.constantFee.address,
    )
    await wormholeSdk.join['file(bytes32,bytes32,uint256)'](bytes32('line'), domainName, domainCfg.line)
  }

  console.log('Configuring oracleAuth...')

  await wormholeSdk.oracleAuth.file(bytes32('threshold'), hexZeroPad(hexlify(oracleAddresses.length), 32))
  await wormholeSdk.oracleAuth.connect(defaultSigner).addSigners(oracleAddresses)

  console.log('Configuring router')
  await wormholeSdk.router.file(bytes32('gateway'), joinDomain, wormholeSdk.join.address)

  console.log(`Configuring vat at ${sdk.vat.address}...`)
  const ilk = await wormholeSdk.join.ilk()
  const makerGovernanceImpersonator = await impersonateAccount(sdk.pause_proxy.address, defaultSigner.provider! as any)
  await sdk.vat.connect(makerGovernanceImpersonator).rely(wormholeSdk.join.address)
  await sdk.vat.connect(makerGovernanceImpersonator).init(ilk)
  await sdk.vat
    .connect(makerGovernanceImpersonator)
    ['file(bytes32,bytes32,uint256)'](ilk, bytes32('spot'), toEthersBigNumber(toRay(1)))
  await sdk.vat.connect(makerGovernanceImpersonator)['file(bytes32,bytes32,uint256)'](ilk, bytes32('line'), globalLine)

  console.log('Configuring L1 router...')
  for (const [domainName, domainCfg] of Object.entries(domainsCfg)) {
    await waitForTx(wormholeSdk.router.file(bytes32('gateway'), domainName, domainCfg.l1Bridge))
  }
}
