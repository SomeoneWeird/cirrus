import inquirer from 'inquirer'

function deleteStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  inquirer.prompt([
    {
      type: 'confirm',
      name: 'ok',
      message: `Are you sure you want to delete ${stackName}?`
    }
  ], function (answers) {
    if (!answers.ok) {
      return process.exit()
    }

    const beforeDeleteDate = new Date()

    cloudformation.deleteStack({
      StackName: stackName
    }, function (err, response) {
      if (err) {
        throw new Error(err)
      }

      utils.pollEvents(stackName, 'Deleting...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'DELETE_COMPLETE' ]
      ], function (err) {
        if (err) {
          if (err.code !== 'ValidationError') {
            throw new Error(err)
          }
          process.exit()
        }

        process.exit()
      }, {
        startDate: beforeDeleteDate,
        ignoreMissing: true
      })
    })
  })
}

export default {
  name: 'delete',
  description: 'Deletes a stack',
  fn: deleteStack
}
