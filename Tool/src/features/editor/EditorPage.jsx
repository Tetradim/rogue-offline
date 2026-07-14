import { useEffect, useState } from 'react'
import { addBlankStage } from '../../../shared/project-schema.js'
import { AssetsTab } from './AssetsTab.jsx'
import { BuildTab } from './BuildTab.jsx'
import { EncountersTab } from './EncountersTab.jsx'
import { EvolutionStageStrip } from './EvolutionStageStrip.jsx'
import { EvolutionTab } from './EvolutionTab.jsx'
import { OfficialPokedex } from './OfficialPokedex.jsx'
import { ReviewTab } from './ReviewTab.jsx'

const TABS = [
  ['build', 'Build'],
  ['evolution', 'Evolution'],
  ['assets', 'Assets'],
  ['encounters', 'Encounters'],
  ['review', 'Review'],
]

function saveLabel(saveState) {
  if (saveState === 'saving') return 'Saving…'
  if (saveState === 'pending') return 'Changes pending'
  if (saveState === 'error') return 'Save failed'
  return 'Autosaved'
}

export function EditorPage({
  api,
  project,
  projectDir,
  saveState,
  saveError,
  pokemon,
  pokemonLoading = false,
  pokemonError = null,
  onChange,
  onServerSaved,
  onClose,
}) {
  const [activeStageId, setActiveStageId] = useState(project.stages[0].stageId)
  const [official, setOfficial] = useState(null)
  const [activeTab, setActiveTab] = useState('build')
  const [operationError, setOperationError] = useState('')
  const [stageBusy, setStageBusy] = useState(false)

  useEffect(() => {
    if (!project.stages.some(stage => stage.stageId === activeStageId)) setActiveStageId(project.stages[0].stageId)
  }, [project.stages, activeStageId])

  const activeStage = project.stages.find(stage => stage.stageId === activeStageId) || project.stages[0]
  const canonicalReady = saveState === 'saved'

  function addStage() {
    const next = addBlankStage(project)
    setActiveStageId(next.stages.at(-1).stageId)
    onChange(next)
  }

  async function deleteStage(stageId) {
    if (!canonicalReady || stageBusy) return
    const index = project.stages.findIndex(stage => stage.stageId === stageId)
    setStageBusy(true)
    setOperationError('')
    try {
      const payload = await api.removeStage(projectDir, project, stageId)
      const nextStages = payload.project.stages
      if (stageId === activeStageId) setActiveStageId(nextStages[Math.min(index, nextStages.length - 1)].stageId)
      onServerSaved(payload)
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStageBusy(false)
    }
  }

  let panel
  if (activeTab === 'build') panel = <BuildTab project={project} stage={activeStage} onChange={onChange} />
  if (activeTab === 'evolution') panel = <EvolutionTab project={project} activeStage={activeStage} onChange={onChange} />
  if (activeTab === 'assets') panel = <AssetsTab api={api} project={project} projectDir={projectDir} stage={activeStage} saveState={saveState} onServerSaved={onServerSaved} />
  if (activeTab === 'encounters') panel = <EncountersTab project={project} official={official} onChange={onChange} />
  if (activeTab === 'review') panel = <ReviewTab api={api} project={project} projectDir={projectDir} saveState={saveState} onChange={onChange} />

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="brand-mini" aria-hidden="true"><span /></div>
        <div className="studio-brand"><strong>PokéRogue Mod Studio</strong><span>Local evolution-line editor</span></div>
        <span className="project-pill" title={projectDir}>{project.name}</span>
        <span className={`save-state ${saveState}`} role="status" title={saveError || ''}><span className="save-dot" aria-hidden="true" />{saveLabel(saveState)}</span>
        <button type="button" className="button button-ghost project-back" onClick={onClose}>Projects</button>
      </header>
      {saveState === 'error' && saveError && <div className="save-error" role="alert">Autosave failed: {saveError}</div>}
      {operationError && <div className="save-error" role="alert">Project operation failed: {operationError}</div>}
      <div className="studio-workspace">
        <OfficialPokedex pokemon={pokemon} loading={pokemonLoading} error={pokemonError} selected={official} onSelect={setOfficial} />
        <main className="editor-panel">
          <EvolutionStageStrip
            stages={project.stages}
            activeStageId={activeStage.stageId}
            onSelect={setActiveStageId}
            onAdd={addStage}
            onRemove={deleteStage}
            removeDisabled={!canonicalReady || stageBusy}
          />
          <div className="editor-tabs" role="tablist" aria-label="Project editor sections">
            {TABS.map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}
          </div>
          <section className="editor-canvas" role="tabpanel">{panel}</section>
        </main>
      </div>
    </div>
  )
}
