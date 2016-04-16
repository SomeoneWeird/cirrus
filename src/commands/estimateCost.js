import open from 'open'

function estimateCost (cloudformation, argv, utils) {
  utils.getParameters(function (err, file, params) {
    if (err) {
      throw err
    }

    let parameters = {
      TemplateBody: JSON.stringify(file),
      Parameters: params
    }

    utils.finalizeParams(parameters)

    cloudformation.estimateTemplateCost(parameters, function (err, response) {
      if (err) {
        throw new Error(err)
      }

      open(response.Url)
    })
  })
}

export default {
  name: 'estimate',
  description: 'Returns monthly cost estimate of stack',
  fn: estimateCost
}
