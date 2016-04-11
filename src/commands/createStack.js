function createStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  if (!stackName) {
    console.error('cirrus create <stackname> --file <file> --parameters <file>')
    process.exit(1)
  }

  utils.getParameters(function (err, file, params, capabilities) {
    if (err) {
      throw new Error(err)
    }

    const beforeCreateDate = new Date()

    let parameters = {
      StackName: stackName,
      Parameters: params,
      TemplateBody: JSON.stringify(file)
    }

    if (capabilities) {
      parameters.Capabilities = capabilities
    }

    utils.finalizeParams(parameters)

    cloudformation.createStack(parameters, function (err, response) {
      if (err) {
        utils.checkExists(stackName, err)
        throw new Error(err)
      }

      utils.pollEvents(stackName, 'Creating...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'CREATE_COMPLETE' ]
      ], function (err) {
        if (err) {
          throw err
        }

        process.exit()
      }, {
        startDate: beforeCreateDate
      })
    })
  })
}

export default {
  name: 'create',
  description: 'Creates a stack',
  fn: createStack
}
