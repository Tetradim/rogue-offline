// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cleanups = []

function embeddedPowerShell(batch) {
  const parts = batch.split(/^:__PRMS_POWERSHELL__\s*$/m)
  if (parts.length !== 2) throw new Error('Updating launcher must contain exactly one embedded PowerShell marker.')
  return parts[1]
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('Windows launcher syntax', () => {
  it('contains one extractable embedded updater program', async () => {
    const batch = await readFile(path.join(rootDir, 'Launch-Updating.bat'), 'utf8')
    const script = embeddedPowerShell(batch)
    expect(script).toMatch(/^\s*param\(/)
    expect(script).toMatch(/exit 0\s*$/)
  })

  const windowsIt = process.platform === 'win32' ? it : it.skip
  windowsIt('parses the embedded updater with Windows PowerShell', async () => {
    const batch = await readFile(path.join(rootDir, 'Launch-Updating.bat'), 'utf8')
    const directory = await mkdtemp(path.join(tmpdir(), 'pokerogue-launcher-syntax-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const scriptFile = path.join(directory, 'updater.ps1')
    await writeFile(scriptFile, embeddedPowerShell(batch), 'utf8')

    const command = [
      '$tokens = $null',
      '$errors = $null',
      '[System.Management.Automation.Language.Parser]::ParseFile($env:PRMS_TEST_SCRIPT, [ref]$tokens, [ref]$errors) | Out-Null',
      'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }',
    ].join('; ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, PRMS_TEST_SCRIPT: scriptFile },
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })
})
