// @vitest-environment node

import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import http, { createServer, request as requestHttp } from 'node:http'
import {
  mkdtemp,
  mkdir,
  open as openFile,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { mutationOriginAllowed } from './http-utils.js'
import { startServer } from './index.js'
import { createProjectRepository } from './project-repository.js'
import { createStaticHandler } from './static-files.js'
import { selectWindowsFolder } from './windows-dialog.js'

const openServers = new Set()
const temporaryDirectories = []

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'pokerogue-studio-server-'))
  temporaryDirectories.push(directory)
  return directory
}

async function listen(listener) {
  const server = createServer(listener)
  openServers.add(server)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server
}

function serverHost(server) {
  const address = server.address()
  return `${address.address}:${address.port}`
}

function request(server, {
  method = 'GET',
  pathname = '/',
  headers = {},
  body,
} = {}) {
  const address = server.address()
  return new Promise((resolve, reject) => {
    const outgoing = requestHttp({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path: pathname,
      headers,
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks)
        const text = responseBody.toString('utf8')
        const isJson = response.headers['content-type']?.startsWith('application/json')
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: responseBody,
          text,
          json: text && isJson ? JSON.parse(text) : undefined,
        })
      })
    })
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

function jsonRequest(server, method, pathname, body, headers = {}) {
  return request(server, {
    method,
    pathname,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function makeRepository(overrides = {}) {
  return {
    create: vi.fn(async ({ parentDir, name }) => ({
      projectDir: path.join(parentDir, name),
      project: { projectId: 'created-project', name },
    })),
    save: vi.fn(async (projectDir, project) => ({
      projectDir,
      project: { ...project, revision: project.revision + 1 },
    })),
    open: vi.fn(async projectDir => ({
      projectDir,
      project: { projectId: 'opened-project' },
    })),
    ...overrides,
  }
}

function makeResponseDouble() {
  const response = {
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    writeHead: vi.fn(() => {
      response.headersSent = true
    }),
    end: vi.fn(() => {
      response.writableEnded = true
    }),
    destroy: vi.fn(() => {
      response.writableEnded = true
    }),
  }
  return response
}

async function flushListenerWork() {
  await new Promise(resolve => setImmediate(resolve))
}

async function startApp(overrides = {}) {
  const dependencies = {
    repository: makeRepository(),
    selectFolder: vi.fn(async () => ''),
    staticHandler: vi.fn(async () => false),
    ...overrides,
  }
  const server = await listen(createApp(dependencies))
  return { server, ...dependencies }
}

afterEach(async () => {
  await Promise.all([...openServers].map(server => new Promise(resolve => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close(resolve)
  })))
  openServers.clear()
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('local companion API', () => {
  it('reports service health with an exact JSON length and supports HEAD', async () => {
    const { server } = await startApp()

    const response = await request(server, { pathname: '/api/health' })
    const headResponse = await request(server, { method: 'HEAD', pathname: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json).toEqual({ ok: true, service: 'pokerogue-mod-studio' })
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(Number(response.headers['content-length'])).toBe(response.body.length)
    expect(headResponse.statusCode).toBe(200)
    expect(headResponse.headers['content-length']).toBe(response.headers['content-length'])
    expect(headResponse.body).toHaveLength(0)
  })

  it('creates and returns the repository canonical project', async () => {
    const repository = makeRepository()
    const { server } = await startApp({ repository })
    const input = { parentDir: 'C:\\Mods', name: 'Ember Line' }

    const response = await jsonRequest(server, 'POST', '/api/projects', input)

    expect(response.statusCode).toBe(201)
    expect(response.json).toEqual({
      projectDir: path.join(input.parentDir, input.name),
      project: { projectId: 'created-project', name: input.name },
    })
    expect(repository.create).toHaveBeenCalledWith(input)
  })

  it('saves and returns the repository canonical project', async () => {
    const repository = makeRepository()
    const { server } = await startApp({ repository })
    const input = {
      projectDir: 'C:\\Mods\\Ember Line',
      project: { projectId: 'project-1', revision: 4 },
    }

    const response = await jsonRequest(server, 'PUT', '/api/projects', input)

    expect(response.statusCode).toBe(200)
    expect(response.json).toEqual({
      projectDir: input.projectDir,
      project: { projectId: 'project-1', revision: 5 },
    })
    expect(repository.save).toHaveBeenCalledWith(input.projectDir, input.project)
  })

  it('opens and returns the repository canonical project', async () => {
    const repository = makeRepository()
    const { server } = await startApp({ repository })
    const input = { projectDir: 'C:\\Mods\\Ember Line' }

    const response = await jsonRequest(server, 'POST', '/api/projects/open', input)

    expect(response.statusCode).toBe(200)
    expect(response.json).toEqual({
      projectDir: input.projectDir,
      project: { projectId: 'opened-project' },
    })
    expect(repository.open).toHaveBeenCalledWith(input.projectDir)
  })

  it('creates, saves, and opens a project through the real repository', async () => {
    const parentDir = await makeTemporaryDirectory()
    const ids = ['project-roundtrip', 'stage-roundtrip']
    const repository = createProjectRepository({
      now: () => '2026-07-13T12:00:00.000Z',
      idFactory: () => ids.shift(),
    })
    const { server } = await startApp({ repository })

    const created = await jsonRequest(server, 'POST', '/api/projects', {
      parentDir,
      name: 'Roundtrip Project',
    })
    const draft = structuredClone(created.json.project)
    draft.name = 'Roundtrip Saved'
    const saved = await jsonRequest(server, 'PUT', '/api/projects', {
      projectDir: created.json.projectDir,
      project: draft,
    })
    const opened = await jsonRequest(server, 'POST', '/api/projects/open', {
      projectDir: created.json.projectDir,
    })

    expect(created.statusCode).toBe(201)
    expect(saved.statusCode).toBe(200)
    expect(saved.json.project).toMatchObject({
      projectId: 'project-roundtrip',
      name: 'Roundtrip Saved',
      revision: 2,
    })
    expect(opened.statusCode).toBe(200)
    expect(opened.json).toEqual(saved.json)
  })

  it('returns the selected folder and preserves an empty cancellation result', async () => {
    const selectFolder = vi.fn()
      .mockResolvedValueOnce('C:\\Mods')
      .mockResolvedValueOnce('')
    const { server } = await startApp({ selectFolder })

    const selected = await jsonRequest(server, 'POST', '/api/dialog/folder', {
      description: 'Choose a project parent',
    })
    const cancelled = await jsonRequest(server, 'POST', '/api/dialog/folder', {
      description: 'Choose again',
    })

    expect(selected.statusCode).toBe(200)
    expect(selected.json).toEqual({ path: 'C:\\Mods' })
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json).toEqual({ path: '' })
    expect(selectFolder).toHaveBeenNthCalledWith(1, 'Choose a project parent')
    expect(selectFolder).toHaveBeenNthCalledWith(2, 'Choose again')
  })

  it('returns JSON 404 and never sends unknown APIs to the static handler', async () => {
    const staticHandler = vi.fn(async () => true)
    const { server } = await startApp({ staticHandler })

    const response = await request(server, { pathname: '/api/not-a-route' })

    expect(response.statusCode).toBe(404)
    expect(response.json).toEqual({ error: 'API route not found.' })
    expect(staticHandler).not.toHaveBeenCalled()
  })

  it('returns 405 with Allow for method-mismatched known APIs', async () => {
    const { server } = await startApp()

    const projects = await request(server, { method: 'DELETE', pathname: '/api/projects' })
    const dialog = await request(server, { pathname: '/api/dialog/folder' })

    expect(projects.statusCode).toBe(405)
    expect(projects.headers.allow).toBe('POST, PUT')
    expect(projects.json).toEqual({ error: 'Method not allowed.' })
    expect(dialog.statusCode).toBe(405)
    expect(dialog.headers.allow).toBe('POST')
  })

  it.each([
    ['DELETE', '/api/projects', 'POST, PUT'],
    ['PATCH', '/api/dialog/folder', 'POST'],
    ['POST', '/api/health', 'GET, HEAD'],
  ])(
    'returns 405 for %s %s before checking a supplied foreign Origin',
    async (method, pathname, allow) => {
      const { server } = await startApp()

      const response = await request(server, {
        method,
        pathname,
        headers: { origin: 'https://example.test' },
      })

      expect(response.statusCode).toBe(405)
      expect(response.headers.allow).toBe(allow)
      expect(response.json).toEqual({ error: 'Method not allowed.' })
    },
  )

  it('reports unsupported, malformed, and oversized JSON bodies as 4xx errors', async () => {
    const repository = makeRepository()
    const { server } = await startApp({ repository })

    const unsupported = await request(server, {
      method: 'POST',
      pathname: '/api/projects',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    const malformed = await request(server, {
      method: 'POST',
      pathname: '/api/projects',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    })
    const oversized = await request(server, {
      method: 'POST',
      pathname: '/api/projects',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
    })

    expect(unsupported.statusCode).toBe(415)
    expect(unsupported.json.error).toMatch(/application\/json/i)
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json.error).toMatch(/malformed json/i)
    expect(oversized.statusCode).toBe(413)
    expect(oversized.json.error).toMatch(/too large/i)
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('accepts case-insensitive JSON content types with charset and treats an empty body as an object', async () => {
    const selectFolder = vi.fn(async () => '')
    const { server } = await startApp({ selectFolder })

    const response = await request(server, {
      method: 'POST',
      pathname: '/api/dialog/folder',
      headers: { 'content-type': 'Application/JSON; Charset=UTF-8' },
      body: '',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json).toEqual({ path: '' })
    expect(selectFolder).toHaveBeenCalledWith(undefined)
  })

  it('rejects non-object and incomplete route payloads as request errors', async () => {
    const { server } = await startApp()

    const responses = await Promise.all([
      jsonRequest(server, 'POST', '/api/projects', { name: 'Missing Parent' }),
      jsonRequest(server, 'PUT', '/api/projects', { projectDir: 'C:\\Mods\\Missing Project' }),
      jsonRequest(server, 'POST', '/api/projects/open', {}),
      jsonRequest(server, 'POST', '/api/dialog/folder', { description: 17 }),
      jsonRequest(server, 'POST', '/api/dialog/folder', null),
    ])

    expect(responses.map(response => response.statusCode)).toEqual([400, 400, 400, 400, 400])
    expect(responses.map(response => response.json.error)).toEqual([
      expect.stringMatching(/parentDir/i),
      expect.stringMatching(/project/i),
      expect.stringMatching(/projectDir/i),
      expect.stringMatching(/description/i),
      expect.stringMatching(/must be an object/i),
    ])
  })

  it('maps expected project failures to contextual actionable 4xx responses', async () => {
    const knownError = Object.assign(new Error('Project is locked by another editor.'), {
      statusCode: 423,
    })
    const known = await startApp({
      repository: makeRepository({ open: vi.fn(async () => { throw knownError }) }),
    })
    const invalid = await startApp({
      repository: makeRepository({
        open: vi.fn(async () => { throw new Error('Invalid project JSON in "project.json".') }),
      }),
    })
    const missingDirectoryError = new Error('Could not resolve project directory for saving.', {
      cause: Object.assign(new Error('Path not found.'), { code: 'ENOENT' }),
    })
    const missing = await startApp({
      repository: makeRepository({ open: vi.fn(async () => { throw missingDirectoryError }) }),
    })
    const staleError = new Error('Cannot save stale project revision 1; canonical revision is 2.')
    const stale = await startApp({
      repository: makeRepository({ save: vi.fn(async () => { throw staleError }) }),
    })
    const permissionError = Object.assign(new Error('Project folder access denied.'), {
      code: 'EACCES',
    })
    const permission = await startApp({
      repository: makeRepository({ open: vi.fn(async () => { throw permissionError }) }),
    })

    const knownResponse = await jsonRequest(known.server, 'POST', '/api/projects/open', {
      projectDir: 'C:\\Mods\\Locked',
    })
    const invalidResponse = await jsonRequest(invalid.server, 'POST', '/api/projects/open', {
      projectDir: 'C:\\Mods\\Invalid',
    })
    const missingResponse = await jsonRequest(missing.server, 'POST', '/api/projects/open', {
      projectDir: 'C:\\Mods\\Missing',
    })
    const staleResponse = await jsonRequest(stale.server, 'PUT', '/api/projects', {
      projectDir: 'C:\\Mods\\Stale',
      project: { revision: 1 },
    })
    const permissionResponse = await jsonRequest(permission.server, 'POST', '/api/projects/open', {
      projectDir: 'C:\\Mods\\Denied',
    })

    expect(knownResponse.statusCode).toBe(423)
    expect(knownResponse.json).toEqual({ error: knownError.message })
    expect(invalidResponse.statusCode).toBe(400)
    expect(invalidResponse.json.error).toMatch(/invalid project json/i)
    expect(missingResponse.statusCode).toBe(404)
    expect(missingResponse.json).toEqual({ error: missingDirectoryError.message })
    expect(staleResponse.statusCode).toBe(409)
    expect(staleResponse.json).toEqual({ error: staleError.message })
    expect(permissionResponse.statusCode).toBe(403)
    expect(permissionResponse.json).toEqual({ error: permissionError.message })
  })

  it('hides picker and runtime diagnostics behind a generic 500 response', async () => {
    const pickerError = Object.assign(
      new Error('spawn C:\\private-tools\\powershell.exe ENOENT'),
      { code: 'ENOENT' },
    )
    const syntaxError = new SyntaxError('Unexpected token in C:\\private-projects\\project.json')
    const onError = vi.fn()
    const picker = await startApp({
      selectFolder: vi.fn(async () => { throw pickerError }),
      onError,
    })
    const runtime = await startApp({
      repository: makeRepository({ open: vi.fn(async () => { throw syntaxError }) }),
      onError,
    })

    const pickerResponse = await jsonRequest(picker.server, 'POST', '/api/dialog/folder', {})
    const runtimeResponse = await jsonRequest(runtime.server, 'POST', '/api/projects/open', {
      projectDir: 'C:\\Mods\\Runtime Failure',
    })

    for (const response of [pickerResponse, runtimeResponse]) {
      expect(response.statusCode).toBe(500)
      expect(response.json).toEqual({ error: 'Internal service error.' })
      expect(response.text).not.toMatch(/private|powershell|unexpected token/i)
    }
    expect(onError).toHaveBeenCalledWith(pickerError, expect.any(Object))
    expect(onError).toHaveBeenCalledWith(syntaxError, expect.any(Object))
  })

  it('allows desktop clients and matching hosts but blocks supplied cross-origin mutations', async () => {
    const selectFolder = vi.fn(async () => 'C:\\Mods')
    const { server } = await startApp({ selectFolder })
    const matchingOrigin = `http://${serverHost(server)}`

    const desktop = await jsonRequest(server, 'POST', '/api/dialog/folder', {})
    const matching = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      origin: matchingOrigin,
    })
    const blocked = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      origin: 'https://example.test',
    })
    const malformed = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      origin: 'not a url',
    })

    expect(desktop.statusCode).toBe(200)
    expect(matching.statusCode).toBe(200)
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json).toEqual({ error: 'Origin does not match this local service.' })
    expect(malformed.statusCode).toBe(403)
    expect(selectFolder).toHaveBeenCalledTimes(2)
  })

  it('rejects a spoofed Host and HTTPS Origin at the live loopback boundary', async () => {
    const selectFolder = vi.fn(async () => 'C:\\Mods')
    const { server } = await startApp({ selectFolder })
    const localPort = server.address().port

    const spoofedHost = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      host: `attacker.example:${localPort}`,
      origin: `http://attacker.example:${localPort}`,
    })
    const wrongScheme = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      origin: `https://127.0.0.1:${localPort}`,
    })

    expect(spoofedHost.statusCode).toBe(403)
    expect(wrongScheme.statusCode).toBe(403)
    expect(spoofedHost.json).toEqual({ error: 'Origin does not match this local service.' })
    expect(wrongScheme.json).toEqual({ error: 'Origin does not match this local service.' })
    expect(selectFolder).not.toHaveBeenCalled()
  })

  it.each([
    'https://127.0.0.1:43123/',
    'https://127.0.0.1:43123/path',
    'https://user@127.0.0.1:43123',
    'https://127.0.0.1:43123?x=1',
    'https://127.0.0.1:43123#x',
    'ftp://127.0.0.1:43123',
    ' https://127.0.0.1:43123',
    'https://127.0.0.1:43123 ',
  ])('rejects a non-origin-only Origin value: %s', origin => {
    expect(mutationOriginAllowed({
      headers: { host: '127.0.0.1:43123', origin },
    })).toBe(false)
  })

  it('returns 403 for a matching-host Origin with a trailing slash', async () => {
    const selectFolder = vi.fn(async () => 'C:\\Mods')
    const { server } = await startApp({ selectFolder })

    const response = await jsonRequest(server, 'POST', '/api/dialog/folder', {}, {
      origin: `https://${serverHost(server)}/`,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json).toEqual({ error: 'Origin does not match this local service.' })
    expect(selectFolder).not.toHaveBeenCalled()
  })

  it('invokes static serving only for non-API GET and HEAD requests', async () => {
    const staticHandler = vi.fn(async (incoming, response) => {
      if (incoming.url === '/') {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('entry')
        return true
      }
      return false
    })
    const { server } = await startApp({ staticHandler })

    const entry = await request(server)
    const missingHead = await request(server, { method: 'HEAD', pathname: '/missing' })
    const nonGet = await request(server, { method: 'POST', pathname: '/outside-api' })
    await request(server, { pathname: '/api/unknown' })

    expect(entry.text).toBe('entry')
    expect(missingHead.statusCode).toBe(404)
    expect(missingHead.body).toHaveLength(0)
    expect(nonGet.statusCode).toBe(404)
    expect(staticHandler.mock.calls.map(([incoming]) => incoming.method)).toEqual(['GET', 'HEAD'])
  })

  it('does not send again or leak a rejection when a static handler ends then rejects', async () => {
    const failure = new Error('failure after end')
    const response = makeResponseDouble()
    const unhandledRejection = vi.fn()
    const onError = vi.fn()
    const app = createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      onError,
      staticHandler: async (incoming, outgoing) => {
        outgoing.writeHead(200, { 'content-type': 'text/plain' })
        outgoing.end('already complete')
        throw failure
      },
    })
    process.on('unhandledRejection', unhandledRejection)

    try {
      app({ method: 'GET', url: '/', headers: {} }, response)
      await flushListenerWork()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }

    expect(response.writeHead).toHaveBeenCalledOnce()
    expect(response.end).toHaveBeenCalledOnce()
    expect(response.destroy).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, expect.any(Object))
    expect(unhandledRejection).not.toHaveBeenCalled()
  })

  it('destroys without a second write when a static handler writes headers then rejects', async () => {
    const failure = new Error('failure after headers')
    const response = makeResponseDouble()
    const unhandledRejection = vi.fn()
    const onError = vi.fn(() => {
      throw new Error('diagnostic callback failed')
    })
    const app = createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      onError,
      staticHandler: async (incoming, outgoing) => {
        outgoing.writeHead(200, { 'content-type': 'text/plain' })
        throw failure
      },
    })
    process.on('unhandledRejection', unhandledRejection)

    try {
      app({ method: 'GET', url: '/', headers: {} }, response)
      await flushListenerWork()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }

    expect(response.writeHead).toHaveBeenCalledOnce()
    expect(response.end).not.toHaveBeenCalled()
    expect(response.destroy).toHaveBeenCalledExactlyOnceWith(failure)
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, expect.any(Object))
    expect(unhandledRejection).not.toHaveBeenCalled()
  })
})

