import { useState } from 'react'

export function DashboardPage({ api, onOpen }) {
  const [mode, setMode] = useState(null)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [busyAction, setBusyAction] = useState(null)
  const [error, setError] = useState('')
  const busy = busyAction !== null

  async function run(actionName, action) {
    if (busy) return
    setBusyAction(actionName)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyAction(null)
    }
  }

  function beginCreate() {
    setMode('create')
    setError('')
  }

  function cancelCreate() {
    setMode(null)
    setName('')
    setFolder('')
    setError('')
  }

  function chooseParentFolder() {
    return run('choose-parent', async () => {
      const selected = await api.chooseFolder('Choose project parent folder')
      if (selected) setFolder(selected)
    })
  }

  function openProject() {
    return run('open-project', async () => {
      const projectDir = await api.chooseFolder('Choose a PokéRogue Mod Studio project folder')
      if (!projectDir) return
      onOpen(await api.openProject(projectDir))
    })
  }

  function createProject(event) {
    event.preventDefault()
    const projectName = name.trim()
    if (!projectName || !folder) return
    return run('create-project', async () => {
      onOpen(await api.createProject(folder, projectName))
    })
  }

  const choosingParent = busyAction === 'choose-parent'
  const openingProject = busyAction === 'open-project'
  const creatingProject = busyAction === 'create-project'

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="brand-lockup">
          <div className="brand-orb" aria-hidden="true"><span /></div>
          <div>
            <p className="eyebrow">Windows local creation studio</p>
            <h1 id="dashboard-title">PokéRogue Mod Studio</h1>
          </div>
        </div>
        <p className="hero-copy">
          Create a portable custom evolution line, use the official Pokédex as a read-only reference,
          and keep every edit in a project folder you control.
        </p>
        <div className="dashboard-actions">
          <button type="button" className="button button-primary" onClick={beginCreate} disabled={busy}>
            <span aria-hidden="true">＋</span> New Evolution Line
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={openProject}
            disabled={busy}
            aria-busy={openingProject}
          >
            {openingProject ? 'Waiting for Windows folder picker…' : 'Open Project Folder'}
          </button>
        </div>
        <div className="dashboard-capabilities" aria-label="Current capabilities">
          <article><strong>Portable projects</strong><span>Project JSON, assets, and autosave history stay together.</span></article>
          <article><strong>Blank custom stages</strong><span>Start neutral; official species are never cloned into your work.</span></article>
          <article><strong>Local companion</strong><span>Filesystem operations remain on loopback and inside chosen folders.</span></article>
        </div>
      </section>

      {mode === 'create' && (
        <div className="dialog-backdrop" role="presentation">
          <form className="dialog-card" onSubmit={createProject} aria-labelledby="create-project-title" aria-busy={busy}>
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">Portable project</p>
                <h2 id="create-project-title">Create blank evolution line</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close create project dialog" onClick={cancelCreate} disabled={busy}>×</button>
            </div>
            <label>
              <span>Project name</span>
              <input value={name} onChange={event => setName(event.target.value)} autoFocus required maxLength={80} placeholder="Emberline" />
            </label>
            <label>
              <span>Parent folder</span>
              <div className="folder-row">
                <input value={folder} readOnly placeholder="Choose where the project folder will be created" />
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={chooseParentFolder}
                  disabled={busy}
                  aria-busy={choosingParent}
                >
                  {choosingParent ? 'Waiting for Windows folder picker…' : 'Choose Parent Folder'}
                </button>
              </div>
            </label>
            {choosingParent && (
              <p className="folder-picker-status" role="status">
                The Windows folder picker is open in front of this window. Choose a folder or select Cancel there.
              </p>
            )}
            {error && <p className="error-banner" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button button-ghost" onClick={cancelCreate} disabled={busy}>Cancel</button>
              <button className="button button-primary" disabled={busy || !name.trim() || !folder}>
                {creatingProject ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {mode !== 'create' && error && <p className="dashboard-error error-banner" role="alert">{error}</p>}
      <footer className="dashboard-footer">Local only · Windows · No accounts or telemetry</footer>
    </main>
  )
}
