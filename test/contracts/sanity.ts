import { MainnetSdk, OptimismSdk } from '@dethcrypto/eth-sdk-client'
import { expect } from 'chai'
import { Signer } from 'ethers'
import { compact } from 'lodash'

import { getActiveWards } from '../pe-utils/auth'
import { AuthableLike } from '../pe-utils/auth/AuthableContract'
import { BridgeSdk } from './bridge'
import { WormholeSdk } from './wormholeJoin'

export async function performSanityChecks(
  l1Signer: Signer,
  sdk: MainnetSdk,
  optimismSdk: OptimismSdk,
  wormholeSdk: WormholeSdk,
  bridgeSdk: BridgeSdk,
  l1BlockOfBeginningOfDeployment: number,
  l2BlockOfBeginningOfDeployment: number,
  includeDeployer: boolean,
) {
  console.log('Performing sanity checks...')

  const deployerAddress = await l1Signer.getAddress()
  async function checkPermissions(contract: AuthableLike, startBlock: number, _expectedPermissions: string[]) {
    const actualPermissions = await getActiveWards(contract, startBlock)
    const expectedPermissions = compact([..._expectedPermissions, includeDeployer && deployerAddress])

    expect(normalizeAddresses(actualPermissions)).to.deep.eq(normalizeAddresses(expectedPermissions))
  }

  await checkPermissions(wormholeSdk.join, l1BlockOfBeginningOfDeployment, [sdk.pause_proxy.address, sdk.esm.address])
  await checkPermissions(wormholeSdk.oracleAuth, l1BlockOfBeginningOfDeployment, [
    sdk.pause_proxy.address,
    sdk.esm.address,
  ])
  await checkPermissions(wormholeSdk.router, l1BlockOfBeginningOfDeployment, [sdk.pause_proxy.address, sdk.esm.address])

  await checkPermissions(bridgeSdk.l2WormholeBridge, l1BlockOfBeginningOfDeployment, [
    optimismSdk.governanceRelay.address,
  ])

  // expect(await bridgeDeployment.l1DaiGateway.l1Escrow()).to.be.eq(bridgeDeployment.l1Escrow.address)
  // expect(await bridgeDeployment.l1GovRelay.l2GovernanceRelay()).to.be.eq(bridgeDeployment.l2GovRelay.address)
  // expect(await bridgeDeployment.l1GovRelay.inbox()).to.be.eq(await bridgeDeployment.l1DaiGateway.inbox())
}

function normalizeAddresses(addresses: string[]): string[] {
  return addresses.map((a) => a.toLowerCase()).sort()
}
