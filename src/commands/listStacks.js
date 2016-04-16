import Table from 'cli-table'
import moment from 'moment'

function listStacks (cloudformation, argv, utils) {
  utils.fetchData('listStacks', 'StackSummaries', {}, function (err, stacks) {
    if (err) {
      throw new Error(err)
    }

    if (!argv.showdeleted) {
      stacks = stacks.filter((stack) => stack.StackStatus !== 'DELETE_COMPLETE')
    }

    if (!stacks.length) {
      console.log(`It looks like you don't have any stacks in ${argv.region}!`)
      process.exit()
    }

    const table = new Table({
      head: [ 'Name', 'Status', 'Last Modified' ]
    })

    for (let i = 0; i < stacks.length; i++) {
      let stack = stacks[i]
      let status = stack.StackStatus
      let last = stack.CreationTime || stack.LastUpdatedTime || stack.DeletionTime
      let now = new Date()
      let duration = last ? moment.duration(+last - +now).humanize() + ' ago' : 'Unable to determine'
      table.push([ stack.StackName, status, duration ])
    }

    console.log(table.toString())
  })
}

export default {
  name: 'list',
  description: 'List all non-deleted stacks',
  fn: listStacks
}
