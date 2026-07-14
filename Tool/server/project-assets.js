import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_ASSET_BYTES = 8 * 1024 * 1024
const EXTENSIONS = {
  sprite: new Set(['.png', '.webp']),
  icon: new Set(['.png', '.webp']),
  cry: new Set(['.ogg', '.m4a', '.mp3', '.wav']),
  variant: new Set(['.json']),
}

function requestError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function safeSegment(value, fallback) {
  const normalized = String(value || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !value.length) throw requestError('Asset data is required.')
  const normalized = value.replace(/\s+/g, '')
  const buffer = Buffer.from(normalized, 'base64')
  if (!buffer.length || buffer.toString('base64').replace(/=+$/g, '') !== normalized.replace(/=+$/g, '')) {
    throw requestError('Asset data is not valid base64.')
  }
  if (buffer.length > MAX_ASSET_BYTES) throw requestError(`Asset exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MB limit.`, 413)
  return buffer
}

export function createProjectAssetRepository({ idFactory = randomUUID } = {}) {
  return {
    async save(projectDir, stageId, kind, file) {
      if (!EXTENSIONS[kind]) throw requestError('Unsupported asset role.')
      const fileName = path.basename(String(file?.fileName || ''))
      const extension = path.extname(fileName).toLowerCase()
      if (!EXTENSIONS[kind].has(extension)) throw requestError(`Unsupported ${kind} file extension.`)
      const data = decodeBase64(file?.dataBase64)
      if (Number(file?.size) && Number(file.size) !== data.length) throw requestError('Asset size does not match the uploaded data.')

      const resolvedProject = await realpath(path.resolve(projectDir))
      const assetsRoot = path.join(resolvedProject, 'assets')
      await mkdir(assetsRoot, { recursive: true })
      const canonicalAssets = await realpath(assetsRoot)
      const stageDirectory = path.join(canonicalAssets, safeSegment(stageId, 'stage'))
      await mkdir(stageDirectory, { recursive: true })
      const storedName = `${kind}-${safeSegment(idFactory(), 'asset')}-${safeSegment(path.basename(fileName, extension), kind)}${extension}`
      const target = path.resolve(stageDirectory, storedName)
      if (!isInside(canonicalAssets, target)) throw requestError('Asset path escapes the project asset folder.')
      await writeFile(target, data, { flag: 'wx' })
      return {
        assetId: `asset_${safeSegment(idFactory(), 'file')}`,
        kind,
        fileName,
        relativePath: path.relative(resolvedProject, target).replaceAll('\\', '/'),
        mimeType: String(file?.mimeType || 'application/octet-stream'),
        size: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      }
    },

    async remove(projectDir, relativePath) {
      if (typeof relativePath !== 'string' || !relativePath.replaceAll('\\', '/').startsWith('assets/')) {
        throw requestError('Only project asset files can be removed.')
      }
      const resolvedProject = await realpath(path.resolve(projectDir))
      const canonicalAssets = await realpath(path.join(resolvedProject, 'assets'))
      const requested = path.resolve(resolvedProject, relativePath)
      let canonicalFile
      try {
        canonicalFile = await realpath(requested)
      } catch (error) {
        if (error.code === 'ENOENT') return { removed: false }
        throw error
      }
      if (!isInside(canonicalAssets, canonicalFile) || canonicalFile === canonicalAssets) throw requestError('Asset path escapes the project asset folder.')
      await rm(canonicalFile, { force: true })
      return { removed: true }
    },
  }
}
