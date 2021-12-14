import { defineConfig } from '@dethcrypto/eth-sdk'

export default defineConfig({
  contracts: {
    mainnet: {
      vat: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
      dai_join: '0x9759A6Ac90977b93B58547b4A71c78317f391A28',
      vow: '0xA950524441892A31ebddF91d3cEEFa04Bf454466',
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      pause_proxy: '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB',
      optimism: {
        xDomainMessenger: '0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1',
        l1StandardBridge: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1',
      },
    },
  },
})
