import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, Contract, Signer } from 'ethers'
import { TransactionReceipt } from 'ethers/node_modules/@ethersproject/providers'

import { TestBadDebtPushSpell__factory } from '../../typechain/factories/TestBadDebtPushSpell__factory'
import { deployUsingFactory, getContractFactory, impersonateAccount, waitForTx } from '../helpers'

interface SpellDeployOpts {
  l1Signer: Signer
  sdk: MainnetSdk
  wormholeJoinAddress: string
  sourceDomain: string
  badDebt: BigNumber
}

export async function deployBadDebtPushSpell(
  opts: SpellDeployOpts,
): Promise<{ castBadDebtPushSpell: () => Promise<TransactionReceipt> }> {
  console.log('Deploying TestBadDebtPushSpell...')
  const BadDebtPushSpellFactory = getContractFactory<TestBadDebtPushSpell__factory>(
    'TestBadDebtPushSpell',
    opts.l1Signer,
  )
  const badDebtPushSpell = await deployUsingFactory(opts.l1Signer, BadDebtPushSpellFactory, [
    opts.wormholeJoinAddress,
    opts.sdk.vat.address,
    opts.sdk.dai_join.address,
    opts.sdk.vow.address,
    opts.sourceDomain,
    opts.badDebt,
  ])

  const castBadDebtPushSpell = () => executeSpell(opts.sdk, badDebtPushSpell)

  return { castBadDebtPushSpell }
}

export async function executeSpell(sdk: MainnetSdk, spell: Contract): Promise<TransactionReceipt> {
  const provider = sdk.dai.provider! as any
  const pauseAddress = await sdk.pause_proxy.owner()
  const pauseImpersonator = await impersonateAccount(pauseAddress, provider)

  return await waitForTx(
    sdk.pause_proxy.connect(pauseImpersonator).exec(spell.address, spell.interface.encodeFunctionData('execute')),
  )
}
