const DEFAULT_JSON_LIMIT = 1024 * 1024

function requestError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

function hasJsonContentType(request) {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string') return false
  return contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

function drainRequest(request) {
  request.once('error', () => {})
  request.resume()
}

export async function readJson(request, { limit = DEFAULT_JSON_LIMIT } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError('JSON body limit must be a non-negative safe integer.')
  }
  if (!hasJsonContentType(request)) {
    drainRequest(request)
    throw requestError('Content-Type must be application/json.', 415)
  }

  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    drainRequest(request)
    throw requestError('JSON request body is too large.', 413)
  }

  const body = await new Promise((resolve, reject) => {
    const chunks = []
    let totalLength = 0
    let settled = false

    function rejectAndDrain(error) {
      if (settled) return
      settled = true
      chunks.length = 0
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('aborted', onAborted)
      request.resume()
      reject(error)
    }

    function onData(chunk) {
      totalLength += chunk.length
      if (totalLength > limit) {
        rejectAndDrain(requestError('JSON request body is too large.', 413))
        return
      }
      chunks.push(chunk)
    }

    function onEnd() {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    }

    function onAborted() {
      rejectAndDrain(requestError('JSON request body was aborted.', 400))
    }

    function onError(error) {
      rejectAndDrain(requestError(`Could not read JSON request body: ${error.message}`, 400))
    }

    request.on('data', onData)
    request.once('end', onEnd)
    request.once('aborted', onAborted)
    request.once('error', onError)
  })

  if (!body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch (error) {
    throw requestError('Malformed JSON request body.', 400)
  }
}

export function sendJson(response, statusCode, value, { head = false } = {}) {
  const body = JSON.stringify(value ?? null)
  const length = Buffer.byteLength(body)
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(length),
  })
  response.end(head ? undefined : body)
}

export function mutationOriginAllowed(request) {
  const origin = request.headers.origin
  if (origin === undefined) return true
  const host = request.headers.host
  const localPort = request.socket?.localPort
  if (
    typeof origin !== 'string'
    || typeof host !== 'string'
    || request.socket?.localAddress !== '127.0.0.1'
    || !Number.isInteger(localPort)
  ) return false

  const serializedHost = localPort === 80 ? '127.0.0.1' : `127.0.0.1:${localPort}`
  const validHost = host === serializedHost || (localPort === 80 && host === '127.0.0.1:80')
  return validHost && origin === `http://${serializedHost}`
}
