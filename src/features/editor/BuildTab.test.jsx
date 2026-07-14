import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBlankProject } from '../../../shared/project-schema.js'
import { BuildTab } from './BuildTab.jsx'

describe('BuildTab', () => {
  it('keeps the Attack slider and exact input synchronized and updates BST', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const onChange = vi.fn()
    const { rerender } = render(<BuildTab project={project} stage={project.stages[0]} onChange={onChange} />)

    const exact = screen.getByLabelText('Attack exact value')
    await user.clear(exact)
    await user.type(exact, '130')
    await user.tab()

    const next = onChange.mock.calls.at(-1)[0]
    rerender(<BuildTab project={next} stage={next.stages[0]} onChange={onChange} />)
    expect(screen.getByLabelText('Attack slider')).toHaveValue('130')
    expect(screen.getByLabelText('Attack exact value')).toHaveValue(130)
    expect(screen.getByText('BST 135')).toBeInTheDocument()
  })

  it('edits blank-stage identity without changing its immutable stage ID', () => {
    const project = createBlankProject({ name: 'Emberline' })
    const originalId = project.stages[0].stageId
    const onChange = vi.fn()
    render(<BuildTab project={project} stage={project.stages[0]} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Species name'), { target: { value: 'Embercub' } })
    const next = onChange.mock.calls.at(-1)[0]
    expect(next.stages[0]).toMatchObject({ stageId: originalId, name: 'Embercub', slug: 'embercub' })
  })

  it('prevents duplicate primary and secondary types', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const onChange = vi.fn()
    render(<BuildTab project={project} stage={project.stages[0]} onChange={onChange} />)

    const secondary = screen.getByLabelText('Secondary type')
    expect(secondary.querySelector('option[value="NORMAL"]')).toBeDisabled()
    await user.selectOptions(secondary, 'FIRE')
    const withSecondary = onChange.mock.calls.at(-1)[0]
    expect(withSecondary.stages[0].types).toEqual(['NORMAL', 'FIRE'])
  })

  it('clamps invalid exact stats to the supported range', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const onChange = vi.fn()
    render(<BuildTab project={project} stage={project.stages[0]} onChange={onChange} />)

    const hp = screen.getByLabelText('HP exact value')
    await user.clear(hp)
    await user.type(hp, '999')
    await user.tab()

    expect(onChange.mock.calls.at(-1)[0].stages[0].baseStats.hp).toBe(255)
  })
})
