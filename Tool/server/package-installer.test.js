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

function manifest(asset = null) {
  return {
    format: 'pokerogue-mod-studio',
    schemaVersion: 3,
    customSpecies: [{ assets: asset ? [asset] : [] }],
  }
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('portable package installer', () => {
  it('materializes the exact verified embedded asset set for the transactional installer', async () => {
    const root = await temporary()
    const data = Buffer.from('sprite bytes')
    const crypto = await import('node:crypto')
    const hash = crypto.createHash('sha256').update(data).digest('hex')
    const asset = { relativePath: 'assets/stage-1/sprite.png', fileName: 'sprite.png', sha256: hash }
    const packageFile = path.join(root, 'mod.pokerogue-mod-package.json')
    await writeFile(packageFile, JSON.stringify({
      format: 'pokerogue-mod-package',
      schemaVersion: 1,
      manifest: manifest(asset),
      assets: [{ ...asset, dataBase64: data.toString('base64') }],
    }))

    const materialized = materializeInput(packageFile)
    try {
      const value = JSON.parse(await readFile(materialized.manifestPath, 'utf8'))
      expect(value.sourceRoot).toMatch(/pokerogue-mod-package-/)
      expect(await readFile(path.join(value.sourceRoot, 'assets', 'stage-1', 'sprite.png'), 'utf8')).toBe('sprite bytes')
    } finally {
      materialized.cleanup()
    }
  })

  it('rejects mismatched hashes, missing assets, duplicates, and unreferenced assets', async () => {
    const root = await temporary()
    const data = Buffer.from('sprite bytes')
    const relativePath = 'assets/stage-1/sprite.png'
    const cases = [
      {
        name: 'bad-hash',
        value: {
          format: 'pokerogue-mod-package', schemaVersion: 1,
          manifest: manifest({ relativePath, sha256: 'not-the-real-hash' }),
          assets: [{ relativePath, sha256: 'not-the-real-hash', dataBase64: data.toString('base64') }],
        },
        pattern: /hash mismatch/i,
      },
      {
        name: 'missing',
        value: { format: 'pokerogue-mod-package', schemaVersion: 1, manifest: manifest({ relativePath, sha256: 'a'.repeat(64) }), assets: [] },
        pattern: /missing manifest asset/i,
      },
      {
        name: 'extra',
        value: { format: 'pokerogue-mod-package', schemaVersion: 1, manifest: manifest(), assets: [{ relativePath, sha256: 'a'.repeat(64), dataBase64: data.toString('base64') }] },
        pattern: /unreferenced/i,
      },
      {
        name: 'duplicate',
        value: {
          format: 'pokerogue-mod-package', schemaVersion: 1,
          manifest: manifest({ relativePath, sha256: 'a'.repeat(64) }),
          assets: [
            { relativePath, sha256: 'a'.repeat(64), dataBase64: data.toString('base64') },
            { relativePath, sha256: 'a'.repeat(64), dataBase64: data.toString('base64') },
          ],
        },
        pattern: /duplicated/i,
      },
    ]

    for (const item of cases) {
      const packageFile = path.join(root, `${item.name}.json`)
      await writeFile(packageFile, JSON.stringify(item.value))
      expect(() => materializeInput(packageFile)).toThrow(item.pattern)
    }
  })
})
