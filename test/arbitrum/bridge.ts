import { expect } from 'chai'
import { constants, Signer, Wallet } from 'ethers'

import {
  Dai__factory,
  L1ArbitrumGovernanceRelay__factory,
  L1DaiGateway__factory,
  L1DaiWormholeGateway__factory,
  L1Escrow__factory,
  L2ArbitrumGovernanceRelay__factory,
  L2DaiGateway__factory,
  L2DaiWormholeGateway__factory,
} from '../../typechain'
import { deployUsingFactoryAndVerify, getContractFactory, waitForTx } from '../helpers'
import { getAddressOfNextDeployedContract } from '../pe-utils/address'
import { MakerSdk } from '../wormhole'
import { WormholeSdk } from '../wormhole/wormhole'
import { ArbitrumRollupSdk } from '.'

interface ArbitrumWormholeBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  makerSdk: MakerSdk
  arbitrumRollupSdk: ArbitrumRollupSdk
  wormholeSdk: WormholeSdk
  baseBridgeSdk: ArbitrumBaseBridgeSdk
  slaveDomain: string
}

export async function deployArbitrumWormholeBridge(opts: ArbitrumWormholeBridgeDeployOpts) {
  console.log('Deploying Arbitrum Wormhole Bridge...')
  const futureL1WormholeBridgeAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const L2WormholeBridgeFactory = getContractFactory<L2DaiWormholeGateway__factory>(
    'L2DaiWormholeGateway',
    opts.l2Signer,
  )
  const l2WormholeBridge = await deployUsingFactoryAndVerify(opts.l2Signer, L2WormholeBridgeFactory, [
    opts.baseBridgeSdk.l2Dai.address,
    futureL1WormholeBridgeAddress,
    opts.slaveDomain,
  ])
  console.log('L2DaiWormholeGateway deployed at: ', l2WormholeBridge.address)

  const L1WormholeBridgeFactory = getContractFactory<L1DaiWormholeGateway__factory>('L1DaiWormholeGateway')
  const l1WormholeBridge = await deployUsingFactoryAndVerify(opts.l1Signer, L1WormholeBridgeFactory, [
    opts.makerSdk.dai.address,
    l2WormholeBridge.address,
    opts.arbitrumRollupSdk.fake_inbox.address, // use a fake inbox that allows relaying arbitrary L2>L1 messages without delay
    opts.baseBridgeSdk.l1Escrow.address,
    opts.wormholeSdk.router.address,
  ])
  expect(l1WormholeBridge.address).to.be.eq(futureL1WormholeBridgeAddress, 'Future address doesnt match actual address')
  console.log('L1DaiWormholeGateway deployed at: ', l1WormholeBridge.address)

  await l2WormholeBridge.rely(opts.baseBridgeSdk.l2GovRelay.address)
  await l2WormholeBridge.deny(await opts.l2Signer.getAddress())

  return { l2WormholeBridge, l1WormholeBridge }
}

interface ArbitrumBaseBridgeDeployOpts {
  l1Signer: Signer
  l2Signer: Signer
  makerSdk: MakerSdk
  arbitrumRollupSdk: ArbitrumRollupSdk
}

export async function deployArbitrumBaseBridge(opts: ArbitrumBaseBridgeDeployOpts) {
  const l1Escrow = await deployUsingFactoryAndVerify(
    opts.l1Signer,
    getContractFactory<L1Escrow__factory>('L1Escrow'),
    [],
  )
  console.log('L1Escrow deployed at: ', l1Escrow.address)

  const l1RouterAddress = '0x70C143928eCfFaf9F5b406f7f4fC28Dc43d68380'
  const l2RouterAddress = '0x9413AD42910c1eA60c737dB5f58d1C504498a3cD'

  console.log('Deploying Arbitrum Base Bridge...')
  const l2Dai = await deployUsingFactoryAndVerify(
    opts.l2Signer,
    getContractFactory<Dai__factory>('Dai', opts.l2Signer),
    [],
  )
  console.log('L2Dai deployed at: ', l2Dai.address)

  const futureL1DaiGatewayAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2DaiGateway = await deployUsingFactoryAndVerify(
    opts.l2Signer,
    getContractFactory<L2DaiGateway__factory>('L2DaiGateway'),
    [futureL1DaiGatewayAddress, l2RouterAddress, opts.makerSdk.dai.address, l2Dai.address],
  )
  console.log('L2DaiGateway deployed at: ', l2DaiGateway.address)
  await waitForTx(l2Dai.rely(l2DaiGateway.address))

  const l1DaiGateway = await deployUsingFactoryAndVerify(
    opts.l1Signer,
    getContractFactory<L1DaiGateway__factory>('L1DaiGateway'),
    [
      l2DaiGateway.address,
      l1RouterAddress,
      opts.arbitrumRollupSdk.inbox.address,
      opts.makerSdk.dai.address,
      l2Dai.address,
      l1Escrow.address,
    ],
  )
  expect(l1DaiGateway.address).to.be.eq(futureL1DaiGatewayAddress, 'Future address doesnt match actual address')
  console.log('L1DaiGateway deployed at: ', l1DaiGateway.address)

  const futureL1GovRelayAddress = await getAddressOfNextDeployedContract(opts.l1Signer)
  const l2GovRelay = await deployUsingFactoryAndVerify(
    opts.l2Signer,
    getContractFactory<L2ArbitrumGovernanceRelay__factory>('L2ArbitrumGovernanceRelay'),
    [futureL1GovRelayAddress],
  )
  console.log('L2ArbitrumGovernanceRelay deployed at', l2GovRelay.address)
  const l1GovRelay = await deployUsingFactoryAndVerify(
    opts.l1Signer,
    getContractFactory<L1ArbitrumGovernanceRelay__factory>('L1ArbitrumGovernanceRelay'),
    [opts.arbitrumRollupSdk.inbox.address, l2GovRelay.address],
  )
  expect(l1GovRelay.address).to.be.eq(futureL1GovRelayAddress, 'Future address doesnt match actual address')
  console.log('L1ArbitrumGovernanceRelay deployed at', l1GovRelay.address)

  // bridge has to be approved on escrow because settling moves tokens
  await waitForTx(l1Escrow.approve(opts.makerSdk.dai.address, l1DaiGateway.address, constants.MaxUint256))
  await waitForTx(l1Escrow.rely(opts.makerSdk.pause_proxy.address))
  await waitForTx(l1Escrow.deny(await opts.l1Signer.getAddress()))

  await waitForTx(l1GovRelay.rely(opts.makerSdk.pause_proxy.address))
  await waitForTx(l1GovRelay.deny(await opts.l1Signer.getAddress()))

  await waitForTx(l2Dai.rely(l2DaiGateway.address))
  await waitForTx(l2Dai.rely(l2GovRelay.address))
  await waitForTx(l2Dai.deny(await opts.l2Signer.getAddress()))

  await waitForTx(l1DaiGateway.rely(opts.makerSdk.pause_proxy.address))
  await waitForTx(l1DaiGateway.deny(await opts.l1Signer.getAddress()))

  await waitForTx(l2DaiGateway.rely(l2GovRelay.address))
  await waitForTx(l2DaiGateway.deny(await opts.l2Signer.getAddress()))

  return {
    l2Dai,
    l1DaiTokenBridge: l1DaiGateway,
    l2DaiTokenBridge: l2DaiGateway,
    l1Escrow,
    l1GovRelay,
    l2GovRelay,
  }
}

export type ArbitrumBaseBridgeSdk = Awaited<ReturnType<typeof deployArbitrumBaseBridge>>