describe('static file handler', () => {
  it('serves dev.html at the root and common assets with accurate metadata', async () => {
    const dist = await makeTemporaryDirectory()
    const files = new Map([
      ['dev.html', ['<main>Studio</main>', 'text/html; charset=utf-8']],
      [path.join('assets', 'index.js'), ['export default 1\n', 'text/javascript; charset=utf-8']],
      [path.join('assets', 'index.css'), ['body { color: red; }\n', 'text/css; charset=utf-8']],
      [path.join('assets', 'data.json'), ['{"ok":true}\n', 'application/json; charset=utf-8']],
      [path.join('assets', 'mark.svg'), ['<svg></svg>', 'image/svg+xml; charset=utf-8']],
      [path.join('assets', 'pixel.png'), [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png']],
    ])
    await mkdir(path.join(dist, 'assets'))
    for (const [relativePath, [contents]] of files) {
      await writeFile(path.join(dist, relativePath), contents)
    }
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist),
    }))

    for (const [relativePath, [contents, contentType]] of files) {
      const pathname = relativePath === 'dev.html' ? '/' : `/${relativePath.replaceAll('\\', '/')}`
      const response = await request(server, { pathname })
      expect(response.statusCode, pathname).toBe(200)
      expect(response.body, pathname).toEqual(Buffer.isBuffer(contents) ? contents : Buffer.from(contents))
      expect(response.headers['content-type'], pathname).toBe(contentType)
      expect(Number(response.headers['content-length']), pathname).toBe(Buffer.byteLength(contents))
    }
  })

  it('sends file headers but no body for HEAD', async () => {
    const dist = await makeTemporaryDirectory()
    const contents = 'console.log("studio")\n'
    await mkdir(path.join(dist, 'assets'))
    await writeFile(path.join(dist, 'assets', 'index.js'), contents)
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist),
    }))

    const response = await request(server, { method: 'HEAD', pathname: '/assets/index.js' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(Number(response.headers['content-length'])).toBe(Buffer.byteLength(contents))
    expect(response.body).toHaveLength(0)
  })

  it.each([
    '/%2e%2e%2fsecret.txt',
    '/nested%2f..%2fsecret.txt',
    '/..%5csecret.txt',
    '/%00secret.txt',
    '/%ZZ',
  ])('rejects malformed or escaping URL path %s', async pathname => {
    const parent = await makeTemporaryDirectory()
    const dist = path.join(parent, 'dist')
    await mkdir(dist)
    await writeFile(path.join(parent, 'secret.txt'), 'not public')
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist),
    }))

    const response = await request(server, { pathname })

    expect(response.statusCode).toBe(404)
    expect(response.json).toEqual({ error: 'Static file not found.' })
    expect(response.text).not.toContain('not public')
  })

  it('refuses a file reached through an in-root link to an outside directory', async () => {
    const parent = await makeTemporaryDirectory()
    const dist = path.join(parent, 'dist')
    const outside = path.join(parent, 'outside')
    await mkdir(dist)
    await mkdir(outside)
    await writeFile(path.join(outside, 'secret.txt'), 'outside secret bytes')
    await symlink(
      outside,
      path.join(dist, 'linked-outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist),
    }))

    const response = await request(server, { pathname: '/linked-outside/secret.txt' })

    expect(response.statusCode).toBe(404)
    expect(response.json).toEqual({ error: 'Static file not found.' })
    expect(response.text).not.toContain('outside secret bytes')
  })

  it('refuses an outside file when an accepted directory is swapped before open', async () => {
    const parent = await makeTemporaryDirectory()
    const dist = path.join(parent, 'dist')
    const safe = path.join(dist, 'safe')
    const outside = path.join(parent, 'outside')
    await mkdir(dist)
    await mkdir(safe)
    await mkdir(outside)
    await writeFile(path.join(safe, 'asset.txt'), 'inside bytes')
    await writeFile(path.join(outside, 'asset.txt'), 'outside secret bytes')
    let swapped = false
    const swapBeforeOpen = vi.fn(async (...args) => {
      if (!swapped) {
        swapped = true
        await rm(safe, { recursive: true, force: true })
        await symlink(outside, safe, process.platform === 'win32' ? 'junction' : 'dir')
      }
      return openFile(...args)
    })
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist, {
        fileSystem: { realpath, open: swapBeforeOpen },
      }),
    }))

    const response = await request(server, { pathname: '/safe/asset.txt' })

    expect(swapped).toBe(true)
    expect(response.statusCode).toBe(404)
    expect(response.json).toEqual({ error: 'Static file not found.' })
    expect(response.text).not.toContain('outside secret bytes')
  })

  it('reads through the original opened handle after an independent identity check', async () => {
    const dist = await makeTemporaryDirectory()
    const contents = 'single handle contents'
    await writeFile(path.join(dist, 'asset.txt'), contents)
    const wrappedHandles = []
    const openCanonicalFile = vi.fn(async (...args) => {
      const handle = await openFile(...args)
      const wrappedHandle = {
        stat: vi.fn((...statArgs) => handle.stat(...statArgs)),
        readFile: vi.fn((...readArgs) => handle.readFile(...readArgs)),
        close: vi.fn((...closeArgs) => handle.close(...closeArgs)),
      }
      wrappedHandles.push(wrappedHandle)
      return wrappedHandle
    })
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist, {
        fileSystem: { realpath, open: openCanonicalFile },
      }),
    }))

    const response = await request(server, { pathname: '/asset.txt' })

    expect(response.statusCode).toBe(200)
    expect(response.text).toBe(contents)
    expect(openCanonicalFile).toHaveBeenCalledTimes(2)
    expect(wrappedHandles).toHaveLength(2)
    expect(wrappedHandles[0].stat).toHaveBeenCalledOnce()
    expect(wrappedHandles[0].readFile).toHaveBeenCalledOnce()
    expect(wrappedHandles[1].stat).toHaveBeenCalledOnce()
    expect(wrappedHandles[1].readFile).not.toHaveBeenCalled()
    expect(wrappedHandles[0].close).toHaveBeenCalledOnce()
    expect(wrappedHandles[1].close).toHaveBeenCalledOnce()
  })

  it('refuses a canonical target whose post-open identity differs from the opened file', async () => {
    const parent = await makeTemporaryDirectory()
    const dist = path.join(parent, 'dist')
    const outside = path.join(parent, 'outside.txt')
    await mkdir(dist)
    await writeFile(path.join(dist, 'asset.txt'), 'inside bytes')
    await writeFile(outside, 'outside secret bytes')
    const openCanonicalFile = vi.fn(async (...args) => (
      openCanonicalFile.mock.calls.length === 1
        ? openFile(...args)
        : openFile(outside, 'r')
    ))
    const server = await listen(createApp({
      repository: makeRepository(),
      selectFolder: vi.fn(),
      staticHandler: createStaticHandler(dist, {
        fileSystem: { realpath, open: openCanonicalFile },
      }),
    }))

    const response = await request(server, { pathname: '/asset.txt' })

    expect(openCanonicalFile).toHaveBeenCalledTimes(2)
    expect(response.statusCode).toBe(404)
    expect(response.json).toEqual({ error: 'Static file not found.' })
    expect(response.text).not.toContain('outside secret bytes')
  })

  it('returns false for missing files and directories', async () => {
    const dist = await makeTemporaryDirectory()
    await mkdir(path.join(dist, 'assets'))
    const handler = createStaticHandler(dist)

    await expect(handler({ method: 'GET', url: '/missing.js' }, {})).resolves.toBe(false)
    await expect(handler({ method: 'GET', url: '/assets' }, {})).resolves.toBe(false)
  })

  it('does not swallow unexpected filesystem failures', async () => {
    const dist = await makeTemporaryDirectory()
    const failure = new Error('filesystem invariant failed')
    await writeFile(path.join(dist, 'asset.js'), 'asset')
    const handler = createStaticHandler(dist, {
      fileSystem: {
        realpath,
        open: async () => { throw failure },
      },
    })

    await expect(handler({ method: 'GET', url: '/asset.js' }, {})).rejects.toBe(failure)
  })
})

