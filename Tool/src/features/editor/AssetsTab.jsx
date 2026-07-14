import { useState } from 'react'
import { ASSET_KINDS } from '../../../shared/project-authoring.js'

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.'))
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
    reader.readAsDataURL(file)
  })
}

export function AssetsTab({ api, project, projectDir, stage, saveState, onServerSaved }) {
  const [kind, setKind] = useState('sprite')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canonicalReady = saveState === 'saved'

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canonicalReady) return
    setBusy(true)
    setError('')
    try {
      const dataBase64 = await readFileBase64(file)
      const payload = await api.uploadAsset(projectDir, project, stage.stageId, kind, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataBase64,
      })
      onServerSaved(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(asset) {
    if (!canonicalReady) return
    setBusy(true)
    setError('')
    try {
      const payload = await api.removeAsset(projectDir, project, stage.stageId, asset.assetId, asset.relativePath)
      onServerSaved(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workflow-sheet">
      <div className="workflow-heading"><div><span className="panel-kicker">Portable project assets</span><h1>Sprites, icons, cries, and variants</h1></div><p>Each stage may assign one file per asset role. Files and project metadata commit together.</p></div>
      <section className="editor-card asset-importer">
        <label>Asset role<select value={kind} onChange={event => setKind(event.target.value)}>{ASSET_KINDS.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
        <label className="file-picker">Choose file<input aria-label="Upload asset file" type="file" disabled={busy || !canonicalReady} accept={kind === 'cry' ? '.ogg,.wav,.mp3,.m4a,audio/*' : kind === 'variant' ? '.json,application/json' : 'image/png,image/webp'} onChange={upload} /></label>
        <div className="asset-guidance"><strong>{kind}</strong><span>{kind === 'cry' ? 'OGG, WAV, M4A, or MP3' : kind === 'variant' ? 'PokéRogue variant metadata JSON' : 'Transparent PNG or WebP recommended'}</span></div>
      </section>
      {!canonicalReady && <p className="warning-copy">Wait for autosave to finish before changing project files.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="asset-grid">
        {(stage.assets || []).map(asset => (
          <article className="asset-card" key={asset.assetId}>
            <div className={`asset-kind ${asset.kind}`}>{asset.kind.slice(0, 2).toUpperCase()}</div>
            <div><strong>{asset.fileName || asset.relativePath}</strong><span>{asset.mimeType} · {Math.max(1, Math.round((asset.size || 0) / 1024))} KB</span><code>{asset.relativePath}</code></div>
            <button type="button" className="button button-danger subtle" disabled={busy || !canonicalReady} onClick={() => remove(asset)}>Remove</button>
          </article>
        ))}
        {!stage.assets?.length && <div className="editor-empty-state"><h2>No uploaded assets</h2><p>Upload a validated project-owned asset. Donor selection is not supported.</p></div>}
      </div>
    </div>
  )
}
