import { useId, useMemo } from 'react'

function normalizeOptions(options) {
  return [...new Set((options || []).filter(value => typeof value === 'string' && value.length))]
}

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function EnumInput({
  options,
  metadata = {},
  listId,
  value,
  'aria-describedby': describedBy,
  title,
  ...inputProps
}) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const resolvedListId = listId || `enum-options-${generatedId}`
  const descriptionId = `${resolvedListId}-description`
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options])
  const selectedMetadata = metadata[normalizeToken(value)] || null
  const resolvedDescribedBy = [describedBy, selectedMetadata ? descriptionId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="enum-input">
      <input
        {...inputProps}
        value={value}
        list={resolvedListId}
        autoComplete="off"
        aria-describedby={resolvedDescribedBy}
        title={title || selectedMetadata?.description}
      />
      <datalist id={resolvedListId}>
        {normalizedOptions.map(option => {
          const details = metadata[option]
          const label = details ? `${details.name} — ${details.description}` : undefined
          return <option key={option} value={option} label={label} />
        })}
      </datalist>
      {selectedMetadata && (
        <div className="enum-description" id={descriptionId} data-enum-description={normalizeToken(value)} aria-live="polite">
          <strong>{selectedMetadata.name}</strong>
          <span>{selectedMetadata.description}</span>
        </div>
      )}
    </div>
  )
}
