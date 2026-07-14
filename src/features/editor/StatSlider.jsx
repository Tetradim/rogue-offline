import { useEffect, useId, useState } from 'react'

function clampStat(value) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 1
  return Math.min(255, Math.max(1, parsed))
}

export function StatSlider({ label, value, onChange }) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))

  useEffect(() => setDraft(String(value)), [value])

  function commitExact() {
    const committed = clampStat(draft)
    setDraft(String(committed))
    if (committed !== value) onChange(committed)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setDraft(String(value))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="stat-control">
      <label htmlFor={`${id}-range`}>{label}</label>
      <input
        id={`${id}-range`}
        aria-label={`${label} slider`}
        type="range"
        min="1"
        max="255"
        value={value}
        onChange={event => onChange(clampStat(event.target.value))}
      />
      <input
        aria-label={`${label} exact value`}
        type="number"
        inputMode="numeric"
        min="1"
        max="255"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commitExact}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
