import { useState, useEffect, useRef } from 'react'
import {
  TYPES, GROWTH_RATES, VARIANT_OPTIONS,
  ABILITY_OPTIONS, MOVE_OPTIONS, BIOME_OPTIONS, FORM_KEY_OPTIONS,
  EVOLUTION_ITEM_OPTIONS,
  INITIAL_POKEMON_DATA, createDefaultPokemon, createDefaultForm,
  resolvedSpriteKey, variantLabel,
} from './data.js'
import {
  MOVE_DESCRIPTIONS, ABILITY_DESCRIPTIONS, PASSIVE_DESCRIPTIONS, TYPE_DESCRIPTIONS,
} from './descriptions.js'
import { getEvolutionChain, findRootSpeciesId, buildGameExport, REAL_ID_RANGE_START, REAL_ID_RANGE_END, EGG_TIERS } from './gameExport.js'
import { loadProject, saveProject, nextAvailableId, normalizeSpecies, validateSpecies, CUSTOM_ID_START } from './projectStore.js'
import { HELD_ITEM_OPTIONS, HELD_ITEM_DESCRIPTIONS, EVOLUTION_ITEM_DESCRIPTIONS, NATURE_OPTIONS } from './held-items.js'
import { downloadProjectManifest } from './projectManifest.js'

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
  { id: 'basic', label: 'Basic' },
  { id: 'types', label: 'Types' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'stats', label: 'Stats' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'moves', label: 'Moves' },
  { id: 'forms', label: 'Forms' },
  { id: 'sprites', label: 'Sprites' },
  { id: 'passives', label: 'Spawns' },
  { id: 'availability', label: 'Availability' },
]

