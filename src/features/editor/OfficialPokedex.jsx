import { useMemo, useState } from 'react'

function searchText(entry) {
  return `${entry.name ?? ''} ${entry.speciesId ?? ''} ${entry.speciesNumber ?? ''}`.toLowerCase()
}

function TypeBadge({ type }) {
  if (!type) return null
  return <span className={`type-badge type-${String(type).toLowerCase()}`}>{type}</span>
}

export function OfficialPokedex({ pokemon, loading = false, error = null, selected, onSelect }) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => (
    pokemon
      .filter(entry => !normalizedSearch || searchText(entry).includes(normalizedSearch))
      .slice(0, 250)
  ), [pokemon, normalizedSearch])

  return (
    <aside className="pokedex-panel" aria-label="Official Pokédex reference">
      <div className="pokedex-heading">
        <div><span className="panel-kicker">Read-only reference</span><strong>Official Pokédex</strong></div>
        <span className="count-pill">{pokemon.length}</span>
      </div>
      <label className="pokedex-search">
        <span className="sr-only">Search official Pokédex</span>
        <input
          aria-label="Search official Pokédex"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search name, ID, or number…"
        />
      </label>
      <div className="pokedex-list" aria-live="polite">
        {loading && <p className="pokedex-message">Loading official species…</p>}
        {error && <p className="pokedex-message error-text">{error}</p>}
        {!loading && !error && filtered.length === 0 && <p className="pokedex-message">No official species match this search.</p>}
        {!loading && !error && filtered.map(entry => {
          const key = `${entry.speciesNumber}-${entry.speciesId}`
          const active = selected?.speciesNumber === entry.speciesNumber && selected?.speciesId === entry.speciesId
          return (
            <button
              type="button"
              key={key}
              className={active ? 'pokedex-row active' : 'pokedex-row'}
              aria-pressed={active}
              onClick={() => onSelect(entry)}
            >
              <span className="dex-number">#{String(entry.speciesNumber).padStart(4, '0')}</span>
              <span className="dex-name">{entry.name}</span>
              <span className="dex-types"><TypeBadge type={entry.primaryType} /><TypeBadge type={entry.secondaryType} /></span>
            </button>
          )
        })}
      </div>
      {selected && (
        <section className="official-reference">
          <div className="official-reference-heading">
            <div>
              <span className="panel-kicker">Official reference</span>
              <strong>{selected.name}</strong>
            </div>
            <span>#{String(selected.speciesNumber).padStart(4, '0')}</span>
          </div>
          <div className="official-type-row"><TypeBadge type={selected.primaryType} /><TypeBadge type={selected.secondaryType} /></div>
          <p>{selected.category || `Generation ${selected.generation ?? '—'} species`}</p>
          <p className="read-only-note">Locked reference. Selecting a species never copies or edits official data.</p>
        </section>
      )}
    </aside>
  )
}
