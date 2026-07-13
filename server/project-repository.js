import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  realpath as nodeRealpath,
  rm as nodeRm,
} from 'node:fs/promises'
import path from 'node:path'
import {
  createBlankProject,
  slugify,
  validateProject,
} from '../shared/project-schema.js'
import { writeAutosave, writeJsonAtomic } from './fs-utils.js'

const WINDOWS_INVALID_FOLDER_CHARACTER = /[<>:"/\\|?*\u0000-\u001f]/
const WINDOWS_RESERVED_FOLDER_BASENAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i
const IMMUTABLE_PROJECT_FIELDS = ['projectId', 'createdAt', 'schemaVersion']
const DEFAULT_FILE_SYSTEM = {
  mkdir: nodeMkdir,
  readFile: nodeReadFile,
  realpath: nodeRealpath,
  rm: nodeRm,
}

function resolveNow(now) {
  return typeof now === 'function' ? now() : now
}

function formatValidationErrors(errors) {
  return errors.map(error => `${error.path}: ${error.message}`).join('; ')
}

function assertValidProject(project, location) {
  const errors = validateProject(project)
  if (!errors.length) return

  const locationMessage = location ? ` for "${location}"` : ''
  throw new Error(`Project validation failed${locationMessage}: ${formatValidationErrors(errors)}`)
}

function assertWindowsFolderName(name) {
  if (
    name === '.'
    || name === '..'
    || WINDOWS_INVALID_FOLDER_CHARACTER.test(name)
    || /[. ]$/.test(name)
    || WINDOWS_RESERVED_FOLDER_BASENAME.test(name)
  ) {
    throw new Error('Project name cannot be used as a Windows folder name.')
  }
}

function resolveDirectChild(parentDir, directoryName) {
  const candidate = path.resolve(parentDir, directoryName)
  if (path.dirname(candidate) !== parentDir) {
    throw new Error('Project name cannot be used as a Windows folder name.')
  }
  return candidate
}

async function claimAvailableProjectDirectory(fileSystem, parentDir, name) {
  await fileSystem.mkdir(parentDir, { recursive: true })
  for (let ordinal = 1; ; ordinal += 1) {
    const directoryName = ordinal === 1 ? name : `${name}-${ordinal}`
    const candidate = resolveDirectChild(parentDir, directoryName)
    try {
      await fileSystem.mkdir(candidate)
      return candidate
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

async function readCanonicalProject(fileSystem, resolvedProjectDir) {
  const canonicalPath = path.join(resolvedProjectDir, 'project.json')
  const canonicalText = await fileSystem.readFile(canonicalPath, 'utf8')
  let project
  try {
    project = JSON.parse(canonicalText)
  } catch (error) {
    throw new Error(`Invalid project JSON in "${canonicalPath}": ${error.message}`, { cause: error })
  }

  assertValidProject(project, canonicalPath)
  return { canonicalPath, project }
}

async function cleanupFailedCreate(fileSystem, projectDir, initializationError) {
  try {
    await fileSystem.rm(projectDir, { recursive: true, force: true })
  } catch (cleanupError) {
    throw new AggregateError(
      [initializationError, cleanupError],
      `Project initialization failed: ${initializationError.message}; cleanup failed: ${cleanupError.message}`,
      { cause: initializationError },
    )
  }
  throw initializationError
}

function enqueueProjectSave(saveQueues, projectDir, operation) {
  const previousTail = saveQueues.get(projectDir) ?? Promise.resolve()
  const result = previousTail.then(operation)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  saveQueues.set(projectDir, tail)

  return result.finally(() => {
    if (saveQueues.get(projectDir) === tail) {
      saveQueues.delete(projectDir)
    }
  })
}

async function resolveProjectSaveQueueKey(fileSystem, resolvedProjectDir) {
  let canonicalProjectDir
  try {
    canonicalProjectDir = await fileSystem.realpath(resolvedProjectDir)
  } catch (error) {
    throw new Error(
      `Could not resolve project directory "${resolvedProjectDir}" for saving: ${error.message}`,
      { cause: error },
    )
  }

  const normalizedProjectDir = path.normalize(path.resolve(canonicalProjectDir))
  return process.platform === 'win32'
    ? normalizedProjectDir.toLowerCase()
    : normalizedProjectDir
}

export function createProjectRepository({
  now = () => new Date().toISOString(),
  idFactory,
  fileSystem: fileSystemOverrides,
} = {}) {
  const fileSystem = { ...DEFAULT_FILE_SYSTEM, ...fileSystemOverrides }
  const saveQueues = new Map()
  return {
    async create({ parentDir, name }) {
      const trimmedName = typeof name === 'string' ? name.trim() : ''
      if (!trimmedName) {
        throw new Error('Project name is required.')
      }
      assertWindowsFolderName(trimmedName)

      const project = createBlankProject({ name: trimmedName, idFactory, now })
      assertValidProject(project)

      const resolvedParentDir = path.resolve(parentDir)
      const projectDir = await claimAvailableProjectDirectory(fileSystem, resolvedParentDir, trimmedName)
      try {
        await fileSystem.mkdir(path.join(projectDir, 'assets'), { recursive: true })
        await fileSystem.mkdir(path.join(projectDir, '.studio', 'operation-logs'), { recursive: true })
        await writeJsonAtomic(path.join(projectDir, 'project.json'), project)
        await writeAutosave(projectDir, project)
        return { projectDir, project }
      } catch (error) {
        return cleanupFailedCreate(fileSystem, projectDir, error)
      }
    },

    async open(projectDir) {
      const resolvedProjectDir = path.resolve(projectDir)
      const { project } = await readCanonicalProject(fileSystem, resolvedProjectDir)
      return { projectDir: resolvedProjectDir, project }
    },

    async save(projectDir, editedProject) {
      const resolvedProjectDir = path.resolve(projectDir)
      const saveQueueKey = await resolveProjectSaveQueueKey(fileSystem, resolvedProjectDir)
      return enqueueProjectSave(saveQueues, saveQueueKey, async () => {
        const { canonicalPath, project: canonicalProject } = await readCanonicalProject(
          fileSystem,
          resolvedProjectDir,
        )
        const changedIdentityFields = IMMUTABLE_PROJECT_FIELDS.filter(field => (
          editedProject?.[field] !== canonicalProject[field]
        ))
        if (changedIdentityFields.length) {
          throw new Error(
            `Project identity mismatch: ${changedIdentityFields.join(', ')} must match the canonical project.`,
          )
        }
        if (!Number.isInteger(editedProject.revision) || editedProject.revision <= 0) {
          throw new Error(
            `Project validation failed for "${canonicalPath}": revision: Project revision must be a positive integer.`,
          )
        }
        if (editedProject.revision < canonicalProject.revision) {
          throw new Error(
            `Cannot save stale project revision ${editedProject.revision}; canonical revision is ${canonicalProject.revision}.`,
          )
        }

        const saved = {
          ...editedProject,
          slug: slugify(editedProject?.name),
          revision: Math.max(canonicalProject.revision, editedProject?.revision) + 1,
          updatedAt: resolveNow(now),
        }
        assertValidProject(saved, canonicalPath)

        await writeAutosave(resolvedProjectDir, saved)
        await writeJsonAtomic(canonicalPath, saved)
        return { projectDir: resolvedProjectDir, project: saved }
      })
    },
  }
}
