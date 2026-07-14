import { useEffect, useState } from 'react'
import { addBlankStage, removeStage } from '../../../shared/project-schema.js'
import { BuildTab } from './BuildTab.jsx'
import { EvolutionStageStrip } from './EvolutionStageStrip.jsx'
import { OfficialPokedex } from './OfficialPokedex.jsx'

const TABS = [
  ['build', 'Build'],
  ['evolution', 'Evolution'],
  ['assets', 'Assets'],
  ['encounters', 'Encounters'],
  ['review', 'Review'],
]

const TAB_DESCRIPTIONS = {
  evolution: ['Evolution graph', 'Branch and requirement authoring arrives in the Authoring Depth phase.'],
  assets: ['Assets', 'Sprite, icon, and cry importing arrives with target-aware asset validation.'],
  encounters: ['Encounters', 'Custom placement and official Keep, Suppress, or Replace policies arrive in the next phase.'],
  review: ['Review', 'Validation summaries, target plans, export, install, and rollback arrive in later phases.'],
}

function saveLabel(saveState) {
  if (saveState === 'saving') return 'Saving…'
  if (saveState === 'pending') return 'Changes pending'
  if (saveState === 'error') return 'Save failed'
  return 'Autosaved'
}

export function EditorPage({
  project,
  projectDir,
  saveState,
  saveError,
  pokemon,
  pokemonLoading = false,
  pokemonError = null,
  onChange,
  onClose,
}) {
  const [activeStageId, setActiveStageId] = useState(project.stages[0].stageId)
  const [official, setOfficial] = useState(null)
  const [activeTab, setActiveTab] = useState('build')

  useEffect(() => {
    if (!project.stages.some(stage => stage.stageId === activeStageId)) {
      setActiveStageId(project.stages[0].stageId)
    }
  }, [project.stages, activeStageId])

  const activeStage = project.stages.find(stage => stage.stageId === activeStageId) || project.stages[0]

  function addStage() {
    const next = addBlankStage(project)
    setActiveStageId(next.stages.at(-1).stageId)
    onChange(next)
  }

  function deleteStage(stageId) {
    const index = project.stages.findIndex(stage => stage.stageId === stageId)
    const next = removeStage(project, stageId)
    if (next === project) return
    const fallback = next.stages[Math.min(index, next.stages.length - 1)]
    setActiveStageId(fallback.stageId)
    onChange(next)
  }

  const placeholder = TAB_DESCRIPTIONS[activeTab]

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="brand-mini" aria-hidden="true"><span /></div>
        <div className="studio-brand"><strong>PokéRogue Mod Studio</strong><span>Local evolution-line editor</span></div>
        <span className="project-pill" title={projectDir}>{project.name}</span>
        <span className={`save-state ${saveState}`} role="status" title={saveError || ''}>
          <span className="save-dot" aria-hidden="true" />{saveLabel(saveState)}
        </span>
        <button type="button" className="button button-ghost project-back" onClick={onClose}>Projects</button>
      </header>
      {saveState === 'error' && saveError && <div className="save-error" role="alert">Autosave failed: {saveError}</div>}
      <div className="studio-workspace">
        <OfficialPokedex
          pokemon={pokemon}
          loading={pokemonLoading}
          error={pokemonError}
          selected={official}
          onSelect={setOfficial}
        />
        <main className="editor-panel">
          <EvolutionStageStrip
            stages={project.stages}
            activeStageId={activeStage.stageId}
            onSelect={setActiveStageId}
            onAdd={addStage}
            onRemove={deleteStage}
          />
          <div className="editor-tabs" role="tablist" aria-label="Project editor sections">
            {TABS.map(([id, label]) => (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                className={activeTab === id ? 'active' : ''}
                onClick={() => setActiveTab(id)}
              >{label}</button>
            ))}
          </div>
          <section className="editor-canvas" role="tabpanel">
            {activeTab === 'build' ? (
              <BuildTab project={project} stage={activeStage} onChange={onChange} />
            ) : (
              <div className="editor-empty-state future-panel">
                <span className="panel-kicker">Planned workflow</span>
                <h1>{placeholder[0]}</h1>
                <p>{placeholder[1]}</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
