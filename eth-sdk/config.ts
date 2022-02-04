import { defineConfig } from '@dethcrypto/eth-sdk'

export default defineConfig({
  contracts: {
    mainnet: {
      vat: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
      dai_join: '0x9759A6Ac90977b93B58547b4A71c78317f391A28',
      vow: '0xA950524441892A31ebddF91d3cEEFa04Bf454466',
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      pause_proxy: '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB',
      esm: '0x29CfBd381043D00a98fD9904a431015Fef07af2f',
      optimism: {
        xDomainMessenger: '0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1',
        l1StandardBridge: '0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1',
      },
    },

    optimism: {
      dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      governanceRelay: '0x10E6593CDda8c58a1d0f14C5164B376352a55f2F',
      optimism: {
        xDomainMessenger: '0x4200000000000000000000000000000000000007',
        l2StandardBridge: '0x4200000000000000000000000000000000000010',
      },
    },

    // needed for kovan test deployment
    kovan: {
      vat: '0xbA987bDB501d131f766fEe8180Da5d81b34b69d9',
      dai_join: '0x5AA71a3ae1C0bd6ac27A1f28e1415fFFB6F15B8c',
      vow: '0x0F4Cbe6CBA918b7488C26E29d9ECd7368F38EA3b',
      dai: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
      pause_proxy: '0x0e4725db88Bb038bBa4C4723e91Ba183BE11eDf3',
      esm: '0xD5D728446275B0A12E4a4038527974b92353B4a9',
      l1Escrow: '0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65',
      optimism: {
        xDomainMessenger: '0x4361d0F75A0186C05f971c566dC6bEa5957483fD',
        l1StandardBridge: '0x22F24361D548e5FaAfb36d1437839f080363982B',
        stateCommitmentChain: '0xD7754711773489F31A0602635f3F167826ce53C5',
      },
    },

    optimismKovan: {
      dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      governanceRelay: '0x10E6593CDda8c58a1d0f14C5164B376352a55f2F',
      optimism: {
        xDomainMessenger: '0x4200000000000000000000000000000000000007',
        l2StandardBridge: '0x4200000000000000000000000000000000000010',
      },
    },

    rinkeby: {
      vat: '0x66b3D63621FDD5967603A824114Da95cc3A35107',
      dai_join: '0x6a4017c221335db1eD44C89C3d12841924EeCB79',
      vow: '0xD9dFdf1f1604eF572EFd9c8c2e5c6DDca659150A',
      pause_proxy: '0x4463830546A8cFcFa1b6Eb660Df17A29a4F4e06F',
      dai: '0x17B729a6Ac1f265090cbb4AecBdd53E34664C00e',
      fake_bridge: '0xc710c7eed1f6d29bc4251c1064f5b27824af72b8', // modified arbitrum bridge allowing arbitrary L2>L1 message passing without delay
    },
  },
})
