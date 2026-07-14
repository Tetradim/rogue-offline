export function EvolutionStageStrip({
  stages,
  activeStageId,
  onSelect,
  onAdd,
  onRemove,
  removeDisabled = false,
}) {
  return (
    <nav className="stage-strip" aria-label="Evolution stages">
      <span className="stage-strip-label">Evolution line</span>
      <div className="stage-chip-list">
        {stages.map((stage, index) => {
          const active = stage.stageId === activeStageId
          return (
            <div key={stage.stageId} className={active ? 'stage-chip active' : 'stage-chip'}>
              <button type="button" className="stage-select" aria-current={active ? 'step' : undefined} onClick={() => onSelect(stage.stageId)}>
                <span className="stage-order">{index + 1}</span>
                <span>{stage.name}</span>
              </button>
              {stages.length > 1 && (
                <button
                  type="button"
                  className="stage-remove"
                  aria-label={`Remove ${stage.name}`}
                  disabled={removeDisabled}
                  title={removeDisabled ? 'Wait for autosave before removing a stage.' : ''}
                  onClick={() => onRemove(stage.stageId)}
                >×</button>
              )}
            </div>
          )
        })}
        <button type="button" className="stage-add" onClick={onAdd}><span aria-hidden="true">＋</span> Add Stage</button>
      </div>
    </nav>
  )
}
