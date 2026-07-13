import { randomUUID } from 'node:crypto'
import {
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir,
  rename as nodeRename,
  rm as nodeRm,
} from 'node:fs/promises'
import path from 'node:path'

const AUTOSAVE_FILE_PATTERN = /^(\d+)\.json$/
const AUTOSAVE_REVISION_WIDTH = 6
const DEFAULT_FILE_SYSTEM = {
  mkdir: nodeMkdir,
  open: nodeOpen,
  rename: nodeRename,
  rm: nodeRm,
}

export async function writeJsonAtomic(filePath, value, { fileSystem: fileSystemOverrides } = {}) {
  const fileSystem = { ...DEFAULT_FILE_SYSTEM, ...fileSystemOverrides }
  const destination = path.resolve(filePath)
  const parentDir = path.dirname(destination)
  const serialized = JSON.stringify(value, null, 2)
  if (serialized === undefined) {
    throw new TypeError('JSON value cannot be serialized.')
  }

  await fileSystem.mkdir(parentDir, { recursive: true })
  const temporaryPath = path.join(
    parentDir,
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  )

  try {
    const handle = await fileSystem.open(temporaryPath, 'wx')
    try {
      await handle.writeFile(`${serialized}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fileSystem.rename(temporaryPath, destination)
  } catch (error) {
    try {
      await fileSystem.rm(temporaryPath, { force: true })
    } catch {
      // Preserve the write or rename failure; cleanup is best-effort.
    }
    throw error
  }
}

export async function writeAutosave(projectDir, project, limit = 10) {
  const autosaveDir = path.join(path.resolve(projectDir), '.studio', 'autosaves')
  const revisionFileName = `${String(project.revision).padStart(AUTOSAVE_REVISION_WIDTH, '0')}.json`
  await writeJsonAtomic(path.join(autosaveDir, revisionFileName), project)

  const snapshots = (await readdir(autosaveDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && AUTOSAVE_FILE_PATTERN.test(entry.name))
    .map(entry => ({
      name: entry.name,
      revision: BigInt(entry.name.match(AUTOSAVE_FILE_PATTERN)[1]),
    }))
    .sort((left, right) => {
      if (left.revision > right.revision) return -1
      if (left.revision < right.revision) return 1
      return left.name.localeCompare(right.name)
    })

  const retainedCount = Math.max(0, Math.trunc(Number(limit)) || 0)
  await Promise.all(snapshots.slice(retainedCount).map(snapshot => (
    nodeRm(path.join(autosaveDir, snapshot.name), { force: true })
  )))
}
