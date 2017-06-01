import inquirer from 'inquirer'

function cancelUpdateStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  inquirer.prompt([
    {
      type: 'confirm',
      name: 'ok',
      message: `Are you sure you want to cancel an update on ${stackName}?`
    }
  ], function (answers) {
    if (!answers.ok) {
      return process.exit()
    }

    const beforeCancelDate = new Date()

    cloudformation.cancelUpdateStack({
      StackName: stackName
    }, function (err, response) {
      if (err) {
        throw new Error(err)
      }

      utils.pollEvents(stackName, 'Canceling...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'CANCEL_COMPLETE' ]
      ], function (err) {
        if (err) {
          if (err.code !== 'ValidationError') {
            throw new Error(err)
          }
          process.exit()
        }

        console.log(` ${stackName} update has been canceled...`.cyan)

        process.exit()
      }, {
        startDate: beforeCancelDate,
        ignoreMissing: true
      })
    })
  })
}

export default {
  name: 'cancel',
  description: 'Cancels an update on the specified stack',
  fn: cancelUpdateStack
}
