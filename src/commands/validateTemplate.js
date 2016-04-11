function validateTemplate (cloudformation, argv, utils) {
  utils.getParameters(function (err, file) {
    if (err) {
      throw err
    }

    cloudformation.validateTemplate({
      TemplateBody: JSON.stringify(file)
    }, function (err, response) {
      if (err) {
        if (err.code !== 'ValidationError') {
          throw new Error(err)
        }
        console.error(`Error: ${err.toString()}`)
        console.error(' ✖  Template failed to validate'.red)
        process.exit(1)
      }

      console.log(' ✓  Template validated successfully'.green)
    })
  }, true)
}

export default {
  name: 'validate',
  description: 'Validates a template',
  fn: validateTemplate
}
