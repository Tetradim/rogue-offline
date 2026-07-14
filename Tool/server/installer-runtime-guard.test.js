// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  validateContainedPath,
  validateInstallerEnvironment,
} = require('../installer-runtime-guard.cjs')
const cleanups = []

async function temporary(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('installer runtime path guard', () => {
  it('rejects lexical paths outside the checkout', async () => {
    const root = await temporary('runtime-guard-root-')
    expect(() => validateContainedPath(
      root,
      '../outside.txt',
      'journal target path',
    )).toThrow(/escapes/i)
  })

  it('rejects a source junction before target inspection or writes', async () => {
    const root = await temporary('runtime-guard-target-')
    const outside = await temporary('runtime-guard-outside-')
    await writeFile(path.join(outside, 'escaped.ts'), 'outside')
    await symlink(outside, path.join(root, 'src'), 'junction')

    expect(() => validateInstallerEnvironment([
      '--project', root,
      '--uninstall', 'missing',
    ])).toThrow(/link|junction/i)
  })

  it('rejects linked transaction-state directories', async () => {
    const root = await temporary('runtime-guard-state-')
    const outside = await temporary('runtime-guard-state-outside-')
    const mods = path.join(root, '.pokerogue-mod-studio', 'mods')
    await mkdir(mods, { recursive: true })
    await writeFile(path.join(outside, 'journal.json'), JSON.stringify({
      owner: 'escaped',
      state: 'committed',
      files: [],
      copies: [],
    }))
    await symlink(outside, path.join(mods, 'escaped'), 'junction')

    expect(() => validateInstallerEnvironment([
      '--project', root,
      '--uninstall', 'escaped',
    ])).toThrow(/link|junction/i)
  })
})
