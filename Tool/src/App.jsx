import { useState, useEffect, useRef } from 'react'
import {
  TYPES, GROWTH_RATES, VARIANT_OPTIONS,
  ABILITY_OPTIONS, MOVE_OPTIONS, BIOME_OPTIONS, FORM_KEY_OPTIONS, EVOLUTION_ITEM_OPTIONS,
  INITIAL_POKEMON_DATA, createDefaultPokemon, createDefaultForm,
  resolvedSpriteKey, variantLabel,
} from './data.js'

// Load full 1025 Pokemon from public JSON
const loadPokemonData = async () => {
  try {
    const res = await fetch('./pokemon_data.json')
    return await res.json()
  } catch (e) {
    console.error('Failed to load Pokemon data:', e)
    return INITIAL_POKEMON_DATA
  }
}

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

// Pokémon Number Picker Modal
function PokemonNumberPicker({ isOpen, onClose, onSelect, currentNumber }) {
  const [search, setSearch] = useState('')
  const [selectedNumber, setSelectedNumber] = useState(currentNumber)
  
  if (!isOpen) return null
  
  const handleNumberSelect = (number) => {
    setSelectedNumber(number)
  }
  
  const handleConfirm = () => {
    onSelect(selectedNumber)
    onClose()
  }
  
  const filteredPokemon = pokemonList.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.speciesId.toLowerCase().includes(search.toLowerCase()) ||
      p.speciesNumber.toString().includes(search)
    return matchesSearch
  }).sort((a, b) => a.speciesNumber - b.speciesNumber)
  
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Select Pokémon Number</h2>
        <input
          type="text"
          placeholder="Search by name, ID, or number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="number-picker-grid">
          {filteredPokemon.map(p => (
            <div
              key={p.speciesId}
              className={`number-picker-item ${selectedNumber === p.speciesNumber ? 'selected' : ''}`}
              onClick={() => handleNumberSelect(p.speciesNumber)}
            >
              <span className="number">{p.speciesNumber}</span>
              <span className="name">{p.name}</span>
              <span className="id">{p.speciesId}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleConfirm} className="primary">Confirm</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [pokemonList, setPokemonList] = useState(INITIAL_POKEMON_DATA)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [activeTab, setActiveTab] = useState('basic')
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showNumberPicker, setShowNumberPicker] = useState(false)
  const [newPokemonNumber, setNewPokemonNumber] = useState(1026)
  const [newPokemonName, setNewPokemonName] = useState('Custom Pokemon 1')
  const [selectedEvolutionIndex, setSelectedEvolutionIndex] = useState(null)
  const [selectedFormKey, setSelectedFormKey] = useState('')

  // Load full Pokemon data on mount
  useEffect(() => {
    loadPokemonData().then(data => {
      setPokemonList(data)
      setLoading(false)
    })
  }, [])

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
    setNewPokemonNumber(maxNum + 1)
    setNewPokemonName(`Custom Pokemon ${maxNum - 1024}`)
    setShowNewModal(true)
  }

  const handleCreatePokemon = () => {
    const speciesNumber = parseInt(newPokemonNumber) || 1026
    const created = createDefaultPokemon(speciesNumber, newPokemonName.trim() || `Custom Pokemon ${speciesNumber}`)
    setPokemonList([...pokemonList, created])
    setSelected(created)
    setMode('edit')
    setActiveTab('basic')
    setShowNewModal(false)
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
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                No Pokemon match "{search || activeLetter}"
              </div>
            ) : (
              filtered.map(p => (
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
              ))
            )}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: '#94a3b8' }}>
            {loading ? 'Loading...' : `${pokemonList.length} Pokemon loaded`}
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
                  <BasicTab pokemon={selected} editable={editable} updateField={updateField} onShowNumberPicker={() => setShowNumberPicker(true)} />
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
                  <EvolutionTab
                    pokemon={selected}
                    allPokemon={pokemonList}
                    editable={editable}
                    updateField={updateField}
                  />
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
      {showNewModal && (
        <NewPokemonModal
          pokemonList={pokemonList}
          speciesNumber={newPokemonNumber}
          name={newPokemonName}
          setSpeciesNumber={setNewPokemonNumber}
          setName={setNewPokemonName}
          onCreate={handleCreatePokemon}
          onCancel={() => setShowNewModal(false)}
        />
      )}
      {showNumberPicker && (
        <PokemonNumberPicker
          isOpen={showNumberPicker}
          onClose={() => setShowNumberPicker(false)}
          onSelect={num => { updateField('speciesNumber', num); setShowNumberPicker(false) }}
          currentNumber={selected?.speciesNumber}
          pokemonList={pokemonList}
        />
      )}
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

