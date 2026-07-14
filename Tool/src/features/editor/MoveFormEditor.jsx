import { useState } from 'react'
import {
  addStageForm,
  addStageMove,
  removeStageForm,
  removeStageMove,
  updateStageForm,
} from '../../../shared/project-authoring.js'

const TYPES = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING',
  'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST',
  'DRAGON', 'DARK', 'STEEL', 'FAIRY',
]
const STATS = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['specialAttack', 'SpA'],
  ['specialDefense', 'SpD'],
  ['speed', 'Spe'],
]

function MoveList({ title, entries, kind, project, stage, onChange }) {
  const [move, setMove] = useState('')
  const [level, setLevel] = useState(1)
  function add(event) {
    event.preventDefault()
    if (!move.trim()) return
    onChange(addStageMove(
      project,
      stage.stageId,
      kind,
      kind === 'levelUp' ? { level, moveId: move } : move,
    ))
    setMove('')
  }
  return (
    <section className="editor-card compact-card">
      <div className="card-heading">
        <h2>{title}</h2><span className="count-pill">{entries.length}</span>
      </div>
      <form className="inline-authoring" onSubmit={add}>
        {kind === 'levelUp' && (
          <label>
            Level
            <input
              aria-label="Move level"
              type="number"
              min="1"
              max="100"
              value={level}
              onChange={event => setLevel(event.target.value)}
            />
          </label>
        )}
        <label>
          Move ID
          <input
            aria-label={`${title} move ID`}
            value={move}
            placeholder="EMBER"
            onChange={event => setMove(event.target.value)}
          />
        </label>
        <button className="button button-secondary" disabled={!move.trim()}>Add</button>
      </form>
      <div className="pill-list authoring-list">
        {entries.map((entry, index) => {
          const label = kind === 'levelUp'
            ? `Lv. ${entry.level} · ${entry.moveId}`
            : entry
          return (
            <span className="data-pill" key={`${label}-${index}`}>
              {label}
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => onChange(removeStageMove(
                  project,
                  stage.stageId,
                  kind,
                  index,
                ))}
              >×</button>
            </span>
          )
        })}
        {!entries.length && <p className="muted empty-copy">No moves added.</p>}
      </div>
    </section>
  )
}

function FormEditor({ form, project, stage, onChange }) {
  const update = patch => onChange(updateStageForm(
    project,
    stage.stageId,
    form.formId,
    patch,
  ))
  const primaryType = form.types?.[0] || stage.types[0]
  const secondaryType = form.types?.[1] || ''
  const stats = form.statOverrides || {}
  return (
    <article className="form-editor">
      <div className="form-editor-heading">
        <div><strong>{form.name}</strong><code>{form.key}</code></div>
        <button
          type="button"
          className="button button-danger subtle"
          onClick={() => onChange(removeStageForm(
            project,
            stage.stageId,
            form.formId,
          ))}
        >Remove form</button>
      </div>
      <div className="form-identity-grid">
        <label>
          Name
          <input
            value={form.name}
            onChange={event => update({ name: event.target.value })}
          />
        </label>
        <label>
          Key
          <input
            value={form.key}
            onChange={event => update({ key: event.target.value })}
          />
        </label>
        <label>
          Asset variant
          <input
            value={form.assetVariant || ''}
            placeholder="mega"
            onChange={event => update({ assetVariant: event.target.value })}
          />
        </label>
        <label>
          Change item
          <input
            value={form.changeItem || ''}
            placeholder="MEGA_BRACELET"
            onChange={event => update({ changeItem: event.target.value })}
          />
        </label>
        <label>
          Abilities
          <input
            value={(form.abilities || []).join(', ')}
            placeholder="BLAZE, SOLAR_POWER"
            onChange={event => update({ abilities: event.target.value.split(',') })}
          />
        </label>
        <label>
          Passive
          <input
            value={form.passive || ''}
            placeholder="Optional"
            onChange={event => update({ passive: event.target.value })}
          />
        </label>
        <label>
          Primary type
          <select
            value={primaryType}
            onChange={event => update({
              types: [event.target.value, secondaryType].filter(Boolean),
            })}
          >
            {TYPES.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>
          Secondary type
          <select
            value={secondaryType}
            onChange={event => update({
              types: [primaryType, event.target.value].filter(Boolean),
            })}
          >
            <option value="">None</option>
            {TYPES.map(type => (
              <option key={type} disabled={type === primaryType}>{type}</option>
            ))}
          </select>
        </label>
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={form.isStarterSelectable !== false}
            onChange={event => update({
              isStarterSelectable: event.target.checked,
            })}
          />
          Starter-selectable form
        </label>
      </div>
      <fieldset className="form-stat-overrides">
        <legend>Optional base-stat overrides</legend>
        {STATS.map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              type="number"
              min="1"
              max="255"
              value={stats[name] ?? ''}
              placeholder={String(stage.baseStats[name])}
              onChange={event => {
                const next = { ...stats }
                if (event.target.value === '') delete next[name]
                else {
                  next[name] = Math.min(
                    255,
                    Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                  )
                }
                update({ statOverrides: next })
              }}
            />
          </label>
        ))}
      </fieldset>
    </article>
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
      <div className="section-heading">
        <div>
          <span className="panel-kicker">Learnset and variants</span>
          <h2>Moves & forms</h2>
        </div>
        <p>
          Use PokéRogue enum-style IDs; spaces are normalized automatically.
          Target Review identifies form features a selected checkout cannot install.
        </p>
      </div>
      <div className="move-grid">
        <MoveList
          title="Level-up"
          kind="levelUp"
          entries={stage.moves?.levelUp || []}
          project={project}
          stage={stage}
          onChange={onChange}
        />
        <MoveList
          title="TM pool"
          kind="tm"
          entries={stage.moves?.tm || []}
          project={project}
          stage={stage}
          onChange={onChange}
        />
        <MoveList
          title="Egg moves"
          kind="egg"
          entries={stage.moves?.egg || []}
          project={project}
          stage={stage}
          onChange={onChange}
        />
      </div>
      <section className="editor-card forms-card">
        <div className="card-heading">
          <div>
            <h2>Alternate forms</h2>
            <span className="card-subtitle">
              Identity, typing, abilities, passive, change item, asset variant,
              starter visibility, and stat overrides
            </span>
          </div>
          <span className="count-pill">{stage.forms?.length || 0}</span>
        </div>
        <form className="inline-authoring" onSubmit={addForm}>
          <label>
            Form name
            <input
              aria-label="New form name"
              value={formName}
              placeholder="Mega"
              onChange={event => setFormName(event.target.value)}
            />
          </label>
          <button
            className="button button-secondary"
            disabled={!formName.trim()}
          >Add form</button>
        </form>
        <div className="form-list">
          {(stage.forms || []).map(form => (
            <FormEditor
              key={form.formId}
              form={form}
              project={project}
              stage={stage}
              onChange={onChange}
            />
          ))}
          {!stage.forms?.length && (
            <p className="muted empty-copy">
              No alternate forms. The base stage remains the default form.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
