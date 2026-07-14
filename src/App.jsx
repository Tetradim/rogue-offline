import { useCallback, useReducer } from 'react'
import { studioApi } from './api/client.js'
import { EditorPage } from './features/editor/EditorPage.jsx'
import { DashboardPage } from './features/projects/DashboardPage.jsx'
import { useAutosave } from './hooks/useAutosave.js'
import { usePokemonData } from './hooks/usePokemonData.js'
import { initialProjectState, projectReducer } from './state/projectReducer.js'

export default function App() {
  const [session, dispatch] = useReducer(projectReducer, initialProjectState)
  const pokemonState = usePokemonData()
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
    <EditorPage
      project={session.project}
      projectDir={session.projectDir}
      saveState={session.saveState}
      saveError={session.error}
      pokemon={pokemonState.pokemon}
      pokemonLoading={pokemonState.loading}
      pokemonError={pokemonState.error}
      onChange={project => dispatch({ type: 'draft-changed', project })}
      onClose={() => dispatch({ type: 'closed' })}
    />
  )
}
