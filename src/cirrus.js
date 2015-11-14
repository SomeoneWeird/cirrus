#!/usr/bin/env node

import "colors";

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
              .command('getresources', 'Returns resources for a stack')
              .command('account', 'Returns information about your AWS account')
              .command('estimate', 'Returns monthly cost estimate of stack')
              .command('validate', 'Validates a template')
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
  list:         listStacks,
  getresources: getResources,
  account:      accountInfo,
  estimate:     estimateCost,
  validate:     validateTemplate
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
