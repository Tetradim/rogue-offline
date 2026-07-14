import { useState } from 'react'
import {
  removeEncounterPlacement,
  setOfficialEncounterPolicy,
  upsertEncounterPlacement,
} from '../../../shared/project-authoring.js'

export function EncountersTab({ project, official, onChange }) {
  const [mode, setMode] = useState('suppress')
  const [replacementStageId, setReplacementStageId] = useState(project.stages[0]?.stageId || '')
  const [stageId, setStageId] = useState(project.stages[0]?.stageId || '')
  const [biome, setBiome] = useState('PLAINS')
  const [weight, setWeight] = useState(10)
  const [minLevel, setMinLevel] = useState(2)
  const [maxLevel, setMaxLevel] = useState(6)

  function saveOfficial(event) {
    event.preventDefault()
    if (!official) return
    onChange(setOfficialEncounterPolicy(project, official, mode, replacementStageId))
  }

  function addPlacement(event) {
    event.preventDefault()
    onChange(upsertEncounterPlacement(project, { stageId, biome, weight, minLevel, maxLevel, rarity: weight <= 2 ? 'rare' : weight <= 6 ? 'uncommon' : 'common' }))
  }

  const policies = project.encounterPolicy?.officialLines || []
  const placements = project.encounterPolicy?.placements || []
  const stageById = new Map(project.stages.map(stage => [stage.stageId, stage]))

  return (
    <div className="workflow-sheet">
      <div className="workflow-heading"><div><span className="panel-kicker">Availability and placement</span><h1>Encounter policy</h1></div><p>Suppress-only is the default. Replacement is explicit and never deletes official species IDs.</p></div>
      <div className="encounter-grid">
        <section className="editor-card">
          <div className="card-heading"><h2>Official reference policy</h2><span className="card-accent purple">Read-only source</span></div>
          {official ? (
            <form onSubmit={saveOfficial}>
              <div className="selected-official"><strong>#{String(official.speciesNumber).padStart(4, '0')} {official.name}</strong><span>{official.primaryType}{official.secondaryType ? ` / ${official.secondaryType}` : ''}</span></div>
              <label>Policy<select value={mode} onChange={event => setMode(event.target.value)}><option value="keep">Keep unchanged</option><option value="suppress">Suppress availability</option><option value="replace">Replace availability with custom stage</option></select></label>
              {mode === 'replace' && <label>Replacement stage<select value={replacementStageId} onChange={event => setReplacementStageId(event.target.value)}>{project.stages.map(stage => <option value={stage.stageId} key={stage.stageId}>{stage.name}</option>)}</select></label>}
              <button className="button button-primary">Save policy</button>
            </form>
          ) : <p className="muted">Select an official Pokémon in the left Pokédex to configure Keep, Suppress, or Replace.</p>}
          <div className="policy-list">
            {policies.map(policy => <article key={policy.speciesId}><div><strong>{policy.name}</strong><span>#{policy.speciesNumber}</span></div><b className={`policy-mode ${policy.mode}`}>{policy.mode}</b><button type="button" onClick={() => onChange(setOfficialEncounterPolicy(project, policy, 'keep'))}>Clear</button></article>)}
            {!policies.length && <p className="muted empty-copy">No official overrides. Everything is kept by default.</p>}
          </div>
        </section>
        <section className="editor-card">
          <div className="card-heading"><h2>Custom wild placement</h2><span className="card-accent blue">Portable intent</span></div>
          <form className="placement-form" onSubmit={addPlacement}>
            <label>Stage<select value={stageId} onChange={event => setStageId(event.target.value)}>{project.stages.map(stage => <option value={stage.stageId} key={stage.stageId}>{stage.name}</option>)}</select></label>
            <label>Biome ID<input value={biome} placeholder="PLAINS" onChange={event => setBiome(event.target.value)} /></label>
            <div className="field-triple"><label>Weight<input type="number" min="1" max="999" value={weight} onChange={event => setWeight(event.target.value)} /></label><label>Min level<input type="number" min="1" max="100" value={minLevel} onChange={event => setMinLevel(event.target.value)} /></label><label>Max level<input type="number" min="1" max="100" value={maxLevel} onChange={event => setMaxLevel(event.target.value)} /></label></div>
            <button className="button button-primary" disabled={!biome.trim()}>Add placement</button>
          </form>
          <div className="placement-list">
            {placements.map(placement => <article key={placement.placementId}><div><strong>{stageById.get(placement.stageId)?.name || 'Missing stage'}</strong><span>{placement.biome} · Lv. {placement.minLevel}–{placement.maxLevel} · weight {placement.weight}</span></div><button type="button" className="button button-danger subtle" onClick={() => onChange(removeEncounterPlacement(project, placement.placementId))}>Remove</button></article>)}
            {!placements.length && <p className="muted empty-copy">No custom wild placements. Add one to enable wild encounters for a stage.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
