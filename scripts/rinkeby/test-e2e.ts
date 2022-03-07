import 'dotenv/config'

import { getArbitrumTestnetSdk, getRinkebySdk } from '@dethcrypto/eth-sdk-client'
import { Provider } from '@ethersproject/providers'
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { ethers, Signer, Wallet } from 'ethers'
import { formatEther, Interface, parseEther } from 'ethers/lib/utils'
import * as hre from 'hardhat'
import { mapValues } from 'lodash'

import { getGasPriceBid, getMaxGas, getMaxSubmissionPrice } from '../../test/arbitrum'
import { deployUsingFactoryAndVerify, getContractFactory, waitForTx } from '../../test/helpers'
import { executeSpell, getAttestations, MakerSdk } from '../../test/wormhole'
import { ArbitrumL2DAIWormholeBridge__factory, WormholeOracleAuth__factory } from '../../typechain'

const bytes32 = ethers.utils.formatBytes32String
const masterDomain = 'RINKEBY-MASTER-1'

const L1_GOV_RELAY_ADDR = '0x97057eF24d3C69D974Cc5348145b7258c5a503B6'
const L2_GOV_RELAY_ADDR = '0x10039313055c5803D1820FEF2720ecC1Ff2F02f6'

const PRINT_RELAY_PARAMS = false
const EXECUTE_L1_SPELL = false

async function main() {
  const { l1Signer, l2Signer } = await setupSigners()
  const senderAddress = l1Signer.address

  const l1StartingBlock = await l1Signer.provider.getBlockNumber()
  const l2StartingBlock = await l2Signer.provider.getBlockNumber()
  console.log('Current L1 block: ', l1StartingBlock)
  console.log('Current L2 block: ', l2StartingBlock)

  const receiverPrivKey = getRequiredEnv('RECEIVER_PRIV_KEY')
  const receiver = new Wallet(receiverPrivKey, l1Signer.provider)
  const oraclePrivKey = getRequiredEnv('ORACLE_PRIV_KEY')
  const oracle = new Wallet(oraclePrivKey, l2Signer.provider)
  console.log('oracle:', oracle.address, 'receiver:', receiver.address)

  const rinkebySdk = getRinkebySdk(l1Signer)
  const arbitrumTestnetSdk = getArbitrumTestnetSdk(l2Signer)

  if (PRINT_RELAY_PARAMS) await printRelayParams(l2Signer.provider)
  if (EXECUTE_L1_SPELL) await deployAndExecuteSpell(l1Signer, rinkebySdk.maker)

  console.log(
    'Sender DAI before: ',
    formatEther(await arbitrumTestnetSdk.arbitrumDaiBridge.dai.balanceOf(senderAddress)),
  )
  console.log('Receiver DAI before: ', formatEther(await rinkebySdk.maker.dai.balanceOf(receiver.address)))

  const oracleAuth = getContractFactory<WormholeOracleAuth__factory>('WormholeOracleAuth', receiver).attach(
    '0x7FD07147305f7eCcA62d0a7737bbE0Bd8AC5359b',
  )
  const l2Bridge = getContractFactory<ArbitrumL2DAIWormholeBridge__factory>(
    'ArbitrumL2DAIWormholeBridge',
    l2Signer,
  ).attach('0xEbA80E9d7C6C2F575a642a43199e32F47Bbd1306')

  console.log('initiateWormhole...')
  const txR = await waitForTx(
    l2Bridge['initiateWormhole(bytes32,address,uint128)'](bytes32(masterDomain), receiver.address, parseEther('0.01'), {
      gasLimit: 2000000,
    }),
  )

  console.log('get PECU attestation...')
  const attestations = await getAttestations(txR, l2Bridge.interface, [oracle])

  console.log('Attestations: ', JSON.stringify(attestations))

  console.log('requestMint...')
  await waitForTx(oracleAuth.requestMint(attestations.wormholeGUID, attestations.signatures, 0, 0))
  // await waitForTx(
  //   oracleAuth.requestMint(
  //     [
  //       '0x4b4f56414e2d534c4156452d4f5054494d49534d2d3100000000000000000000',
  //       '0x4b4f56414e2d4d41535445522d31000000000000000000000000000000000000',
  //       '0x000000000000000000000000c87675d77eadcf1ea2198dc6ab935f40d76fd3e2',
  //       '0x0000000000000000000000000000000000000000000000000000000000000000',
  //       '0x016345785d8a0000',
  //       '0x018d8c',
  //       1646234074,
  //     ] as any,
  //     '0xeb0ef69460ec6fb7be08c7f314097b324ffbf52fbfc6ee3db5aefd6bb863db100a56388681566164b858c9064e32d0cae2db7fdcc955c154c918f2ce9fdaf0ae1b6dcb2cabc15980926a1495dd6ac51eca3422570292210f87b9531515ec25d66c4a3350f5b3130f6f9e294ba943aad08fc31bb0c086a8e8e9798ea38dc4d1b7391c1b607d3b5138957233cf16f94b1d43dc92f95fe33f54b2ae8d316b066cefa8bb369d6464a05a5fec691928cc96273f9ee051b20128094847c034b58f76887fda1ccfac693a6842a397a6fc219bca79ee86e7fc5baf6cd090bcf5c6e852810974af53d3e853043102f448c6ee11db0c6e52d88fbc6fbc814d74a7bb08a73c420b951c',
  //     0,
  //     0,
  //   ),
  // )

  console.log(
    'Sender DAI after: ',
    formatEther(await arbitrumTestnetSdk.arbitrumDaiBridge.dai.balanceOf(senderAddress)),
  )
  console.log('Receiver DAI after: ', formatEther(await rinkebySdk.maker.dai.balanceOf(receiver.address)))
}

