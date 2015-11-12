#!/usr/bin/env node

import AWS    from "aws-sdk";
import yargs  from "yargs";
import Table  from "cli-table";
import moment from "moment";

const argv = yargs
              .usage('Usage: $0 <command>')
              .command('list', 'List all non-deleted stacks')
              .command('info', 'Returns information about the stack')
              .describe('region', 'Set region')
              .describe('showdeleted', 'Show deleted stacks')
              .default('region', 'ap-southeast-1')
              .default('showdeleted', false)
              .demand(1, '')
              .argv;

let cmd = argv._[0];

let commands = {
  list: listStacks,
  info: stackInfo
}

if(!~Object.keys(commands).indexOf(cmd)) {
  yargs.showHelp();
  process.exit();
}

const cloudformation = new AWS.CloudFormation({
  region: argv.region
});

commands[cmd]();

function fetchStacks(callback) {
  let stacks = [];
  function fetchStack(NextToken) {
    cloudformation.listStacks({
      NextToken
    }, function(err, response) {
      if(err) {
        return callback(err);
      }
      stacks = stacks.concat(response.StackSummaries);
      if(response.NextToken) {
        fetchStack(response.NextToken);
      } else {
        return callback(null, stacks);
      }
    });
  }
  fetchStack();
}

function listStacks() {

  fetchStacks(function(err, stacks) {

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
      let last;
      switch(stack.StackStatus) {
        case "UPDATE_COMPLETE": {
          status = "Updated";
          last   = stack.LastUpdatedTime;
          break;
        }
        case "CREATE_COMPLETE": {
          status = "Created";
          last   = stack.CreationTime;
          break;
        }
        case "DELETE_COMPLETE": {
          status = "Deleted";
          last   = stack.DeletionTime;
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

function stackInfo() {

  const stackName = argv._[1];

  if(!stackName) {
    console.error("cirrus info <stackname>");
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
