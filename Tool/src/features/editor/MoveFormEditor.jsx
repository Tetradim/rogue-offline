import { useState } from 'react'
import {
  addStageForm,
  addStageMove,
  removeStageForm,
  removeStageMove,
  updateStageForm,
} from '../../../shared/project-authoring.js'

function MoveList({ title, entries, kind, project, stage, onChange }) {
  const [move, setMove] = useState('')
  const [level, setLevel] = useState(1)
  function add(event) {
    event.preventDefault()
    if (!move.trim()) return
    onChange(addStageMove(project, stage.stageId, kind, kind === 'levelUp' ? { level, moveId: move } : move))
    setMove('')
  }
  return (
    <section className="editor-card compact-card">
      <div className="card-heading"><h2>{title}</h2><span className="count-pill">{entries.length}</span></div>
      <form className="inline-authoring" onSubmit={add}>
        {kind === 'levelUp' && <label>Level<input aria-label="Move level" type="number" min="1" max="100" value={level} onChange={event => setLevel(event.target.value)} /></label>}
        <label>Move ID<input aria-label={`${title} move ID`} value={move} placeholder="EMBER" onChange={event => setMove(event.target.value)} /></label>
        <button className="button button-secondary" disabled={!move.trim()}>Add</button>
      </form>
      <div className="pill-list authoring-list">
        {entries.map((entry, index) => {
          const label = kind === 'levelUp' ? `Lv. ${entry.level} · ${entry.moveId}` : entry
          return <span className="data-pill" key={`${label}-${index}`}>{label}<button type="button" aria-label={`Remove ${label}`} onClick={() => onChange(removeStageMove(project, stage.stageId, kind, index))}>×</button></span>
        })}
        {!entries.length && <p className="muted empty-copy">No moves added.</p>}
      </div>
    </section>
  )
}

export function MoveFormEditor({ project, stage, onChange }) {
  const [formName, setFormName] = useState('')
  function addForm(event) {
    event.preventDefault()
    if (!formName.trim()) return
    onChange(addStageForm(project, stage.stageId, { name: formName }))
    setFormName('')
  }
  return (
    <div className="authoring-section">
      <div className="section-heading"><div><span className="panel-kicker">Learnset and variants</span><h2>Moves & forms</h2></div><p>Use PokéRogue enum-style IDs; spaces are normalized automatically.</p></div>
      <div className="move-grid">
        <MoveList title="Level-up" kind="levelUp" entries={stage.moves?.levelUp || []} project={project} stage={stage} onChange={onChange} />
        <MoveList title="TM pool" kind="tm" entries={stage.moves?.tm || []} project={project} stage={stage} onChange={onChange} />
        <MoveList title="Egg moves" kind="egg" entries={stage.moves?.egg || []} project={project} stage={stage} onChange={onChange} />
      </div>
      <section className="editor-card forms-card">
        <div className="card-heading"><div><h2>Alternate forms</h2><span className="card-subtitle">Form keys stay stable and target-aware</span></div><span className="count-pill">{stage.forms?.length || 0}</span></div>
        <form className="inline-authoring" onSubmit={addForm}>
          <label>Form name<input aria-label="New form name" value={formName} placeholder="Mega" onChange={event => setFormName(event.target.value)} /></label>
          <button className="button button-secondary" disabled={!formName.trim()}>Add form</button>
        </form>
        <div className="form-list">
          {(stage.forms || []).map(form => (
            <article className="form-row" key={form.formId}>
              <label>Name<input value={form.name} onChange={event => onChange(updateStageForm(project, stage.stageId, form.formId, { name: event.target.value }))} /></label>
              <label>Key<input value={form.key} onChange={event => onChange(updateStageForm(project, stage.stageId, form.formId, { key: event.target.value }))} /></label>
              <label>Asset variant<input value={form.assetVariant || ''} placeholder="mega" onChange={event => onChange(updateStageForm(project, stage.stageId, form.formId, { assetVariant: event.target.value }))} /></label>
              <button type="button" className="button button-danger subtle" onClick={() => onChange(removeStageForm(project, stage.stageId, form.formId))}>Remove</button>
            </article>
          ))}
          {!stage.forms?.length && <p className="muted empty-copy">No alternate forms. The base stage remains the default form.</p>}
        </div>
      </section>
    </div>
  )
}
