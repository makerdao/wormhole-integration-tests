import { getOptimismKovanSdk } from '@dethcrypto/eth-sdk-client'
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import * as dotenv from 'dotenv'
import { ethers, Wallet } from 'ethers'
import { formatEther, Interface, parseUnits } from 'ethers/lib/utils'
import * as hre from 'hardhat'

import { getContractFactory, impersonateAccount, waitForTx } from '../../test/helpers'
import { getAttestations } from '../../test/wormhole'
dotenv.config()

const bytes32 = hre.ethers.utils.formatBytes32String

import { OptimismL2DaiWormholeGateway__factory } from '../../typechain'

// note: before running this script you need to setup hardhat network to use with optimistic-kovan network in fork mode
async function main() {
  const masterDomain = bytes32('KOVAN-MASTER-1')
  const user = '0x4BeE0574349BF0d8caB290dE4f38D38FEEEED91A'
  const l2Spell = '0x992C01191D62C0C333ef23935978749B50eDbC82'
  const spellInterface = new Interface(['function execute()'])
  const oraclePrivKey = getRequiredEnv('ORACLE_PRIV_KEY')

  const signer = await impersonateAccount(user, hre.ethers.provider)
  console.log('Network block number: ', await signer.provider!.getBlockNumber())

  const optimismKovanSdk = getOptimismKovanSdk(signer.provider! as any)
  const l2GovRelay = optimismKovanSdk.optimismDaiBridge.l2GovernanceRelay

  console.log('Executing L2 spell')
  const l1MessengerImpersonator = await impersonateAccount(
    applyL1ToL2Alias(await optimismKovanSdk.optimism.xDomainMessenger.l1CrossDomainMessenger()),
  )
  await waitForTx(
    optimismKovanSdk.optimism.xDomainMessenger
      .connect(l1MessengerImpersonator)
      .relayMessage(
        l2GovRelay.address,
        await optimismKovanSdk.optimismDaiBridge.l2GovernanceRelay.l1GovernanceRelay(),
        l2GovRelay.interface.encodeFunctionData('relay', [l2Spell, spellInterface.encodeFunctionData('execute')]),
        0,
      ),
  )

  console.log('DAI before: ', formatEther(await optimismKovanSdk.optimismDaiBridge.dai.balanceOf(user)))

  const l2WormholeBridge = getContractFactory<OptimismL2DaiWormholeGateway__factory>(
    'OptimismL2DaiWormholeGateway',
    signer,
  ).attach('0x45440Ae4988965A4cD94651E715fC9A04e62Fb41')
  const tx = await waitForTx(
    l2WormholeBridge['initiateWormhole(bytes32,address,uint128)'](
      masterDomain,
      await signer.getAddress(),
      parseUnits('1', 'ether'),
    ),
  )

  console.log('DAI after: ', formatEther(await optimismKovanSdk.optimismDaiBridge.dai.balanceOf(user)))

  const attestations = await getAttestations(tx, l2WormholeBridge.interface, [
    new Wallet(oraclePrivKey, signer.provider),
  ])

  console.log('Attestations: ', JSON.stringify(attestations))
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
