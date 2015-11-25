#!/usr/bin/env node

import "colors";

import path      from "path";
import fs        from "fs";
import AWS       from "aws-sdk";
import yargs     from "yargs";
import Table     from "cli-table";
import moment    from "moment";
import open      from "open";
import columnify from "columnify";
import inquirer  from "inquirer";
import spinner   from "io-spin";
import async     from "async";

const argv = yargs
              .usage('Usage: $0 <command>')
              .command('list', 'List all non-deleted stacks')
              .command('resources', 'Returns resources for a stack')
              .command('events', 'Returns events for a stack')
              .command('account', 'Returns information about your AWS account')
              .command('estimate', 'Returns monthly cost estimate of stack')
              .command('validate', 'Validates a template')
              .command('create', 'Creates a stack')
              .command('update', 'Updates a stack')
              .command('delete', 'Deletes a stack')
              .describe('region', 'Set region')
              .describe('showdeleted', 'Show deleted stacks')
              .describe('file', 'Template file')
              .describe('parameters', 'Template file parameters')
              .describe('after', 'ISO Date to limit response data')
              .describe('before', 'ISO Date to limit response data')
              .describe('limit', 'Limit number of responses')
              .default('region', 'ap-southeast-1')
              .default('showdeleted', false)
              .alias('file', 'f')
              .alias('parameters', 'params')
              .alias('parameters', 'p')
              .demand(1, '')
              .argv;

let cmd = argv._[0];

let commands = {
  list:      listStacks,
  resources: getResources,
  events:    getEvents,
  account:   accountInfo,
  estimate:  estimateCost,
  validate:  validateTemplate,
  create:    createStack,
  update:    updateStack,
  delete:    deleteStack
}

const command = commands[cmd];

if(!command) {
  yargs.showHelp();
  process.exit();
}

if(argv.after) {
  argv.after = new Date(argv.after);
  if(argv.after.toString() == 'Invalid Date') delete argv.after;
}

if(argv.before) {
  argv.before = new Date(argv.before);
  if(argv.before.toString() == 'Invalid Date') delete argv.before;
}

if(argv.limit) {
  argv.limit = parseInt(argv.limit);
  if(isNaN(argv.limit)) delete argv.limit;
}

const cloudformation = new AWS.CloudFormation({
  region: argv.region
});

command();

function fetchData(cmd, key, data = {}, callback) {
  let out = [];
  function fetch(NextToken) {
    cloudformation[cmd](Object.assign(data, { NextToken }), function(err, response) {
      if(err) {
        return callback(err);
      }
      out = out.concat(response[key]);
      if(response.NextToken) {
        return fetch(response.NextToken);
      } else {
        return callback(null, out);
      }
    });
  }
  fetch();
}

function getTemplate(callback, ignoreParams) {

  if(!argv.file) {
    console.error("Please pass '--file <filename>'");
    process.exit(1);
  }

  if(!argv.parameters && ignoreParams !== true) {
    console.error("Please pass '--parameters <parameters file>'");
    process.exit(1);
  }

  let file, params;

  try {
    file = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), argv.file)).toString());
    if(ignoreParams !== true) {
      params = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), argv.parameters)).toString());
    }
  } catch(e) {
    console.error(`There was an error loading your template/params file: ${e}`);
    process.exit(1);
  }

  if(ignoreParams === true) {
    return callback(null, file);
  }

  // Here we check if any parameters need replacing with their actual values
  let neededStacks = [];

  for(let i = 0; i < params.length; i++) {

    let param = params[i];

    let match = param.ParameterValue.match(/<<(.+)>>/);

    if(!match) {
      continue;
    }

    let stack = match[1].split('.');

    if(stack.length !== 2) {
      console.error(`${param.ParameterKey} has an invalid interpolation value of ${param.ParameterValue}. Example: <<stackName.logicalId>>`);
      process.exit(1);
    }

    stack = stack[0];

    neededStacks.push(stack);

  }

  async.each(neededStacks, function(stack, done) {

    fetchData('listStackResources', 'StackResourceSummaries', {
      StackName: stack
    }, function(err, response) {

      if(err) {
        return done(err);
      }

      let stackKeys = params.map(param => {
        let m = param.ParameterValue.match(/<<(.+).(.+)>>/);
        if(m) return param.ParameterKey;
        return false;
      }).filter(Boolean);

      function getPhysicalId(resourceId) {
        for(let i = 0; i < response.length; i++) {
          if(response[i].LogicalResourceId == resourceId) {
            return response[i].PhysicalResourceId;
          }
        }
        throw new Error(`Stack ${stack} does not contain a resource ${resourceId}`);
      }

      for(let i = 0; i < params.length; i++) {
        if(!~stackKeys.indexOf(params[i].ParameterKey)) {
          continue;
        }
        params[i].ParameterValue = getPhysicalId(params[i].ParameterValue.match(/\.(.+)>>$/)[1]);
      }

      done();

    });

  }, function(err) {
    if(err) {
      return callback(err);
    }
    return callback(null, file, params);
  });

}

