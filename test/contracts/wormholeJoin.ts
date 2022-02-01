import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, BigNumberish, Signer } from 'ethers'
import { hexlify, hexZeroPad } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { Dictionary } from 'ts-essentials'

import {
  WormholeConstantFee__factory,
  WormholeJoin,
  WormholeJoin__factory,
  WormholeOracleAuth,
  WormholeOracleAuth__factory,
  WormholeRouter,
  WormholeRouter__factory,
} from '../../typechain'
import { getContractFactory, impersonateAccount, toEthersBigNumber, toRay } from '../helpers'

const bytes32 = ethers.utils.formatBytes32String

export const OPTIMISTIC_ROLLUP_FLUSH_FINALIZATION_TIME = 60 * 60 * 24 * 8 // flush should happen more or less, 1 day after initWormhole, and should take 7 days to finalize

export async function deployWormholeJoin({
  defaultSigner,
  sdk,
  ilk,
  joinDomain,
  domainsCfg,
  oracleAddresses,
  globalFee,
  globalFeeTTL,
}: {
  defaultSigner: Signer
  sdk: MainnetSdk
  ilk: string
  joinDomain: string
  domainsCfg: Dictionary<{ line: BigNumber }>
  oracleAddresses: string[]
  globalFee: BigNumberish
  globalFeeTTL: BigNumberish
}): Promise<{ join: WormholeJoin; oracleAuth: WormholeOracleAuth; router: WormholeRouter }> {
  const WormholeJoinFactory = getContractFactory<WormholeJoin__factory>('WormholeJoin', defaultSigner)
  const join = await WormholeJoinFactory.deploy(sdk.vat.address, sdk.dai_join.address, ilk, joinDomain)
  console.log('WormholeJoin deployed at: ', join.address)

  console.log('Configuring join...')
  await join['file(bytes32,address)'](bytes32('vow'), sdk.vow.address)
  const ConstantFeeFactory = getContractFactory<WormholeConstantFee__factory>('WormholeConstantFee', defaultSigner)

  const constantFee = await ConstantFeeFactory.deploy(globalFee, globalFeeTTL)
  for (const [domainName, domainCfg] of Object.entries(domainsCfg)) {
    await join['file(bytes32,bytes32,address)'](bytes32('fees'), domainName, constantFee.address)
    await join['file(bytes32,bytes32,uint256)'](bytes32('line'), domainName, domainCfg.line)
  }

  console.log('Configuring oracleAuth...')
  const WormholeOracleAuthFactory = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', defaultSigner)
  const oracleAuth = await WormholeOracleAuthFactory.deploy(join.address)
  await join.rely(oracleAuth.address)
  await oracleAuth.file(bytes32('threshold'), hexZeroPad(hexlify(oracleAddresses.length), 32))
  await oracleAuth.connect(defaultSigner).addSigners(oracleAddresses)

  console.log('Deploying router...')
  const WormholeRouterFactory = getContractFactory<WormholeRouter__factory>('WormholeRouter', defaultSigner)
  const router = await WormholeRouterFactory.deploy(sdk.dai.address)
  await router.file(bytes32('gateway'), joinDomain, join.address)
  await join.rely(router.address)

  return { join, oracleAuth, router }
}

export async function addWormholeJoinToVat({
  defaultSigner,
  ilk,
  line,
  sdk,
  join,
}: {
  defaultSigner: Signer
  sdk: MainnetSdk
  line: BigNumber
  ilk: string
  join: WormholeJoin
}) {
  console.log(`Configuring vat at ${sdk.vat.address}...`)
  const makerGovernanceImpersonator = await impersonateAccount(sdk.pause_proxy.address, defaultSigner.provider! as any)
  await sdk.vat.connect(makerGovernanceImpersonator).rely(join.address)
  await sdk.vat.connect(makerGovernanceImpersonator).init(ilk)
  await sdk.vat
    .connect(makerGovernanceImpersonator)
    ['file(bytes32,bytes32,uint256)'](ilk, bytes32('spot'), toEthersBigNumber(toRay(1)))
  await sdk.vat.connect(makerGovernanceImpersonator)['file(bytes32,bytes32,uint256)'](ilk, bytes32('line'), line)
}
