// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { FOLDER_PICKER_TIMEOUT_MS, selectWindowsFolder } from './windows-dialog.js'

describe('Windows folder picker', () => {
  it('uses a topmost owner window and returns the selected path', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: 'C:\\Mods\r\n' })

    await expect(selectWindowsFolder("Choose Ember's folder", { execFileAsync })).resolves.toBe('C:\\Mods')

    expect(execFileAsync).toHaveBeenCalledOnce()
    const [file, args, options] = execFileAsync.mock.calls[0]
    const command = args.at(-1)
    expect(file).toBe('powershell.exe')
    expect(args).toContain('-STA')
    expect(command).toContain('$owner.TopMost = $true')
    expect(command).toContain('$owner.BringToFront()')
    expect(command).toContain('$dialog.ShowDialog($owner)')
    expect(command).toContain("Choose Ember''s folder")
    expect(options).toMatchObject({
      windowsHide: true,
      encoding: 'utf8',
      timeout: FOLDER_PICKER_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    })
  })

  it('returns an empty path when the user cancels', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '' })
    await expect(selectWindowsFolder('Choose a folder', { execFileAsync })).resolves.toBe('')
  })

  it('turns a stalled native picker into a recoverable request error', async () => {
    const timeout = Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' })
    const execFileAsync = vi.fn().mockRejectedValue(timeout)

    await expect(selectWindowsFolder('Choose a folder', { execFileAsync })).rejects.toMatchObject({
      statusCode: 408,
      message: expect.stringMatching(/did not return/i),
    })
  })
})
