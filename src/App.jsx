import { useCallback, useReducer } from 'react'
import { studioApi } from './api/client.js'
import { DashboardPage } from './features/projects/DashboardPage.jsx'
import { useAutosave } from './hooks/useAutosave.js'
import { initialProjectState, projectReducer } from './state/projectReducer.js'

export default function App() {
  const [session, dispatch] = useReducer(projectReducer, initialProjectState)
  const save = useCallback((projectDir, project) => studioApi.saveProject(projectDir, project), [])
  const onSaving = useCallback(() => dispatch({ type: 'saving' }), [])
  const onSaved = useCallback(payload => dispatch({ type: 'saved', payload }), [])
  const onError = useCallback(error => dispatch({
    type: 'save-failed',
    error: error instanceof Error ? error.message : String(error),
  }), [])

  useAutosave({
    dirty: session.dirty,
    projectDir: session.projectDir,
    project: session.project,
    save,
    onSaving,
    onSaved,
    onError,
  })

  if (!session.project) {
    return <DashboardPage api={studioApi} onOpen={payload => dispatch({ type: 'opened', payload })} />
  }

  return (
    <main className="dashboard-shell">
      <section className="dialog-card">
        <p className="eyebrow">Portable project open</p>
        <h1>{session.project.name}</h1>
        <p>The project is open at {session.projectDir}.</p>
        <p className="muted">Editor modules are loading from the current implementation phase.</p>
        <button className="button button-secondary" onClick={() => dispatch({ type: 'closed' })}>
          Back to Projects
        </button>
      </section>
    </main>
  )
}
