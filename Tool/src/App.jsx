import { useState, useEffect } from 'react'
import {
  TYPES, GROWTH_RATES, VARIANT_OPTIONS,
  INITIAL_POKEMON_DATA, createDefaultPokemon, createDefaultForm,
  resolvedSpriteKey, variantLabel,
} from './data.js'

const TABS = [
  { id: 'basic', label: '1. Basic' },
  { id: 'types', label: '2. Types' },
  { id: 'abilities', label: '3. Abilities' },
  { id: 'stats', label: '4. Stats' },
  { id: 'evolution', label: '5. Evolution' },
  { id: 'moves', label: '6. Moves' },
  { id: 'forms', label: '7. Forms' },
  { id: 'sprites', label: '8. Sprites' },
  { id: 'passives', label: '9. Spawns' },
]
const TAB_IDS = TABS.map(t => t.id)

function downloadPokemon(pokemon) {
  const constName = `${pokemon.speciesId.replace(/-/g, '_')}_SPECIES`
  const content =
    `// Custom Pokemon: ${pokemon.name}\n` +
    `export const ${constName} = ${JSON.stringify(pokemon, null, 2)};\n`
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${pokemon.speciesId}.ts`
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [pokemonList, setPokemonList] = useState(INITIAL_POKEMON_DATA)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [activeTab, setActiveTab] = useState('basic')
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState(null)

  const filtered = pokemonList.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.speciesId.toLowerCase().includes(search.toLowerCase())
    const matchesLetter = !activeLetter || p.name.toUpperCase().startsWith(activeLetter)
    return matchesSearch && matchesLetter
  })

  useEffect(() => {
    const handler = (e) => {
      if (e.key.length === 1 && e.key.match(/[A-Za-z]/) && !e.ctrlKey && !e.metaKey) {
        setActiveLetter(e.key.toUpperCase())
        setSearch('')
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (idx < TAB_IDS.length) setActiveTab(TAB_IDS[idx])
      }
      if (e.key === 'Escape') {
        setActiveLetter(null)
        setSearch('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleNewPokemon = () => {
    const maxNum = Math.max(...pokemonList.map(p => p.speciesNumber), 1025)
    const created = createDefaultPokemon(maxNum + 1, `Custom Pokemon ${maxNum - 1024}`)
    setPokemonList([...pokemonList, created])
    setSelected(created)
    setMode('edit')
    setActiveTab('basic')
  }

  const handleSave = () => {
    if (!selected) return
    setPokemonList(list => list.map(p => (p.speciesNumber === selected.speciesNumber ? selected : p)))
    setMode('view')
  }

  const handleExport = () => {
    if (selected) downloadPokemon(selected)
  }

  const updateField = (field, value) => {
    if (selected) setSelected({ ...selected, [field]: value })
  }

  const updateStat = (stat, value) => {
    if (selected) setSelected({ ...selected, baseStats: { ...selected.baseStats, [stat]: value } })
  }

  const editable = mode === 'edit'

  return (
    <div className="app">
      <header className="header">
        <h1>Pokerogue Pokemon Creator</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleNewPokemon}>+ New Pokemon</button>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => { setSearch(e.target.value); setActiveLetter(null) }}
              />
            </div>
            <div className="letter-nav">
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                <button
                  key={letter}
                  className={`letter-btn ${activeLetter === letter ? 'active' : ''}`}
                  onClick={() => setActiveLetter(activeLetter === letter ? null : letter)}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
          <div className="pokemon-list">
            {filtered.map(p => (
              <div
                key={p.speciesNumber}
                className={`pokemon-list-item ${selected?.speciesNumber === p.speciesNumber ? 'selected' : ''}`}
                onClick={() => { setSelected(p); setMode('view') }}
              >
                <div className="pokemon-icon">{p.isLegendary || p.isMythical ? '\u2605' : '\u25CF'}</div>
                <div className="pokemon-info">
                  <div className="pokemon-name">{p.name}</div>
                  <div className="pokemon-number">#{p.speciesNumber.toString().padStart(4, '0')}</div>
                </div>
                <div className="pokemon-types">
                  <span className={`type-badge type-${p.primaryType}`}>{p.primaryType.substring(0, 3)}</span>
                  {p.secondaryType && (
                    <span className={`type-badge type-${p.secondaryType}`}>{p.secondaryType.substring(0, 3)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: '#94a3b8' }}>
            {pokemonList.length} Pokemon loaded
          </div>
        </aside>

        <main className="editor-panel">
          {selected ? (
            <>
              <div className="editor-tabs">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`editor-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="editor-content">
                {activeTab === 'basic' && (
                  <BasicTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'types' && (
                  <TypesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'abilities' && (
                  <AbilitiesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'stats' && (
                  <StatsTab pokemon={selected} editable={editable} updateStat={updateStat} />
                )}
                {activeTab === 'evolution' && (
                  <EvolutionTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'moves' && (
                  <MovesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'forms' && (
                  <FormsTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'sprites' && (
                  <SpritesTab
                    pokemon={selected}
                    allPokemon={pokemonList}
                    editable={editable}
                    updateField={updateField}
                  />
                )}
                {activeTab === 'passives' && (
                  <PassivesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
              </div>

              <div className="action-bar">
                <span style={{ color: '#94a3b8' }}>
                  {selected.isLegendary && 'Legendary '}
                  {selected.isMythical && 'Mythical '}
                  {selected.name} (#{selected.speciesNumber})
                </span>
                <div className="action-bar-right">
                  <button className="btn btn-secondary" onClick={handleExport}>Export .ts</button>
                  {mode === 'view' ? (
                    <button className="btn btn-primary" onClick={() => setMode('edit')}>Edit</button>
                  ) : (
                    <button className="btn btn-success" onClick={handleSave}>Save</button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="welcome-screen">
              <div className="welcome-icon">\u26A1</div>
              <h2 className="welcome-title">Welcome to Pokemon Creator</h2>
              <p className="welcome-subtitle">Select a Pokemon or create a new one</p>
              <button className="btn btn-primary" onClick={handleNewPokemon}>+ Create New Pokemon</button>
              <div style={{ marginTop: '32px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
                <p><strong>Tips:</strong></p>
                <p>A-Z: Jump to letter | 1-9: Switch tabs | Esc: Clear filter</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

function BasicTab({ pokemon, editable, updateField }) {
  return (
    <div className="form-section">
      <h3 className="form-section-title">Basic Information</h3>
      <div className="form-grid">
        <Field label="Species ID">
          <input className="form-input" type="text" value={pokemon.speciesId} disabled={!editable}
            onChange={e => updateField('speciesId', e.target.value.toLowerCase().replace(/\s+/g, '_'))} />
        </Field>
        <Field label="Name">
          <input className="form-input" type="text" value={pokemon.name} disabled={!editable}
            onChange={e => updateField('name', e.target.value)} />
        </Field>
        <Field label="Species Number">
          <input className="form-input" type="number" value={pokemon.speciesNumber} disabled={!editable}
            onChange={e => updateField('speciesNumber', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Category">
          <input className="form-input" type="text" value={pokemon.category} disabled={!editable}
            onChange={e => updateField('category', e.target.value)} />
        </Field>
        <Field label="Height (m)">
          <input className="form-input" type="number" step="0.1" value={pokemon.height} disabled={!editable}
            onChange={e => updateField('height', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Weight (kg)">
          <input className="form-input" type="number" step="0.1" value={pokemon.weight} disabled={!editable}
            onChange={e => updateField('weight', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Gender Ratio (%)">
          <input className="form-input" type="number" value={pokemon.genderRatio} disabled={!editable}
            onChange={e => updateField('genderRatio', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Generation">
          <input className="form-input" type="number" value={pokemon.generation} disabled={!editable}
            onChange={e => updateField('generation', parseInt(e.target.value) || 1)} />
        </Field>
        <Field label="Growth Rate">
          <select className="form-select" value={pokemon.growthRate} disabled={!editable}
            onChange={e => updateField('growthRate', e.target.value)}>
            {GROWTH_RATES.map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Base Friendship">
          <input className="form-input" type="number" value={pokemon.baseFriendship} disabled={!editable}
            onChange={e => updateField('baseFriendship', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Capture Rate">
          <input className="form-input" type="number" value={pokemon.captureRate} disabled={!editable}
            onChange={e => updateField('captureRate', parseInt(e.target.value) || 0)} />
        </Field>
        <div className="form-group full-width">
          <div className="checkbox-group">
            <input type="checkbox" id="isLegendary" checked={pokemon.isLegendary} disabled={!editable}
              onChange={e => updateField('isLegendary', e.target.checked)} />
            <label htmlFor="isLegendary">Legendary</label>
          </div>
          <div className="checkbox-group">
            <input type="checkbox" id="isMythical" checked={pokemon.isMythical} disabled={!editable}
              onChange={e => updateField('isMythical', e.target.checked)} />
            <label htmlFor="isMythical">Mythical</label>
          </div>
        </div>
      </div>
    </div>
  )
}

function TypesTab({ pokemon, editable, updateField }) {
  return (
    <div className="form-section">
      <h3 className="form-section-title">Pokemon Types</h3>
      <div className="form-grid">
        <Field label="Primary Type">
          <select className="form-select" value={pokemon.primaryType} disabled={!editable}
            onChange={e => updateField('primaryType', e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Secondary Type">
          <select className="form-select" value={pokemon.secondaryType || ''} disabled={!editable}
            onChange={e => updateField('secondaryType', e.target.value || null)}>
            <option value="">None</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
    </div>
  )
}

function AbilitiesTab({ pokemon, editable, updateField }) {
  return (
    <div className="form-section">
      <h3 className="form-section-title">Abilities</h3>
      <div className="form-grid">
        <Field label="Ability 1">
          <input className="form-input" type="text" value={pokemon.ability1} disabled={!editable}
            placeholder="OVERGROW"
            onChange={e => updateField('ability1', e.target.value.toUpperCase().replace(/\s+/g, '_'))} />
        </Field>
        <Field label="Ability 2">
          <input className="form-input" type="text" value={pokemon.ability2 || ''} disabled={!editable}
            placeholder="CHLOROPHYLL"
            onChange={e => updateField('ability2', e.target.value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Hidden Ability">
          <input className="form-input" type="text" value={pokemon.hiddenAbility || ''} disabled={!editable}
            onChange={e => updateField('hiddenAbility', e.target.value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Passive Ability">
          <input className="form-input" type="text" value={pokemon.passiveAbility || ''} disabled={!editable}
            onChange={e => updateField('passiveAbility', e.target.value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
      </div>
    </div>
  )
}

function StatsTab({ pokemon, editable, updateStat }) {
  const total = Object.values(pokemon.baseStats).reduce((a, b) => a + b, 0)
  return (
    <div className="form-section">
      <h3 className="form-section-title">Base Stats</h3>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>Total: {total}</p>
      <div className="stats-grid">
        {['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'].map(stat => (
          <div className="stat-input" key={stat}>
            <span className="stat-label">{stat.replace('special', 'Sp. ').toUpperCase()}</span>
            <input type="number" min={1} max={255} value={pokemon.baseStats[stat]} disabled={!editable}
              onChange={e => updateStat(stat, parseInt(e.target.value) || 0)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function EvolutionTab({ pokemon, editable, updateField }) {
  const evolutions = pokemon.evolutions || []

  const updateEvolution = (index, patch) => {
    const next = [...evolutions]
    next[index] = { ...next[index], ...patch }
    updateField('evolutions', next)
  }

  const removeEvolution = (index) => {
    updateField('evolutions', evolutions.filter((_, i) => i !== index))
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">Evolution</h3>

      <div className="form-grid" style={{ marginBottom: '16px' }}>
        <Field label="Pre-Evolution">
          <input className="form-input" type="text" value={pokemon.preEvolution || ''} disabled={!editable}
            onChange={e => updateField('preEvolution', e.target.value.toLowerCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="This Pokemon's Variant">
          <select className="form-select" value={pokemon.variant || ''} disabled={!editable}
            onChange={e => updateField('variant', e.target.value)}>
            {VARIANT_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="evolution-list">
        {evolutions.map((evo, i) => (
          <div className="evolution-item" key={i}>
            <input className="form-input" type="text" placeholder="Species" value={evo.speciesId}
              disabled={!editable}
              onChange={e => updateEvolution(i, { speciesId: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />
            <input className="form-input" type="number" placeholder="Level" style={{ width: '80px' }}
              value={evo.level || ''} disabled={!editable}
              onChange={e => updateEvolution(i, { level: parseInt(e.target.value) || undefined })} />
            <input className="form-input" type="text" placeholder="Item" style={{ width: '120px' }}
              value={evo.item || ''} disabled={!editable}
              onChange={e => updateEvolution(i, { item: e.target.value.toUpperCase().replace(/\s+/g, '_') || undefined })} />
            <select className="form-select" style={{ width: '190px' }} value={evo.variant || ''} disabled={!editable}
              onChange={e => updateEvolution(i, { variant: e.target.value })}>
              {VARIANT_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            {editable && (
              <button className="btn btn-danger" onClick={() => removeEvolution(i)}>Remove</button>
            )}
          </div>
        ))}
        {editable && (
          <button className="btn btn-secondary"
            onClick={() => updateField('evolutions', [...evolutions, { speciesId: '', level: 1, variant: '' }])}>
            + Add Evolution
          </button>
        )}
      </div>
    </div>
  )
}

function MovesTab({ pokemon, editable, updateField }) {
  const levelUpText = Object.entries(pokemon.levelUpMoves || {})
    .map(([level, move]) => `${level}:${move}`)
    .join('\n')

  const handleLevelUpChange = (text) => {
    const map = {}
    text.split('\n').forEach(line => {
      const [level, move] = line.split(':')
      if (level && move) map[parseInt(level)] = move.trim().toUpperCase()
    })
    updateField('levelUpMoves', map)
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">Moves</h3>
      <div className="form-grid">
        <div className="form-group full-width">
          <label className="form-label">Level-Up Moves (level:moveId)</label>
          <textarea className="form-input" rows={6} value={levelUpText} disabled={!editable}
            onChange={e => handleLevelUpChange(e.target.value)} />
        </div>
        <div className="form-group full-width">
          <label className="form-label">TM Pool (comma-separated)</label>
          <input className="form-input" type="text" value={(pokemon.tmPool || []).join(', ')} disabled={!editable}
            onChange={e => updateField('tmPool', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))} />
        </div>
        <div className="form-group full-width">
          <label className="form-label">Egg Moves</label>
          <input className="form-input" type="text" value={(pokemon.eggMoves || []).join(', ')} disabled={!editable}
            onChange={e => updateField('eggMoves', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))} />
        </div>
      </div>
    </div>
  )
}

// --- New: Forms tab -------------------------------------------------------
// This tab never actually existed in the shipped build (it was missing from
// both the tab bar and the render switch), only referenced in an orphaned
// keyboard-shortcut array. Implemented here from scratch.
function FormsTab({ pokemon, editable, updateField }) {
  const forms = pokemon.forms || []

  const updateForm = (index, patch) => {
    const next = [...forms]
    next[index] = { ...next[index], ...patch }
    updateField('forms', next)
  }

  const removeForm = (index) => {
    updateField('forms', forms.filter((_, i) => i !== index))
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">Forms</h3>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Alternate forms (regional variants, battle forms, etc). Shiny/Gmax/Mega/Dynamax
        display variants are handled on the Evolution and Sprites tabs instead.
      </p>

      <div className="evolution-list">
        {forms.map((form, i) => (
          <div key={i} className="form-section" style={{ padding: '16px', marginBottom: 0 }}>
            <div className="form-grid">
              <Field label="Form Key">
                <input className="form-input" type="text" value={form.formKey} disabled={!editable}
                  placeholder="alolan"
                  onChange={e => updateForm(i, { formKey: e.target.value.toLowerCase().replace(/\s+/g, '_') })} />
              </Field>
              <Field label="Form Name">
                <input className="form-input" type="text" value={form.formName} disabled={!editable}
                  placeholder="Alolan Form"
                  onChange={e => updateForm(i, { formName: e.target.value })} />
              </Field>
              <Field label="Sprite Key">
                <input className="form-input" type="text" value={form.spriteKey} disabled={!editable}
                  onChange={e => updateForm(i, { spriteKey: e.target.value })} />
              </Field>
              <Field label="Icon Key">
                <input className="form-input" type="text" value={form.iconKey} disabled={!editable}
                  onChange={e => updateForm(i, { iconKey: e.target.value })} />
              </Field>
              <Field label="Primary Type Override">
                <select className="form-select" value={form.primaryType || ''} disabled={!editable}
                  onChange={e => updateForm(i, { primaryType: e.target.value || '' })}>
                  <option value="">(unchanged)</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Secondary Type Override">
                <select className="form-select" value={form.secondaryType || ''} disabled={!editable}
                  onChange={e => updateForm(i, { secondaryType: e.target.value || '' })}>
                  <option value="">(unchanged)</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div className="form-group full-width">
                <div className="checkbox-group">
                  <input type="checkbox" id={`megaForm-${i}`} checked={!!form.isMegaForm} disabled={!editable}
                    onChange={e => updateForm(i, { isMegaForm: e.target.checked })} />
                  <label htmlFor={`megaForm-${i}`}>Mega Form</label>
                </div>
                <div className="checkbox-group">
                  <input type="checkbox" id={`battleForm-${i}`} checked={!!form.isBattleForm} disabled={!editable}
                    onChange={e => updateForm(i, { isBattleForm: e.target.checked })} />
                  <label htmlFor={`battleForm-${i}`}>Battle-Only Form</label>
                </div>
              </div>
            </div>
            {editable && (
              <div style={{ marginTop: '12px' }}>
                <button className="btn btn-danger" onClick={() => removeForm(i)}>Remove Form</button>
              </div>
            )}
          </div>
        ))}
        {editable && (
          <button className="btn btn-secondary"
            onClick={() => updateField('forms', [...forms, createDefaultForm()])}>
            + Add Form
          </button>
        )}
        {forms.length === 0 && !editable && (
          <p style={{ color: '#94a3b8' }}>No alternate forms defined.</p>
        )}
      </div>
    </div>
  )
}

// --- Sprites tab: now shows the evolution-line variant preview ------------
function SpritesTab({ pokemon, allPokemon, editable, updateField }) {
  const preEvo = pokemon.preEvolution
    ? allPokemon.find(p => p.speciesId === pokemon.preEvolution)
    : null

  const evolutions = pokemon.evolutions || []

  return (
    <div className="form-section">
      <h3 className="form-section-title">Sprites</h3>
      <div className="form-grid">
        <Field label="Sprite Key">
          <select className="form-select" value={pokemon.spriteKey || ''} disabled={!editable}
            onChange={e => updateField('spriteKey', e.target.value)}>
            {allPokemon.map(p => <option key={p.speciesId} value={p.spriteKey}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Icon Key">
          <select className="form-select" value={pokemon.iconKey || ''} disabled={!editable}
            onChange={e => updateField('iconKey', e.target.value)}>
            {allPokemon.map(p => <option key={p.speciesId} value={p.iconKey || p.spriteKey}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <h3 className="form-section-title" style={{ marginTop: '24px' }}>Variant Sprites (Evolution Line)</h3>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Variants are chosen per stage on the Evolution tab. This is a read-only
        preview of the resolved sprite key for each stage of this line.
      </p>

      <div className="evolution-list">
        {preEvo && (
          <div className="evolution-item">
            <span style={{ width: '90px', color: '#94a3b8', fontSize: '12px' }}>PRE-EVO</span>
            <span style={{ flex: 1 }}>{preEvo.name}</span>
            <span style={{ color: '#94a3b8' }}>{variantLabel(preEvo.variant)}</span>
            <code>{resolvedSpriteKey(preEvo.spriteKey, preEvo.variant)}</code>
          </div>
        )}

        <div className="evolution-item">
          <span style={{ width: '90px', color: 'var(--secondary)', fontSize: '12px' }}>THIS MON</span>
          <span style={{ flex: 1 }}>{pokemon.name}</span>
          <span style={{ color: '#94a3b8' }}>{variantLabel(pokemon.variant)}</span>
          <code>{resolvedSpriteKey(pokemon.spriteKey, pokemon.variant)}</code>
        </div>

        {evolutions.map((evo, i) => {
          const evoSpecies = allPokemon.find(p => p.speciesId === evo.speciesId)
          const baseSpriteKey = evoSpecies ? evoSpecies.spriteKey : evo.speciesId
          return (
            <div className="evolution-item" key={i}>
              <span style={{ width: '90px', color: '#94a3b8', fontSize: '12px' }}>
                LV {evo.level || '\u2014'}{evo.item ? ` / ${evo.item}` : ''}
              </span>
              <span style={{ flex: 1 }}>{evoSpecies ? evoSpecies.name : (evo.speciesId || '(unset)')}</span>
              <span style={{ color: '#94a3b8' }}>{variantLabel(evo.variant)}</span>
              <code>{resolvedSpriteKey(baseSpriteKey, evo.variant)}</code>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PassivesTab({ pokemon, editable, updateField }) {
  return (
    <div className="form-section">
      <h3 className="form-section-title">Passives &amp; Biomes</h3>
      <div className="form-grid">
        <div className="form-group full-width">
          <label className="form-label">Passive Abilities</label>
          <input className="form-input" type="text" value={(pokemon.passives || []).join(', ')} disabled={!editable}
            onChange={e => updateField('passives', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))} />
        </div>
        <div className="form-group full-width">
          <label className="form-label">Spawn Biomes</label>
          <input className="form-input" type="text" value={(pokemon.biomes || []).join(', ')} disabled={!editable}
            onChange={e => updateField('biomes', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))} />
        </div>
        <Field label="Min Level">
          <input className="form-input" type="number" value={pokemon.spawnLevels.min} disabled={!editable}
            onChange={e => updateField('spawnLevels', { ...pokemon.spawnLevels, min: parseInt(e.target.value) || 1 })} />
        </Field>
        <Field label="Max Level">
          <input className="form-input" type="number" value={pokemon.spawnLevels.max} disabled={!editable}
            onChange={e => updateField('spawnLevels', { ...pokemon.spawnLevels, max: parseInt(e.target.value) || 100 })} />
        </Field>
      </div>
    </div>
  )
}
