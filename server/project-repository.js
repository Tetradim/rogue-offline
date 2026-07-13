import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  createBlankProject,
  slugify,
  validateProject,
} from '../shared/project-schema.js'
import { writeAutosave, writeJsonAtomic } from './fs-utils.js'

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

async function claimAvailableProjectDirectory(parentDir, name) {
  await mkdir(parentDir, { recursive: true })
  for (let ordinal = 1; ; ordinal += 1) {
    const directoryName = ordinal === 1 ? name : `${name}-${ordinal}`
    const candidate = path.join(parentDir, directoryName)
    try {
      await mkdir(candidate)
      return candidate
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

export function createProjectRepository({
  now = () => new Date().toISOString(),
  idFactory,
} = {}) {
  return {
    async create({ parentDir, name }) {
      const trimmedName = typeof name === 'string' ? name.trim() : ''
      if (!trimmedName) {
        throw new Error('Project name is required.')
      }

      const project = createBlankProject({ name: trimmedName, idFactory, now })
      assertValidProject(project)

      const resolvedParentDir = path.resolve(parentDir)
      const projectDir = await claimAvailableProjectDirectory(resolvedParentDir, trimmedName)
      try {
        await Promise.all([
          mkdir(path.join(projectDir, 'assets'), { recursive: true }),
          mkdir(path.join(projectDir, '.studio', 'operation-logs'), { recursive: true }),
        ])
        await writeJsonAtomic(path.join(projectDir, 'project.json'), project)
        await writeAutosave(projectDir, project)
        return { projectDir, project }
      } catch (error) {
        try {
          await rm(projectDir, { recursive: true, force: true })
        } catch {
          // Preserve the project creation error; cleanup is best-effort.
        }
        throw error
      }
    },

    async open(projectDir) {
      const resolvedProjectDir = path.resolve(projectDir)
      const canonicalPath = path.join(resolvedProjectDir, 'project.json')
      const canonicalText = await readFile(canonicalPath, 'utf8')
      let project
      try {
        project = JSON.parse(canonicalText)
      } catch (error) {
        throw new Error(`Invalid project JSON in "${canonicalPath}": ${error.message}`, { cause: error })
      }

      assertValidProject(project, canonicalPath)
      return { projectDir: resolvedProjectDir, project }
    },

    async save(projectDir, editedProject) {
      const resolvedProjectDir = path.resolve(projectDir)
      const saved = {
        ...editedProject,
        slug: slugify(editedProject?.name),
        revision: editedProject?.revision + 1,
        updatedAt: resolveNow(now),
      }
      assertValidProject(saved, path.join(resolvedProjectDir, 'project.json'))

      await writeJsonAtomic(path.join(resolvedProjectDir, 'project.json'), saved)
      await writeAutosave(resolvedProjectDir, saved)
      return { projectDir: resolvedProjectDir, project: saved }
    },
  }
}