function OptionInput({ value, options, disabled, placeholder, onChange, id }) {
  return (
    <>
      <input
        className="form-input"
        type="text"
        list={id}
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={id}>
        {options.map(option => <option key={option} value={option} />)}
      </datalist>
    </>
  )
}

// Shared dropdown-style multi-select (click to add/remove from a select-like popover)
function MultiDropdown({ values, options, disabled, placeholder, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (val) => {
    const cur = values || []
    onChange(cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val])
  }

  return (
    <div className="multi-dropdown" ref={ref}>
      <div className="multi-dropdown-display" onClick={() => !disabled && setOpen(o => !o)}>
        {values && values.length > 0
          ? values.map(v => (
              <span key={v} className="pill">
                {v}
                {!disabled && <button onClick={e => { e.stopPropagation(); toggle(v) }}>x</button>}
              </span>
            ))
          : <span className="multi-dropdown-placeholder">{placeholder || 'Select...'}</span>
        }
        {!disabled && <span className="multi-dropdown-chevron">{open ? '\u25B2' : '\u25BC'}</span>}
      </div>
      {open && (
        <div className="multi-dropdown-menu">
          {options.map(opt => {
            const active = values && values.includes(opt.value)
            return (
              <div key={opt.value} className={`multi-dropdown-item ${active ? 'active' : ''}`}
                onClick={() => toggle(opt.value)}>
                <span className="multi-dropdown-check">{active ? '\u2713' : ''}</span>
                {opt.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MultiOptionInput({ values, options, disabled, placeholder, onChange, id }) {
  const [draft, setDraft] = useState('')
  const selectedValues = values || []

  const addValue = (value) => {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, '_')
    if (!normalized || selectedValues.includes(normalized)) return
    onChange([...selectedValues, normalized])
    setDraft('')
  }

  return (
    <div className="multi-picker">
      <div className="multi-picker-row">
        <OptionInput
          id={id}
          value={draft}
          options={options}
          disabled={disabled}
          placeholder={placeholder}
          onChange={setDraft}
        />
        <button className="btn btn-secondary" disabled={disabled || !draft.trim()} onClick={() => addValue(draft)}>
          Add
        </button>
      </div>
      <div className="pill-list">
        {selectedValues.map(value => (
          <span className="pill" key={value}>
            {value}
            {!disabled && (
              <button onClick={() => onChange(selectedValues.filter(v => v !== value))} aria-label={`Remove ${value}`}>
                x
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

function NewPokemonModal({
  pokemonList, speciesNumber, name, setSpeciesNumber, setName, onCreate, onCancel,
}) {
  const number = parseInt(speciesNumber) || 0
  const existing = pokemonList.find(p => p.speciesNumber === number)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-pokemon-title">
      <div className="modal">
        <h2 id="new-pokemon-title">New Pokemon</h2>
        <div className="form-grid">
          <Field label="Species Number">
            <input className="form-input" type="number" min={1} value={speciesNumber}
              onChange={e => setSpeciesNumber(e.target.value)} />
          </Field>
          <Field label="Name">
            <input className="form-input" type="text" value={name}
              onChange={e => setName(e.target.value)} />
          </Field>
        </div>
        {existing && (
          <p className="modal-warning">#{number} is already used by {existing.name}. Creating anyway will duplicate that number.</p>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onCreate}>Create</button>
        </div>
      </div>
    </div>
  )
}

function BasicTab({ pokemon, editable, updateField, onShowNumberPicker }) {
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
          <div style={{display: 'flex', gap: '8px'}}>
            <input className="form-input" type="number" value={pokemon.speciesNumber} disabled={!editable}
              onChange={e => updateField('speciesNumber', parseInt(e.target.value) || 0)} style={{flex: 1}} />
            {editable && (
              <button onClick={onShowNumberPicker} className="icon-button" title="Browse all Pokemon">🔍</button>
            )}
          </div>
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
          <OptionInput id="ability-1-options" value={pokemon.ability1} options={ABILITY_OPTIONS} disabled={!editable}
            placeholder="OVERGROW"
            onChange={value => updateField('ability1', value.toUpperCase().replace(/\s+/g, '_'))} />
        </Field>
        <Field label="Ability 2">
          <OptionInput id="ability-2-options" value={pokemon.ability2 || ''} options={ABILITY_OPTIONS} disabled={!editable}
            placeholder="CHLOROPHYLL"
            onChange={value => updateField('ability2', value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Hidden Ability">
          <OptionInput id="hidden-ability-options" value={pokemon.hiddenAbility || ''} options={ABILITY_OPTIONS} disabled={!editable}
            onChange={value => updateField('hiddenAbility', value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Passive Ability">
          <OptionInput id="passive-ability-options" value={pokemon.passiveAbility || ''} options={ABILITY_OPTIONS} disabled={!editable}
            onChange={value => updateField('passiveAbility', value.toUpperCase().replace(/\s+/g, '_') || null)} />
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

function EvolutionTab({ pokemon, allPokemon, editable, updateField }) {
  const evolutions = pokemon.evolutions || []
  const speciesOptions = allPokemon.map(p => p.speciesId)

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
          <OptionInput id="pre-evolution-options" value={pokemon.preEvolution || ''} options={speciesOptions} disabled={!editable}
            onChange={value => updateField('preEvolution', value.toLowerCase().replace(/\s+/g, '_') || null)} />
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
            <OptionInput id={`evolution-species-options-${i}`} value={evo.speciesId} options={speciesOptions}
              disabled={!editable} placeholder="Species"
              onChange={value => updateEvolution(i, { speciesId: value.toLowerCase().replace(/\s+/g, '_') })} />
            <input className="form-input" type="number" placeholder="Level" style={{ width: '80px' }}
              value={evo.level || ''} disabled={!editable}
              onChange={e => updateEvolution(i, { level: parseInt(e.target.value) || undefined })} />
            <OptionInput id={`evolution-item-options-${i}`} value={evo.item || ''} options={EVOLUTION_ITEM_OPTIONS}
              disabled={!editable} placeholder="Item"
              onChange={value => updateEvolution(i, { item: value.toUpperCase().replace(/\s+/g, '_') || undefined })} />
            <OptionInput id={`evolution-form-options-${i}`} value={evo.formKey || ''} options={FORM_KEY_OPTIONS}
              disabled={!editable} placeholder="Form Key"
              onChange={value => updateEvolution(i, { formKey: value || undefined })} />
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
            onClick={() => updateField('evolutions', [...evolutions, { speciesId: '', level: 1, formKey: '', variant: '' }])}>
            + Add Evolution
          </button>
        )}
      </div>
    </div>
  )
}

function MovesTab({ pokemon, editable, updateField }) {
  const levelUpRows = Object.entries(pokemon.levelUpMoves || {})
    .map(([level, move]) => ({ level: parseInt(level), move }))
    .sort((a, b) => a.level - b.level)

  const updateLevelUpRows = (rows) => {
    const map = {}
    rows.forEach(row => {
      if (row.level && row.move) map[row.level] = row.move.trim().toUpperCase().replace(/\s+/g, '_')
    })
    updateField('levelUpMoves', map)
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">Moves</h3>
      <div className="form-grid">
        <div className="form-group full-width">
          <label className="form-label">Level-Up Moves</label>
          <div className="move-list">
            {levelUpRows.map((row, i) => (
              <div className="move-row" key={`${row.level}-${row.move}-${i}`}>
                <input className="form-input" type="number" min={1} value={row.level} disabled={!editable}
                  onChange={e => {
                    const next = [...levelUpRows]
                    next[i] = { ...row, level: parseInt(e.target.value) || 1 }
                    updateLevelUpRows(next)
                  }} />
                <OptionInput id={`level-move-options-${i}`} value={row.move} options={MOVE_OPTIONS} disabled={!editable}
                  placeholder="TACKLE"
                  onChange={value => {
                    const next = [...levelUpRows]
                    next[i] = { ...row, move: value.toUpperCase().replace(/\s+/g, '_') }
                    updateLevelUpRows(next)
                  }} />
                {editable && (
                  <button className="btn btn-danger" onClick={() => updateLevelUpRows(levelUpRows.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <button className="btn btn-secondary" onClick={() => updateLevelUpRows([...levelUpRows, { level: 1, move: 'TACKLE' }])}>
                + Add Move
              </button>
            )}
            {levelUpRows.length === 0 && !editable && (
              <p style={{ color: '#94a3b8' }}>No level-up moves defined.</p>
            )}
          </div>
        </div>
        <div className="form-group full-width">
          <label className="form-label">TM Pool</label>
          <MultiOptionInput id="tm-pool-options" values={pokemon.tmPool || []} options={MOVE_OPTIONS} disabled={!editable}
            placeholder="THUNDERBOLT"
            onChange={values => updateField('tmPool', values)} />
        </div>
        <div className="form-group full-width">
          <label className="form-label">Egg Moves</label>
          <MultiOptionInput id="egg-move-options" values={pokemon.eggMoves || []} options={MOVE_OPTIONS} disabled={!editable}
            placeholder="ANCIENT_POWER"
            onChange={values => updateField('eggMoves', values)} />
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
                <OptionInput id={`form-key-options-${i}`} value={form.formKey} options={FORM_KEY_OPTIONS} disabled={!editable}
                  placeholder="alolan"
                  onChange={value => updateForm(i, { formKey: value.toLowerCase().replace(/\s+/g, '_') })} />
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
            <option value="">-- Select --</option>
            {allPokemon.map(p => (
              <option key={p.speciesId} value={p.spriteKey}>
                {p.name} ({p.spriteKey})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon Key">
          <select className="form-select" value={pokemon.iconKey || ''} disabled={!editable}
            onChange={e => updateField('iconKey', e.target.value)}>
            <option value="">-- Select --</option>
            {allPokemon.map(p => (
              <option key={p.speciesId} value={p.iconKey || p.spriteKey}>
                {p.name} ({p.iconKey || p.spriteKey})
              </option>
            ))}
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
              <span style={{ color: '#94a3b8' }}>{evo.formKey || 'base'}</span>
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
          <MultiDropdown
            values={pokemon.passives || []}
            options={ABILITY_OPTIONS.map(ability => ({
              value: ability,
              label: ability.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
            }))}
            disabled={!editable}
            placeholder="Overgrow"
            onChange={values => updateField('passives', values)}
          />
        </div>
        <div className="form-group full-width">
          <label className="form-label">Spawn Biomes</label>
          <MultiOptionInput id="biome-options" values={pokemon.biomes || []} options={BIOME_OPTIONS} disabled={!editable}
            placeholder="FOREST"
            onChange={values => updateField('biomes', values)} />
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
