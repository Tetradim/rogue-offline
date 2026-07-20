import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { addStageForm } from '../../../shared/project-authoring.js'
import { addBlankStage, createBlankProject } from '../../../shared/project-schema.js'
import { BuildTab } from './BuildTab.jsx'
import { EncountersTab } from './EncountersTab.jsx'
import { EvolutionTab } from './EvolutionTab.jsx'

function expectLinkedOption(input, expectedValue) {
  const listId = input.getAttribute('list')
  expect(listId).toBeTruthy()
  const datalist = document.getElementById(listId)
  expect(datalist).toBeInTheDocument()
  expect(Array.from(datalist.options).map(option => option.value)).toContain(expectedValue)
}

describe('enum-backed editor dropdowns', () => {
  it('links ability, passive, move, form, and item fields to populated option catalogs', () => {
    let project = createBlankProject({ name: 'Emberline' })
    project = addStageForm(project, project.stages[0].stageId, { name: 'Mega' })
    const stage = project.stages[0]

    render(<BuildTab project={project} stage={stage} onChange={vi.fn()} />)

    expectLinkedOption(screen.getByLabelText('Primary ability'), 'BLAZE')
    expectLinkedOption(screen.getByLabelText('Passive'), 'SOLAR_POWER')
    expectLinkedOption(screen.getByLabelText('Level-up move ID'), 'EMBER')
    expectLinkedOption(screen.getByLabelText('TM pool move ID'), 'THUNDERBOLT')
    expectLinkedOption(screen.getByLabelText('Egg moves move ID'), 'ANCIENT_POWER')
    expectLinkedOption(screen.getByLabelText('Mega form key'), 'mega')
    expectLinkedOption(screen.getByLabelText('Mega primary ability'), 'BLAZE')
    expectLinkedOption(screen.getByLabelText('Mega change item'), 'FIRE_STONE')
  })

  it('changes the evolution requirement control to the matching enum catalog', async () => {
    const user = userEvent.setup()
    const project = addBlankStage(createBlankProject({ name: 'Emberline' }))

    render(<EvolutionTab project={project} activeStage={project.stages[0]} onChange={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Requirement'), 'item')
    expectLinkedOption(screen.getByLabelText('Requirement value'), 'FIRE_STONE')

    await user.selectOptions(screen.getByLabelText('Requirement'), 'move')
    expectLinkedOption(screen.getByLabelText('Requirement value'), 'ANCIENT_POWER')

    await user.selectOptions(screen.getByLabelText('Requirement'), 'time')
    expectLinkedOption(screen.getByLabelText('Requirement value'), 'DAY')
  })

  it('links encounter biome authoring to the biome catalog', () => {
    const project = createBlankProject({ name: 'Emberline' })

    render(<EncountersTab project={project} official={null} onChange={vi.fn()} />)

    expectLinkedOption(screen.getByLabelText('Biome ID'), 'FOREST')
  })
})
