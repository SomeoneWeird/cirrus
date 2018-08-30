import spinner from 'io-spin'
import async from 'async'

function stopSpinner () {
  spinner.destroy()
  process.stdout.write('\r\x1bm')
}

function diffStack (cloudformation, argv, utils) {
  function displayDiffs (response) {
    if (argv.raw) {
      console.log(JSON.stringify(response, null, 2))
      return
    }

    for (let i = 0; i < response.Changes.length; i++) {
      let change = response.Changes[i].ResourceChange
      let action = change.Action

      let colour

      switch (action) {
        case 'Add': {
          colour = 'green'
          break
        }
        case 'Modify': {
          colour = 'yellow'
          break
        }
        case 'Remove': {
          colour = 'red'
          break
        }
      }

      console.log(`---- ${change.LogicalResourceId}`[colour])
      console.log('  Action:', `${action}`[colour])
      console.log('  Type:', change.ResourceType.substr(5).replace(/::/g, ' '))

      if (change.PhysicalResourceId) {
        console.log('  Resource ID:', change.PhysicalResourceId)
      }

      if (action === 'Modify') {
        let replace = change.Replacement
        console.log('  Replacement:', replace)
        console.log('  ----- Modifications')
        let details = change.Details
        for (let j = 0; j < details.length; j++) {
          let detail = details[j]
          if (detail.ChangeSource === 'ParameterReference') {
            continue
          }
          console.log(`    - ${detail.Target.Name}`)
        }
      }
    }
  }

  function deleteStack () {
    cloudformation.deleteChangeSet({
      ChangeSetName,
      StackName: stackName
    }, function (err) {
      stopSpinner()

      if (err) {
        console.error('There was an error cleaning up your stack diff.')
        console.error('You may have to delete it manually from the AWS console.')
        console.error('Look for changeset:', ChangeSetName)
        console.error('AWS Returned:', err.toString())
        process.exit(1)
      }

      process.exit()
    })
  }

  const stackName = argv._[1]

  const ChangeSetName = `${stackName}${Date.now()}`

  if (!stackName) {
    console.error('cirrus diff <stackname> --file <file> --parameters <file>')
    process.exit(1)
  }

  utils.getParameters(function (err, file, params, capabilities) {
    if (err) {
      throw err
    }

    spinner.start('Creating stack diff...', 'Box1')

    let parameters = {
      ChangeSetName,
      StackName: stackName,
      Parameters: params,
      TemplateBody: JSON.stringify(file)
    }

    if (capabilities) {
      parameters.Capabilities = capabilities
    }

    utils.finalizeParams(parameters)

    cloudformation.createChangeSet(parameters, function (err, response) {
      if (err) {
        throw new Error(err)
      }

      async.whilst(function (response) {
        if (!response) {
          return true
        }

        // Still creating...
        return response.Status === 'CREATE_IN_PROGRESS'
      }, function (done) {
        setTimeout(function () {
          cloudformation.describeChangeSet({
            ChangeSetName,
            StackName: stackName
          }, function (err, response) {
            if (err) {
              return done(err)
            }

            return done(null, response)
          })
        }, 5000)
      }, function (err, response) {
        if (err) {
          throw new Error(err)
        }

        if (response.Status === 'FAILED' && response.StatusReason === "The submitted information didn't contain changes. Submit different information to create a change set.") {
          console.log('No Differences!')
          deleteStack()
        } else if (response.Status !== 'CREATE_COMPLETE') {
          stopSpinner()
          console.error('There was an error creating your stack diff.')
          console.error('Have a look at the AWS console for more details')
          console.error('ChangeSet Name:', ChangeSetName)
          console.error('Error:', response.StatusReason)
          process.exit(1)
        } else {
          displayDiffs(response)
          deleteStack()
        }
      })
    })
  })
}

export default {
  name: 'diff',
  description: 'Creates a changeset and shows you the difference',
  fn: diffStack
}
