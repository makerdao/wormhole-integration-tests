import { getKovanSdk } from '@dethcrypto/eth-sdk-client'
import { sleep } from '@eth-optimism/core-utils'
import * as dotenv from 'dotenv'
import { Contract } from 'ethers'
import { formatEther, Interface } from 'ethers/lib/utils'
import * as hre from 'hardhat'

import { deployUsingFactoryAndVerify, getContractFactory, impersonateAccount, waitForTx } from '../../test/helpers'

dotenv.config()

import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Signer } from 'ethers'

import { WormholeOracleAuth__factory } from '../../typechain'

// note: before running this script you need to setup hardhat network to use with kovan network in fork mode
async function main() {
  const userAddress = '0x4BeE0574349BF0d8caB290dE4f38D38FEEEED91A'
  const signer = await impersonateAccount(userAddress, hre.ethers.provider)
  const mkrWhaleAddress = '0xd200790f62c8da69973e61d4936cfE4f356ccD07'
  console.log('Network block number: ', await signer.provider!.getBlockNumber())

  // const spellInterface = new Interface(['function cast()', 'function schedule()'])
  // const l1Spell = new Contract('0x66b3d63621fdd5967603a824114da95cc3a35107', spellInterface)
  const SpellFactory = await hre.ethers.getContractFactory('L1KovanAddWormholeDomainSpell')
  const l1Spell = await deployUsingFactoryAndVerify(signer, SpellFactory, [])
  console.log('L1 spell deployed at: ', l1Spell.address)

  const kovanSdk = getKovanSdk(signer.provider! as any)

  await executeDssSpell(signer, await kovanSdk.maker.pause_proxy.owner(), l1Spell, mkrWhaleAddress)

  console.log('DAI before: ', formatEther(await kovanSdk.maker.dai.balanceOf(userAddress)))

  const oracleAuth = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', signer).attach(
    '0xcEBe310e86d44a55EC6Be05e0c233B033979BC67',
  )

  await waitForTx(
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

  console.log('DAI after: ', formatEther(await kovanSdk.maker.dai.balanceOf(userAddress)))
}

async function executeDssSpell(
  l1Signer: Signer,
  pauseAddress: string,
  spell: Contract,
  mkrWhaleAddress: string,
): Promise<TransactionReceipt> {
  // execute spell using standard DssSpell procedure
  const mkrWhale = await impersonateAccount(mkrWhaleAddress, l1Signer.provider as JsonRpcProvider)
  const pause = new Contract(pauseAddress, new Interface(['function authority() view returns (address)']), l1Signer)
  const chief = new Contract(
    await pause.authority(),
    new Interface(['function vote(address[])', 'function lift(address)']),
    mkrWhale,
  )
  console.log('Vote spell...')
  await waitForTx(chief.vote([spell.address]))
  console.log('Lift spell...')
  await waitForTx(chief.lift(spell.address))
  console.log('Scheduling spell...')
  await waitForTx(spell.connect(l1Signer).schedule())
  console.log('Waiting pause delay...')
  await sleep(60000)
  console.log('Casting spell...')
  return await waitForTx(spell.connect(l1Signer).cast())
}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
