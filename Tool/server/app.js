import { addStageAsset, removeStageAsset } from '../shared/project-authoring.js'
import { removeStage } from '../shared/project-schema.js'
import { mutationOriginAllowed, readJson, sendJson } from './http-utils.js'

const HEALTH = { ok: true, service: 'pokerogue-mod-studio' }
const ASSET_UPLOAD_JSON_LIMIT = 16 * 1024 * 1024
const MOD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/
const ROUTE_METHODS = new Map([
  ['/api/health', ['GET', 'HEAD']],
  ['/api/projects', ['POST', 'PUT']],
  ['/api/projects/open', ['POST']],
  ['/api/projects/assets', ['POST']],
  ['/api/projects/assets/remove', ['POST']],
  ['/api/projects/stages/remove', ['POST']],
  ['/api/dialog/folder', ['POST']],
  ['/api/targets/analyze', ['POST']],
  ['/api/delivery/plan', ['POST']],
  ['/api/delivery/apply', ['POST']],
  ['/api/delivery/uninstall', ['POST']],
  ['/api/delivery/package', ['POST']],
])

function httpError(message, statusCode, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { statusCode })
}

function unavailable(name) {
  return async () => { throw httpError(`${name} is unavailable in this companion configuration.`, 501) }
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function errorStatus(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) return error.statusCode
  return 500
}

function projectErrorStatus(error) {
  const explicitStatus = errorStatus(error)
  if (explicitStatus !== 500 || error?.statusCode === 500) return explicitStatus
  const errorCode = error?.code ?? error?.cause?.code
  if (errorCode === 'ENOENT') return 404
  if (errorCode === 'EACCES' || errorCode === 'EPERM') return 403
  const message = error?.message ?? ''
  if (/(?:cannot save stale project revision|project identity mismatch|already installed|revision mismatch)/i.test(message)) return 409
  if (/(?:project validation failed|project name (?:is required|cannot be used)|invalid project (?:json|import|shape)|unsupported project)/i.test(message)) return 400
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError('JSON request body must be an object.', 400)
  return value
}

function requireStringField(body, field) {
  if (typeof body[field] !== 'string' || !body[field].trim()) throw httpError(`JSON request field "${field}" must be a non-empty string.`, 400)
}

function requireProjectField(body) {
  if (!body.project || typeof body.project !== 'object' || Array.isArray(body.project)) throw httpError('JSON request field "project" must be an object.', 400)
}

function requireRevision(body) {
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) throw httpError('JSON request field "expectedRevision" must be a positive integer.', 400)
}

function validateRouteBody(pathname, method, body) {
  if (pathname === '/api/projects' && method === 'POST') {
    requireStringField(body, 'parentDir')
    requireStringField(body, 'name')
  } else if (pathname === '/api/projects' && method === 'PUT') {
    requireStringField(body, 'projectDir')
    requireProjectField(body)
  } else if (pathname === '/api/projects/open') requireStringField(body, 'projectDir')
  else if (pathname === '/api/projects/assets') {
    requireStringField(body, 'projectDir')
    requireStringField(body, 'stageId')
    requireStringField(body, 'kind')
    requireProjectField(body)
    if (!body.file || typeof body.file !== 'object' || Array.isArray(body.file)) throw httpError('JSON request field "file" must be an object.', 400)
  } else if (pathname === '/api/projects/assets/remove') {
    requireStringField(body, 'projectDir')
    requireStringField(body, 'stageId')
    requireStringField(body, 'assetId')
    requireStringField(body, 'relativePath')
    requireProjectField(body)
  } else if (pathname === '/api/projects/stages/remove') {
    requireStringField(body, 'projectDir')
    requireStringField(body, 'stageId')
    requireProjectField(body)
  } else if (pathname === '/api/targets/analyze') {
    requireStringField(body, 'targetDir')
    if (body.project !== undefined) requireProjectField(body)
  } else if (pathname === '/api/delivery/plan' || pathname === '/api/delivery/apply') {
    requireStringField(body, 'projectDir')
    requireStringField(body, 'targetDir')
    requireRevision(body)
  } else if (pathname === '/api/delivery/uninstall') {
    requireStringField(body, 'targetDir')
    requireStringField(body, 'modId')
    if (!MOD_ID_PATTERN.test(body.modId)) throw httpError('Mod ID must contain only lowercase letters, numbers, underscores, or hyphens.', 400)
  } else if (pathname === '/api/delivery/package') {
    requireStringField(body, 'projectDir')
    requireStringField(body, 'outputDir')
    requireRevision(body)
  } else if (pathname === '/api/dialog/folder' && body.description !== undefined && typeof body.description !== 'string') {
    throw httpError('JSON request field "description" must be a string.', 400)
  }
}

function sendMethodNotAllowed(response, request, methods) {
  response.setHeader('allow', methods.join(', '))
  sendJson(response, 405, { error: 'Method not allowed.' }, { head: request.method === 'HEAD' })
}

function reportInternalError(onError, error, request) {
  try {
    const result = onError(error, request)
    result?.catch?.(() => {})
  } catch {
    // Diagnostic callbacks are isolated.
  }
}

function sendError(response, request, error, onError) {
  const statusCode = errorStatus(error)
  if (statusCode >= 500) reportInternalError(onError, error, request)
  if (response.writableEnded) return
  if (response.headersSent) {
    response.destroy(error)
    return
  }
  sendJson(response, statusCode, { error: statusCode >= 500 ? 'Internal service error.' : error.message }, { head: request.method === 'HEAD' })
}

function emptyFileTransaction() {
  return {
    commit: async () => {},
    rollback: async () => {},
  }
}

