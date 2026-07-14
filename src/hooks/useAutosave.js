import { useEffect, useRef } from 'react'

export function useAutosave({
  dirty,
  projectDir,
  project,
  save,
  onSaving,
  onSaved,
  onError,
  delay = 350,
}) {
  const sequence = useRef(0)
  const callbacks = useRef({ save, onSaving, onSaved, onError })
  callbacks.current = { save, onSaving, onSaved, onError }

  useEffect(() => {
    const current = ++sequence.current
    if (!dirty || !projectDir || !project) return undefined

    const timer = setTimeout(async () => {
      try {
        callbacks.current.onSaving?.()
        const payload = await callbacks.current.save(projectDir, project)
        if (current === sequence.current) callbacks.current.onSaved?.(payload)
      } catch (error) {
        if (current === sequence.current) callbacks.current.onError?.(error)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [dirty, projectDir, project, delay])
}
