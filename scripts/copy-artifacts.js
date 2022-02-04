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

function copyHardhatArtifact(filePath, destinationDirPath) {
  console.log(`Reading hardhat artifact ${filePath}`)
  const nameWithExtension = basename(filePath)

  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} doesnt exist!`)
  }

  const artifact = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const destinationPath = join(destinationDirPath, nameWithExtension)
  console.log(`Writing to ${destinationPath}`)
  fs.writeFileSync(destinationPath, JSON.stringify(artifact, null, 2))
}

const dappToolsArtifacts = join(__dirname, '../repos/dss-wormhole/out/')
const hardhatBridgeArtifacts = join(__dirname, '../repos/optimism-dai-bridge/artifacts/contracts/')
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
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l1/L1DAITokenBridge.sol/L1DAITokenBridge.json'), output)
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l2/dai.sol/Dai.json'), output)
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l2/L2DAITokenBridge.sol/L2DAITokenBridge.json'), output)
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l1/L1DAIWormholeBridge.sol/L1DAIWormholeBridge.json'), output)
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l1/L1Escrow.sol/L1Escrow.json'), output)
copyHardhatArtifact(join(hardhatBridgeArtifacts, 'l2/L2DAIWormholeBridge.sol/L2DAIWormholeBridge.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/TestBadDebtPushSpell.sol/TestBadDebtPushSpell.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/TestBadDebtPushSpell.sol/DaiJoinLike.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/TestBadDebtPushSpell.sol/VatLike.json'), output)
copyHardhatArtifact(join(hardhatTestArtifacts, 'test/TestBadDebtPushSpell.sol/WormholeJoinLike.json'), output)
copyHardhatArtifact(
  join(hardhatTestArtifacts, 'deploy/L1AddWormholeDomainSpell.sol/L1AddWormholeDomainSpell.json'),
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
