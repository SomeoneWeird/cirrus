import spinner from 'io-spin'

import createStack from './createStack'
import updateStack from './updateStack'

function updateOrCreateStack (cloudformation, argv, utils) {
  const stackName = argv._[1]

  if (!stackName) {
    console.error('cirrus updateorcreate <stackname> --file <file> --parameters <file>')
    process.exit(1)
  }

  spinner.start('Figuring out what to do...', 'Box1')

  utils.fetchData('listStacks', 'StackSummaries', {}, function (err, stacks) {
    if (err) {
      throw new Error(err)
    }

    let stackExists = stacks.find(function (stack) {
      return stack.StackName === stackName
    })

    if (stackExists && stackExists.DeletionTime && stackExists.DeletionTime > stackExists.CreationTime) {
      // Actually deleted
      stackExists = null
    }

    let fn = stackExists ? updateStack.fn : createStack.fn

    spinner.destroy()
    process.stdout.write('\r\x1bm')

    return fn(cloudformation, argv, utils)
  })
}

export default {
  name: 'updateorcreate',
  description: 'Updates a stack if it exists or else creates it',
  fn: updateOrCreateStack
}
