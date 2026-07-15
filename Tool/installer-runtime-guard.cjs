'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const STATE_DIR = '.pokerogue-mod-studio'
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage'])
let patchesInstalled = false

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) {
    throw new Error(`Invalid ${label}.`)
  }
  const normalized = path.normalize(value)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Invalid ${label}: path escapes the checkout.`)
  }
  return normalized
}

function canonicalRoot(project) {
  const root = fs.realpathSync(path.resolve(project))
  if (!fs.statSync(root).isDirectory()) throw new Error('Project path must be a directory.')
  return root
}

function nearestExistingParent(candidate) {
  let current = path.dirname(candidate)
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`Could not resolve an existing parent for ${candidate}.`)
    current = parent
  }
  return fs.realpathSync(current)
}

function validateContainedPath(root, relative, label, { mustExist = false } = {}) {
  const candidate = path.resolve(root, safeRelative(relative, label))
  if (!isInside(root, candidate) || candidate === root) {
    throw new Error(`Invalid ${label}: path escapes the checkout.`)
  }
  const parent = nearestExistingParent(candidate)
  if (!isInside(root, parent)) throw new Error(`Invalid ${label}: parent escapes the checkout.`)
  if (!fs.existsSync(candidate)) {
    if (mustExist) throw new Error(`Required ${label} is missing: ${relative}`)
    return candidate
  }
  const metadata = fs.lstatSync(candidate)
  if (metadata.isSymbolicLink()) throw new Error(`Invalid ${label}: links are not allowed.`)
  const canonical = fs.realpathSync(candidate)
  if (!isInside(root, canonical) || canonical === root) {
    throw new Error(`Invalid ${label}: canonical path escapes the checkout.`)
  }
  return canonical
}

function scanForLinks(root, directory) {
  if (!fs.existsSync(directory)) return
  if (directory !== root) {
    const metadata = fs.lstatSync(directory)
    const canonical = fs.realpathSync(directory)
    if (metadata.isSymbolicLink() || path.resolve(canonical).toLowerCase() !== path.resolve(directory).toLowerCase()) {
      throw new Error(`Refusing target link or junction: ${path.relative(root, directory)}`)
    }
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name) || entry.name === STATE_DIR) continue
    const full = path.join(directory, entry.name)
    const metadata = fs.lstatSync(full)
    if (entry.isSymbolicLink() || metadata.isSymbolicLink()) {
      throw new Error(`Refusing target link or junction: ${path.relative(root, full)}`)
    }
    if (entry.isDirectory()) scanForLinks(root, full)
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid transaction JSON in ${file}: ${error.message}`)
  }
}

function validateJournal(root, file) {
  const journal = readJson(file)
  if (!journal || !Array.isArray(journal.files) || !Array.isArray(journal.copies)) {
    throw new Error(`Invalid Mod Studio journal: ${file}`)
  }
  const committed = !journal.state || journal.state === 'committed'
  for (const item of [...journal.files, ...journal.copies]) {
    const shouldExist = committed || item.status === 'applied'
    validateContainedPath(root, item.path, 'journal target path', { mustExist: shouldExist })
    if (item.backup) {
      validateContainedPath(root, item.backup, 'journal backup path', {
        mustExist: Boolean(item.beforeHash),
      })
    }
  }
}

function validateUpdateState(root, file) {
  const state = readJson(file)
  if (!Array.isArray(state.records)) throw new Error(`Invalid Mod Studio update state: ${file}`)
  for (const record of state.records) {
    validateContainedPath(root, record.path, 'update target path')
    validateContainedPath(root, record.snapshot, 'update snapshot path', { mustExist: true })
  }
}

