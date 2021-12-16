import * as dotenv from 'dotenv'

import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'

dotenv.config()

const config: HardhatUserConfig = {
  solidity: '0.8.9',
  networks: {
    defaultNetwork: {
      url: '',
    },
  },
  mocha: {
    timeout: 120_000,
  },
}

export default config
