function updateStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  if (!stackName) {
    console.error('cirrus update <stackname> --file <file> --parameters <file>')
    process.exit(1)
  }

  utils.getParameters(function (err, file, params, capabilities) {
    if (err) {
      throw new Error(err)
    }

    const beforeUpdateDate = new Date()

    let parameters = {
      StackName: stackName,
      Parameters: params,
      TemplateBody: JSON.stringify(file)
    }

    if (capabilities) {
      parameters.Capabilities = capabilities
    }

    utils.finalizeParams(parameters)

    cloudformation.updateStack(parameters, function (err, response) {
      if (err) {
        utils.checkExists(stackName, err)
        if (~err.toString().indexOf('No updates')) {
          console.log(` ${'✓'.green}  No changes`)
          process.exit()
        }
        if (~err.toString().indexOf('IN_PROGRESS')) {
          console.log(` ${'!'.yellow} Stack is in the middle of another update. Use 'cirrus events ${stackName}' to see events.`)
          process.exit()
        }
        throw new Error(err)
      }

      utils.pollEvents(stackName, 'Updating...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'UPDATE_COMPLETE' ]
      ], function (err) {
        if (err) {
          throw err
        }

        process.exit()
      }, {
        startDate: beforeUpdateDate
      })
    })
  })
}

export default {
  name: 'update',
  description: 'Updates a stack',
  fn: updateStack
}
