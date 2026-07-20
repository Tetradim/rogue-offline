import { useEffect, useId, useMemo, useRef, useState } from 'react'

const MAX_VISIBLE_OPTIONS = 80

function normalizeOptions(options) {
  return [...new Set((options || []).filter(value => typeof value === 'string' && value.length))]
}

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function optionRank(option, details, query) {
  if (!query) return 0
  const id = option.toLowerCase()
  const name = String(details?.name || '').toLowerCase()
  const description = String(details?.description || '').toLowerCase()
  if (id === query || name === query) return 0
  if (id.startsWith(query) || name.startsWith(query)) return 1
  if (id.includes(query) || name.includes(query)) return 2
  if (description.includes(query)) return 3
  return Number.POSITIVE_INFINITY
}

export function EnumInput({
  options,
  metadata = {},
  listId,
  value,
  'aria-describedby': describedBy,
  title,
  onChange,
  onFocus,
  onBlur,
  onClick,
  onKeyDown,
  ...inputProps
}) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const resolvedListId = listId || `enum-options-${generatedId}`
  const descriptionId = `${resolvedListId}-description`
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options])
  const selectedMetadata = metadata[normalizeToken(value)] || null
  const resolvedDescribedBy = [describedBy, selectedMetadata ? descriptionId : null].filter(Boolean).join(' ') || undefined
  const query = String(value || '').trim().toLowerCase()

  const matchingOptions = useMemo(() => normalizedOptions
    .map((option, index) => ({ option, index, rank: optionRank(option, metadata[option], query) }))
    .filter(entry => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index), [metadata, normalizedOptions, query])

  const visibleOptions = matchingOptions.slice(0, MAX_VISIBLE_OPTIONS)

  useEffect(() => {
    setActiveIndex(visibleOptions.length ? 0 : -1)
  }, [query, visibleOptions.length])

  function emitValue(nextValue) {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    })
  }

  function selectOption(option) {
    emitValue(option)
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(event) {
    onKeyDown?.(event)
    if (event.defaultPrevented || inputProps.disabled) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(index => Math.min(Math.max(index, -1) + 1, visibleOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(index => index <= 0 ? Math.max(visibleOptions.length - 1, 0) : index - 1)
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(Math.max(visibleOptions.length - 1, 0))
    } else if (event.key === 'Enter' && open && activeIndex >= 0 && visibleOptions[activeIndex]) {
      event.preventDefault()
      selectOption(visibleOptions[activeIndex].option)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="enum-input">
      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={resolvedListId}
        aria-activedescendant={open && activeIndex >= 0 ? `${resolvedListId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        aria-describedby={resolvedDescribedBy}
        title={title || selectedMetadata?.description}
        onChange={event => {
          emitValue(event.target.value)
          setOpen(true)
          setActiveIndex(0)
        }}
        onFocus={event => {
          onFocus?.(event)
          if (!event.defaultPrevented && !inputProps.disabled) setOpen(true)
        }}
        onClick={event => {
          onClick?.(event)
          if (!event.defaultPrevented && !inputProps.disabled) setOpen(true)
        }}
        onBlur={event => {
          onBlur?.(event)
          setOpen(false)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="enum-options" id={resolvedListId} role="listbox">
          {visibleOptions.map(({ option }, index) => {
            const details = metadata[option]
            const selected = normalizeToken(value) === normalizeToken(option)
            return (
              <div
                className={`enum-option${index === activeIndex ? ' active' : ''}`}
                id={`${resolvedListId}-option-${index}`}
                key={option}
                role="option"
                aria-selected={selected}
                data-enum-value={option}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <div className="enum-option-heading">
                  <code>{option}</code>
                  {details?.name && <strong>{details.name}</strong>}
                </div>
                {details?.description && <span className="enum-option-description">{details.description}</span>}
              </div>
            )
          })}
          {!visibleOptions.length && <div className="enum-options-empty">No matching known values. You can still enter a custom enum ID.</div>}
          {matchingOptions.length > visibleOptions.length && (
            <div className="enum-options-more">Showing the first {MAX_VISIBLE_OPTIONS} matches. Keep typing to narrow the list.</div>
          )}
        </div>
      )}
      {selectedMetadata && (
        <div className="enum-description" id={descriptionId} data-enum-description={normalizeToken(value)} aria-live="polite">
          <strong>{selectedMetadata.name}</strong>
          <span>{selectedMetadata.description}</span>
        </div>
      )}
    </div>
  )
}
