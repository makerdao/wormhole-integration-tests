import { deployWormhole } from '../test/contracts/wormhole'

async function main() {
  const wormholeJoin = deployWormhole({})
}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error('ERR', e)
    process.exit(1)
  })
