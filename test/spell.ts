import { MainnetSdk } from '@dethcrypto/eth-sdk-client'
import { BigNumber, Signer, Transaction } from 'ethers'

import { TestBadDebtPushSpell__factory } from '../typechain/factories/TestBadDebtPushSpell__factory'
import { deployUsingFactory, getContractFactory, impersonateAccount } from './helpers'

interface SpellDeployOpts {
  l1Signer: Signer
  sdk: MainnetSdk
  wormholeJoinAddress: string
  sourceDomain: string
  badDebt: BigNumber
}

export async function deploySpell(
  opts: SpellDeployOpts,
): Promise<{ castBadDebtPushSpell: () => Promise<Transaction> }> {
  const pauseAddress = await opts.sdk.pause_proxy.owner()
  const pauseImpersonator = await impersonateAccount(pauseAddress, opts.l1Signer.provider! as any)

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
  const castBadDebtPushSpell = () =>
    opts.sdk.pause_proxy
      .connect(pauseImpersonator)
      .exec(badDebtPushSpell.address, badDebtPushSpell.interface.encodeFunctionData('execute'))

  return { castBadDebtPushSpell }
}
