import { readFile as nodeReadFile, stat as nodeStat } from 'node:fs/promises'
import path from 'node:path'

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8'],
])

function isMissingFileError(error) {
  return error?.code === 'ENOENT' || error?.code === 'EISDIR'
}

function resolvePublicPath(rootDir, requestUrl) {
  if (typeof requestUrl !== 'string' || !requestUrl.startsWith('/')) return undefined
  const queryStart = requestUrl.indexOf('?')
  const rawPathname = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart)
  if (/%(?:2f|5c)/i.test(rawPathname)) return undefined

  let pathname
  try {
    pathname = decodeURIComponent(rawPathname)
  } catch {
    return undefined
  }

  if (pathname.includes('\0') || pathname.includes('\\')) return undefined
  const segments = pathname.split('/')
  if (segments.some(segment => segment === '.' || segment === '..')) return undefined

  const relativePath = pathname === '/'
    ? 'dev.html'
    : segments.filter(Boolean).join(path.sep)
  if (!relativePath) return undefined

  const candidate = path.resolve(rootDir, relativePath)
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`
  if (candidate !== rootDir && !candidate.startsWith(rootPrefix)) return undefined
  return candidate
}

export function createStaticHandler(rootDir, { fileSystem: fileSystemOverrides } = {}) {
  const resolvedRoot = path.resolve(rootDir)
  const fileSystem = {
    stat: nodeStat,
    readFile: nodeReadFile,
    ...fileSystemOverrides,
  }

  return async function serveStatic(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false
    const filePath = resolvePublicPath(resolvedRoot, request.url)
    if (!filePath) return false

    let fileStats
    try {
      fileStats = await fileSystem.stat(filePath)
    } catch (error) {
      if (isMissingFileError(error)) return false
      throw error
    }
    if (!fileStats.isFile()) return false

    let body
    if (request.method === 'GET') {
      try {
        body = await fileSystem.readFile(filePath)
      } catch (error) {
        if (isMissingFileError(error)) return false
        throw error
      }
    }

    const contentLength = request.method === 'HEAD' ? fileStats.size : body.length
    response.writeHead(200, {
      'content-type': CONTENT_TYPES.get(path.extname(filePath).toLowerCase())
        ?? 'application/octet-stream',
      'content-length': String(contentLength),
    })
    response.end(request.method === 'HEAD' ? undefined : body)
    return true
  }
}