function listStacks() {

  fetchData('listStacks', 'StackSummaries', {}, function(err, stacks) {

    if(err) {
      throw new Error(err);
    }

    if(!argv.showdeleted) {
      stacks = stacks.filter(stack => stack.StackStatus !== 'DELETE_COMPLETE');
    }

    if(!stacks.length) {
      console.log(`It looks like you don't have any stacks in ${argv.region}!`);
      process.exit();
    }

    const table = new Table({
      head: [ 'Name', 'Status', 'Last Modified' ]
    });

    const potentialTimes = [
      'CreationTime',
      'LastUpdatedTime',
      'DeletionTime'
    ];

    for(let i = 0; i < stacks.length; i++) {
      let stack  = stacks[i];
      let status = stack.StackStatus;
      let last;
      for(var i = 0; i < potentialTimes.length; i++) {
        if(stack[potentialTimes[i]]) {
          last = stack[potentialTimes[i]];
          break;
        }
      }
      let now = new Date();
      let duration = moment.duration(+last - +now);
      table.push([ stack.StackName, status, `${duration.humanize()} ago` ]);
    }

    console.log(table.toString());

  });

}

function getResources() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus resources <stackname>");
    process.exit(1);
  }

  cloudformation.describeStacks({
    StackName: stackName
  }, function(err, response) {

    if(err) {
      checkExists(stackName, err);
      throw new Error(err);
    }

    cloudformation.listStackResources({
      StackName: stackName
    }, function(err, response) {

      if(err) {
        checkExists(stackName, err);
        throw new Error(err);
      }

      const table = new Table({
        head: [ 'Name', 'Type', 'Last Modified' ]
      });

      for(let i = 0; i < response.StackResourceSummaries.length; i++) {
        let resource = response.StackResourceSummaries[i];
        let now = new Date();
        let duration = moment.duration(+resource.LastUpdatedTimestamp - +now);
        table.push([
          resource.LogicalResourceId,
          resource.ResourceType,
          `${duration.humanize()} ago`
        ]);
      }

      console.log(table.toString());

    });

  });

}

function fetchEvents(StackName, callback, opts = {}) {

  fetchData('describeStackEvents', 'StackEvents', {
    StackName
  }, function(err, events) {

    if(err) {
      if(opts.ignoreMissing !== true)
        checkExists(StackName, err);
      return callback(err);
    }

    let after  = argv.after || opts.after;
    let before = argv.before || opts.before;

    if(after) {
      events = events.filter(event => event.Timestamp >= after);
    }

    if(before) {
      events = events.filter(event => event.Timestamp <= before);
    }

    events = events.sort((a, b) => a.Timestamp - b.Timestamp);

    return callback(null, events);

  });

}

function getEvents() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus events <stackname>");
    process.exit(1);
  }

  fetchEvents(stackName, function(err, events) {

    if(err) {
      checkExists(stackName, err);
      throw new Error(err);
    }

    logEvents(events);

  });

}

function accountInfo() {

  cloudformation.describeAccountLimits({}, function(err, response) {

    if(err) {
      throw new Error(err);
    }

    fetchData('listStacks', 'StackSummaries', {}, function(err, stacks) {

      if(err) {
        throw new Error(err);
      }

      stacks = stacks.filter(stack => stack.StackStatus !== 'DELETE_COMPLETE');

      console.log(`You have currently used ${stacks.length} out of ${response.AccountLimits[0].Value} stacks`);

    });

  });

}

function estimateCost() {

  getTemplate(function(err, file, params) {

    if(err) {
      throw err;
    }

    cloudformation.estimateTemplateCost({
      TemplateBody: JSON.stringify(file),
      Parameters:   params
    }, function(err, response) {

      if(err) {
        throw new Error(err);
      }

      open(response.Url);

    });

  });

}

function validateTemplate() {

  getTemplate(function(err, file) {

    if(err) {
      throw err;
    }

    cloudformation.validateTemplate({
      TemplateBody: JSON.stringify(file)
    }, function(err, response) {

      if(err) {
        if(err.code !== 'ValidationError')
          throw new Error(err);
        console.error(`Error: ${err.toString()}`);
        console.error(' ✖  Template failed to validate'.red);
        process.exit(1);
      }

      console.log(" ✓  Template validated successfully".green);

    });

  }, true);

}

