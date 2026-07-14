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

  function saveOfficial(event) {
    event.preventDefault()
    if (!official) return
    onChange(setOfficialEncounterPolicy(project, official, mode, replacementStageId))
  }

  function addPlacement(event) {
    event.preventDefault()
    onChange(upsertEncounterPlacement(project, { stageId, biome }))
  }

  const policies = project.encounterPolicy?.officialLines || []
  const placements = project.encounterPolicy?.placements || []
  const stageById = new Map(project.stages.map(stage => [stage.stageId, stage]))

  return (
    <div className="workflow-sheet">
      <div className="workflow-heading"><div><span className="panel-kicker">Wild pool membership</span><h1>Encounter policy</h1></div><p>The supported adapter edits exact, simple biome species arrays. It does not guess weights or level ranges.</p></div>
      <div className="encounter-grid">
        <section className="editor-card">
          <div className="card-heading"><h2>Official wild reference policy</h2><span className="card-accent purple">Read-only source</span></div>
          {official ? (
            <form onSubmit={saveOfficial}>
              <div className="selected-official"><strong>#{String(official.speciesNumber).padStart(4, '0')} {official.name}</strong><span>{official.primaryType}{official.secondaryType ? ` / ${official.secondaryType}` : ''}</span></div>
              <label>Policy<select value={mode} onChange={event => setMode(event.target.value)}><option value="keep">Keep unchanged</option><option value="suppress">Suppress wild references</option><option value="replace">Replace wild references with custom stage</option></select></label>
              {mode === 'replace' && <label>Replacement stage<select value={replacementStageId} onChange={event => setReplacementStageId(event.target.value)}>{project.stages.map(stage => <option value={stage.stageId} key={stage.stageId}>{stage.name}</option>)}</select></label>}
              <button className="button button-primary">Save policy</button>
            </form>
          ) : <p className="muted">Select an official Pokémon in the left Pokédex to configure its supported wild-pool references.</p>}
          <div className="policy-list">
            {policies.map(policy => <article key={policy.speciesId}><div><strong>{policy.name}</strong><span>#{policy.speciesNumber}</span></div><b className={`policy-mode ${policy.mode}`}>{policy.mode}</b><button type="button" onClick={() => onChange(setOfficialEncounterPolicy(project, policy, 'keep'))}>Clear</button></article>)}
            {!policies.length && <p className="muted empty-copy">No official wild overrides. Everything is kept by default.</p>}
          </div>
        </section>
        <section className="editor-card">
          <div className="card-heading"><h2>Custom wild pool</h2><span className="card-accent blue">Exact adapter</span></div>
          <form className="placement-form" onSubmit={addPlacement}>
            <label>Stage<select value={stageId} onChange={event => setStageId(event.target.value)}>{project.stages.map(stage => <option value={stage.stageId} key={stage.stageId}>{stage.name}</option>)}</select></label>
            <label>Biome ID<input value={biome} placeholder="PLAINS" onChange={event => setBiome(event.target.value)} /></label>
            <button className="button button-primary" disabled={!biome.trim()}>Add pool membership</button>
          </form>
          <div className="placement-list">
            {placements.map(placement => <article key={placement.placementId}><div><strong>{stageById.get(placement.stageId)?.name || 'Missing stage'}</strong><span>{placement.biome} · simple species array</span></div><button type="button" className="button button-danger subtle" onClick={() => onChange(removeEncounterPlacement(project, placement.placementId))}>Remove</button></article>)}
            {!placements.length && <p className="muted empty-copy">No custom wild pool memberships.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
