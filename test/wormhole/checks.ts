import { getActiveWards } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { Signer } from 'ethers'
import { compact } from 'lodash'

import { AuthableLike } from '../pe-utils/auth'
import { BaseBridgeSdk, WormholeBridgeSdk, WormholeSdk } from '.'
import { MakerSdk } from './setup'

export async function performSanityChecks(
  l1Signer: Signer,
  makerSdk: MakerSdk,
  wormholeSdk: WormholeSdk,
  baseBridgeSdk: BaseBridgeSdk,
  wormholeBridgeSdk: WormholeBridgeSdk,
  l1BlockOfBeginningOfDeployment: number,
  l2BlockOfBeginningOfDeployment: number,
  includeDeployer: boolean,
) {
  console.log('Performing sanity checks...')

  await performBridgeSanityChecks(
    l1Signer,
    baseBridgeSdk,
    wormholeBridgeSdk,
    l2BlockOfBeginningOfDeployment,
    includeDeployer,
)

  await performWormholeSanityChecks(
    l1Signer,
    makerSdk,
    wormholeSdk,
    l1BlockOfBeginningOfDeployment,
    includeDeployer,
  )
}

export async function performWormholeSanityChecks(
  l1Signer: Signer,
  makerSdk: MakerSdk,
  wormholeSdk: WormholeSdk,
  l1BlockOfBeginningOfDeployment: number,
  includeDeployer: boolean,
) {
  const deployerAddress = await l1Signer.getAddress()
  async function checkPermissions(contract: AuthableLike, startBlock: number, _expectedPermissions: string[]) {
    const actualPermissions = await getActiveWards(contract, startBlock)
    const expectedPermissions = compact([..._expectedPermissions, includeDeployer && deployerAddress])

    expect(normalizeAddresses(actualPermissions)).to.deep.eq(normalizeAddresses(expectedPermissions))
  }

  await checkPermissions(wormholeSdk.join, l1BlockOfBeginningOfDeployment, [
    wormholeSdk.oracleAuth.address,
    wormholeSdk.router.address,
    makerSdk.pause_proxy.address,
    makerSdk.esm.address,
  ])
  await checkPermissions(wormholeSdk.oracleAuth, l1BlockOfBeginningOfDeployment, [
    makerSdk.pause_proxy.address,
    makerSdk.esm.address,
  ])
  await checkPermissions(wormholeSdk.router, l1BlockOfBeginningOfDeployment, [
    makerSdk.pause_proxy.address,
    makerSdk.esm.address,
  ])

  expect(await wormholeSdk.join.vat()).to.be.eq(makerSdk.vat.address)
  expect(await wormholeSdk.oracleAuth.wormholeJoin()).to.be.eq(wormholeSdk.join.address)
}

export async function performBridgeSanityChecks(
  l1Signer: Signer,
  baseBridgeSdk: BaseBridgeSdk,
  wormholeBridgeSdk: WormholeBridgeSdk,
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

  await checkPermissions(wormholeBridgeSdk.l2WormholeBridge, l2BlockOfBeginningOfDeployment, [
    baseBridgeSdk.l2GovRelay.address,
  ])

  expect(await wormholeBridgeSdk.l1WormholeBridge.l1Escrow()).to.be.eq(baseBridgeSdk.l1Escrow.address)

}

function normalizeAddresses(addresses: string[]): string[] {
  return addresses.map((a) => a.toLowerCase()).sort()
}
