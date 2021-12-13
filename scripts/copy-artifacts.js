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
const hardhatArtifacts = join(__dirname, '../repos/optimism-dai-bridge/artifacts/contracts/')
const output = join(__dirname, '../external-artifacts')

if (!fs.existsSync(output)) {
  console.log(`Creating ${output} dir`)
  fs.mkdirSync(output)
}

copyDappToolsArtifact(dappToolsArtifacts, 'WormholeJoin', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeConstantFee', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeOracleAuth', output)
copyDappToolsArtifact(dappToolsArtifacts, 'WormholeRouter', output)
copyHardhatArtifact(join(hardhatArtifacts, 'l1/L1DAIWormholeBridge.sol/L1DAIWormholeBridge.json'), output)
copyHardhatArtifact(join(hardhatArtifacts, 'l1/L1Escrow.sol/L1Escrow.json'), output)
copyHardhatArtifact(join(hardhatArtifacts, 'l2/L2DAIWormholeBridge.sol/L2DAIWormholeBridge.json'), output)
