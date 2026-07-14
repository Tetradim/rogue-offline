import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildDeliveryManifest, reviewProject } from '../shared/project-review.js'
import { writeJsonAtomic } from './fs-utils.js'
import { analyzePokeRogueTarget } from './target-discovery.js'

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

async function readProject(projectDir) {
  const canonicalDir = await realpath(path.resolve(projectDir))
  let project
  try {
    project = JSON.parse(await readFile(path.join(canonicalDir, 'project.json'), 'utf8'))
  } catch (error) {
    throw deliveryError(`Could not read portable project: ${error.message}`, error.code === 'ENOENT' ? 404 : 400, error)
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
    stageAllocations: { ...analysis.stageAllocations, ...(stored?.stageAllocations || {}) },
    boundAt: stored?.boundAt || new Date().toISOString(),
    analyzedAt: new Date().toISOString(),
  }
}

function projectWithBinding(project, binding) {
  const bindings = (project.targetBindings || []).filter(candidate => candidate.targetId !== binding.targetId && candidate.targetDir !== binding.targetDir)
  return { ...project, targetBindings: [...bindings, binding] }
}

export function createDeliveryService({
  installerPath,
  runProcess = async (file, args, options) => execFileAsync(file, args, options),
  nodePath = process.execPath,
} = {}) {
  if (!installerPath) throw new TypeError('Delivery service requires an installer path.')

  async function prepare(projectDir, targetDir) {
    const opened = await readProject(projectDir)
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
        maxBuffer: 8 * 1024 * 1024,
      })
      return `${result.stdout || ''}${result.stderr || ''}`.trim()
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`.trim()
      throw deliveryError(output || error.message || 'Installer operation failed.', 409, error)
    }
  }

  return {
    async plan(projectDir, targetDir) {
      const prepared = await prepare(projectDir, targetDir)
      const output = await execute(['--manifest', prepared.manifestPath, '--project', prepared.analysis.targetDir, '--dry-run'])
      return { title: 'Preflight plan passed', output, target: prepared.analysis, manifest: prepared.manifest }
    },

    async apply(projectDir, targetDir, { force = false } = {}) {
      const prepared = await prepare(projectDir, targetDir)
      const preflight = force
        ? await execute(['--project', prepared.analysis.targetDir, '--uninstall', prepared.project.slug, '--dry-run'])
        : await execute(['--manifest', prepared.manifestPath, '--project', prepared.analysis.targetDir, '--dry-run'])
      const args = ['--manifest', prepared.manifestPath, '--project', prepared.analysis.targetDir]
      if (force) args.push('--force')
      const applied = await execute(args)
      return {
        title: force ? 'Mod updated transactionally' : 'Mod installed transactionally',
        output: `${force ? 'Existing transaction journal preflight:\n' : ''}${preflight}\n\n${applied}`,
        target: prepared.analysis,
      }
    },

    async uninstall(targetDir, modId) {
      const analysis = await analyzePokeRogueTarget(targetDir)
      const output = await execute(['--project', analysis.targetDir, '--uninstall', modId])
      return { title: 'Mod uninstalled and rolled back', output, target: analysis }
    },

    async packageProject(projectDir, outputDir, targetId = null) {
      const opened = await readProject(projectDir)
      const report = reviewProject(opened.project, { validateTargetCapabilities: false })
      if (!report.ready) throw deliveryError(`Project is not ready to package: ${formatIssues(report)}`, 422)
      const binding = (opened.project.targetBindings || []).find(item => !targetId || item.targetId === targetId) || opened.project.targetBindings?.at(-1) || null
      const manifest = buildDeliveryManifest(opened.project, binding)
      const canonicalAssetsRoot = await realpath(path.join(opened.projectDir, 'assets'))
      const embeddedAssets = []
      for (const stage of opened.project.stages) {
        for (const asset of stage.assets || []) {
          const requested = path.resolve(opened.projectDir, asset.relativePath)
          let canonicalFile
          try {
            canonicalFile = await realpath(requested)
          } catch (error) {
            throw deliveryError(`Asset file is missing: ${asset.fileName || asset.relativePath}`, error.code === 'ENOENT' ? 404 : 400, error)
          }
          if (!isInside(canonicalAssetsRoot, canonicalFile) || canonicalFile === canonicalAssetsRoot) {
            throw deliveryError(`Asset path escapes project assets: ${asset.relativePath}`)
          }
          const data = await readFile(canonicalFile)
          const hash = createHash('sha256').update(data).digest('hex')
          if (asset.sha256 && asset.sha256 !== hash) throw deliveryError(`Asset hash changed since import: ${asset.fileName || asset.relativePath}`, 409)
          embeddedAssets.push({ stageId: stage.stageId, ...asset, sha256: hash, dataBase64: data.toString('base64') })
        }
      }
      const packageValue = {
        format: 'pokerogue-mod-package',
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        project: opened.project,
        manifest,
        assets: embeddedAssets,
      }
      const resolvedOutput = path.resolve(outputDir)
      await mkdir(resolvedOutput, { recursive: true })
      const packagePath = path.join(resolvedOutput, `${opened.project.slug}.pokerogue-mod-package.json`)
      await writeJsonAtomic(packagePath, packageValue)
      return { title: 'Portable mod package exported', packagePath, assetCount: embeddedAssets.length }
    },
  }
}
