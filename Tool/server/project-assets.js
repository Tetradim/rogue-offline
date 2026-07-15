import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_ASSET_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 4096
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
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  if (!buffer.length || buffer.toString('base64').replace(/=+$/g, '') !== normalized.replace(/=+$/g, '')) throw requestError('Asset data is not valid base64.')
  if (buffer.length > MAX_ASSET_BYTES) throw requestError(`Asset exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MB limit.`, 413)
  return buffer
}

function startsWithBytes(data, bytes) {
  return data.length >= bytes.length && bytes.every((byte, index) => data[index] === byte)
}

function validatePng(data) {
  if (!startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw requestError('PNG asset has an invalid file signature.')
  if (data.length < 24 || data.toString('ascii', 12, 16) !== 'IHDR') throw requestError('PNG asset has no valid IHDR header.')
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) throw requestError(`PNG dimensions must be between 1 and ${MAX_IMAGE_DIMENSION} pixels.`)
  return { mimeType: 'image/png', width, height }
}

function validateWebp(data) {
  if (data.length < 16 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw requestError('WebP asset has an invalid file signature.')
  return { mimeType: 'image/webp' }
}

function validateAudio(data, extension) {
  if (extension === '.ogg' && data.toString('ascii', 0, 4) !== 'OggS') throw requestError('OGG cry has an invalid file signature.')
  if (extension === '.wav' && (data.length < 12 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE')) throw requestError('WAV cry has an invalid file signature.')
  if (extension === '.mp3' && data.toString('ascii', 0, 3) !== 'ID3' && !(data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) throw requestError('MP3 cry has an invalid file signature.')
  if (extension === '.m4a' && (data.length < 12 || data.toString('ascii', 4, 8) !== 'ftyp')) throw requestError('M4A cry has an invalid file signature.')
  return { mimeType: { '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }[extension] }
}

function validateVariant(data) {
  let value
  try {
    value = JSON.parse(data.toString('utf8'))
  } catch (error) {
    throw requestError(`Variant metadata is not valid JSON: ${error.message}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw requestError('Variant metadata must contain a JSON object.')
  return { mimeType: 'application/json' }
}

function validateAssetData(kind, extension, data) {
  if (extension === '.png') return validatePng(data)
  if (extension === '.webp') return validateWebp(data)
  if (kind === 'cry') return validateAudio(data, extension)
  if (kind === 'variant') return validateVariant(data)
  throw requestError('Unsupported asset data.')
}

async function projectRoots(projectDir) {
  const resolvedProject = await realpath(path.resolve(projectDir))
  const assetsPath = path.join(resolvedProject, 'assets')
  await mkdir(assetsPath, { recursive: true })
  const assetsRoot = await realpath(assetsPath)
  return { resolvedProject, assetsRoot }
}

async function quarantinePath(resolvedProject, canonicalTarget, idFactory) {
  const trashRoot = path.join(resolvedProject, '.studio', 'asset-transactions')
  await mkdir(trashRoot, { recursive: true })
  const quarantine = path.join(trashRoot, safeSegment(idFactory(), 'asset-transaction'))
  await rename(canonicalTarget, quarantine)
  let finished = false
  return {
    async commit() {
      if (finished) return
      finished = true
      await rm(quarantine, { recursive: true, force: true })
    },
    async rollback() {
      if (finished) return
      finished = true
      await mkdir(path.dirname(canonicalTarget), { recursive: true })
      await rename(quarantine, canonicalTarget)
    },
  }
}

export function createProjectAssetRepository({ idFactory = randomUUID } = {}) {
  return {
    async save(projectDir, stageId, kind, file) {
      if (!EXTENSIONS[kind]) throw requestError('Unsupported asset role.')
      const fileName = path.basename(String(file?.fileName || ''))
      if (!fileName) throw requestError('Asset filename is required.')
      const extension = path.extname(fileName).toLowerCase()
      if (!EXTENSIONS[kind].has(extension)) throw requestError(`Unsupported ${kind} file extension.`)
      const data = decodeBase64(file?.dataBase64)
      if (Number(file?.size) && Number(file.size) !== data.length) throw requestError('Asset size does not match the uploaded data.')
      const detected = validateAssetData(kind, extension, data)
      const { resolvedProject, assetsRoot } = await projectRoots(projectDir)
      const stageDirectory = path.join(assetsRoot, safeSegment(stageId, 'stage'))
      await mkdir(stageDirectory, { recursive: true })
      const storedName = `${kind}-${safeSegment(idFactory(), 'asset')}-${safeSegment(path.basename(fileName, extension), kind)}${extension}`
      const target = path.resolve(stageDirectory, storedName)
      if (!isInside(assetsRoot, target)) throw requestError('Asset path escapes the project asset folder.')
      await writeFile(target, data, { flag: 'wx' })
      return {
        asset: {
          assetId: `asset_${safeSegment(idFactory(), 'file')}`,
          kind,
          fileName,
          relativePath: path.relative(resolvedProject, target).replaceAll('\\', '/'),
          mimeType: detected.mimeType,
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
          ...(detected.width ? { width: detected.width, height: detected.height } : {}),
        },
        async rollback() { await rm(target, { force: true }) },
      }
    },

    async quarantine(projectDir, relativePath) {
      if (typeof relativePath !== 'string' || !relativePath.replaceAll('\\', '/').startsWith('assets/')) throw requestError('Only project asset files can be removed.')
      const { resolvedProject, assetsRoot } = await projectRoots(projectDir)
      const requested = path.resolve(resolvedProject, relativePath)
      let canonicalFile
      try {
        canonicalFile = await realpath(requested)
      } catch (error) {
        if (error.code === 'ENOENT') return { missing: true, commit: async () => {}, rollback: async () => {} }
        throw error
      }
      if (!isInside(assetsRoot, canonicalFile) || canonicalFile === assetsRoot) throw requestError('Asset path escapes the project asset folder.')
      return quarantinePath(resolvedProject, canonicalFile, idFactory)
    },

    async quarantineStage(projectDir, stageId) {
      const { resolvedProject, assetsRoot } = await projectRoots(projectDir)
      const stageDirectory = path.join(assetsRoot, safeSegment(stageId, 'stage'))
      let canonicalStage
      try {
        canonicalStage = await realpath(stageDirectory)
      } catch (error) {
        if (error.code === 'ENOENT') return { missing: true, commit: async () => {}, rollback: async () => {} }
        throw error
      }
      if (!isInside(assetsRoot, canonicalStage) || canonicalStage === assetsRoot) throw requestError('Stage asset path escapes the project asset folder.')
      return quarantinePath(resolvedProject, canonicalStage, idFactory)
    },
  }
}
