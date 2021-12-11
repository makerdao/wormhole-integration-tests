import { ContractFactory, Signer } from 'ethers'
import { Interface } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { join } from 'path'

export function getContractFactory<T extends ContractFactory>(name: string, signer?: Signer): T {
  const artifactsPath = join(__dirname, '../../external-artifacts')
  const artifact = require(join(artifactsPath, `${name}.json`))

  return new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer) as any
}

export type ContractLike = {
  readonly address: string
  readonly interface: Interface

  readonly signer: Signer
}

export type ContractFactoryLike = {
  interface: any
  bytecode: any
  deploy(...args: Array<any>): Promise<ContractLike>
}

export async function deployUsingFactory<T extends ContractFactoryLike>(
  signer: Signer,
  factory: T,
  args: Parameters<T['deploy']>,
): Promise<ReturnType<T['deploy']>> {
  const contractFactory = new ethers.ContractFactory(factory.interface, factory.bytecode, signer)
  const contractDeployed = await contractFactory.deploy(...(args as any))

  await contractDeployed.deployed()

  return contractDeployed as any
}
