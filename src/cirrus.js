#!/usr/bin/env node

import path   from "path";
import fs     from "fs";
import AWS    from "aws-sdk";
import yargs  from "yargs";
import Table  from "cli-table";
import moment from "moment";
import open   from "open";

const argv = yargs
              .usage('Usage: $0 <command>')
              .command('list', 'List all non-deleted stacks')
              .command('info', 'Returns information about the stack')
              .command('account', 'Returns information about your AWS account')
              .command('estimate', 'Returns monthly cost estimate of stack')
              .describe('region', 'Set region')
              .describe('showdeleted', 'Show deleted stacks')
              .describe('file', 'Template file')
              .describe('parameters', 'Template file parameters')
              .default('region', 'ap-southeast-1')
              .default('showdeleted', false)
              .alias('file', 'f')
              .alias('parameters', 'params')
              .alias('parameters', 'p')
              .demand(1, '')
              .argv;

let cmd = argv._[0];

let commands = {
  list:     listStacks,
  info:     stackInfo,
  account:  accountInfo,
  estimate: estimateCost
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

function getTemplate() {

  if(!argv.file) {
    console.error("Please pass '--file <filename>'");
    process.exit(1);
  }

  if(!argv.parameters) {
    console.error("Please pass '--parameters <parameters file>'");
    process.exit(1);
  }

  let file, params;

  try {
    file   = JSON.parse(fs.readFileSync(path.resolve(__dirname, argv.file)).toString());
    params = JSON.parse(fs.readFileSync(path.resolve(__dirname, argv.parameters)).toString());
  } catch(e) {
    console.error(`There was an error loading your template/params file: ${e}`);
    process.exit(1);
  }

  return {
    file,
    params
  };

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