describe('Windows folder picker', () => {
  it('escapes apostrophes and invokes hidden STA PowerShell', async () => {
    const calls = []
    const execFileAsync = vi.fn(async (...args) => {
      calls.push(args)
      return { stdout: ' C:\\Trainer Mods\\Selected \r\n', stderr: '' }
    })

    const selected = await selectWindowsFolder("Choose Trainer's folder", { execFileAsync })

    expect(selected).toBe('C:\\Trainer Mods\\Selected')
    expect(calls).toHaveLength(1)
    const [command, args, options] = calls[0]
    expect(command).toBe('powershell.exe')
    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-STA', '-Command'])
    expect(args[4]).toContain("$dialog.Description = 'Choose Trainer''s folder'")
    expect(args[4]).toContain('$dialog.ShowNewFolderButton = $true')
    expect(args[4]).toContain('$dialog.ShowDialog($owner)')
    expect(args[4]).toMatch(/DialogResult.*OK/)
    expect(options).toMatchObject({ windowsHide: true, encoding: 'utf8' })
  })

  it('returns an empty string when the dialog is cancelled', async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: '\r\n', stderr: '' }))

    await expect(selectWindowsFolder(undefined, { execFileAsync })).resolves.toBe('')
  })
})

describe('local server startup', () => {
  it('imports without creating a server or spawning an opener', async () => {
    const originalCreateServer = http.createServer
    const originalSpawn = childProcess.spawn
    const originalArgv = [...process.argv]
    const originalExitCode = process.exitCode
    const fakeServer = {
      once: vi.fn(),
      off: vi.fn(),
      listen: vi.fn((port, host, callback) => callback()),
      address: vi.fn(() => ({ port: 43123 })),
      close: vi.fn(callback => callback()),
    }
    const createServerSpy = vi.fn(() => fakeServer)
    const spawnSpy = vi.fn(() => ({ unref: vi.fn() }))
    http.createServer = createServerSpy
    childProcess.spawn = spawnSpy
    process.argv.push('--open')
    syncBuiltinESMExports()
    let importedExitCode

    try {
      await import('./index.js?side-effect-check')
      await flushListenerWork()
      importedExitCode = process.exitCode
    } finally {
      http.createServer = originalCreateServer
      childProcess.spawn = originalSpawn
      process.argv.splice(0, process.argv.length, ...originalArgv)
      process.exitCode = originalExitCode
      syncBuiltinESMExports()
    }

    expect(createServerSpy).not.toHaveBeenCalled()
    expect(spawnSpy).not.toHaveBeenCalled()
    expect(importedExitCode).toBe(originalExitCode)
  })

  it('exposes pure port parsing without starting a server', async () => {
    const { parsePort } = await import('./index.js')

    expect(parsePort(undefined)).toBe(0)
    expect(parsePort('43123')).toBe(43123)
    expect(() => parsePort('1.5')).toThrow(/POKEROGUE_STUDIO_PORT.*integer.*0.*65535/i)
  })

  it('reports an injected startup failure and returns nonzero behavior without mutating process', async () => {
    const { runCli } = await import('./index.js')
    const failure = new Error('injected listen failure')
    const start = vi.fn(async () => { throw failure })
    const stderr = { write: vi.fn() }
    const processTarget = { exitCode: undefined }
    const originalExitCode = process.exitCode

    const result = await runCli({
      env: { POKEROGUE_STUDIO_PORT: '43123' },
      argv: ['--open'],
      stdout: { write: vi.fn() },
      stderr,
      start,
      processTarget,
    })

    expect(start).toHaveBeenCalledOnce()
    expect(result).toEqual({ exitCode: 1, error: failure })
    expect(processTarget.exitCode).toBe(1)
    expect(process.exitCode).toBe(originalExitCode)
    expect(stderr.write).toHaveBeenCalledExactlyOnceWith(
      'Failed to start PokeRogue Mod Studio: injected listen failure\n',
    )
  })

  it('contains a delayed opener error, reports failure, and closes the announced server', async () => {
    const { runCli } = await import('./index.js')
    const failure = new Error('delayed opener failure')
    const opener = new EventEmitter()
    opener.unref = vi.fn()
    const spawnProcess = vi.fn(() => {
      setImmediate(() => opener.emit('error', failure))
      return opener
    })
    const stdoutWrites = []
    const stderrWrites = []
    const processTarget = { exitCode: undefined }
    const uncaughtException = vi.fn()
    const unhandledRejection = vi.fn()
    process.on('uncaughtException', uncaughtException)
    process.on('unhandledRejection', unhandledRejection)
    let result

    try {
      result = await runCli({
        env: { POKEROGUE_STUDIO_PORT: '0' },
        argv: ['--open'],
        stdout: { write: chunk => stdoutWrites.push(chunk) },
        stderr: { write: chunk => stderrWrites.push(chunk) },
        processTarget,
        start: options => startServer({ ...options, spawnProcess }),
      })
      openServers.add(result.started.server)
      await vi.waitFor(() => expect(processTarget.exitCode).toBe(1))
    } finally {
      process.off('uncaughtException', uncaughtException)
      process.off('unhandledRejection', unhandledRejection)
    }

    expect(result.exitCode).toBe(1)
    expect(result.error).toBe(failure)
    expect(result.started.server.listening).toBe(false)
    expect(stdoutWrites).toHaveLength(1)
    expect(JSON.parse(stdoutWrites[0])).toEqual({
      type: 'server-started',
      url: result.started.url,
    })
    expect(stderrWrites).toEqual([
      'Failed to start PokeRogue Mod Studio: delayed opener failure\n',
    ])
    expect(opener.unref).toHaveBeenCalledOnce()
    expect(uncaughtException).not.toHaveBeenCalled()
    expect(unhandledRejection).not.toHaveBeenCalled()
  })

  it('binds loopback on an ephemeral port, reports one startup line, and opens on request', async () => {
    const writes = []
    const spawnCalls = []
    const opener = new EventEmitter()
    opener.unref = vi.fn()
    const spawnProcess = vi.fn((...args) => {
      spawnCalls.push(args)
      return opener
    })

    const started = await startServer({
      env: { POKEROGUE_STUDIO_PORT: '0' },
      argv: ['--open'],
      stdout: { write: chunk => writes.push(chunk) },
      spawnProcess,
    })
    openServers.add(started.server)

    const address = started.server.address()
    expect(address.address).toBe('127.0.0.1')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(writes[0])).toEqual({ type: 'server-started', url: started.url })
    expect(started.url).toBe(`http://127.0.0.1:${address.port}`)
    expect(spawnCalls).toEqual([[
      'cmd.exe',
      ['/c', 'start', '', started.url],
      { detached: true, stdio: 'ignore', windowsHide: true },
    ]])
    expect(opener.listenerCount('error')).toBe(1)
    expect(opener.unref).toHaveBeenCalledOnce()
  })

  it.each(['', 'abc', '-1', '1.5', '65536'])('rejects invalid configured port %j', async configuredPort => {
    await expect(startServer({
      env: { POKEROGUE_STUDIO_PORT: configuredPort },
      argv: [],
      stdout: { write: vi.fn() },
    })).rejects.toThrow(/POKEROGUE_STUDIO_PORT.*integer.*0.*65535/i)
  })
})
