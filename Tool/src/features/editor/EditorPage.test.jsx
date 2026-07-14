import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBlankProject } from '../../../shared/project-schema.js'
import { EditorPage } from './EditorPage.jsx'

function renderEditor(overrides = {}) {
  const project = overrides.project || createBlankProject({ name: 'Emberline' })
  const onChange = vi.fn()
  const api = {
    chooseFolder: vi.fn(), uploadAsset: vi.fn(), removeAsset: vi.fn(), analyzeTarget: vi.fn(),
    planDelivery: vi.fn(), applyDelivery: vi.fn(), uninstallDelivery: vi.fn(), packageProject: vi.fn(),
  }
  render(<EditorPage
    api={api}
    project={project}
    projectDir="C:\\Mods\\Emberline"
    saveState="saved"
    pokemon={[{ speciesNumber: 4, name: 'Charmander', primaryType: 'FIRE', speciesId: 'charmander', category: 'Lizard Pokémon' }]}
    onChange={onChange}
    onClose={vi.fn()}
    {...overrides}
  />)
  return { project, onChange, api }
}

describe('EditorPage', () => {
  it('keeps official Pokémon read-only and adds blank custom stages', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()
    await user.click(screen.getByRole('button', { name: /charmander/i }))
    expect(screen.getByText(/official reference/i)).toBeInTheDocument()
    expect(screen.getByText(/never copies or edits official data/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit official/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add stage/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stages: expect.arrayContaining([expect.objectContaining({ name: 'Custom Stage 2', source: 'custom' })]) }))
  })

  it('renders every authoring workflow instead of placeholders', async () => {
    const user = userEvent.setup()
    renderEditor()
    for (const name of ['Build', 'Evolution', 'Assets', 'Encounters', 'Review']) expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Evolution' }))
    expect(screen.getByRole('heading', { name: /branches and requirements/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Assets' }))
    expect(screen.getByRole('heading', { name: /sprites, icons, cries/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Encounters' }))
    expect(screen.getByRole('heading', { name: /encounter policy/i })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getByRole('heading', { name: /review project/i })).toBeInTheDocument()
  })

  it('surfaces autosave failures in the editor', () => {
    renderEditor({ saveState: 'error', saveError: 'Project revision is stale.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Project revision is stale.')
  })
})
