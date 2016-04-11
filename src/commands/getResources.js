import Table from 'cli-table'
import moment from 'moment'

function getResources (cloudformation, argv, utils) {
  const stackName = argv._[1]

  if (!stackName) {
    console.error('cirrus resources <stackname>')
    process.exit(1)
  }

  cloudformation.describeStacks({
    StackName: stackName
  }, function (err, response) {
    if (err) {
      utils.checkExists(stackName, err)
      throw new Error(err)
    }

    cloudformation.listStackResources({
      StackName: stackName
    }, function (err, response) {
      if (err) {
        utils.checkExists(stackName, err)
        throw new Error(err)
      }

      const table = new Table({
        head: [ 'Name', 'Type', 'Last Modified' ]
      })

      for (let i = 0; i < response.StackResourceSummaries.length; i++) {
        let resource = response.StackResourceSummaries[i]
        let now = new Date()
        let duration = moment.duration(+resource.LastUpdatedTimestamp - +now)
        table.push([
          resource.LogicalResourceId,
          resource.ResourceType,
          `${duration.humanize()} ago`
        ])
      }

      console.log(table.toString())
    })
  })
}

export default {
  name: 'resouces',
  description: 'Returns resources for a stack',
  fn: getResources
}