function validateTransactionState(root) {
  const mods = path.join(root, STATE_DIR, 'mods')
  if (fs.existsSync(mods)) {
    validateContainedPath(root, path.relative(root, mods), 'mods state directory', { mustExist: true })
    for (const owner of fs.readdirSync(mods)) {
      validateContainedPath(root, path.relative(root, path.join(mods, owner)), 'mod owner directory', { mustExist: true })
      const file = path.join(mods, owner, 'journal.json')
      if (fs.existsSync(file)) validateJournal(root, file)
    }
  }
  const updates = path.join(root, STATE_DIR, 'updates')
  if (fs.existsSync(updates)) {
    validateContainedPath(root, path.relative(root, updates), 'updates state directory', { mustExist: true })
    for (const owner of fs.readdirSync(updates)) {
      validateContainedPath(root, path.relative(root, path.join(updates, owner)), 'update owner directory', { mustExist: true })
      const file = path.join(updates, owner, 'state.json')
      if (fs.existsSync(file)) validateUpdateState(root, file)
    }
  }
}

function parseProject(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') return argv[index + 1]
  }
  return null
}

function validateInstallerEnvironment(argv) {
  const project = parseProject(argv)
  if (!project) return null
  const root = canonicalRoot(project)
  for (const relative of ['src', 'public', 'assets']) {
    const directory = path.join(root, relative)
    if (fs.existsSync(directory)) scanForLinks(root, directory)
  }
  validateTransactionState(root)
  return root
}

function fsyncFile(file, originals) {
  const descriptor = originals.openSync(file, 'r+')
  try {
    originals.fsyncSync(descriptor)
  } finally {
    originals.closeSync(descriptor)
  }
}

function fsyncDirectory(directory, originals) {
  try {
    const descriptor = originals.openSync(directory, 'r')
    try {
      originals.fsyncSync(descriptor)
    } finally {
      originals.closeSync(descriptor)
    }
  } catch {
    // Windows does not consistently permit directory fsync handles.
  }
}

function temporaryFor(target) {
  return `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.guard.tmp`
}

function installDurableFsPatches() {
  if (patchesInstalled) return
  patchesInstalled = true
  const originals = {
    openSync: fs.openSync.bind(fs),
    closeSync: fs.closeSync.bind(fs),
    fsyncSync: fs.fsyncSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    copyFileSync: fs.copyFileSync.bind(fs),
    renameSync: fs.renameSync.bind(fs),
    cpSync: fs.cpSync.bind(fs),
  }

  fs.writeFileSync = function guardedWriteFileSync(file, data, options) {
    const result = originals.writeFileSync(file, data, options)
    if (typeof file === 'string' || file instanceof URL || Buffer.isBuffer(file)) {
      fsyncFile(file, originals)
      fsyncDirectory(path.dirname(path.resolve(file)), originals)
    } else {
      originals.fsyncSync(file)
    }
    return result
  }

  fs.copyFileSync = function guardedCopyFileSync(source, target, mode) {
    const temporary = temporaryFor(path.resolve(target))
    try {
      originals.copyFileSync(source, temporary, mode)
      fsyncFile(temporary, originals)
      originals.renameSync(temporary, target)
      fsyncDirectory(path.dirname(path.resolve(target)), originals)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }

  fs.renameSync = function guardedRenameSync(oldPath, newPath) {
    const result = originals.renameSync(oldPath, newPath)
    if (fs.existsSync(newPath) && fs.lstatSync(newPath).isFile()) fsyncFile(newPath, originals)
    fsyncDirectory(path.dirname(path.resolve(newPath)), originals)
    return result
  }

  function durableTree(source, target, options = {}) {
    const metadata = fs.lstatSync(source)
    if (metadata.isSymbolicLink()) throw new Error(`Refusing to copy transaction-state link: ${source}`)
    if (metadata.isDirectory()) {
      fs.mkdirSync(target, { recursive: true })
      for (const name of fs.readdirSync(source)) {
        durableTree(path.join(source, name), path.join(target, name), options)
      }
      fsyncDirectory(target, originals)
      return
    }
    if (metadata.isFile()) fs.copyFileSync(source, target, options.mode)
  }

  fs.cpSync = function guardedCpSync(source, target, options = {}) {
    if (!options.recursive && fs.statSync(source).isDirectory()) {
      return originals.cpSync(source, target, options)
    }
    durableTree(source, target, options)
  }
}

module.exports = {
  installDurableFsPatches,
  validateContainedPath,
  validateInstallerEnvironment,
  validateJournal,
}
