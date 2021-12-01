import ethers from 'ethers'
import hre from 'hardhat'

export async function impersonateAccount(
  address: string,
  provider: ethers.providers.JsonRpcProvider = hre.ethers.provider,
): Promise<ethers.Signer> {
  await provider.send('hardhat_impersonateAccount', [address])

  await provider.send('hardhat_setBalance', [address, '0x10000000000000000'])

  const signer = provider.getSigner(address)

  return signer
}
