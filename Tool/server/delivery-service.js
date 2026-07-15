import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildDeliveryManifest, reviewProject } from '../shared/project-review.js'
import { validateProject } from '../shared/project-schema.js'
import { writeJsonAtomic } from './fs-utils.js'
import { analyzePokeRogueTarget } from './target-discovery.js'
import { verifyTargetBuild } from './target-verifier.js'

const execFileAsync = promisify(execFile)

function deliveryError(message, statusCode = 400, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { statusCode })
}

function formatIssues(report) {
  return report.issues.filter(item => item.severity === 'error').map(item => `${item.path}: ${item.message}`).join('; ')
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function readProject(projectDir, expectedRevision) {
  const canonicalDir = await realpath(path.resolve(projectDir))
  let project
  try {
    project = JSON.parse(await readFile(path.join(canonicalDir, 'project.json'), 'utf8'))
  } catch (error) {
    throw deliveryError(`Could not read portable project: ${error.message}`, error.code === 'ENOENT' ? 404 : 400, error)
  }
  const validation = validateProject(project)
  if (validation.length) throw deliveryError(`Portable project is invalid: ${validation.map(item => `${item.path}: ${item.message}`).join('; ')}`, 422)
  if (!Number.isInteger(expectedRevision) || expectedRevision !== project.revision) {
    throw deliveryError(`Project revision mismatch: expected saved revision ${expectedRevision}, canonical revision is ${project.revision}. Save the project before delivery.`, 409)
  }
  return { projectDir: canonicalDir, project }
}

function bindingFor(project, analysis) {
  const stored = (project.targetBindings || []).find(binding => binding.targetId === analysis.targetId || binding.targetDir === analysis.targetDir)
  return {
    ...(stored || {}),
    ...analysis,
    targetId: analysis.targetId,
    targetDir: analysis.targetDir,
    capabilities: analysis.capabilities,
    layout: analysis.layout,
    warnings: analysis.warnings,
    validationIssues: analysis.validationIssues,
    stageAllocations: { ...analysis.stageAllocations },
    boundAt: stored?.boundAt || new Date().toISOString(),
    analyzedAt: new Date().toISOString(),
  }
}

function projectWithBinding(project, binding) {
  const bindings = (project.targetBindings || []).filter(candidate => candidate.targetId !== binding.targetId && candidate.targetDir !== binding.targetDir)
  return { ...project, targetBindings: [...bindings, binding] }
}

function portableBinding(binding) {
  if (!binding) return null
  return {
    targetId: binding.targetId,
    adapter: binding.adapter,
    fingerprint: binding.fingerprint,
    revision: binding.revision,
    stageAllocations: { ...(binding.stageAllocations || {}) },
  }
}

function portableProject(project) {
  return {
    ...project,
    targetBindings: [],
  }
}

export function createDeliveryService({
  installerPath,
  runProcess = async (file, args, options) => execFileAsync(file, args, options),
  verifyTarget = verifyTargetBuild,
  nodePath = process.execPath,
} = {}) {
  if (!installerPath) throw new TypeError('Delivery service requires an installer path.')

  async function prepare(projectDir, targetDir, expectedRevision) {
    const opened = await readProject(projectDir, expectedRevision)
    const analysis = await analyzePokeRogueTarget(targetDir, opened.project)
    const binding = bindingFor(opened.project, analysis)
    const project = projectWithBinding(opened.project, binding)
    const report = reviewProject(project, { requireTarget: true, validateTargetCapabilities: true })
    if (!report.ready) throw deliveryError(`Project is not ready for delivery: ${formatIssues(report)}`, 422)
    const manifest = buildDeliveryManifest(project, binding, { sourceRoot: opened.projectDir })
    const deliveryDir = path.join(opened.projectDir, '.studio', 'delivery')
    await mkdir(deliveryDir, { recursive: true })
    const manifestPath = path.join(deliveryDir, `${analysis.targetId}.manifest.json`)
    await writeJsonAtomic(manifestPath, manifest)
    return { ...opened, project, analysis, binding, manifest, manifestPath }
  }

  async function execute(args) {
    try {
      const result = await runProcess(nodePath, [installerPath, ...args], {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
      return `${result.stdout || ''}${result.stderr || ''}`.trim()
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`.trim()
      throw deliveryError(output || error.message || 'Installer operation failed.', 409, error)
    }
  }

  async function preflight(prepared, { force = false } = {}) {
    const args = ['--manifest', prepared.manifestPath, '--project', prepared.analysis.targetDir, '--dry-run']
    if (force) args.push('--force')
    const sourcePlan = await execute(args)
    let buildOutput
    try {
      buildOutput = await verifyTarget({
        analysis: prepared.analysis,
        manifestPath: prepared.manifestPath,
        installerPath,
        nodePath,
        runProcess,
      })
    } catch (error) {
      if (error?.statusCode) throw error
      throw deliveryError(error.message || 'Isolated target build failed.', 422, error)
    }
    return `${sourcePlan}\n\nIsolated target verification passed.${buildOutput ? `\n${buildOutput}` : ''}`
  }

  return {
    async plan(projectDir, targetDir, expectedRevision) {
      const prepared = await prepare(projectDir, targetDir, expectedRevision)
      const output = await preflight(prepared)
      return { title: 'Preflight and isolated target build passed', output, target: prepared.analysis, manifest: prepared.manifest }
    },

    async apply(projectDir, targetDir, { force = false, expectedRevision } = {}) {
      const prepared = await prepare(projectDir, targetDir, expectedRevision)
      const preflightOutput = await preflight(prepared, { force })
      const args = ['--manifest', prepared.manifestPath, '--project', prepared.analysis.targetDir]
      if (force) args.push('--force')
      const applied = await execute(args)
      return {
        title: force ? 'Mod updated transactionally' : 'Mod installed transactionally',
        output: `${preflightOutput}\n\n${applied}`,
        target: prepared.analysis,
      }
    },

    async uninstall(targetDir, modId) {
      const analysis = await analyzePokeRogueTarget(targetDir)
      const output = await execute(['--project', analysis.targetDir, '--uninstall', modId])
      return { title: 'Mod uninstalled after conflict checks', output, target: analysis }
    },

    async packageProject(projectDir, outputDir, expectedRevision, targetId = null) {
      const opened = await readProject(projectDir, expectedRevision)
      const report = reviewProject(opened.project, { validateTargetCapabilities: false })
      if (!report.ready) throw deliveryError(`Project is not ready to package: ${formatIssues(report)}`, 422)
      const selected = (opened.project.targetBindings || []).find(item => targetId && item.targetId === targetId) || null
      const binding = portableBinding(selected)
      const sanitizedProject = portableProject(opened.project)
      const manifest = buildDeliveryManifest(sanitizedProject, binding)
      const canonicalAssetsRoot = await realpath(path.join(opened.projectDir, 'assets'))
      const embeddedAssets = []
      const seenPaths = new Set()
      for (const stage of opened.project.stages) {
        for (const asset of stage.assets || []) {
          const requested = path.resolve(opened.projectDir, asset.relativePath)
          let canonicalFile
          try {
            canonicalFile = await realpath(requested)
          } catch (error) {
            throw deliveryError(`Asset file is missing: ${asset.fileName || asset.relativePath}`, error.code === 'ENOENT' ? 404 : 400, error)
          }
          if (!isInside(canonicalAssetsRoot, canonicalFile) || canonicalFile === canonicalAssetsRoot) throw deliveryError(`Asset path escapes project assets: ${asset.relativePath}`)
          const relative = asset.relativePath.replaceAll('\\', '/')
          if (seenPaths.has(relative)) throw deliveryError(`Asset path is duplicated in the project: ${relative}`, 422)
          seenPaths.add(relative)
          const data = await readFile(canonicalFile)
          const hash = createHash('sha256').update(data).digest('hex')
          if (!asset.sha256 || asset.sha256 !== hash) throw deliveryError(`Asset hash changed since import: ${asset.fileName || asset.relativePath}`, 409)
          embeddedAssets.push({ stageId: stage.stageId, ...asset, sha256: hash, dataBase64: data.toString('base64') })
        }
      }
      const packageValue = {
        format: 'pokerogue-mod-package',
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        project: sanitizedProject,
        manifest,
        assets: embeddedAssets,
      }
      const resolvedOutput = path.resolve(outputDir)
      await mkdir(resolvedOutput, { recursive: true })
      const canonicalOutput = await realpath(resolvedOutput)
      const packagePath = path.join(canonicalOutput, `${opened.project.slug}.pokerogue-mod-package.json`)
      await writeJsonAtomic(packagePath, packageValue)
      return { title: 'Portable mod package exported without machine-local target paths', packagePath, assetCount: embeddedAssets.length }
    },
  }
}
