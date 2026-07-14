import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { addBlankStage, createBlankProject } from '../../../shared/project-schema.js'
import { EditorPage } from './EditorPage.jsx'

function renderEditor(overrides = {}) {
  const project = overrides.project || createBlankProject({ name: 'Emberline' })
  const onChange = vi.fn()
  render(
    <EditorPage
      project={project}
      projectDir="C:\\Mods\\Emberline"
      saveState="saved"
      pokemon={[{
        speciesNumber: 4,
        name: 'Charmander',
        primaryType: 'FIRE',
        speciesId: 'charmander',
        category: 'Lizard Pokémon',
      }]}
      onChange={onChange}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
  return { project, onChange }
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      stages: expect.arrayContaining([
        expect.objectContaining({ name: 'Custom Stage 2', source: 'custom' }),
      ]),
    }))
  })

  it('shows every approved editor tab without enabling unfinished workflows', async () => {
    const user = userEvent.setup()
    renderEditor()

    for (const name of ['Build', 'Evolution', 'Assets', 'Encounters', 'Review']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('tab', { name: 'Encounters' }))
    expect(screen.getByText(/keep, suppress, or replace/i)).toBeInTheDocument()
  })

  it('preserves the selected stage when a different stage is removed', async () => {
    const user = userEvent.setup()
    let project = createBlankProject({ name: 'Emberline' })
    project = addBlankStage(project)
    project = addBlankStage(project)
    const { onChange } = renderEditor({ project })

    const thirdStage = screen.getByRole('button', { name: /custom stage 3/i })
    await user.click(thirdStage)
    expect(thirdStage).toHaveAttribute('aria-current', 'step')
    await user.click(screen.getByRole('button', { name: /remove custom stage 1/i }))

    expect(thirdStage).toHaveAttribute('aria-current', 'step')
    expect(onChange.mock.calls.at(-1)[0].stages).toHaveLength(2)
  })

  it('surfaces autosave failures in the editor', () => {
    renderEditor({ saveState: 'error', saveError: 'Project revision is stale.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Project revision is stale.')
  })
})
