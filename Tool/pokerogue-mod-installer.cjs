#!/usr/bin/env node
'use strict'

const { main } = require('./installer-core.cjs')

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(`\nERROR ${error.stack || error.message}\n`)
  process.exitCode = 1
}
