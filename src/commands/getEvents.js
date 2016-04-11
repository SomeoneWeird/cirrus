function getEvents (cloudformation, argv, utils) {
  const stackName = argv._[1]

  if (!stackName) {
    console.error('cirrus events <stackname>')
    process.exit(1)
  }

  utils.fetchEvents(stackName, function (err, events) {
    if (err) {
      utils.checkExists(stackName, err)
      throw new Error(err)
    }

    utils.logEvents(events)
  })
}

export default {
  name: 'events',
  description: 'Returns events for a stack',
  fn: getEvents
}
