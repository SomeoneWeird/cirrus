#!/usr/bin/env node

import 'colors'

import fs from 'fs'
import path from 'path'
import AWS from 'aws-sdk'
import yargs from 'yargs'

import utils from './utils'

let commands = {}

fs.readdirSync(path.resolve(__dirname, './commands')).map(function (file) {
  let t = require(path.resolve(__dirname, './commands', file)).default
  commands[t.name] = t
})

let argv = yargs.usage('Usage: $0 <command>')

for (let k in commands) {
  let command = commands[k]
  argv.command(command.name, command.description)
}

argv = argv.describe('region', 'Set region')
  .describe('showdeleted', 'Show deleted stacks')
  .describe('file', 'Template file')
  .describe('parameters', 'Template file parameters')
  .describe('after', 'ISO Date to limit response data')
  .describe('before', 'ISO Date to limit response data')
  .describe('limit', 'Limit number of responses')
  .describe('capabilities', 'List of capablities')
  .array('capabilities')
  .default('region', 'ap-southeast-1')
  .default('showdeleted', false)
  .alias('file', 'f')
  .alias('parameters', 'params')
  .alias('parameters', 'p')
  .demand(1, '')
  .argv

let command = commands[argv._[0]]

if (!command) {
  yargs.showHelp()
  process.exit()
}

if (argv.after) {
  argv.after = new Date(argv.after)
  if (argv.after.toString() === 'Invalid Date') delete argv.after
}

if (argv.before) {
  argv.before = new Date(argv.before)
  if (argv.before.toString() === 'Invalid Date') delete argv.before
}

if (argv.limit) {
  argv.limit = parseInt(argv.limit)
  if (isNaN(argv.limit)) delete argv.limit
}

const cloudformation = new AWS.CloudFormation({
  region: argv.region
})

command.fn(cloudformation, argv, utils(argv, cloudformation))
