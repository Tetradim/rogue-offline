import { useId, useMemo } from 'react'

function normalizeOptions(options) {
  return [...new Set((options || []).filter(value => typeof value === 'string' && value.length))]
}

export function EnumInput({ options, listId, ...inputProps }) {
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const resolvedListId = listId || `enum-options-${generatedId}`
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options])

  return (
    <>
      <input {...inputProps} list={resolvedListId} autoComplete="off" />
      <datalist id={resolvedListId}>
        {normalizedOptions.map(option => <option key={option} value={option} />)}
      </datalist>
    </>
  )
}
