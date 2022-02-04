import { setupArbitrumTests } from './arbitrum'
import { runWormholeTests } from './wormhole.test'
import { arbitrumDomain } from './wormhole/wormhole'

runWormholeTests(arbitrumDomain, setupArbitrumTests)
