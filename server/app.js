import { mutationOriginAllowed, readJson, sendJson } from './http-utils.js'

const HEALTH = { ok: true, service: 'pokerogue-mod-studio' }
const ROUTE_METHODS = new Map([
  ['/api/health', ['GET', 'HEAD']],
  ['/api/projects', ['POST', 'PUT']],
  ['/api/projects/open', ['POST']],
  ['/api/dialog/folder', ['POST']],
])

function httpError(message, statusCode, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { statusCode })
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function errorStatus(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) {
    return error.statusCode
  }
  return 500
}

function projectErrorStatus(error) {
  const explicitStatus = errorStatus(error)
  if (explicitStatus !== 500 || error?.statusCode === 500) return explicitStatus

  const errorCode = error?.code ?? error?.cause?.code
  if (errorCode === 'ENOENT') return 404
  if (errorCode === 'EACCES' || errorCode === 'EPERM') return 403

  const message = error?.message ?? ''
  if (/(?:cannot save stale project revision|project identity mismatch)/i.test(message)) return 409
  if (
    /(?:project validation failed|project name (?:is required|cannot be used)|invalid project (?:json|import|shape)|unsupported project)/i
      .test(message)
  ) return 400
  return 500
}

async function runProjectOperation(operation) {
  try {
    return await operation()
  } catch (error) {
    const statusCode = projectErrorStatus(error)
    if (statusCode === 500 && error?.statusCode === undefined) throw error
    if (error?.statusCode === statusCode) throw error
    throw httpError(error.message, statusCode, error)
  }
}

function requireObjectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError('JSON request body must be an object.', 400)
  }
  return value
}

function requireStringField(body, field) {
  if (typeof body[field] !== 'string' || !body[field].trim()) {
    throw httpError(`JSON request field "${field}" must be a non-empty string.`, 400)
  }
}

function validateRouteBody(pathname, method, body) {
  if (pathname === '/api/projects' && method === 'POST') {
    requireStringField(body, 'parentDir')
    requireStringField(body, 'name')
  } else if (pathname === '/api/projects' && method === 'PUT') {
    requireStringField(body, 'projectDir')
    if (!body.project || typeof body.project !== 'object' || Array.isArray(body.project)) {
      throw httpError('JSON request field "project" must be an object.', 400)
    }
  } else if (pathname === '/api/projects/open') {
    requireStringField(body, 'projectDir')
  } else if (
    pathname === '/api/dialog/folder'
    && body.description !== undefined
    && typeof body.description !== 'string'
  ) {
    throw httpError('JSON request field "description" must be a string.', 400)
  }
}

function sendMethodNotAllowed(response, request, methods) {
  response.setHeader('allow', methods.join(', '))
  sendJson(response, 405, { error: 'Method not allowed.' }, {
    head: request.method === 'HEAD',
  })
}

function reportInternalError(onError, error, request) {
  try {
    const result = onError(error, request)
    result?.catch?.(() => {})
  } catch {
    // Error reporting must never create a second listener failure.
  }
}

function sendError(response, request, error, onError) {
  if (response.writableEnded) return
  if (response.headersSent) {
    response.destroy(error)
    return
  }
  const statusCode = errorStatus(error)
  if (statusCode >= 500) reportInternalError(onError, error, request)
  const message = statusCode >= 500
    ? 'Internal service error.'
    : error.message
  sendJson(response, statusCode, { error: message }, {
    head: request.method === 'HEAD',
  })
}

export function createApp({ repository, selectFolder, staticHandler, onError = () => {} }) {
  async function handleRequest(request, response) {
    const pathname = request.url.split('?', 1)[0]

    if (isApiPath(pathname)) {
      const allowedMethods = ROUTE_METHODS.get(pathname)
      if (!allowedMethods) {
        sendJson(response, 404, { error: 'API route not found.' }, {
          head: request.method === 'HEAD',
        })
        return
      }
      if (!allowedMethods.includes(request.method)) {
        sendMethodNotAllowed(response, request, allowedMethods)
        return
      }

      if (request.method !== 'GET' && request.method !== 'HEAD' && !mutationOriginAllowed(request)) {
        sendJson(response, 403, { error: 'Origin does not match this local service.' })
        return
      }

      if (pathname === '/api/health') {
        sendJson(response, 200, HEALTH, { head: request.method === 'HEAD' })
        return
      }

      const body = requireObjectBody(await readJson(request))
      validateRouteBody(pathname, request.method, body)
      if (pathname === '/api/projects' && request.method === 'POST') {
        sendJson(response, 201, await runProjectOperation(() => repository.create(body)))
        return
      }
      if (pathname === '/api/projects' && request.method === 'PUT') {
        sendJson(response, 200, await runProjectOperation(
          () => repository.save(body.projectDir, body.project),
        ))
        return
      }
      if (pathname === '/api/projects/open') {
        sendJson(response, 200, await runProjectOperation(() => repository.open(body.projectDir)))
        return
      }
      if (pathname === '/api/dialog/folder') {
        sendJson(response, 200, { path: await selectFolder(body.description) })
      }
      return
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && await staticHandler(request, response)) {
      return
    }
    sendJson(response, 404, { error: 'Static file not found.' }, {
      head: request.method === 'HEAD',
    })
  }

  return function localCompanionApp(request, response) {
    void handleRequest(request, response).catch(error => {
      try {
        sendError(response, request, error, onError)
      } catch (sendFailure) {
        response.destroy(sendFailure)
      }
    })
  }
}
