import * as dotenv from 'dotenv'

import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'

dotenv.config()

const config: HardhatUserConfig = {
  solidity: '0.8.9',
  networks: {
    hardhat: {
      forking: {
        url: process.env.L2
          ? 'https://optimism-mainnet.infura.io/v3/90b33e5399ee4a12aabe9978fbfab011'
          : 'https://mainnet.infura.io/v3/90b33e5399ee4a12aabe9978fbfab011',
      },
    },
  },
  mocha: {
    timeout: 120_000,
  },
}

export default config