function deleteStack() {

  const stackName = argv._[1];

  inquirer.prompt([
    {
      type: "confirm",
      name: "ok",
      message: `Are you sure you want to delete ${stackName}?`
    }
  ], function(answers) {

    if(!answers.ok) {
      return process.exit();
    }

    const beforeDeleteDate = new Date();

    cloudformation.deleteStack({
      StackName: stackName
    }, function(err, response) {

      if(err) {
        throw new Error(err);
      }

      pollEvents(stackName, 'Deleting...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'DELETE_COMPLETE' ]
      ], function(err) {

        if(err) {
          if(err.code !== 'ValidationError')
            throw new Error(err);
          process.exit();
        }

        process.exit();

      }, {
        startDate:     beforeDeleteDate,
        ignoreMissing: true
      });

    });

  });

}

function createStack() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus create <stackname> --file <file> --parameters <file>");
    process.exit(1);
  }

  getTemplate(function(err, file, params) {

    if(err) {
      throw new Error(err);
    }

    const beforeCreateDate = new Date();

    cloudformation.createStack({
      StackName:    stackName,
      Parameters:   params,
      TemplateBody: JSON.stringify(file)
    }, function(err, response) {

      if(err) {
        checkExists(stackName, err);
        throw new Error(err);
      }

      pollEvents(stackName, 'Creating...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'CREATE_COMPLETE' ]
      ], function(err) {

        if(err) {
          throw err;
        }

        process.exit();

      }, {
        startDate: beforeCreateDate
      });

    });

  });

}

function updateStack() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus update <stackname> --file <file> --parameters <file>");
    process.exit(1);
  }

  getTemplate(function(err, file, params) {

    const beforeUpdateDate = new Date();

    cloudformation.updateStack({
      StackName:    stackName,
      Parameters:   params,
      TemplateBody: JSON.stringify(file)
    }, function(err, response) {

      if(err) {
        checkExists(stackName, err);
        if(~err.toString().indexOf('No updates')) {
          console.log(` ${'✓'.green}  No changes`);
          process.exit();
        }
        if(~err.toString().indexOf('IN_PROGRESS')) {
          console.log(` ${'!'.yellow} Stack is in the middle of another update. Use 'cirrus events ${stackName}' to see events.`);
          process.exit();
        }
        throw new Error(err);
      }

      pollEvents(stackName, 'Updating...', [
        [ 'LogicalResourceId', stackName ],
        [ 'ResourceStatus', 'UPDATE_COMPLETE' ]
      ], function(err) {

        if(err) {
          throw err;
        }

        process.exit();

      }, {
        startDate: beforeUpdateDate
      });

    });

  });

}

function logEvents(events) {

  events = events.map(function(event) {

    let ok = '?';

    if(~event.ResourceStatus.indexOf("COMPLETE")) {
      ok = '✓'.green;
    } else if(~event.ResourceStatus.indexOf("FAILED")) {
      ok = '✖'.red;
    } else if(~event.ResourceStatus.indexOf("IN_PROGRESS")) {
      ok = '*'.yellow;
    }

    let out = {
      ts: `[${event.Timestamp}]`,
      ok,
      id: event.LogicalResourceId,
      status: `- ${event.ResourceStatus}`
    }

    if(event.ResourceStatusReason) {
      out.reason = ` (${event.ResourceStatusReason})`;
    }

    return out;

  });

  if(argv.limit) {
    events = events.slice(events.length - argv.limit, events.length);
  }

  console.log(columnify(events, {
    showHeaders: false
  }));

}

function pollEvents(stackName, actionName, matches, callback, opts = {}) {

  function checkEvents(lastDate) {

    const now = new Date();

    fetchEvents(stackName, function(err, events) {

      if(err) {
        return callback(err);
      }

      if(lastDate) {
        events = events.filter(event => event.Timestamp > lastDate);
      }

      if(!events.length) {
        return next();
      }

      spinner.destroy();

      process.stdout.write('\r\x1bm')

      logEvents(events);

      spinner.start(actionName, 'Box1');

      for(let i = 0; i < events.length; i++) {
        if(matches.every(function(match) {
          return events[i][match[0]] === match[1];
        })) {
          spinner.destroy();
          return callback();
        }
      }

      return next();

      function next() {

        setTimeout(() => {
          checkEvents(now);
        }, 1000);

      }

    }, opts);

  }

  spinner.start(actionName, 'Box1');

  checkEvents(opts.startDate);

}

function checkExists(stackName, err) {
  if(err && ~err.toString().indexOf("does not exist")) {
    console.error(`${stackName} does not exist in ${argv.region}`);
    process.exit(1);
  }
}
