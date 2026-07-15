// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const toolRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const installer = path.join(toolRoot, 'pokerogue-mod-installer.cjs')
const cleanups = []

async function temporary(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function hash(data) {
  return createHash('sha256').update(data).digest('hex')
}

function run(args) {
  return spawnSync(process.execPath, [installer, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('installer recovery and locking', () => {
  it('restores an operation that may have written before its final journal update', async () => {
    const target = await temporary('mod-studio-recovery-')
    const source = path.join(target, 'src', 'file.ts')
    const backup = path.join(
      target,
      '.pokerogue-mod-studio',
      'mods',
      'crashed',
      'backups',
      'src',
      'file.ts',
    )
    await mkdir(path.dirname(source), { recursive: true })
    await mkdir(path.dirname(backup), { recursive: true })
    const before = Buffer.from('export const value = "before";\n')
    const after = Buffer.from('export const value = "after";\n')
    await writeFile(source, after)
    await writeFile(backup, before)
    await writeFile(
      path.join(target, '.pokerogue-mod-studio', 'mods', 'crashed', 'journal.json'),
      JSON.stringify({
        schemaVersion: 2,
        owner: 'crashed',
        state: 'applying',
        files: [{
          path: 'src/file.ts',
          backup: '.pokerogue-mod-studio/mods/crashed/backups/src/file.ts',
          beforeHash: hash(before),
          afterHash: hash(after),
          status: 'applying',
        }],
        copies: [],
      }, null, 2),
    )

    const result = run(['--project', target, '--uninstall', 'missing'])
    expect(result.status).not.toBe(0)
    expect(await readFile(source)).toEqual(before)
    await expect(readFile(
      path.join(target, '.pokerogue-mod-studio', 'mods', 'crashed', 'journal.json'),
    )).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not enter a checkout while a live operation lock exists', async () => {
    const target = await temporary('mod-studio-lock-')
    const state = path.join(target, '.pokerogue-mod-studio')
    await mkdir(state, { recursive: true })
    await writeFile(
      path.join(state, 'operation.lock'),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    )

    const result = run(['--project', target, '--uninstall', 'missing'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/already running/i)
  })
})
