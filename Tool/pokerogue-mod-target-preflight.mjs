#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseTargetPreflightArgs,
  projectFromManifest,
  runTargetPreflight,
} from './server/target-preflight-service.js'

const modulePath = fileURLToPath(import.meta.url)

async function main() {
  const options = parseTargetPreflightArgs(process.argv.slice(2))
  if (options.help || !options.manifest || !options.project) {
    console.log('Usage:\n  node pokerogue-mod-target-preflight.mjs --manifest <manifest.json> --project <game-root>')
    process.exitCode = options.help ? 0 : 1
    return
  }
  const result = await runTargetPreflight({
    manifestPath: options.manifest,
    targetDir: options.project,
  })
  console.log(result.output)
}

if (path.resolve(process.argv[1] || '') === path.resolve(modulePath)) {
  main().catch(error => {
    console.error(`\nERROR ${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

export {
  parseTargetPreflightArgs as parseArgs,
  projectFromManifest,
  runTargetPreflight,
}
