import { getGoerliSdk } from '@dethcrypto/eth-sdk-client'
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import * as dotenv from 'dotenv'
import * as ethers from 'ethers'
import { mapValues } from 'lodash'
import { Dictionary } from 'ts-essentials'
dotenv.config()


import { deployWormhole } from '../../test/wormhole'
import { performWormholeSanityChecks } from '../../test/wormhole/checks'

const bytes32 = ethers.utils.formatBytes32String

async function main() {
  const fee = 0 // 0 fees
  const feeTTL = 60 * 60 * 24 * 8 // flush should happen more or less, 1 day after initWormhole, and should take 7 days to finalize
  const ilk: string = bytes32('WH-GOERLI-TEST-1')
  const masterDomain = bytes32('GOERLI-MASTER-1')

  const { l1Signer } = await setupSigners()
  const l1StartingBlock = await l1Signer.provider.getBlockNumber()
  console.log('Current L1 block: ', l1StartingBlock)

  const goerliSdk = getGoerliSdk(l1Signer)

  const wormholeSdk = await deployWormhole({
    defaultSigner: l1Signer,
    makerSdk: goerliSdk.maker,
    ilk,
    joinDomain: masterDomain,
    globalFee: fee,
    globalFeeTTL: feeTTL,
  })

  await performWormholeSanityChecks(
    l1Signer,
    goerliSdk.maker,
    wormholeSdk,
    l1StartingBlock,
    false,
  )

  console.log('Wormhole: ', getSdkAddresses(wormholeSdk))
}

async function setupSigners() {
  const l1Rpc = getRequiredEnv('GOERLI_L1_RPC')
  const deployerPrivKey = getRequiredEnv('GOERLI_DEPLOYER_PRIV_KEY')
  const l1Provider = new ethers.providers.JsonRpcProvider(l1Rpc)

  expect((await l1Provider.getNetwork()).chainId).to.eq(5, 'Not goerli!')

  const l1Signer = new ethers.Wallet(deployerPrivKey, l1Provider)

  return { l1Signer }
}

function getSdkAddresses(sdk: Dictionary<ethers.BaseContract>) {
  return JSON.stringify(
    mapValues(sdk, (v) => v.address),
    null,
    2,
  )
}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