async function setupSigners() {
  const l1Rpc = getRequiredEnv('RINKEBY_ARBITRUM_L1_RPC')
  const l2Rpc = getRequiredEnv('RINKEBY_ARBITRUM_L2_RPC')
  const deployerPrivKey = getRequiredEnv('RINKEBY_ARBITRUM_DEPLOYER_PRIV_KEY')
  const l1Provider = new ethers.providers.JsonRpcProvider(l1Rpc)
  const l2Provider = new ethers.providers.JsonRpcProvider(l2Rpc)

  expect((await l1Provider.getNetwork()).chainId).to.eq(4, 'Not rinkeby!')
  expect((await l2Provider.getNetwork()).chainId).to.eq(421611, 'Not arbitrum testnet!')

  const l1Signer = new ethers.Wallet(deployerPrivKey, l1Provider)
  const l2Signer = new ethers.Wallet(deployerPrivKey, l2Provider)

  return { l1Signer, l2Signer }
}

async function printRelayParams(l2Provider: Provider) {
  const l2SpellInterface = new Interface(['function execute()'])
  const l2SpellCalldata = l2SpellInterface.encodeFunctionData('execute')
  const l2MessageCalldata = new Interface([
    'function relay(address target, bytes calldata targetData)',
  ]).encodeFunctionData('relay', ['0xffffffffffffffffffffffffffffffffffffffff', l2SpellCalldata])
  const calldataLength = l2MessageCalldata.length
  const gasPriceBid = await getGasPriceBid(l2Provider)
  const maxSubmissionCost = await getMaxSubmissionPrice(l2Provider, calldataLength)
  const maxGas = await getMaxGas(
    l2Provider,
    L1_GOV_RELAY_ADDR,
    L2_GOV_RELAY_ADDR,
    L2_GOV_RELAY_ADDR,
    maxSubmissionCost,
    gasPriceBid,
    l2MessageCalldata,
  )
  const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas))

  console.log(
    'Relay params:',
    mapValues({ l1CallValue: ethValue, maxGas, gasPriceBid, maxSubmissionCost }, (bn) => bn.toString()),
  )
}

async function deployAndExecuteSpell(l1Signer: Signer, makerSdk: MakerSdk) {
  // const l1SpellInterface = new Interface(['function execute()', 'function action() view returns (address)'])
  // const l1Spell = new ethers.Contract('0xeF4382B2cC7821303B97E5b26C6e254C6b06848D', l1SpellInterface, l1Signer)
  console.log('Deploying L1 spell...')
  const SpellFactory = await hre.ethers.getContractFactory('L1RinkebyAddWormholeDomainSpell')
  const l1Spell = await deployUsingFactoryAndVerify(l1Signer, SpellFactory, [])
  console.log('L1 spell deployed at: ', l1Spell.address)

  const actionAddress = await l1Spell.action()
  const action = new ethers.Contract(
    actionAddress,
    new Interface(['function l1CallValue() view returns (uint256)']),
    l1Signer,
  )
  const l1CallValue = await action.l1CallValue()
  const l1GovDai = await l1Signer.provider!.getBalance(L1_GOV_RELAY_ADDR)
  if (l1GovDai.lt(l1CallValue)) {
    console.log(`Funding L1GovernanceRelay with ${formatEther(l1CallValue)} ETH...`)
    await waitForTx(l1Signer.sendTransaction({ to: L1_GOV_RELAY_ADDR, value: l1CallValue }))
  }

  // spell execution
  await executeSpell(l1Signer, makerSdk, l1Spell)
}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
