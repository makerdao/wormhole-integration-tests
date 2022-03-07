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
  const destinationPath = join(destinationDirPath, destinationFilename || basename(filePath))
  if (fs.existsSync(destinationPath)) {
    throw new Error(`${destinationPath} already exists!`)
  }

  const artifact = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  console.log(`Writing to ${destinationPath}`)
  fs.writeFileSync(destinationPath, JSON.stringify(artifact, null, 2))
}

const dappToolsArtifacts = join(__dirname, '../repos/dss-wormhole/out/')
const hardhatTestArtifacts = join(__dirname, '../artifacts/contracts')
const output = join(__dirname, '../external-artifacts')

function copyOptimismBridgeArtifact(relativePath, destinationDirPath) {
  const filePath = join(__dirname, '../repos/optimism-dai-bridge/artifacts/contracts/', relativePath)
  const destinationFilename = `Optimism${basename(filePath)}`
  copyHardhatArtifact(filePath, destinationDirPath, destinationFilename)
}
function copyArbitrumBridgeArtifact(relativePath, destinationDirPath) {
  const filePath = join(__dirname, '../repos/arbitrum-dai-bridge/artifacts/contracts/', relativePath)
  const destinationFilename = `Arbitrum${basename(filePath)}`
  copyHardhatArtifact(filePath, destinationDirPath, destinationFilename)
}

if (fs.existsSync(output)) {
  console.log(`Deleting ${output} dir`)
  fs.rmSync(output, { recursive: true, force: true })
}

console.log(`Creating ${output} dir`)
fs.mkdirSync(output)

// copy dss-wormhole artifacts
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeJoin', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeConstantFee', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeOracleAuth', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeRouter', output)
copyDappToolsArtifact(dappToolsArtifacts, 'BasicRelay', output)

// copy optimism-dai-bridge artifacts
copyOptimismBridgeArtifact('l2/dai.sol/Dai.json', output)
copyOptimismBridgeArtifact('l1/L1Escrow.sol/L1Escrow.json', output)
copyOptimismBridgeArtifact('l1/L1DAITokenBridge.sol/L1DAITokenBridge.json', output)
copyOptimismBridgeArtifact('l2/L2DAITokenBridge.sol/L2DAITokenBridge.json', output)
copyOptimismBridgeArtifact('l1/L1DAIWormholeBridge.sol/L1DAIWormholeBridge.json', output)
copyOptimismBridgeArtifact('l2/L2DAIWormholeBridge.sol/L2DAIWormholeBridge.json', output)
copyOptimismBridgeArtifact('l1/L1GovernanceRelay.sol/L1GovernanceRelay.json', output)
copyOptimismBridgeArtifact('l2/L2GovernanceRelay.sol/L2GovernanceRelay.json', output)

// copy arbitrum-dai-bridge artifacts
copyArbitrumBridgeArtifact('l2/dai.sol/Dai.json', output)
copyArbitrumBridgeArtifact('l1/L1Escrow.sol/L1Escrow.json', output)
copyArbitrumBridgeArtifact('l1/L1DaiGateway.sol/L1DaiGateway.json', output)
copyArbitrumBridgeArtifact('l2/L2DaiGateway.sol/L2DaiGateway.json', output)
copyArbitrumBridgeArtifact('l2/L2CrossDomainEnabled.sol/L2CrossDomainEnabled.json', output)
copyArbitrumBridgeArtifact('l1/L1DaiWormholeGateway.sol/L1DaiWormholeGateway.json', output)
copyArbitrumBridgeArtifact('l2/L2DaiWormholeGateway.sol/L2DaiWormholeGateway.json', output)
copyArbitrumBridgeArtifact('l1/L1GovernanceRelay.sol/L1GovernanceRelay.json', output)
copyArbitrumBridgeArtifact('l2/L2GovernanceRelay.sol/L2GovernanceRelay.json', output)

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
