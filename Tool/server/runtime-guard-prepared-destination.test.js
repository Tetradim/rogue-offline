// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { validateContainedPath } = require('../installer-runtime-guard.cjs')
const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'prepared-destination-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('prepared transaction destination containment', () => {
  it('accepts a missing deep destination when its nearest existing parent is contained', async () => {
    const root = await temporary()
    await mkdir(path.join(root, 'public'), { recursive: true })

    expect(() => validateContainedPath(
      root,
      'public/images/pokemon/1026.png',
      'journal target path',
      { mustExist: false },
    )).not.toThrow()
  })

  it('still rejects a missing destination whose lexical path escapes', async () => {
    const root = await temporary()
    expect(() => validateContainedPath(
      root,
      '../outside/deep/file.png',
      'journal target path',
      { mustExist: false },
    )).toThrow(/escapes/i)
  })
})
