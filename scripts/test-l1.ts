import { getKovanSdk, getOptimismKovanSdk } from '@dethcrypto/eth-sdk-client'
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import * as dotenv from 'dotenv'
import { Contract, ethers, Wallet } from 'ethers'
import { formatEther, Interface, parseUnits } from 'ethers/lib/utils'
import * as hre from 'hardhat'
import { mapValues } from 'lodash'
import { Dictionary } from 'ts-essentials'
import { deployUsingFactoryAndVerify, getContractFactory, impersonateAccount, waitForTx } from '../test/helpers'
import { executeSpell, getAttestations } from '../test/wormhole'
dotenv.config()

const bytes32 = hre.ethers.utils.formatBytes32String

import { L2DAIWormholeBridge__factory, WormholeOracleAuth__factory } from '../typechain'

// note: before running this script you need to setup hardhat network to use with kovan network in fork mode
async function main() {
  const masterDomain = bytes32('KOVAN-MASTER-1')
  const user = '0x4BeE0574349BF0d8caB290dE4f38D38FEEEED91A'
  // const l1Spell = '0x8EEd20d0F2C95eb636AB099A0bb318fA0134d523'
  const spellInterface = new Interface(['function execute()'])

  const signer = await impersonateAccount(user, hre.ethers.provider)
  console.log('Network block number: ', await signer.provider!.getBlockNumber())

  const SpellFactory = await hre.ethers.getContractFactory('L1KovanAddWormholeDomainSpell')
  const l1Spell = await deployUsingFactoryAndVerify(signer, SpellFactory, [])
  console.log('L1 spell deployed at: ', l1Spell.address)

  const kovanSdk = getKovanSdk(signer.provider! as any)
  console.log('Executing L1 spell')
  await executeSpell(signer, kovanSdk.maker, new Contract(l1Spell.address, spellInterface))

  console.log('DAI before: ', formatEther(await kovanSdk.maker.dai.balanceOf(user)))

  const oracleAuth = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', signer).attach(
    '0xcEBe310e86d44a55EC6Be05e0c233B033979BC67',
  )
  const tx = await waitForTx(
    oracleAuth.requestMint(
      [
        '0x4b4f56414e2d534c4156452d4f5054494d49534d2d3100000000000000000000',
        '0x4b4f56414e2d4d41535445522d31000000000000000000000000000000000000',
        '0x0000000000000000000000004bee0574349bf0d8cab290de4f38d38feeeed91a',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        '0x016345785d8a0000',
        '0x018d88',
        1646090403,
      ] as any,
      '0x236bf659a96b121bb58b4e12b014d756cbf8fa3a7bcf3f179ae3320b4cc5688418664766e7e62b47857b0e6c19fc74172ad10baaf4484d3ebea9e180545d76d61b',
      0,
      0,
    ),
  )

  console.log('DAI after: ', formatEther(await kovanSdk.maker.dai.balanceOf(user)))
}

// this should be extracted to common library, arbitrum uses exactly same scheme
function applyL1ToL2Alias(l1Address: string): string {
  const mask = ethers.BigNumber.from(2).pow(160)
  const offset = ethers.BigNumber.from('0x1111000000000000000000000000000000001111')

  const l1AddressAsNumber = ethers.BigNumber.from(l1Address)

  const l2AddressAsNumber = l1AddressAsNumber.add(offset)

  return l2AddressAsNumber.mod(mask).toHexString()
}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
