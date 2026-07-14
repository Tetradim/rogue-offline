#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function parseArgs(argv) {
  const options = { dryRun: false, force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--input') options.input = argv[++index]
    else if (argument === '--project') options.project = argv[++index]
    else if (argument === '--dry-run') options.dryRun = true
    else if (argument === '--force') options.force = true
    else if (argument === '--help' || argument === '-h') options.help = true
  }
  return options
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`)
  }
}

function decodeAsset(asset) {
  if (typeof asset.dataBase64 !== 'string' || !asset.dataBase64.length) {
    throw new Error(`Package asset has no data: ${asset.fileName || asset.relativePath || 'unnamed asset'}`)
  }
  const normalized = asset.dataBase64.replace(/\s+/g, '')
  const data = Buffer.from(normalized, 'base64')
  if (!data.length || data.toString('base64').replace(/=+$/g, '') !== normalized.replace(/=+$/g, '')) {
    throw new Error(`Package asset is not valid base64: ${asset.fileName || asset.relativePath}`)
  }
  const hash = sha256(data)
  if (asset.sha256 && hash !== asset.sha256) {
    throw new Error(`Package asset hash mismatch: ${asset.fileName || asset.relativePath}`)
  }
  return data
}

function materializeInput(inputFile) {
  const input = readJson(inputFile)
  if (input.format === 'pokerogue-mod-studio') {
    return { manifestPath: path.resolve(inputFile), cleanup: () => {} }
  }
  if (input.format !== 'pokerogue-mod-package' || Number(input.schemaVersion) !== 1) {
    throw new Error('Input must be a current PokéRogue Mod Studio manifest or package.')
  }
  if (!input.manifest || input.manifest.format !== 'pokerogue-mod-studio') {
    throw new Error('Portable package does not contain a valid delivery manifest.')
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pokerogue-mod-package-'))
  const assetsRoot = path.join(temporaryRoot, 'assets')
  fs.mkdirSync(assetsRoot, { recursive: true })
  try {
    for (const asset of input.assets || []) {
      const relativePath = String(asset.relativePath || '').replaceAll('\\', '/')
      if (!relativePath.startsWith('assets/')) {
        throw new Error(`Package asset path is outside assets/: ${relativePath}`)
      }
      const target = path.resolve(temporaryRoot, relativePath)
      if (!isInside(assetsRoot, target) || target === assetsRoot) {
        throw new Error(`Package asset path escapes the temporary project: ${relativePath}`)
      }
      const data = decodeAsset(asset)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, data, { flag: 'wx' })
    }
    const manifest = { ...input.manifest, sourceRoot: temporaryRoot }
    const manifestPath = path.join(temporaryRoot, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    return {
      manifestPath,
      cleanup: () => fs.rmSync(temporaryRoot, { recursive: true, force: true }),
    }
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
    throw error
  }
}

function runInstaller({ input, project, dryRun = false, force = false }) {
  if (!input || !project) throw new Error('Both --input and --project are required.')
  const materialized = materializeInput(path.resolve(input))
  try {
    const installer = path.join(__dirname, 'pokerogue-mod-installer.cjs')
    const args = [
      installer,
      '--manifest', materialized.manifestPath,
      '--project', path.resolve(project),
    ]
    if (dryRun) args.push('--dry-run')
    if (force) args.push('--force')
    const result = spawnSync(process.execPath, args, {
      stdio: 'inherit',
      windowsHide: true,
    })
    if (result.error) throw result.error
    return Number.isInteger(result.status) ? result.status : 1
  } finally {
    materialized.cleanup()
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || !options.input || !options.project) {
    console.log('Usage:\n  node pokerogue-mod-package-installer.cjs --input <manifest-or-package.json> --project <game-root> [--dry-run] [--force]')
    process.exitCode = options.help ? 0 : 1
    return
  }
  try {
    process.exitCode = runInstaller(options)
  } catch (error) {
    console.error(`\nERROR ${error.stack || error.message}\n`)
    process.exitCode = 1
  }
}

module.exports = { decodeAsset, materializeInput, parseArgs, runInstaller }
if (require.main === module) main()
