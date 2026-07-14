import { open as nodeOpen, realpath as nodeRealpath } from 'node:fs/promises'
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

function isInsideRoot(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate)
  return (
    relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

function isSameCanonicalPath(left, right) {
  return path.relative(left, right) === '' && path.relative(right, left) === ''
}

function hasFileIdentity(stats) {
  return (
    (typeof stats?.dev === 'bigint' || Number.isSafeInteger(stats?.dev))
    && (typeof stats?.ino === 'bigint' || Number.isSafeInteger(stats?.ino))
  )
}

function hasSameFileIdentity(left, right) {
  if (!hasFileIdentity(left) || !hasFileIdentity(right)) return false
  return left.dev === right.dev && left.ino === right.ino
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
    realpath: nodeRealpath,
    open: nodeOpen,
    ...fileSystemOverrides,
  }
  let canonicalRoot

  async function resolveCanonicalRoot() {
    if (canonicalRoot) return canonicalRoot
    const resolved = await fileSystem.realpath(resolvedRoot)
    canonicalRoot = resolved
    return resolved
  }

  return async function serveStatic(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false
    const filePath = resolvePublicPath(resolvedRoot, request.url)
    if (!filePath) return false

    let resolvedCanonicalRoot
    let canonicalFilePath
    try {
      resolvedCanonicalRoot = await resolveCanonicalRoot()
      canonicalFilePath = await fileSystem.realpath(filePath)
    } catch (error) {
      if (isMissingFileError(error)) return false
      throw error
    }
    if (!isInsideRoot(resolvedCanonicalRoot, canonicalFilePath)) return false

    let handle
    try {
      handle = await fileSystem.open(canonicalFilePath, 'r')
      const fileStats = await handle.stat({ bigint: true })
      if (!fileStats.isFile()) return false

      const postOpenCanonicalPath = await fileSystem.realpath(filePath)
      if (
        !isInsideRoot(resolvedCanonicalRoot, postOpenCanonicalPath)
        || !isSameCanonicalPath(canonicalFilePath, postOpenCanonicalPath)
      ) return false

      let identityHandle
      let identityStats
      try {
        identityHandle = await fileSystem.open(postOpenCanonicalPath, 'r')
        identityStats = await identityHandle.stat({ bigint: true })
      } finally {
        await identityHandle?.close()
      }
      if (!identityStats?.isFile?.() || !hasSameFileIdentity(fileStats, identityStats)) return false

      const body = request.method === 'GET' ? await handle.readFile() : undefined

      const contentLength = request.method === 'HEAD' ? fileStats.size : body.length
      response.writeHead(200, {
        'content-type': CONTENT_TYPES.get(path.extname(canonicalFilePath).toLowerCase())
          ?? 'application/octet-stream',
        'content-length': String(contentLength),
      })
      response.end(request.method === 'HEAD' ? undefined : body)
      return true
    } catch (error) {
      if (isMissingFileError(error)) return false
      throw error
    } finally {
      await handle?.close()
    }
  }
}
