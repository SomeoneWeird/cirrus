function accountInfo (cloudformation, argv, utils) {
  cloudformation.describeAccountLimits({}, function (err, response) {
    if (err) {
      throw new Error(err)
    }

    utils.fetchData('listStacks', 'StackSummaries', {}, function (err, stacks) {
      if (err) {
        throw new Error(err)
      }

      stacks = stacks.filter((stack) => stack.StackStatus !== 'DELETE_COMPLETE')

      console.log(`You have currently used ${stacks.length} out of ${response.AccountLimits[0].Value} stacks`)
    })
  })
}

export default {
  name: 'account',
  description: 'Returns information about your AWS account',
  fn: accountInfo
}
