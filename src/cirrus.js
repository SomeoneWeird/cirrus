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

const argv = yargs
              .usage('Usage: $0 <command>')
              .command('list', 'List all non-deleted stacks')
              .command('getresources', 'Returns resources for a stack')
              .command('getevents', 'Returns events for a stack')
              .command('account', 'Returns information about your AWS account')
              .command('estimate', 'Returns monthly cost estimate of stack')
              .command('validate', 'Validates a template')
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
  list:         listStacks,
  getresources: getResources,
  getevents:    getEvents,
  account:      accountInfo,
  estimate:     estimateCost,
  validate:     validateTemplate
}

if(!~Object.keys(commands).indexOf(cmd)) {
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

commands[cmd]();

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

function getTemplate(ignoreParams) {

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
    file = JSON.parse(fs.readFileSync(path.resolve(__dirname, argv.file)).toString());
    if(ignoreParams !== true) {
      params = JSON.parse(fs.readFileSync(path.resolve(__dirname, argv.parameters)).toString());
    }
  } catch(e) {
    console.error(`There was an error loading your template/params file: ${e}`);
    process.exit(1);
  }

  let o = {
    file
  }

  if(ignoreParams !== true) {
    o.params = params;
  }

  return o;

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

    for(let i = 0; i < stacks.length; i++) {
      let stack  = stacks[i];
      let status = stack.StackStatus;
      let last = stack.LastUpdatedTime;
      switch(stack.StackStatus) {
        case "UPDATE_COMPLETE": {
          break;
        }
        case "CREATE_COMPLETE": {
          last = stack.CreationTime;
          break;
        }
        case "DELETE_COMPLETE": {
          last = stack.DeletionTime;
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
    console.error("cirrus getresources <stackname>");
    process.exit(1);
  }

  cloudformation.describeStacks({
    StackName: stackName
  }, function(err, response) {

    if(err) {
      if(~err.toString().indexOf("does not exist")) {
        console.error(`${stackName} does not exist in ${argv.region}`);
        process.exit(1);
      }
      throw new Error(err);
    }

    cloudformation.listStackResources({
      StackName: stackName
    }, function(err, response) {

      if(err) {
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

function getEvents() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus getresources <stackname>");
    process.exit(1);
  }

  fetchData('describeStackEvents', 'StackEvents', {
    StackName: stackName
  }, function(err, events) {

    if(err) {
      throw new Error(err);
    }

    if(argv.after) {
      events = events.filter(event => event.Timestamp >= argv.after);
    }

    if(argv.before) {
      events = events.filter(event => event.Timestamp <= after.before);
    }

    events = events.sort((a, b) => a.Timestamp - b.Timestamp);

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
    }))

  });

}

function accountInfo() {

  cloudformation.describeAccountLimits({}, function(err, response) {

    if(err) {
      throw new Error(err);
    }

    fetchStacks(function(err, stacks) {

      if(err) {
        throw new Error(err);
      }

      stacks = stacks.filter(stack => stack.StackStatus !== 'DELETE_COMPLETE');

      console.log(`You have currently used ${stacks.length} out of ${response.AccountLimits[0].Value} stacks`);

    });

  });

}

function estimateCost() {

  const template = getTemplate();

  cloudformation.estimateTemplateCost({
    TemplateBody: JSON.stringify(template.file),
    Parameters:   template.params
  }, function(err, response) {

    if(err) {
      throw new Error(err);
    }

    open(response.Url);

  });

}

function validateTemplate() {

  const template = getTemplate(true);

  cloudformation.validateTemplate({
    TemplateBody: JSON.stringify(template.file)
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

}
