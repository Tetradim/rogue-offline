// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { materializeInput } = require('../pokerogue-mod-package-installer.cjs')
const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'pokerogue-package-test-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('portable package installer', () => {
  it('materializes verified embedded assets for the transactional installer', async () => {
    const root = await temporary()
    const data = Buffer.from('sprite bytes')
    const crypto = await import('node:crypto')
    const hash = crypto.createHash('sha256').update(data).digest('hex')
    const packageFile = path.join(root, 'mod.pokerogue-mod-package.json')
    await writeFile(packageFile, JSON.stringify({
      format: 'pokerogue-mod-package',
      schemaVersion: 1,
      manifest: { format: 'pokerogue-mod-studio', schemaVersion: 3, customSpecies: [] },
      assets: [{
        relativePath: 'assets/stage-1/sprite.png',
        fileName: 'sprite.png',
        sha256: hash,
        dataBase64: data.toString('base64'),
      }],
    }))

    const materialized = materializeInput(packageFile)
    try {
      const manifest = JSON.parse(await readFile(materialized.manifestPath, 'utf8'))
      expect(manifest.sourceRoot).toMatch(/pokerogue-mod-package-/)
      expect(await readFile(path.join(manifest.sourceRoot, 'assets', 'stage-1', 'sprite.png'), 'utf8')).toBe('sprite bytes')
    } finally {
      materialized.cleanup()
    }
  })

  it('rejects embedded assets whose hash does not match', async () => {
    const root = await temporary()
    const packageFile = path.join(root, 'bad.pokerogue-mod-package.json')
    await writeFile(packageFile, JSON.stringify({
      format: 'pokerogue-mod-package',
      schemaVersion: 1,
      manifest: { format: 'pokerogue-mod-studio', schemaVersion: 3 },
      assets: [{
        relativePath: 'assets/stage-1/sprite.png',
        fileName: 'sprite.png',
        sha256: 'not-the-real-hash',
        dataBase64: Buffer.from('sprite bytes').toString('base64'),
      }],
    }))

    expect(() => materializeInput(packageFile)).toThrow(/hash mismatch/i)
  })
})
