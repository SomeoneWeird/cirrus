import inquirer from 'inquirer'

function deleteStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  inquirer.prompt([
    {
      type: 'confirm',
      name: 'ok',
      message: `Are you sure you want to delete ${stackName}?`
    },
    {
      type: 'input',
      name: 'region',
      message: 'Just confirming, which region did you want to delete this stack in?'
    }
  ], function (answers) {
    if (!answers.ok) {
      return process.exit()
    }

    if (answers.region !== argv.region) {
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'.red)
      console.error('The region you entered was different from the one you previously selected.')
      console.error('Aborted.')
      process.exit(1)
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

        console.log(`${stackName} has been deleted...`.cyan)

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
