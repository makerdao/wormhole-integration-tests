import ethers from 'ethers'
import hre from 'hardhat'

import { AnyNumber, toMyBigNumber, toWad } from './numeric'

export async function impersonateAccount(
  address: string,
  provider: ethers.providers.JsonRpcProvider = hre.ethers.provider,
): Promise<ethers.Signer> {
  await provider.send('hardhat_impersonateAccount', [address])

  await mintEther(address, provider)

  const signer = provider.getSigner(address)

  return signer
}

export async function mintEther(
  address: string,
  provider: ethers.providers.JsonRpcProvider = hre.ethers.provider,
  amt: AnyNumber = toWad(100),
): Promise<void> {
  await provider.send('hardhat_setBalance', [address, '0x' + toMyBigNumber(amt).toString(16)])
}