async function compensateMetadataCommit(repository, projectDir, originalProject, savedPayload, transaction, commitError) {
  try {
    await transaction.rollback()
    await repository.save(projectDir, { ...originalProject, revision: savedPayload.project.revision })
  } catch (rollbackError) {
    throw new AggregateError([commitError, rollbackError], `Asset transaction failed and project metadata could not be restored: ${rollbackError.message}`, { cause: commitError })
  }
  throw commitError
}

export function createApp({
  repository,
  selectFolder,
  staticHandler,
  assetRepository = {
    save: unavailable('Asset upload'),
    quarantine: unavailable('Asset removal'),
    quarantineStage: unavailable('Stage asset removal'),
  },
  analyzeTarget = unavailable('Target analysis'),
  deliveryService = {
    plan: unavailable('Delivery planning'),
    apply: unavailable('Delivery installation'),
    uninstall: unavailable('Delivery uninstall'),
    packageProject: unavailable('Package export'),
  },
  onError = () => {},
}) {
  async function uploadAsset(body) {
    const stage = body.project.stages?.find(candidate => candidate.stageId === body.stageId)
    if (!stage) throw httpError('Asset stage does not exist in the submitted project.', 409)
    const previousAsset = stage.assets?.find(asset => asset.kind === body.kind)
    const previousTransaction = previousAsset
      ? await assetRepository.quarantine(body.projectDir, previousAsset.relativePath)
      : emptyFileTransaction()
    let transaction
    try {
      transaction = await assetRepository.save(body.projectDir, body.stageId, body.kind, body.file)
    } catch (error) {
      await previousTransaction.rollback().catch(() => {})
      throw error
    }

    let saved
    try {
      const nextProject = addStageAsset(body.project, body.stageId, transaction.asset)
      saved = await repository.save(body.projectDir, nextProject)
    } catch (error) {
      await transaction.rollback().catch(() => {})
      await previousTransaction.rollback().catch(() => {})
      throw error
    }

    try {
      await previousTransaction.commit()
      return { ...saved, asset: transaction.asset }
    } catch (error) {
      await transaction.rollback().catch(() => {})
      return compensateMetadataCommit(repository, body.projectDir, body.project, saved, previousTransaction, error)
    }
  }

  async function removeAsset(body) {
    const transaction = await assetRepository.quarantine(body.projectDir, body.relativePath)
    let saved
    try {
      const nextProject = removeStageAsset(body.project, body.stageId, body.assetId)
      saved = await repository.save(body.projectDir, nextProject)
    } catch (error) {
      await transaction.rollback().catch(() => {})
      throw error
    }
    try {
      await transaction.commit()
      return saved
    } catch (error) {
      return compensateMetadataCommit(repository, body.projectDir, body.project, saved, transaction, error)
    }
  }

  async function removeProjectStage(body) {
    const nextProject = removeStage(body.project, body.stageId)
    if (nextProject === body.project) throw httpError('Stage could not be removed.', 409)
    const transaction = await assetRepository.quarantineStage(body.projectDir, body.stageId)
    let saved
    try {
      saved = await repository.save(body.projectDir, nextProject)
    } catch (error) {
      await transaction.rollback().catch(() => {})
      throw error
    }
    try {
      await transaction.commit()
      return saved
    } catch (error) {
      return compensateMetadataCommit(repository, body.projectDir, body.project, saved, transaction, error)
    }
  }

  async function handleRequest(request, response) {
    const pathname = request.url.split('?', 1)[0]
    if (isApiPath(pathname)) {
      const allowedMethods = ROUTE_METHODS.get(pathname)
      if (!allowedMethods) {
        sendJson(response, 404, { error: 'API route not found.' }, { head: request.method === 'HEAD' })
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

      const body = requireObjectBody(await readJson(request, {
        limit: pathname === '/api/projects/assets' ? ASSET_UPLOAD_JSON_LIMIT : undefined,
      }))
      validateRouteBody(pathname, request.method, body)
      if (pathname === '/api/projects' && request.method === 'POST') return sendJson(response, 201, await runProjectOperation(() => repository.create(body)))
      if (pathname === '/api/projects' && request.method === 'PUT') return sendJson(response, 200, await runProjectOperation(() => repository.save(body.projectDir, body.project)))
      if (pathname === '/api/projects/open') return sendJson(response, 200, await runProjectOperation(() => repository.open(body.projectDir)))
      if (pathname === '/api/projects/assets') return sendJson(response, 201, await runProjectOperation(() => uploadAsset(body)))
      if (pathname === '/api/projects/assets/remove') return sendJson(response, 200, await runProjectOperation(() => removeAsset(body)))
      if (pathname === '/api/projects/stages/remove') return sendJson(response, 200, await runProjectOperation(() => removeProjectStage(body)))
      if (pathname === '/api/dialog/folder') return sendJson(response, 200, { path: await selectFolder(body.description) })
      if (pathname === '/api/targets/analyze') return sendJson(response, 200, await analyzeTarget(body.targetDir, body.project))
      if (pathname === '/api/delivery/plan') return sendJson(response, 200, await deliveryService.plan(body.projectDir, body.targetDir, body.expectedRevision))
      if (pathname === '/api/delivery/apply') return sendJson(response, 200, await deliveryService.apply(body.projectDir, body.targetDir, { force: Boolean(body.force), expectedRevision: body.expectedRevision }))
      if (pathname === '/api/delivery/uninstall') return sendJson(response, 200, await deliveryService.uninstall(body.targetDir, body.modId))
      if (pathname === '/api/delivery/package') return sendJson(response, 201, await deliveryService.packageProject(body.projectDir, body.outputDir, body.expectedRevision, body.targetId || null))
      return
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && await staticHandler(request, response)) return
    sendJson(response, 404, { error: 'Static file not found.' }, { head: request.method === 'HEAD' })
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
