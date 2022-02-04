import { setupOptimismTests } from './optimism'
import { runWormholeTests } from './wormhole.test'
import { optimismDomain } from './wormhole/wormhole'

runWormholeTests(optimismDomain, setupOptimismTests)
