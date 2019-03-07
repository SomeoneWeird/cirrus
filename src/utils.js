import fs from 'fs'
import path from 'path'
import async from 'async'
import AWS from 'aws-sdk'
import inquirer from 'inquirer'
import spinner from 'io-spin'
import columnify from 'columnify'
import moment from 'moment'

export default function (argv, cloudformation) {
  function fetchData (cmd, key, data = {}, callback) {
    let out = []
    function fetch (NextToken) {
      cloudformation[cmd](Object.assign(data, { NextToken }), function (err, response) {
        if (err) {
          return callback(err)
        }
        out = out.concat(response[key])
        if (response.NextToken) {
          return fetch(response.NextToken)
        } else {
          return callback(null, out)
        }
      })
    }
    fetch()
  }

  function finalizeParams (params) {
    // TODO: We can do a bunch of other validation here
    params.Parameters = objToCFParams(params.Parameters)
  }

  function cfParamsToObj (params) {
    console.warn('Using the cloudformation style parameters (ParameterKey/ParameterValue) is now deprecated, please convert your params file to plain key/value object')
    console.warn('[ { ParameterKey: "hello", ParameterValue: "world" } ] -> { hello: "world" }')
    let out = {}
    for (let i = 0; i < params.length; i++) {
      let param = params[i]
      out[param.ParameterKey] = param.ParameterValue
    }
    return out
  }

  function objToCFParams (obj) {
    let out = []
    for (let k in obj) {
      out.push({
        ParameterKey: k,
        ParameterValue: obj[k]
      })
    }
    return out
  }

  function getParameters (callback, ignoreParams) {
    if (!argv.file) {
      console.error("Please pass '--file <filename>'")
      process.exit(1)
    }

    if (!argv.parameters && ignoreParams !== true) {
      console.error('Please pass \'--parameters <parameters file>\'')
      process.exit(1)
    }

    let file, params, capabilities

    try {
      file = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), argv.file)).toString())
      if (ignoreParams !== true) {
        params = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), argv.parameters)).toString())
      }
    } catch (e) {
      console.log(file)
      console.log(params)
      console.error(`There was an error loading your template/params file: ${e}`)
      process.exit(1)
    }

    if (argv.capabilities) {
      capabilities = argv.capabilities
    }

    if (ignoreParams === true) {
      return callback(null, file)
    }

    // Here we check if any parameters need replacing with their actual values
    let neededKms = {}
    let neededStacks = []
    let neededPrompts = []
    let neededPasswords = []
    let neededDateTimes = []

    if (Array.isArray(params)) {
      params = cfParamsToObj(params)
    }

    for (let key in params) {
      let value = params[key]

      // Exit nicely if value is not a string instead of crashing on value.match()
      if (typeof value !== 'string') {
        console.error(`Invalid parameter type: ${key} value is a ${typeof value}. Only strings are allowed in parameters file.`)
        process.exit(1)
      }

      let match = value.match(/<<(.+)>>/)

      if (!match) {
        continue
      }

      match = match[1]

      if (match === 'prompt') {
        neededPrompts.push(key)
        continue
      }

      if (match === 'password') {
        neededPasswords.push(key)
        continue
      }

      let kmsMatch = match.match(/kms: (.+)/)
      if (kmsMatch) {
        let cipherText = kmsMatch[1]
        neededKms[key] = cipherText
        continue
      }

      let dateTimeMatch = match.match(/currentDate: (.+)/)
      if (dateTimeMatch) {
        let timeFormat = dateTimeMatch[1]
        neededDateTimes[key] = timeFormat
        continue
      }

      let stack = match.split('.')

      if (stack.length !== 2) {
        console.error(`${key} has an invalid interpolation value of ${value}. Example: <<stackName.logicalId>>`)
        process.exit(1)
      }

      stack = stack[0]

      neededStacks.push(stack)
    }

    for (const k of Object.keys(neededDateTimes)) {
      params[k] = moment.utc().format(neededDateTimes[k])
    }

    async.eachOf(neededKms, function (cipherText, pKey, callback) {
      decrypt(cipherText, pKey, function (err, plainText) {
        if (err) return callback(err)
        params[pKey] = plainText
        callback()
      })
    }, function (err) {
      if (err) {
        throw new Error('Could not decrypt all keys')
      }

      async.each(neededStacks, function (stack, done) {
        fetchData('listStackResources', 'StackResourceSummaries', {
          StackName: stack
        }, function (err, response) {
          if (err) {
            return done(err)
          }

          function getPhysicalId (resourceId) {
            for (let i = 0; i < response.length; i++) {
              if (response[i].LogicalResourceId === resourceId) {
                return response[i].PhysicalResourceId
              }
            }
            throw new Error(`Stack ${stack} does not contain a resource ${resourceId}`)
          }

          for (let key in params) {
            let value = params[key]
            let m = value.match(/<<(.+)>>/)
            let pair = m ? m[1].split('.') : false
            if (pair && pair[0] === stack) {
              params[key] = getPhysicalId(pair[1])
            }
          }

          done()
        })
      }, function (err) {
        if (err) {
          return callback(err)
        }
        if (!neededPrompts.length && !neededPasswords.length && !neededKms.length) return fin()
        function rKey (type) {
          return function (key) {
            return {
              type,
              name: key,
              message: `What would you like ${key} to be set to?`
            }
          }
        }

        let questions = neededPrompts.map(rKey('input'))
        questions = questions.concat(neededPasswords.map(rKey('password')))
        inquirer.prompt(questions, function (answers) {
          for (let k in answers) {
            for (let pkey in params) {
              if (pkey === k) {
                params[pkey] = answers[k]
                break
              }
            }
          }
          fin()
        })
        function fin () {
          return callback(null, file, params, capabilities)
        }
      })
    })
  }

  function decrypt (cipherText, key, callback) {
    let blob = Buffer.from(cipherText, 'base64')
    let kms = new AWS.KMS({region: argv.region})
    kms.decrypt({CiphertextBlob: blob}, function (err, data) {
      if (err) {
        throw new Error(`Could not decrypt value for ${key}: ${err}`)
      }
      callback(null, data.Plaintext.toString())
    })
  }

  function checkExists (stackName, err) {
    if (err && ~err.toString().indexOf('does not exist')) {
      console.error(`${stackName} does not exist in ${argv.region}`)
      process.exit(1)
    }
  }

  function fetchEvents (StackName, callback, opts = {}) {
    fetchData('describeStackEvents', 'StackEvents', {
      StackName
    }, function (err, events) {
      if (err) {
        if (opts.ignoreMissing !== true) {
          checkExists(StackName, err)
        }
        return callback(err)
      }

      let after = argv.after || opts.after
      let before = argv.before || opts.before

      if (after) {
        events = events.filter((event) => event.Timestamp >= after)
      }

      if (before) {
        events = events.filter((event) => event.Timestamp <= before)
      }

      events = events.sort((a, b) => a.Timestamp - b.Timestamp)

      return callback(null, events)
    })
  }

  function logEvents (events) {
    events = events.map(function (event) {
      let ok = '?'

      if (~event.ResourceStatus.indexOf('COMPLETE')) {
        ok = '✓'.green
      } else if (~event.ResourceStatus.indexOf('FAILED')) {
        ok = '✖'.red
      } else if (~event.ResourceStatus.indexOf('IN_PROGRESS')) {
        ok = '*'.yellow
      }

      let out = {
        ts: `[${event.Timestamp}]`,
        ok,
        id: event.LogicalResourceId,
        status: `- ${event.ResourceStatus}`
      }

      if (event.ResourceStatusReason) {
        out.reason = ` (${event.ResourceStatusReason})`
      }

      return out
    })

    if (argv.limit) {
      events = events.slice(events.length - argv.limit, events.length)
    }

    console.log(columnify(events, {
      showHeaders: false
    }))
  }

  function pollEvents (stackName, actionName, matches, callback, opts = {}) {
    const failureMatches = [
      [ 'LogicalResourceId', stackName ],
      [ 'ResourceStatus', 'ROLLBACK_COMPLETE' ]
    ]
    const failureCallback = function (err) {
      if (err) {
        throw err
      }
      console.log(`${stackName} failed!`.red)
      process.exit()
    }

    function checkEvents (lastDate) {
      const now = new Date()

      fetchEvents(stackName, function (err, events) {
        if (err) {
          return callback(err)
        }

        if (lastDate) {
          events = events.filter((event) => event.Timestamp > lastDate)
        }

        if (!events.length) {
          return next()
        }

        spinner.destroy()

        process.stdout.write('\r\x1bm')

        logEvents(events)

        spinner.start(actionName, 'Box1')

        for (let i = 0; i < events.length; i++) {
          if (matches.every(function (match) {
            return events[i][match[0]] === match[1]
          })) {
            spinner.destroy()
            return callback()
          }
          if (failureMatches.every(function (match) {
            return events[i][match[0]] === match[1]
          })) {
            spinner.destroy()
            return failureCallback()
          }
        }



        return next()

        function next () {
          setTimeout(() => {
            checkEvents(now)
          }, 5000)
        }
      }, opts)
    }

    spinner.start(actionName, 'Box1')

    checkEvents(opts.startDate)
  }

  return {
    fetchData,
    finalizeParams,
    cfParamsToObj,
    objToCFParams,
    getParameters,
    checkExists,
    fetchEvents,
    logEvents,
    pollEvents
  }
}
