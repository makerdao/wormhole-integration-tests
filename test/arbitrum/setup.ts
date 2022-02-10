import { getRinkebySdk, RinkebySdk } from '@dethcrypto/eth-sdk-client'
import { sleep } from '@eth-optimism/core-utils'
import { ContractReceipt, ContractTransaction } from 'ethers'
import { ethers } from 'hardhat'

import { L1AddWormholeArbitrumSpell__factory, L2AddWormholeDomainSpell__factory } from '../../typechain'
import { deployUsingFactory, getContractFactory, waitForTx } from '../helpers'
import { deployWormhole, DomainSetupOpts, DomainSetupResult } from '../wormhole'
import { getGasPriceBid, getMaxGas, getMaxSubmissionPrice } from './deposit'
import {
  deployArbitrumBaseBridge,
  deployArbitrumWormholeBridge,
  depositToStandardBridge,
  getArbitrumAddresses,
  makeRelayTxToL1,
  waitToRelayTxsToL2,
} from './index'

const TTL = 300

export async function setupArbitrumTests({
  l1Signer,
  l2Signer,
  l1User,
  l1Provider,
  l2Provider,
  l2DaiAmount,
  domain,
  masterDomain,
  ilk,
  fee,
  line,
}: DomainSetupOpts): Promise<DomainSetupResult> {
  const l1Sdk = getRinkebySdk(l1Signer)
  const rinkebySdk = l1Sdk as RinkebySdk
  const arbitrumAddresses = getArbitrumAddresses()

  const userEthAmount = ethers.utils.parseEther('0.1')
  if ((await l1User.getBalance()).lt(userEthAmount)) {
    console.log('Funding l1User ETH balance...')
    await l1Signer.sendTransaction({ to: l1User.address, value: userEthAmount })
  }
  if ((await l2Provider.getBalance(l1User.address)).lt(userEthAmount)) {
    console.log('Funding l2User ETH balance...')
    await l2Signer.sendTransaction({ to: l1User.address, value: userEthAmount })
  }
  if ((await l1Sdk.dai.balanceOf(l1User.address)).lt(l2DaiAmount)) {
    console.log('Funding l1User DAI balance...')
    await l1Sdk.dai.transfer(l1User.address, l2DaiAmount)
  }

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    sdk: l1Sdk,
    ilk,
    joinDomain: masterDomain,
    globalFee: fee,
    globalFeeTTL: TTL,
  })

  const baseBridgeSdk = await deployArbitrumBaseBridge({
    l1Signer,
    l2Signer,
    sdk: rinkebySdk,
    arbitrumAddresses,
  })
  const wormholeBridgeSdk = await deployArbitrumWormholeBridge({
    rinkebySdk,
    l1Signer,
    l2Signer,
    wormholeSdk,
    baseBridgeSdk,
    domain,
    arbitrumAddresses,
  })

  const relayTxToL1 = makeRelayTxToL1(wormholeBridgeSdk.l2WormholeBridge, l1Sdk, l1Signer)
  const relayTxToL2 = (
    l1Tx: Promise<ContractTransaction> | ContractTransaction | Promise<ContractReceipt> | ContractReceipt,
  ) => waitToRelayTxsToL2(l1Tx, arbitrumAddresses.l1.inbox, l1Provider, l2Provider)

  console.log('Deploy Arbitrum L2 spell...')
  const l2AddWormholeDomainSpell = await deployUsingFactory(
    l2Signer,
    getContractFactory<L2AddWormholeDomainSpell__factory>('L2AddWormholeDomainSpell'),
    [baseBridgeSdk.l2Dai.address, wormholeBridgeSdk.l2WormholeBridge.address, masterDomain],
  )
  console.log('Deploy Arbitrum L1 spell...')
  const L1AddWormholeArbitrumSpellFactory = getContractFactory<L1AddWormholeArbitrumSpell__factory>(
    'L1AddWormholeArbitrumSpell',
    l1Signer,
  )
  const l2SpellCalldata = l2AddWormholeDomainSpell.interface.encodeFunctionData('execute')
  const l2MessageCalldata = baseBridgeSdk.l2GovRelay.interface.encodeFunctionData('relay', [
    l2AddWormholeDomainSpell.address,
    l2SpellCalldata,
  ])
  const calldataLength = l2MessageCalldata.length
  const gasPriceBid = await getGasPriceBid(l2Provider)
  const maxSubmissionCost = await getMaxSubmissionPrice(l2Provider, calldataLength)
  const maxGas = await getMaxGas(
    l2Provider,
    baseBridgeSdk.l1GovRelay.address,
    baseBridgeSdk.l2GovRelay.address,
    baseBridgeSdk.l2GovRelay.address,
    maxSubmissionCost,
    gasPriceBid,
    l2MessageCalldata,
  )
  const addWormholeDomainSpell = await L1AddWormholeArbitrumSpellFactory.deploy(
    domain,
    wormholeSdk.join.address,
    wormholeSdk.constantFee.address,
    line,
    wormholeSdk.router.address,
    wormholeBridgeSdk.l1WormholeBridge.address,
    baseBridgeSdk.l1Escrow.address,
    rinkebySdk.dai.address,
    {
      l1GovRelay: baseBridgeSdk.l1GovRelay.address,
      l2ConfigureDomainSpell: l2AddWormholeDomainSpell.address,
      l1CallValue: maxSubmissionCost.add(gasPriceBid.mul(maxGas)),
      maxGas,
      gasPriceBid,
      maxSubmissionCost,
    },
  )

  console.log('Moving some DAI to L2...')
  await waitForTx(l1Sdk.dai.connect(l1Signer).transfer(l1User.address, l2DaiAmount))
  await waitForTx(l1Sdk.dai.connect(l1User).approve(baseBridgeSdk.l1DaiTokenBridge.address, l2DaiAmount))
  await relayTxToL2(
    depositToStandardBridge({
      l2Provider: l2Provider,
      from: l1User,
      to: l1User.address,
      l1Gateway: baseBridgeSdk.l1DaiTokenBridge,
      l1TokenAddress: l1Sdk.dai.address,
      l2GatewayAddress: baseBridgeSdk.l2DaiTokenBridge.address,
      deposit: l2DaiAmount.toString(),
    }),
  )
  console.log('Arbitrum setup complete.')
  return {
    l1Sdk,
    relayTxToL1,
    relayTxToL2,
    wormholeSdk,
    baseBridgeSdk,
    wormholeBridgeSdk,
    ttl: TTL,
    forwardTimeToAfterFinalization,
    addWormholeDomainSpell,
  }
}

async function forwardTimeToAfterFinalization() {
  await sleep(TTL * 1000 + 30000)
}
