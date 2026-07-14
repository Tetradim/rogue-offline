// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticHandler } from './static-files.js'

const cleanups = []

async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'pokerogue-static-entry-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function responseDouble() {
  const response = {
    statusCode: null,
    headers: null,
    body: undefined,
    writeHead: vi.fn((statusCode, headers) => {
      response.statusCode = statusCode
      response.headers = headers
    }),
    end: vi.fn(body => {
      response.body = body
    }),
  }
  return response
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('production static entry', () => {
  it('prefers the Vite index.html output at the root', async () => {
    const dist = await temporary()
    await writeFile(path.join(dist, 'index.html'), '<main>production</main>')
    await writeFile(path.join(dist, 'dev.html'), '<main>legacy</main>')
    const response = responseDouble()

    const served = await createStaticHandler(dist)(
      { method: 'GET', url: '/' },
      response,
    )

    expect(served).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(response.body.toString('utf8')).toContain('production')
    expect(response.body.toString('utf8')).not.toContain('legacy')
  })

  it('falls back to legacy dev.html when index.html is absent', async () => {
    const dist = await temporary()
    await mkdir(path.join(dist, 'assets'))
    await writeFile(path.join(dist, 'dev.html'), '<main>legacy</main>')
    const response = responseDouble()

    const served = await createStaticHandler(dist)(
      { method: 'GET', url: '/' },
      response,
    )

    expect(served).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(response.body.toString('utf8')).toContain('legacy')
  })
})
