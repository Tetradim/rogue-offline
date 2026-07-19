import { useMemo, useState } from 'react'
import { removeEvolutionEdge, upsertEvolutionEdge } from '../../../shared/project-authoring.js'
import { EVOLUTION_ITEM_OPTIONS, MOVE_OPTIONS } from '../../options.generated.js'
import { EnumInput } from './EnumInput.jsx'

const TIME_OF_DAY_OPTIONS = ['DAWN', 'DAY', 'DUSK', 'NIGHT']

function triggerSummary(edge) {
  const trigger = edge.trigger || {}
  if (trigger.type === 'level') return `Level ${trigger.level}`
  if (trigger.type === 'item') return `Use ${trigger.item || 'item'}`
  if (trigger.type === 'friendship') return `Friendship ${trigger.friendship}`
  if (trigger.type === 'time') return `${trigger.time || 'time'} evolution`
  if (trigger.type === 'move') return `Know ${trigger.move || 'move'}`
  return trigger.description || 'Custom requirement'
}

function defaultValue(type) {
  if (type === 'level') return '16'
  if (type === 'friendship') return '220'
  if (type === 'time') return 'DAY'
  return ''
}

function RequirementValue({ type, value, onChange }) {
  if (type === 'level') return <input aria-label="Requirement value" type="number" min="1" max="100" value={value} onChange={onChange} />
  if (type === 'friendship') return <input aria-label="Requirement value" type="number" min="1" max="255" value={value} onChange={onChange} />
  if (type === 'item') return <EnumInput aria-label="Requirement value" value={value} options={EVOLUTION_ITEM_OPTIONS} placeholder="FIRE_STONE" onChange={onChange} />
  if (type === 'move') return <EnumInput aria-label="Requirement value" value={value} options={MOVE_OPTIONS} placeholder="ANCIENT_POWER" onChange={onChange} />
  if (type === 'time') return <EnumInput aria-label="Requirement value" value={value} options={TIME_OF_DAY_OPTIONS} placeholder="DAY" onChange={onChange} />
  return <input aria-label="Requirement value" value={value} placeholder="Describe the custom requirement" onChange={onChange} />
}

export function EvolutionTab({ project, activeStage, onChange }) {
  const otherStages = useMemo(() => project.stages.filter(stage => stage.stageId !== activeStage.stageId), [project.stages, activeStage.stageId])
  const [to, setTo] = useState(otherStages[0]?.stageId || '')
  const [type, setType] = useState('level')
  const [value, setValue] = useState('16')

  function changeType(nextType) {
    setType(nextType)
    setValue(defaultValue(nextType))
  }

  function addEdge(event) {
    event.preventDefault()
    if (!to) return
    const trigger = { type }
    if (type === 'level') trigger.level = value
    else if (type === 'item') trigger.item = value
    else if (type === 'friendship') trigger.friendship = value
    else if (type === 'time') trigger.time = value
    else if (type === 'move') trigger.move = value
    else trigger.description = value
    onChange(upsertEvolutionEdge(project, { from: activeStage.stageId, to, trigger }))
  }

  const stageById = new Map(project.stages.map(stage => [stage.stageId, stage]))
  return (
    <div className="workflow-sheet">
      <div className="workflow-heading"><div><span className="panel-kicker">Evolution graph</span><h1>Branches and requirements</h1></div><p>Every edge is explicit, portable, and validated for cycles before delivery.</p></div>
      <section className="editor-card">
        <div className="card-heading"><h2>Add evolution from {activeStage.name}</h2><span className="card-accent purple">Graph</span></div>
        <form className="evolution-form" onSubmit={addEdge}>
          <label>Target stage<select value={to} onChange={event => setTo(event.target.value)}><option value="">Choose stage</option>{otherStages.map(stage => <option value={stage.stageId} key={stage.stageId}>{stage.name}</option>)}</select></label>
          <label>Requirement<select value={type} onChange={event => changeType(event.target.value)}>{['level','item','friendship','time','move','custom'].map(option => <option value={option} key={option}>{option}</option>)}</select></label>
          <label>Requirement value<RequirementValue type={type} value={value} onChange={event => setValue(event.target.value)} /></label>
          <button className="button button-primary" disabled={!to || !String(value).trim()}>Add evolution</button>
        </form>
      </section>
      <div className="edge-list">
        {(project.evolutionEdges || []).map(edge => (
          <article className="edge-card" key={edge.edgeId}>
            <div className="edge-node"><span>From</span><strong>{stageById.get(edge.from)?.name || 'Missing stage'}</strong></div>
            <div className="edge-arrow"><span>{triggerSummary(edge)}</span><b>→</b></div>
            <div className="edge-node"><span>To</span><strong>{stageById.get(edge.to)?.name || 'Missing stage'}</strong></div>
            <button type="button" className="button button-danger subtle" onClick={() => onChange(removeEvolutionEdge(project, edge.edgeId))}>Remove</button>
          </article>
        ))}
        {!project.evolutionEdges?.length && <div className="editor-empty-state"><h2>No evolution requirements yet</h2><p>Add another stage, then connect it from the active stage. Branches are supported.</p></div>}
      </div>
    </div>
  )
}
