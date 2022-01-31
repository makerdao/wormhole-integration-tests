async function main() {}

main()
  .then(() => console.log('DONE'))
  .catch((e) => {
    console.error('ERR', e)
    process.exit(1)
  })