function downloadPokemon(pokemon) {
  const constName = `${pokemon.speciesId.replace(/-/g, '_')}_SPECIES`
  const content =
    `// Custom Pokemon: ${pokemon.name}\n` +
    `export const ${constName} = ${JSON.stringify(pokemon, null, 2)};\n`
  let url = null
  try {
    const blob = new Blob([content], { type: 'text/plain' })
    url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pokemon.speciesId}.ts`
    // Append to body to ensure it works in Firefox
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    if (url) {
      URL.revokeObjectURL(url)
    }
  }
}

// Pokémon Number Picker Modal
function PokemonNumberPicker({ isOpen, onClose, onSelect, currentNumber, pokemonList }) {
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
  
  const filteredPokemon = (pokemonList || []).filter(p => {
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
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [activeTab, setActiveTab] = useState('basic')
  const [search, setSearch] = useState('')
  const [activeLetter, setActiveLetter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pokemonList, setPokemonList] = useState(INITIAL_POKEMON_DATA)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showNumberPicker, setShowNumberPicker] = useState(false)
  const [numberPickerTarget, setNumberPickerTarget] = useState('existing') // 'existing' | 'new'
  const [newPokemonNumber, setNewPokemonNumber] = useState(1026)
  const [newPokemonName, setNewPokemonName] = useState('Custom Pokemon 1')
  const [selectedEvolutionIndex, setSelectedEvolutionIndex] = useState(null)
  const [selectedFormKey, setSelectedFormKey] = useState('')

  // Load full Pokemon data on mount
  useEffect(() => {
    loadPokemonData().then(data => {
      setPokemonList(loadProject(data))
      setLoading(false)
    }).catch(error => {
      setError('Failed to load Pokemon data. Please check your connection.')
      setLoading(false)
    })
  }, [])

  const filtered = pokemonList.filter(p => {
    if (!pokemonList) return [];
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.speciesId.toLowerCase().includes(search.toLowerCase())
    const matchesLetter = !activeLetter || p.name.toUpperCase().startsWith(activeLetter)
    return matchesSearch && matchesLetter
  })

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || document.activeElement?.isContentEditable
      if (isEditable) return
      if (e.key.length === 1 && e.key.match(/[A-Za-z]/) && !e.ctrlKey && !e.metaKey) {
        setActiveLetter(e.key.toUpperCase())
        setSearch('')
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
    const freeId = nextAvailableId(pokemonList)
    setNewPokemonNumber(freeId)
    setNewPokemonName(`Custom Pokemon ${freeId - 1025}`)
    setShowNewModal(true)
  }

  const handleCreatePokemon = () => {
    const speciesNumber = parseInt(newPokemonNumber) || CUSTOM_ID_START
    const created = normalizeSpecies({ ...createDefaultPokemon(speciesNumber, newPokemonName.trim() || `Custom Pokemon ${speciesNumber}`), source: 'custom' })
    const errors = validateSpecies(created, pokemonList)
    if (errors.length) { setError(errors.join(' ')); return }
    const next = [...pokemonList, created]
    setPokemonList(next)
    saveProject(next)
    setSelected(created)
    setMode('edit')
    setActiveTab('basic')
    setShowNewModal(false)
  }

  const handleSave = () => {
    if (!selected) return
    const errors = selected.source === 'custom' ? validateSpecies(selected, pokemonList) : []
    if (errors.length) { setError(errors.join(' ')); return }
    const next = pokemonList.map(p => (p.projectId === selected.projectId ? { ...selected, revision: (selected.revision || 0) + 1 } : p))
    setPokemonList(next)
    saveProject(next)
    setSelected(next.find(p => p.projectId === selected.projectId))
    setError(null)
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

  // For editing a *different* stage's sprite/icon key from this Pokemon's
  // Sprites tab (pre-evolution or an evolution target) — commits directly
  // to pokemonList since it's not part of the currently-selected Pokemon's
  // draft edit buffer. If that other stage happens to be the currently
  // selected/edited one, keep the draft buffer in sync too.
  const updateOtherPokemon = (speciesId, field, value) => {
    setPokemonList(list => { const next = list.map(p => (p.speciesId === speciesId ? { ...p, [field]: value } : p)); saveProject(next); return next })
    if (selected?.speciesId === speciesId) {
      setSelected(prev => ({ ...prev, [field]: value }))
    }
  }

  const editable = mode === 'edit'

  if (loading) {
    return <div className="loading">Loading Pokémon data...</div>
  }
  
  if (error) {
    return <div className="error">Error: {error}</div>
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Pokerogue Pokemon Creator</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => downloadProjectManifest(pokemonList)}>Export Mod Project</button>
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
                  key={p.projectId}
                  className={`pokemon-list-item ${selected?.projectId === p.projectId ? 'selected' : ''}`}
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
                  <BasicTab pokemon={selected} editable={editable} updateField={updateField} onShowNumberPicker={() => setShowNumberPicker(true)} pokemonList={pokemonList} />
                )}
                {activeTab === 'types' && (
                  <TypesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'abilities' && (
                  <AbilitiesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'stats' && (
                  <StatsTab pokemon={selected} allPokemon={pokemonList} editable={editable} updateStat={updateStat} />
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
                    updateOtherPokemon={updateOtherPokemon}
                  />
                )}
                {activeTab === 'passives' && (
                  <PassivesTab pokemon={selected} editable={editable} updateField={updateField} />
                )}
                {activeTab === 'availability' && (
                  <AvailabilityTab pokemon={selected} editable={editable} updateField={updateField} />
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
                <p>A-Z: Jump to letter (when not typing in a field) | Esc: Clear filter</p>
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
          onBrowseNumbers={() => { setNumberPickerTarget('new'); setShowNumberPicker(true) }}
        />
      )}
      {showNumberPicker && (
        <PokemonNumberPicker
          isOpen={showNumberPicker}
          onClose={() => setShowNumberPicker(false)}
          onSelect={(num) => {
            if (numberPickerTarget === 'new') {
              setNewPokemonNumber(num)
            } else if (selected) {
              updateField('speciesNumber', num)
            }
            setShowNumberPicker(false)
          }}
          currentNumber={numberPickerTarget === 'new' ? (parseInt(newPokemonNumber) || 1) : (selected?.speciesNumber || 1)}
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

function OptionInput({ value, options, disabled, placeholder, onChange, id, descriptions }) {
  const desc = descriptions && value ? descriptions[value] : null
  return (
    <>
      <input
        className="form-input"
        type="text"
        list={id}
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        title={desc || undefined}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={id}>
        {options.map(option => <option key={option} value={option} />)}
      </datalist>
      {desc && <p className="field-description">{desc}</p>}
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
                title={opt.description || undefined}
                onClick={() => toggle(opt.value)}>
                <span className="multi-dropdown-check">{active ? '✓' : ''}</span>
                {opt.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MultiOptionInput({ values, options, disabled, addDisabled, placeholder, onChange, id, descriptions }) {
  const [draft, setDraft] = useState('')
  const selectedValues = values || []
  // addDisabled gates only the "add new" row (e.g. a cap being reached).
  // Removing an already-selected value should still work whenever the form
  // itself is editable — being capped shouldn't also lock you out of
  // removing something to make room for a different pick.
  const addRowDisabled = disabled || addDisabled

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
          disabled={addRowDisabled}
          placeholder={placeholder}
          descriptions={descriptions}
          onChange={setDraft}
        />
        <button className="btn btn-secondary" disabled={addRowDisabled || !draft.trim()} onClick={() => addValue(draft)}>
          Add
        </button>
      </div>
      <div className="pill-list">
        {selectedValues.map(value => (
          <span className="pill" key={value} title={descriptions?.[value] || undefined}>
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
  pokemonList, speciesNumber, name, setSpeciesNumber, setName, onCreate, onCancel, onBrowseNumbers,
}) {
  const number = parseInt(speciesNumber) || 0
  const existing = pokemonList.find(p => p.speciesNumber === number)
  const [confirmedOverride, setConfirmedOverride] = useState(false)

  // Reset the override confirmation whenever the number changes, so it can
  // never silently carry over to a different (also colliding) number.
  useEffect(() => { setConfirmedOverride(false) }, [number])

  const blocked = number < CUSTOM_ID_START || !!existing

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-pokemon-title">
      <div className="modal">
        <h2 id="new-pokemon-title">New Pokemon</h2>
        <div className="form-grid">
          <Field label="Species Number">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className="form-input" type="number" min={CUSTOM_ID_START} value={speciesNumber}
                onChange={e => setSpeciesNumber(e.target.value)} />
              <button type="button" className="icon-button" title="Browse taken/free numbers"
                onClick={onBrowseNumbers}>🔍</button>
            </div>
          </Field>
          <Field label="Name">
            <input className="form-input" type="text" value={name}
              onChange={e => setName(e.target.value)} />
          </Field>
        </div>
        {existing && (
          <>
            <p className="modal-warning">
              #{number} is already used by {existing.name}. Two Pokemon sharing a number isn't just a
              display quirk here — if both ever get exported to your real game, whichever one builds
              last silently overwrites the other under that same ID, and anything that already evolves
              into or out of #{number} would evolve into the wrong Pokemon without any error. This is
              blocked permanently. Choose a different slot.
            </p>

          </>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onCreate} disabled={blocked}>Create</button>
        </div>
      </div>
    </div>
  )
}

function BasicTab({ pokemon, editable, updateField, onShowNumberPicker, pokemonList }) {
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
            <input className="form-input" type="number" min={CUSTOM_ID_START} value={pokemon.speciesNumber} disabled={!editable || pokemon.source === 'legacy'}
              onChange={e => updateField('speciesNumber', parseInt(e.target.value) || 0)} style={{flex: 1}} />
            {editable && pokemon.source !== 'legacy' && (
              <button onClick={() => onShowNumberPicker(pokemonList)} className="icon-button" title="Browse all Pokemon">🔍</button>
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
          <div className="checkbox-group">
            <input type="checkbox" id="isStarter" checked={!!pokemon.isStarter} disabled={!editable}
              onChange={e => updateField('isStarter', e.target.checked)} />
            <label htmlFor="isStarter">Starter Pokemon (selectable in New Game)</label>
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
          {TYPE_DESCRIPTIONS[pokemon.primaryType] && (
            <p className="field-description">{TYPE_DESCRIPTIONS[pokemon.primaryType]}</p>
          )}
        </Field>
        <Field label="Secondary Type">
          <select className="form-select" value={pokemon.secondaryType || ''} disabled={!editable}
            onChange={e => updateField('secondaryType', e.target.value || null)}>
            <option value="">None</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {pokemon.secondaryType && TYPE_DESCRIPTIONS[pokemon.secondaryType] && (
            <p className="field-description">{TYPE_DESCRIPTIONS[pokemon.secondaryType]}</p>
          )}
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
            placeholder="OVERGROW" descriptions={ABILITY_DESCRIPTIONS}
            onChange={value => updateField('ability1', value.toUpperCase().replace(/\s+/g, '_'))} />
        </Field>
        <Field label="Ability 2">
          <OptionInput id="ability-2-options" value={pokemon.ability2 || ''} options={ABILITY_OPTIONS} disabled={!editable}
            placeholder="CHLOROPHYLL" descriptions={ABILITY_DESCRIPTIONS}
            onChange={value => updateField('ability2', value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Hidden Ability">
          <OptionInput id="hidden-ability-options" value={pokemon.hiddenAbility || ''} options={ABILITY_OPTIONS} disabled={!editable}
            descriptions={ABILITY_DESCRIPTIONS}
            onChange={value => updateField('hiddenAbility', value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
        <Field label="Passive Ability">
          <OptionInput id="passive-ability-options" value={pokemon.passiveAbility || ''} options={ABILITY_OPTIONS} disabled={!editable}
            descriptions={ABILITY_DESCRIPTIONS}
            onChange={value => updateField('passiveAbility', value.toUpperCase().replace(/\s+/g, '_') || null)} />
        </Field>
      </div>
    </div>
  )
}

function StatsTab({ pokemon, allPokemon, editable, updateStat }) {
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
      <GameExportPanel pokemon={pokemon} allPokemon={allPokemon} />
    </div>
  )
}

function GameExportPanel({ pokemon, allPokemon }) {
  const rootSpeciesId = findRootSpeciesId(pokemon.speciesId, allPokemon)
  const rootPokemon = allPokemon.find(p => p.speciesId === rootSpeciesId) || pokemon
  const chain = getEvolutionChain(rootSpeciesId, allPokemon)

  const [startId, setStartId] = useState(1040)
  const [lineName, setLineName] = useState(rootPokemon.name || '')
  const [starterCost, setStarterCost] = useState(1)
  const [eggTier, setEggTier] = useState('')
  const [nature, setNature] = useState('')
  const [heldItems, setHeldItems] = useState([])
  const [result, setResult] = useState(null)

  const chainSpeciesIds = new Set(chain.map(s => s.speciesId))
  const proposedIds = chain.map((_, i) => (parseInt(startId) || 0) + i)
  const livePreviewCollisions = allPokemon.filter(p =>
    !chainSpeciesIds.has(p.speciesId) && proposedIds.includes(p.speciesNumber)
  )

  const addHeldItem = () => setHeldItems([...heldItems, { name: '', count: 1 }])
  const updateHeldItem = (i, patch) => {
    const next = [...heldItems]
    next[i] = { ...next[i], ...patch }
    setHeldItems(next)
  }
  const removeHeldItem = (i) => setHeldItems(heldItems.filter((_, idx) => idx !== i))

  const handleGenerate = () => {
    const output = buildGameExport({
      chain, allPokemon, startId: parseInt(startId) || 0, lineName,
      starterCost: parseInt(starterCost) || 1,
      eggTier: eggTier || null,
      nature: nature ? nature.toUpperCase().replace(/\s+/g, '_') : null,
      heldItems: heldItems.filter(h => h.name.trim()).map(h => ({
        name: h.name.trim().toUpperCase().replace(/\s+/g, '_'),
        count: parseInt(h.count) || 1,
      })),
    })
    setResult(output)
  }

  const handleDownload = () => {
    if (!result || result.error) return
    const parts = [
      '// ============ 1. src/enums/species-id.ts ============',
      result.enumBlock,
      '// ============ 2. generation-XX.ts ============',
      result.generationBlock,
      '// ============ 3. src/data/balance/moves/egg-moves.ts ============',
      result.eggMovesBlock,
      '// ============ 4. Asset checklist ============',
      result.assetChecklist,
    ]
    if (result.starterPatchBlock) {
      parts.push('// ============ 5. src/phases/select-starter-phase.ts ============', result.starterPatchBlock)
    }
    parts.push(
      '// ============ Manual steps NOT covered by this patch ============',
      result.manualSteps.map(s => `// - ${s}`).join('\n'),
    )
    const blob = new Blob([parts.join('\n\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${lineName.toLowerCase().replace(/\s+/g, '_') || 'custom_line'}_game_patch.ts.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadManifest = () => {
    if (!result || result.error) return
    const blob = new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${lineName.toLowerCase().replace(/\s+/g, '_') || 'custom_line'}_manifest.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="form-section" style={{ marginTop: '24px' }}>
      <h3 className="form-section-title">Export Game Patch</h3>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        <strong>What this does:</strong> takes a full custom evolution line you've built here in the
        Tool and gets it into your actual local game project — new numeric species IDs, a registry
        block with your stats/types/abilities/moves in the real field names, matching egg-move
        entries, donor sprite/icon/cry assets copied under the new IDs, and (if set below) a patch
        for the game's starter-select code. Works from any stage of a line, not just the first one:
        {' '}{chain.map(s => s.name).join(' → ')}.
      </p>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        <strong>Two ways to get it into your project:</strong> download the Manifest (.json) and run
        the included <code>apply-game-patch.cjs</code> script from your terminal — it actually edits
        the real files and copies the real assets for you, so you're not doing the work twice. Or
        download the Patch (.txt) to review/copy by hand if you'd rather do it yourself. Either way,
        you still need to rebuild your project afterward — this Tool has no live connection to a
        running game.
      </p>
      <div className="form-grid" style={{ marginBottom: '16px' }}>
        <Field label="Line Name">
          <input className="form-input" type="text" value={lineName} onChange={e => setLineName(e.target.value)} />
        </Field>
        <Field label={`Start ID (safe range: ${REAL_ID_RANGE_START}-${REAL_ID_RANGE_END})`}>
          <input className="form-input" type="number" value={startId}
            onChange={e => setStartId(e.target.value)} />
          {livePreviewCollisions.length > 0 && (
            <p className="field-description" style={{ color: 'var(--danger)' }}>
              ⚠ Collides with: {livePreviewCollisions.map(p => `#${p.speciesNumber} ${p.name}`).join(', ')}
              {' '}— pick a different Start ID.
            </p>
          )}
        </Field>
        <Field label="Starter Cost">
          <input className="form-input" type="number" min={1} value={starterCost}
            onChange={e => setStarterCost(e.target.value)} />
        </Field>
        <Field label="Egg Tier (optional — real field is optional)">
          <select className="form-select" value={eggTier} onChange={e => setEggTier(e.target.value)}>
            <option value="">(omit — leave unset)</option>
            {EGG_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Fixed Nature (optional)">
          <select className="form-select" value={nature} onChange={e => setNature(e.target.value)}>
            <option value="">(omit — player chooses at starter select, as normal)</option>
            {NATURE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label className="form-label">Starting Held Items (optional)</label>
        <p className="field-description" style={{ marginBottom: '8px' }}>
          Real held-item keys, extracted directly from this project's own modifier registry (111
          confirmed). Descriptions are shown where available — common items have well-known,
          stable effects; PokeRogue-specific items (Mystery Encounter items, some boosters) are
          left undescribed rather than guessed.
        </p>
        <div className="evolution-list">
          {heldItems.map((item, i) => (
            <div className="evolution-item" key={i}>
              <OptionInput id={`held-item-options-${i}`} value={item.name} options={HELD_ITEM_OPTIONS}
                placeholder="LEFTOVERS" descriptions={HELD_ITEM_DESCRIPTIONS}
                onChange={value => updateHeldItem(i, { name: value })} />
              <input className="form-input" type="number" min={CUSTOM_ID_START} style={{ width: '90px' }}
                placeholder="Count" value={item.count}
                onChange={e => updateHeldItem(i, { count: e.target.value })} />
              <button className="btn btn-danger" onClick={() => removeHeldItem(i)}>Remove</button>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addHeldItem}>+ Add Held Item</button>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleGenerate}>Generate Patch</button>

      {result?.error && (
        <p style={{ color: 'var(--danger)', marginTop: '12px' }}>{result.error}</p>
      )}

      {result && !result.error && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={handleDownloadManifest}>
              Download Manifest (.json) — for apply-game-patch.cjs
            </button>
            <button className="btn btn-secondary" onClick={handleDownload}>Download Patch (.txt) — to review/copy by hand</button>
          </div>
          <p className="field-description" style={{ marginTop: '10px' }}>
            <strong>To actually apply it:</strong> from your local <code>pokerogue-beta</code> project
            folder, run <code>node apply-game-patch.cjs --manifest {(lineName || 'custom_line').toLowerCase().replace(/\s+/g, '_')}_manifest.json --project /path/to/pokerogue-beta --dry-run</code> first
            to check everything, then re-run without <code>--dry-run</code> to actually write the
            files and copy the assets. The script is included alongside this Tool.
          </p>
          <div style={{ marginTop: '12px' }}>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>
              Stage IDs: {result.stageEnumNames.map((n, i) => `${n}=${result.stageIds[i]}`).join(', ')}
            </p>
            {result.manualSteps.map((step, i) => (
              <p key={i} style={{ color: '#f0b429', fontSize: '13px' }}>⚠ {step}</p>
            ))}
          </div>
        </div>
      )}
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
              disabled={!editable} placeholder="Item" descriptions={EVOLUTION_ITEM_DESCRIPTIONS}
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

      <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '16px' }}>
        Looking for Export Game Patch? It's on the Stats tab now — it works from any stage of
        this line, not just the first one.
      </p>
    </div>
  )
}

