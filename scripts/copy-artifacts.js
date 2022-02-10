const fs = require('fs')
const { join, basename } = require('path')

function copyDappToolsArtifact(inputDirPath, name, destinationDirPath) {
  const abiFilePath = join(inputDirPath, `${name}.abi`)
  const binFilePath = join(inputDirPath, `${name}.bin`)
  console.log(`Reading dapp tools artifact ${abiFilePath}`)

  if (!fs.existsSync(abiFilePath) || !fs.existsSync(binFilePath)) {
    throw new Error(`${abiFilePath} or ${binFilePath} doesnt exist!`)
  }

  const artifact = {
    abi: JSON.parse(fs.readFileSync(abiFilePath, 'utf-8')),
    bytecode: fs.readFileSync(binFilePath, 'utf-8').trim(),
  }

  const destinationPath = join(destinationDirPath, `${name}.json`)
  console.log(`Writing to ${destinationPath}`)
  fs.writeFileSync(destinationPath, JSON.stringify(artifact, null, 2))
}

function copyHardhatArtifact(filePath, destinationDirPath, destinationFilename) {
  console.log(`Reading hardhat artifact ${filePath}`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} doesnt exist!`)
  }

  const artifact = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const destinationPath = join(destinationDirPath, destinationFilename || basename(filePath))
  console.log(`Writing to ${destinationPath}`)
  fs.writeFileSync(destinationPath, JSON.stringify(artifact, null, 2))
}

const dappToolsArtifacts = join(__dirname, '../repos/dss-wormhole/out/')
const hardhatOptimismBridgeArtifacts = join(__dirname, '../repos/optimism-dai-bridge/artifacts/contracts/')
const hardhatArbitrumBridgeArtifacts = join(__dirname, '../repos/arbitrum-dai-bridge/artifacts/contracts/')
const hardhatTestArtifacts = join(__dirname, '../artifacts/contracts')
const output = join(__dirname, '../external-artifacts')

if (!fs.existsSync(output)) {
  console.log(`Creating ${output} dir`)
  fs.mkdirSync(output)
}

copyDappToolsArtifact(dappToolsArtifacts, 'WormholeJoin', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeConstantFee', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeOracleAuth', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeRouter', output)
copyDappToolsArtifact(dappToolsArtifacts, 'BasicRelay', output)

copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l1/L1DAITokenBridge.sol/L1DAITokenBridge.json'), output)
copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l2/dai.sol/Dai.json'), output)
copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l2/L2DAITokenBridge.sol/L2DAITokenBridge.json'), output)
copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l1/L1DAIWormholeBridge.sol/L1DAIWormholeBridge.json'), output)
copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l1/L1Escrow.sol/L1Escrow.json'), output)
copyHardhatArtifact(join(hardhatOptimismBridgeArtifacts, 'l2/L2DAIWormholeBridge.sol/L2DAIWormholeBridge.json'), output)
copyHardhatArtifact(
  join(hardhatOptimismBridgeArtifacts, 'l1/L1GovernanceRelay.sol/L1GovernanceRelay.json'),
  output,
  'L1OptimismGovernanceRelay.json',
)
copyHardhatArtifact(
  join(hardhatOptimismBridgeArtifacts, 'l2/L2GovernanceRelay.sol/L2GovernanceRelay.json'),
  output,
  'L2OptimismGovernanceRelay.json',
)

copyHardhatArtifact(join(hardhatArbitrumBridgeArtifacts, 'l1/L1DaiGateway.sol/L1DaiGateway.json'), output)
copyHardhatArtifact(join(hardhatArbitrumBridgeArtifacts, 'l2/L2DaiGateway.sol/L2DaiGateway.json'), output)
copyHardhatArtifact(
  join(hardhatArbitrumBridgeArtifacts, 'l2/L2CrossDomainEnabled.sol/L2CrossDomainEnabled.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatArbitrumBridgeArtifacts, 'l1/L1DaiWormholeGateway.sol/L1DaiWormholeGateway.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatArbitrumBridgeArtifacts, 'l2/L2DaiWormholeGateway.sol/L2DaiWormholeGateway.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatArbitrumBridgeArtifacts, 'l1/L1GovernanceRelay.sol/L1GovernanceRelay.json'),
  output,
  'L1ArbitrumGovernanceRelay.json',
)
copyHardhatArtifact(
  join(hardhatArbitrumBridgeArtifacts, 'l2/L2GovernanceRelay.sol/L2GovernanceRelay.json'),
  output,
  'L2ArbitrumGovernanceRelay.json',
)

copyHardhatArtifact(join(hardhatTestArtifacts, 'test/FileJoinFeesSpell.sol/FileJoinFeesSpell.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/FileJoinLineSpell.sol/FileJoinLineSpell.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/PushBadDebtSpell.sol/PushBadDebtSpell.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/PushBadDebtSpell.sol/DaiJoinLike.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/PushBadDebtSpell.sol/VatLike.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/PushBadDebtSpell.sol/WormholeJoinLike.json'), output)

copyHardhatArtifact(
  join(hardhatTestArtifacts, 'deploy/L1AddWormholeOptimismSpell.sol/L1AddWormholeOptimismSpell.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatTestArtifacts, 'deploy/L1AddWormholeArbitrumSpell.sol/L1AddWormholeArbitrumSpell.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatTestArtifacts, 'deploy/L1ConfigureWormholeSpell.sol/L1ConfigureWormholeSpell.json'),
  output,
)
copyHardhatArtifact(
  join(hardhatTestArtifacts, 'deploy/L2AddWormholeDomainSpell.sol/L2AddWormholeDomainSpell.json'),
  output,
)
