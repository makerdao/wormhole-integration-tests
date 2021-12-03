import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, Signer } from 'ethers'
import { hexlify, hexZeroPad } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { Dictionary } from 'ts-essentials'

import {
  WormholeConstantFee__factory,
  WormholeJoin,
  WormholeJoin__factory,
  WormholeOracleAuth,
  WormholeOracleAuth__factory,
} from '../typechain'
import { getContractFactory } from './helpers'

const bytes32 = ethers.utils.formatBytes32String

export async function deployWormhole({
  defaultSigner,
  sdk,
  line,
  spot,
  ilk,
  joinDomain,
  domainsCfg,
  oracleAddresses,
}: {
  defaultSigner: Signer
  sdk: MainnetSdk
  line: BigNumber
  spot: BigNumber
  ilk: string
  joinDomain: string
  domainsCfg: Dictionary<{ line: BigNumber }>
  oracleAddresses: string[]
}): Promise<{ join: WormholeJoin; oracleAuth: WormholeOracleAuth }> {
  const WormholeJoinFactory = getContractFactory<WormholeJoin__factory>('WormholeJoin', defaultSigner)
  const join = await WormholeJoinFactory.deploy(sdk.vat.address, sdk.dai_join.address, ilk, joinDomain)
  console.log('WormholeJoin deployed at: ', join.address)

  console.log('Configuring vat...')
  await sdk.vat.rely(join.address)
  await sdk.vat.init(ilk)
  await sdk.vat['file(bytes32,bytes32,uint256)'](ilk, bytes32('spot'), spot)
  await sdk.vat['file(bytes32,bytes32,uint256)'](ilk, bytes32('line'), line)

  console.log('Configuring join...')
  await join['file(bytes32,address)'](bytes32('vow'), sdk.vow.address)
  const ConstantFeeFactory = getContractFactory<WormholeConstantFee__factory>('WormholeConstantFee', defaultSigner)
  const constantFee = await ConstantFeeFactory.deploy(0)
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

  return { join, oracleAuth }
}
