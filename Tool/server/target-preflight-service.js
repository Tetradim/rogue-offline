import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzePokeRogueTarget } from './target-discovery.js'
import { verifyTargetBuild } from './target-verifier.js'

const toolRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function parseTargetPreflightArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--manifest') options.manifest = argv[++index]
    else if (argument === '--project') options.project = argv[++index]
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

export function projectFromManifest(manifest, targetDir) {
  const stages = (manifest.customSpecies || []).map(species => ({
    stageId: species.projectId || species.speciesId,
    slug: species.speciesId,
    types: [species.primaryType, species.secondaryType].filter(Boolean),
    abilities: [species.ability1, species.ability2, species.hiddenAbility].filter(Boolean),
    passive: species.passiveAbility || '',
    growthRate: species.growthRate,
    moves: {
      levelUp: (species.levelUpMoves || []).map(move => ({ level: move[0], moveId: move[1] })),
      tm: [...(species.tmMoves || [])],
      egg: [...(species.eggMoves || [])],
    },
    forms: (species.forms || []).map(form => ({ ...form })),
  }))
  const stageBySlug = new Map(stages.map(stage => [stage.slug, stage.stageId]))
  const evolutionEdges = (manifest.customSpecies || []).flatMap(species => (
    (species.evolutions || []).map((evolution, index) => ({
      edgeId: `${species.projectId || species.speciesId}-${index}`,
      from: species.projectId || species.speciesId,
      to: stageBySlug.get(evolution.speciesId) || evolution.speciesId,
      trigger: { ...(evolution.trigger || {}) },
      priority: 0,
    }))
  ))
  const placements = (manifest.customSpecies || []).flatMap(species => (
    (species.encounterPlacements || []).map((placement, index) => ({
      placementId: placement.placementId || `${species.projectId || species.speciesId}-${index}`,
      stageId: species.projectId || species.speciesId,
      biome: placement.biome,
    }))
  ))
  const stageAllocations = Object.fromEntries((manifest.registry || []).map(item => [
    item.projectId,
    Number(item.speciesNumber),
  ]))
  const targetBindings = Object.keys(stageAllocations).length
    ? [{
        targetId: manifest.target?.targetId || 'package-target',
        targetDir,
        adapter: manifest.target?.adapter || 'pokerogue-modern-source',
        stageAllocations,
      }]
    : []
  return {
    slug: String(manifest.mod?.id || ''),
    stages,
    evolutionEdges,
    encounterPolicy: { placements, officialLines: [] },
    targetBindings,
  }
}

export async function runTargetPreflight({
  manifestPath,
  targetDir,
  installerPath = path.join(toolRoot, 'pokerogue-mod-installer.cjs'),
  analyzeTarget = analyzePokeRogueTarget,
  verifyTarget = verifyTargetBuild,
} = {}) {
  if (!manifestPath || !targetDir) throw new Error('Both manifestPath and targetDir are required.')
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'))
  if (manifest.format !== 'pokerogue-mod-studio' || Number(manifest.schemaVersion) !== 3) {
    throw new Error('Isolated preflight requires a current Mod Studio delivery manifest.')
  }
  const resolvedTarget = path.resolve(targetDir)
  const project = projectFromManifest(manifest, resolvedTarget)
  const analysis = await analyzeTarget(resolvedTarget, project)
  const errors = (analysis.validationIssues || []).filter(item => item.severity === 'error')
  if (errors.length) {
    throw new Error(`Target is not ready: ${errors.map(item => `${item.path}: ${item.message}`).join('; ')}`)
  }
  if (
    manifest.target?.adapter
    && manifest.target.adapter !== 'auto-detect'
    && manifest.target.adapter !== analysis.adapter
  ) {
    throw new Error(`Package adapter ${manifest.target.adapter} does not match detected adapter ${analysis.adapter}.`)
  }
  if (manifest.target?.fingerprint && manifest.target.fingerprint !== analysis.fingerprint) {
    throw new Error('The selected checkout fingerprint does not match this target-bound package. Re-export or select the original compatible checkout.')
  }
  const output = await verifyTarget({
    analysis,
    manifestPath: path.resolve(manifestPath),
    installerPath,
  })
  return {
    analysis,
    output: `Isolated target build passed.${output ? `\n${output}` : ''}`,
  }
}