function MovesTab({ pokemon, editable, updateField }) {
  // levelUpMoves used to be stored as {level: move} — a plain object, which
  // silently collapses to one entry whenever two moves share a level
  // (object keys must be unique). That's the bug behind "can't pick two
  // moves at the same level." Switched to an array of {level, move} so
  // duplicates are allowed. (Checked: every entry in pokemon_data.json has
  // levelUpMoves as an empty {}, so there's no real data to migrate.)
  const levelUpRows = Array.isArray(pokemon.levelUpMoves) ? pokemon.levelUpMoves : []
  const eggMoves = pokemon.eggMoves || []
  const EGG_MOVE_CAP = 4 // confirmed exact count in the real game's egg-moves.ts

  const updateLevelUpRows = (rows) => updateField('levelUpMoves', rows)

  const addAllTMs = () => {
    const combined = Array.from(new Set([...(pokemon.tmPool || []), ...MOVE_OPTIONS]))
    updateField('tmPool', combined)
  }

  return (
    <div className="form-section">
      <h3 className="form-section-title">Moves</h3>
      <div className="form-grid">
        <div className="form-group full-width">
          <label className="form-label">Level-Up Moves</label>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 8px' }}>
            Multiple moves can share the same level — just add another row with the same number.
          </p>
          <div className="move-list">
            {levelUpRows.map((row, i) => (
              <div className="move-row" key={i}>
                <input className="form-input" type="number" min={CUSTOM_ID_START} value={row.level} disabled={!editable}
                  onChange={e => {
                    const next = [...levelUpRows]
                    next[i] = { ...row, level: parseInt(e.target.value) || 1 }
                    updateLevelUpRows(next)
                  }} />
                <OptionInput id={`level-move-options-${i}`} value={row.move} options={MOVE_OPTIONS} disabled={!editable}
                  placeholder="TACKLE" descriptions={MOVE_DESCRIPTIONS}
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
              <button className="btn btn-secondary" onClick={() => updateLevelUpRows([...levelUpRows, { level: 1, move: '' }])}>
                + Add Move
              </button>
            )}
            {levelUpRows.length === 0 && !editable && (
              <p style={{ color: '#94a3b8' }}>No level-up moves defined.</p>
            )}
          </div>
        </div>
        <div className="form-group full-width">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <label className="form-label" style={{ margin: 0 }}>TM Pool</label>
            {editable && (
              <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: '12px' }} onClick={addAllTMs}>
                + All TMs
              </button>
            )}
          </div>
          <MultiOptionInput id="tm-pool-options" values={pokemon.tmPool || []} options={MOVE_OPTIONS} disabled={!editable}
            placeholder="THUNDERBOLT" descriptions={MOVE_DESCRIPTIONS}
            onChange={values => updateField('tmPool', values)} />
        </div>
        <div className="form-group full-width">
          <label className="form-label">
            Egg Moves ({eggMoves.length}/{EGG_MOVE_CAP})
          </label>
          <MultiOptionInput id="egg-move-options" values={eggMoves}
            options={eggMoves.length >= EGG_MOVE_CAP ? [] : MOVE_OPTIONS}
            disabled={!editable}
            addDisabled={eggMoves.length >= EGG_MOVE_CAP}
            placeholder={eggMoves.length >= EGG_MOVE_CAP ? `Limit of ${EGG_MOVE_CAP} reached` : 'ANCIENT_POWER'}
            descriptions={MOVE_DESCRIPTIONS}
            onChange={values => updateField('eggMoves', values.slice(0, EGG_MOVE_CAP))} />
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
        {forms.map((form, i) => {
          const suggestedKey = `${pokemon.speciesNumber}${form.formKey ? `-${form.formKey}` : ''}`
          return (
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
              <Field label="Sprite Key (Tool bookkeeping only — see note below)">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" type="text" value={form.spriteKey} disabled={!editable}
                    placeholder={suggestedKey}
                    onChange={e => updateForm(i, { spriteKey: e.target.value })} />
                  {editable && (
                    <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                      onClick={() => updateForm(i, { spriteKey: suggestedKey })}>
                      Use "{suggestedKey}"
                    </button>
                  )}
                </div>
                <p className="field-description">
                  <strong>Correction from an earlier version of this Tool:</strong> there is no
                  "Sprite Key" field anywhere in the real game's data at all — confirmed directly
                  in the actual source. The sprite file the game loads is always computed
                  automatically at runtime as <code>{'{numeric SpeciesId}'}{'{-formKey if not the default form}'}</code>,
                  e.g. Charizard is species #6, so its Mega X form loads <code>6-mega-x.png</code> —
                  not a name-based file like <code>charizard-mega-x.png</code>. You can't override
                  this by typing a different value anywhere in the real game; this field only exists
                  so this Tool's own "Export Game Patch" feature knows which existing species' art
                  to physically copy for this stage. The real trick your project already uses (see
                  Tetradim/Tetrajin) is copying an existing Pok\u00e9mon's actual image/atlas files to a
                  new filename matching your custom species' own number — not pointing at another
                  species by name.
                </p>
              </Field>
              <Field label="Icon Key (Tool bookkeeping only — see note below)">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" type="text" value={form.iconKey} disabled={!editable}
                    placeholder={String(pokemon.speciesNumber)}
                    onChange={e => updateForm(i, { iconKey: e.target.value })} />
                  {editable && (
                    <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                      onClick={() => updateForm(i, { iconKey: String(pokemon.speciesNumber) })}>
                      Use "{pokemon.speciesNumber}"
                    </button>
                  )}
                </div>
                <p className="field-description">
                  Same correction as Sprite Key above — not a real settable field either. Icons
                  are frames inside one shared spritesheet per generation
                  (<code>pokemon_icons_0.png</code> ... <code>pokemon_icons_9.png</code>), keyed by
                  numeric ID, not a standalone file you can point elsewhere.
                </p>
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
          )
        })}
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
function SpritesTab({ pokemon, allPokemon, editable, updateField, updateOtherPokemon }) {
  const preEvo = pokemon.preEvolution
    ? allPokemon.find(p => p.speciesId === pokemon.preEvolution)
    : null

  const evolutions = pokemon.evolutions || []
  const spriteKeyOptions = allPokemon.map(p => p.spriteKey).filter(Boolean)
  const iconKeyOptions = allPokemon.map(p => p.iconKey || p.spriteKey).filter(Boolean)

  return (
    <div className="form-section">
      <h3 className="form-section-title">Sprites</h3>
      <div className="form-grid">
        <Field label="Sprite Key">
          <div style={{ display: 'flex', gap: '8px' }}>
            <OptionInput id="sprite-key-options" value={pokemon.spriteKey || ''} options={spriteKeyOptions}
              disabled={!editable} placeholder={pokemon.speciesId}
              onChange={value => updateField('spriteKey', value)} />
            {editable && pokemon.spriteKey !== pokemon.speciesId && (
              <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                onClick={() => updateField('spriteKey', pokemon.speciesId)}>
                Reset to "{pokemon.speciesId}"
              </button>
            )}
          </div>
        </Field>
        <Field label="Icon Key">
          <div style={{ display: 'flex', gap: '8px' }}>
            <OptionInput id="icon-key-options" value={pokemon.iconKey || ''} options={iconKeyOptions}
              disabled={!editable} placeholder={pokemon.speciesId}
              onChange={value => updateField('iconKey', value)} />
            {editable && pokemon.iconKey !== pokemon.speciesId && (
              <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                onClick={() => updateField('iconKey', pokemon.speciesId)}>
                Reset to "{pokemon.speciesId}"
              </button>
            )}
          </div>
        </Field>
      </div>

      <h3 className="form-section-title" style={{ marginTop: '24px' }}>Sprites Per Evolution Stage</h3>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Each stage of this line is its own Pokemon entry with its own Sprite Key, so you can assign a
        different sprite per stage right here without switching to that stage's own page. Shiny/form
        display is still set per stage on the Evolution tab. Type to search, or use Reset to put it
        back to that Pokemon's own default.
      </p>

      <div className="evolution-list">
        {preEvo && (
          <div className="evolution-item" style={{ flexWrap: 'wrap' }}>
            <span style={{ width: '90px', color: '#94a3b8', fontSize: '12px' }}>PRE-EVO</span>
            <span style={{ flex: 1, minWidth: '120px' }}>{preEvo.name}</span>
            <div style={{ display: 'flex', gap: '8px', width: '340px' }}>
              <OptionInput id="pre-evo-sprite-key-options" value={preEvo.spriteKey || ''} options={spriteKeyOptions}
                disabled={!editable}
                onChange={value => updateOtherPokemon(preEvo.speciesId, 'spriteKey', value)} />
              {editable && preEvo.spriteKey !== preEvo.speciesId && (
                <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => updateOtherPokemon(preEvo.speciesId, 'spriteKey', preEvo.speciesId)}>
                  Reset
                </button>
              )}
            </div>
            <span style={{ color: '#94a3b8' }}>{variantLabel(preEvo.variant)}</span>
          </div>
        )}

        <div className="evolution-item">
          <span style={{ width: '90px', color: 'var(--secondary)', fontSize: '12px' }}>THIS MON</span>
          <span style={{ flex: 1 }}>{pokemon.name}</span>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>(edit using the Sprite Key field above)</span>
          <code>{resolvedSpriteKey(pokemon.spriteKey, pokemon.variant)}</code>
        </div>

        {evolutions.map((evo, i) => {
          const evoSpecies = allPokemon.find(p => p.speciesId === evo.speciesId)
          if (!evoSpecies) {
            return (
              <div className="evolution-item" key={i}>
                <span style={{ width: '90px', color: '#94a3b8', fontSize: '12px' }}>
                  LV {evo.level || '—'}{evo.item ? ` / ${evo.item}` : ''}
                </span>
                <span style={{ flex: 1, color: '#94a3b8' }}>
                  {evo.speciesId || '(unset)'} {'—'} not found in the roster, can't assign a sprite yet
                </span>
              </div>
            )
          }
          return (
            <div className="evolution-item" key={i} style={{ flexWrap: 'wrap' }}>
              <span style={{ width: '90px', color: '#94a3b8', fontSize: '12px' }}>
                LV {evo.level || '—'}{evo.item ? ` / ${evo.item}` : ''}
              </span>
              <span style={{ flex: 1, minWidth: '120px' }}>{evoSpecies.name}</span>
              <div style={{ display: 'flex', gap: '8px', width: '340px' }}>
                <OptionInput id={`evo-sprite-key-options-${i}`} value={evoSpecies.spriteKey || ''} options={spriteKeyOptions}
                  disabled={!editable}
                  onChange={value => updateOtherPokemon(evoSpecies.speciesId, 'spriteKey', value)} />
                {editable && evoSpecies.spriteKey !== evoSpecies.speciesId && (
                  <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}
                    onClick={() => updateOtherPokemon(evoSpecies.speciesId, 'spriteKey', evoSpecies.speciesId)}>
                    Reset
                  </button>
                )}
              </div>
              <span style={{ color: '#94a3b8' }}>{evo.formKey || 'base'}</span>
              <span style={{ color: '#94a3b8' }}>{variantLabel(evo.variant)}</span>
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
              label: ability.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
              description: PASSIVE_DESCRIPTIONS[ability] || ABILITY_DESCRIPTIONS[ability],
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


function AvailabilityTab({ pokemon, editable, updateField }) {
  const availability = pokemon.availability || {}
  const labels = {
    wildEncounters: 'Wild encounters',
    starters: 'Starter selection',
    eggs: 'Egg pools',
    trainers: 'Trainer teams',
    bosses: 'Boss encounters',
    specialRewards: 'Special rewards and mystery encounters',
  }
  const setAvailability = (key, value) => updateField('availability', { ...availability, [key]: value })
  const setAll = value => updateField('availability', Object.fromEntries(Object.keys(labels).map(key => [key, value])))
  return (
    <div className="form-section">
      <h3 className="form-section-title">Acquisition &amp; Encounter Availability</h3>
      <p className="field-description">
        Disabling a legacy species preserves its registry entry and existing saves. The injector will remove it only from the selected acquisition pools.
      </p>
      <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        <button className="btn btn-secondary" disabled={!editable} onClick={() => setAll(false)}>Disable all acquisition</button>
        <button className="btn btn-secondary" disabled={!editable} onClick={() => setAll(true)}>Enable all acquisition</button>
      </div>
      <div className="form-grid">
        {Object.entries(labels).map(([key, label]) => (
          <div className="checkbox-group" key={key}>
            <input type="checkbox" id={`availability-${key}`} checked={availability[key] !== false} disabled={!editable}
              onChange={e => setAvailability(key, e.target.checked)} />
            <label htmlFor={`availability-${key}`}>{label}</label>
          </div>
        ))}
      </div>
    </div>
  )
}
