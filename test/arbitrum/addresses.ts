export function getArbitrumAddresses() {
  return {
    l1: {
      inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e', // real inbox
      fake_inbox: '0x0495dF1ed467FeeCe56D36866acb3348BE407b9D', // modified inbox allowing arbitrary L2>L1 message passing without delay
    },
  }
}

export type ArbitrumAddresses = ReturnType<typeof getArbitrumAddresses>
