import { useMemo, useState } from 'react'
import { upsertTargetBinding } from '../../../shared/project-authoring.js'
import { buildDeliveryManifest, reviewProject } from '../../../shared/project-review.js'

export function ReviewTab({ api, project, projectDir, onChange }) {
  const report = useMemo(() => reviewProject(project), [project])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const activeBinding = project.targetBindings?.at(-1) || null

  async function bindTarget() {
    setBusy('binding')
    setError('')
    try {
      const targetDir = await api.chooseFolder('Choose a local PokéRogue source checkout')
      if (!targetDir) return
      const analysis = await api.analyzeTarget(targetDir, project)
      const binding = {
        targetId: analysis.targetId,
        targetDir: analysis.targetDir,
        adapter: analysis.adapter,
        fingerprint: analysis.fingerprint,
        version: analysis.version,
        layout: analysis.layout,
        capabilities: analysis.capabilities,
        warnings: analysis.warnings,
        stageAllocations: analysis.stageAllocations,
      }
      onChange(upsertTargetBinding(project, binding))
      setResult({ title: 'Target analyzed', output: analysis.summary || `Detected ${analysis.adapter}` })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }

  async function run(action) {
    if (!activeBinding) return
    setBusy(action)
    setError('')
    try {
      let response
      if (action === 'plan') response = await api.planDelivery(projectDir, activeBinding.targetDir)
      if (action === 'install') response = await api.applyDelivery(projectDir, activeBinding.targetDir, false)
      if (action === 'update') response = await api.applyDelivery(projectDir, activeBinding.targetDir, true)
      if (action === 'uninstall') response = await api.uninstallDelivery(activeBinding.targetDir, project.slug)
      if (action === 'package') {
        const outputDir = await api.chooseFolder('Choose a folder for the portable mod package')
        if (!outputDir) return
        response = await api.packageProject(projectDir, outputDir, activeBinding.targetId)
      }
      setResult({ title: response?.title || action, output: response?.output || response?.packagePath || JSON.stringify(response, null, 2) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }

  const preview = buildDeliveryManifest(project, activeBinding)
  return (
    <div className="workflow-sheet review-sheet">
      <div className="workflow-heading"><div><span className="panel-kicker">Validation and delivery</span><h1>Review project</h1></div><div className={`readiness-badge ${report.ready ? 'ready' : 'blocked'}`}>{report.ready ? 'Authoring ready' : `${report.counts.error} blocking issue${report.counts.error === 1 ? '' : 's'}`}</div></div>
      <div className="review-grid">
        <section className="editor-card issue-panel">
          <div className="card-heading"><h2>Project checks</h2><span>{report.counts.error} errors · {report.counts.warning} warnings</span></div>
          <div className="issue-list">
            {report.issues.map((item, index) => <article className={`review-issue ${item.severity}`} key={`${item.path}-${item.code}-${index}`}><b>{item.severity}</b><div><strong>{item.message}</strong><code>{item.path}</code></div></article>)}
            {!report.issues.length && <div className="review-success"><strong>No project issues found</strong><span>The project model is internally consistent.</span></div>}
          </div>
        </section>
        <section className="editor-card target-panel">
          <div className="card-heading"><h2>PokéRogue target</h2><span className="card-accent blue">Auto-detect</span></div>
          {activeBinding ? <div className="target-summary"><strong>{activeBinding.version || activeBinding.adapter}</strong><code>{activeBinding.targetDir}</code><div className="capability-row">{Object.entries(activeBinding.capabilities || {}).map(([name, value]) => <span className={value ? 'yes' : 'no'} key={name}>{name}</span>)}</div>{activeBinding.warnings?.map(warning => <p className="warning-copy" key={warning}>{warning}</p>)}</div> : <p className="muted">Bind any local PokéRogue checkout. The companion inspects its source layout and refuses unfamiliar structures.</p>}
          <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={bindTarget}>{activeBinding ? 'Analyze another checkout' : 'Bind PokéRogue checkout'}</button>
        </section>
      </div>
      <section className="editor-card delivery-panel">
        <div className="card-heading"><div><h2>Transactional delivery</h2><span className="card-subtitle">Preflight, install, update, uninstall, or package</span></div><span className="count-pill">{project.stages.length} stages</span></div>
        <div className="delivery-actions">
          <button className="button button-secondary" disabled={!activeBinding || Boolean(busy)} onClick={() => run('plan')}>Preflight plan</button>
          <button className="button button-primary" disabled={!activeBinding || !report.ready || Boolean(busy)} onClick={() => run('install')}>Install</button>
          <button className="button button-secondary" disabled={!activeBinding || !report.ready || Boolean(busy)} onClick={() => run('update')}>Update</button>
          <button className="button button-danger" disabled={!activeBinding || Boolean(busy)} onClick={() => run('uninstall')}>Uninstall / rollback</button>
          <button className="button button-ghost" disabled={Boolean(busy)} onClick={() => run('package')}>Export package</button>
        </div>
        {busy && <p className="operation-status" role="status">Running {busy}…</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        {result && <div className="operation-result"><strong>{result.title}</strong><pre>{result.output}</pre></div>}
      </section>
      <details className="manifest-preview"><summary>Delivery manifest preview</summary><pre>{JSON.stringify(preview, null, 2)}</pre></details>
    </div>
  )
}
