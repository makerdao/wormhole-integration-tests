import * as dotenv from 'dotenv'

import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

dotenv.config()

const config: HardhatUserConfig = {
  solidity: '0.8.9',
  networks: {
    // we don't use default network so this should make it unusable to prevent any accidental use
    defaultNetwork: {
      url: '',
    },
    hardhat: {
      // prevents gas estimations problems
      gas: 'auto',
    },
  },
  mocha: {
    timeout: 5000_000,
  },
}

export default config
