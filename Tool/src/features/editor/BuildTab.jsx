import { calculateBst, setStageField, setStageStat } from '../../../shared/project-schema.js'
import { MoveFormEditor } from './MoveFormEditor.jsx'
import { StatSlider } from './StatSlider.jsx'

const TYPES = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY']
const GROWTH_RATES = ['ERRATIC', 'FAST', 'MEDIUM_FAST', 'MEDIUM_SLOW', 'SLOW', 'FLUCTUATING']
const STATS = [
  ['hp', 'HP'],
  ['attack', 'Attack'],
  ['defense', 'Defense'],
  ['specialAttack', 'Sp. Atk'],
  ['specialDefense', 'Sp. Def'],
  ['speed', 'Speed'],
]

function token(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizedSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function BuildTab({ project, stage, onChange }) {
  const updateField = (name, value) => onChange(setStageField(project, stage.stageId, name, value))
  const updateFlag = (name, checked) => updateField('flags', { ...stage.flags, [name]: checked })

  function updatePrimaryType(primaryType) {
    const secondaryType = stage.types[1] === primaryType ? undefined : stage.types[1]
    updateField('types', [primaryType, secondaryType].filter(Boolean))
  }

  function updateSecondaryType(secondaryType) {
    updateField('types', [stage.types[0], secondaryType].filter(Boolean))
  }

  return (
    <div className="build-sheet">
      <div className="build-heading">
        <div>
          <span className="panel-kicker">Custom stage authoring</span>
          <h1>{stage.name}</h1>
          <p>Author portable species data without modifying an official Pokémon.</p>
        </div>
        <div className="stage-identity" title="Stage IDs remain stable when names and slugs change">
          <span>Immutable stage ID</span><code>{stage.stageId}</code>
        </div>
      </div>

      <div className="build-grid">
        <section className="editor-card identity-card">
          <div className="card-heading"><h2>Identity</h2><span className="card-accent purple">Custom</span></div>
          <label>Species name<input value={stage.name} maxLength={80} onChange={event => updateField('name', event.target.value)} /></label>
          <label>Internal slug<input value={stage.slug} onChange={event => updateField('slug', normalizedSlug(event.target.value))} /></label>
          <label>Category<input value={stage.category} maxLength={80} placeholder="Seed Pokémon" onChange={event => updateField('category', event.target.value)} /></label>
          <div className="field-pair">
            <label>Generation<input type="number" min="1" max="99" value={stage.generation} onChange={event => updateField('generation', Number(event.target.value))} /></label>
            <label>Growth rate<select value={stage.growthRate} onChange={event => updateField('growthRate', event.target.value)}>{GROWTH_RATES.map(rate => <option key={rate}>{rate}</option>)}</select></label>
          </div>
          <div className="field-pair">
            <label>Primary type<select value={stage.types[0]} onChange={event => updatePrimaryType(event.target.value)}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
            <label>Secondary type<select value={stage.types[1] || ''} onChange={event => updateSecondaryType(event.target.value)}><option value="">None</option>{TYPES.map(type => <option key={type} disabled={type === stage.types[0]}>{type}</option>)}</select></label>
          </div>
        </section>

        <section className="editor-card battle-card">
          <div className="card-heading"><h2>Battle data</h2><span className="card-accent blue">Core</span></div>
          <label>Primary ability<input value={stage.abilities[0] || ''} placeholder="BLAZE" onChange={event => updateField('abilities', event.target.value ? [token(event.target.value), ...stage.abilities.slice(1)] : stage.abilities.slice(1))} /></label>
          <label>Secondary ability<input value={stage.abilities[1] || ''} placeholder="Optional" onChange={event => updateField('abilities', [stage.abilities[0], token(event.target.value)].filter(Boolean))} /></label>
          <label>Hidden ability<input value={stage.abilities[2] || ''} placeholder="Optional" onChange={event => updateField('abilities', [stage.abilities[0], stage.abilities[1], token(event.target.value)].filter(Boolean))} /></label>
          <label>Passive<input value={stage.passive} placeholder="Optional passive" onChange={event => updateField('passive', token(event.target.value))} /></label>
          <div className="field-pair">
            <label>Height (m)<input type="number" min="0.1" max="9999" step="0.1" value={stage.height} onChange={event => updateField('height', Number(event.target.value))} /></label>
            <label>Weight (kg)<input type="number" min="0.1" max="999999" step="0.1" value={stage.weight} onChange={event => updateField('weight', Number(event.target.value))} /></label>
          </div>
          <div className="field-triple">
            <label>Friendship<input type="number" min="0" max="255" value={stage.baseFriendship} onChange={event => updateField('baseFriendship', Number(event.target.value))} /></label>
            <label>Capture rate<input type="number" min="1" max="255" value={stage.captureRate} onChange={event => updateField('captureRate', Number(event.target.value))} /></label>
            <label>Male ratio %<input type="number" min="0" max="100" value={stage.genderRatio} onChange={event => updateField('genderRatio', Number(event.target.value))} /></label>
          </div>
          <fieldset className="flag-group">
            <legend>Classification flags</legend>
            <label><input type="checkbox" checked={stage.flags.legendary} onChange={event => updateFlag('legendary', event.target.checked)} /> Legendary</label>
            <label><input type="checkbox" checked={stage.flags.mythical} onChange={event => updateFlag('mythical', event.target.checked)} /> Mythical</label>
            <label><input type="checkbox" checked={stage.flags.starter} onChange={event => updateFlag('starter', event.target.checked)} /> Starter</label>
          </fieldset>
        </section>

        <section className="editor-card stats-card">
          <div className="card-heading">
            <div><h2>Base stats</h2><span className="card-subtitle">Slider and exact value stay synchronized</span></div>
            <strong className="bst-pill">BST {calculateBst(stage)}</strong>
          </div>
          <div className="stat-list">
            {STATS.map(([name, label]) => <StatSlider key={name} label={label} value={stage.baseStats[name]} onChange={value => onChange(setStageStat(project, stage.stageId, name, value))} />)}
          </div>
          <p className="stat-note">Values are clamped from 1 to 255. The Review tab reports balance and target compatibility warnings.</p>
        </section>
      </div>
      <MoveFormEditor project={project} stage={stage} onChange={onChange} />
    </div>
  )
}
