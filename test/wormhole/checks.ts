import { getActiveWards } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { Signer } from 'ethers'
import { compact } from 'lodash'

import { AuthableLike } from '../pe-utils/auth'
import { BaseBridgeSdk, Sdk, WormholeBridgeSdk, WormholeSdk } from '.'

export async function performSanityChecks(
  l1Signer: Signer,
  sdk: Sdk,
  wormholeSdk: WormholeSdk,
  baseBridgeSdk: BaseBridgeSdk,
  wormholeBridgeSdk: WormholeBridgeSdk,
  l1BlockOfBeginningOfDeployment: number,
  l2BlockOfBeginningOfDeployment: number,
  includeDeployer: boolean,
  masterDomain: string,
  slaveDomain: string,
) {
  console.log('Performing sanity checks...')

  const deployerAddress = await l1Signer.getAddress()
  async function checkPermissions(contract: AuthableLike, startBlock: number, _expectedPermissions: string[]) {
    const actualPermissions = await getActiveWards(contract, startBlock)
    const expectedPermissions = compact([..._expectedPermissions, includeDeployer && deployerAddress])

    expect(normalizeAddresses(actualPermissions)).to.deep.eq(normalizeAddresses(expectedPermissions))
  }

  await checkPermissions(wormholeSdk.join, l1BlockOfBeginningOfDeployment, [
    wormholeSdk.oracleAuth.address,
    wormholeSdk.router.address,
    sdk.pause_proxy.address,
    sdk.esm.address,
  ])
  await checkPermissions(wormholeSdk.oracleAuth, l1BlockOfBeginningOfDeployment, [
    sdk.pause_proxy.address,
    sdk.esm.address,
  ])
  await checkPermissions(wormholeSdk.router, l1BlockOfBeginningOfDeployment, [sdk.pause_proxy.address, sdk.esm.address])

  await checkPermissions(wormholeBridgeSdk.l2WormholeBridge, l2BlockOfBeginningOfDeployment, [
    baseBridgeSdk.l2GovRelay.address,
  ])

  expect(await wormholeSdk.join.vat()).to.be.eq(sdk.vat.address)
  expect(await wormholeSdk.join.vow()).to.be.eq(sdk.vow.address)
  expect(await wormholeSdk.oracleAuth.wormholeJoin()).to.be.eq(wormholeSdk.join.address)
  expect(await wormholeSdk.router.gateways(masterDomain)).to.be.eq(wormholeSdk.join.address)
  expect(await wormholeSdk.router.gateways(slaveDomain)).to.be.eq(wormholeBridgeSdk.l1WormholeBridge.address)
  expect(await wormholeBridgeSdk.l1WormholeBridge.escrow()).to.be.eq(baseBridgeSdk.l1Escrow.address)
}

function normalizeAddresses(addresses: string[]): string[] {
  return addresses.map((a) => a.toLowerCase()).sort()
}
