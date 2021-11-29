import ethers from 'ethers'
import hre from 'hardhat'

export async function impersonateAccount(
  address: string,
  { setBalance }: { setBalance?: boolean } = {},
): Promise<ethers.Signer> {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  })

  if (setBalance) {
    await hre.network.provider.send('hardhat_setBalance', [address, '0x10000000000000000'])
  }

  const signer = await hre.ethers.getSigner(address)

  return signer
}
