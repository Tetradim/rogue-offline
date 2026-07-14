import { mutationOriginAllowed, readJson, sendJson } from './http-utils.js'

const HEALTH = { ok: true, service: 'pokerogue-mod-studio' }
const ROUTE_METHODS = new Map([
  ['/api/health', ['GET', 'HEAD']],
  ['/api/projects', ['POST', 'PUT']],
  ['/api/projects/open', ['POST']],
  ['/api/dialog/folder', ['POST']],
])

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function isRepositoryInputError(error) {
  return /(?:project\s+(?:name|validation|identity)|invalid\s+project\s+json|cannot\s+save\s+stale|windows\s+folder\s+name|project\s+revision)/i
    .test(error?.message ?? '')
}

function errorStatus(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) {
    return error.statusCode
  }
  const errorCode = error?.code ?? error?.cause?.code
  if (errorCode === 'ENOENT') return 404
  if (errorCode === 'EEXIST') return 409
  if (error instanceof SyntaxError || isRepositoryInputError(error)) return 400
  return 500
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

function sendError(response, request, error) {
  if (response.writableEnded) return
  if (response.headersSent) {
    response.destroy(error)
    return
  }
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : 'Unexpected local service error.'
  sendJson(response, errorStatus(error), { error: message }, {
    head: request.method === 'HEAD',
  })
}

export function createApp({ repository, selectFolder, staticHandler }) {
  async function handleRequest(request, response) {
    const pathname = request.url.split('?', 1)[0]

    if (isApiPath(pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD' && !mutationOriginAllowed(request)) {
        sendJson(response, 403, { error: 'Origin does not match this local service.' })
        return
      }

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

      if (pathname === '/api/health') {
        sendJson(response, 200, HEALTH, { head: request.method === 'HEAD' })
        return
      }

      const body = requireObjectBody(await readJson(request))
      validateRouteBody(pathname, request.method, body)
      if (pathname === '/api/projects' && request.method === 'POST') {
        sendJson(response, 201, await repository.create(body))
        return
      }
      if (pathname === '/api/projects' && request.method === 'PUT') {
        sendJson(response, 200, await repository.save(body.projectDir, body.project))
        return
      }
      if (pathname === '/api/projects/open') {
        sendJson(response, 200, await repository.open(body.projectDir))
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
        sendError(response, request, error)
      } catch (sendFailure) {
        response.destroy(sendFailure)
      }
    })
  }
}
