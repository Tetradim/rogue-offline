import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { addStageForm } from '../../../shared/project-authoring.js'
import { addBlankStage, createBlankProject } from '../../../shared/project-schema.js'
import { ABILITY_METADATA, MOVE_METADATA } from '../../enum-metadata.generated.js'
import { BuildTab } from './BuildTab.jsx'
import { EncountersTab } from './EncountersTab.jsx'
import { EvolutionTab } from './EvolutionTab.jsx'

function inputByAriaLabel(label) {
  const input = document.querySelector(`input[aria-label="${label}"]`)
  expect(input).toBeInTheDocument()
  return input
}

function linkedDatalist(input) {
  const listId = input.getAttribute('list')
  expect(listId).toBeTruthy()
  const datalist = document.getElementById(listId)
  expect(datalist).toBeInTheDocument()
  return datalist
}

function expectLinkedOption(input, expectedValue) {
  const datalist = linkedDatalist(input)
  expect(Array.from(datalist.options).map(option => option.value)).toContain(expectedValue)
}

function expectDescribedOption(input, expectedValue, metadata) {
  const option = Array.from(linkedDatalist(input).options).find(candidate => candidate.value === expectedValue)
  expect(option).toBeDefined()
  expect(option.label).toContain(metadata[expectedValue].name)
  expect(option.label).toContain(metadata[expectedValue].description)
}

describe('enum-backed editor dropdowns', () => {
  it('links ability, passive, move, form, and item fields to populated option catalogs', () => {
    let project = createBlankProject({ name: 'Emberline' })
    project = addStageForm(project, project.stages[0].stageId, { name: 'Mega' })
    const stage = project.stages[0]

    render(<BuildTab project={project} stage={stage} onChange={vi.fn()} />)

    expectLinkedOption(inputByAriaLabel('Primary ability'), 'BLAZE')
    expectLinkedOption(inputByAriaLabel('Passive'), 'SOLAR_POWER')
    expectLinkedOption(inputByAriaLabel('Level-up move ID'), 'EMBER')
    expectLinkedOption(inputByAriaLabel('TM pool move ID'), 'THUNDERBOLT')
    expectLinkedOption(inputByAriaLabel('Egg moves move ID'), 'ANCIENT_POWER')
    expectLinkedOption(inputByAriaLabel('Mega form key'), 'mega')
    expectLinkedOption(inputByAriaLabel('Mega primary ability'), 'BLAZE')
    expectLinkedOption(inputByAriaLabel('Mega change item'), 'FIRE_STONE')
  })

  it('shows descriptive labels and a visible explanation for selected passives and moves', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const stage = { ...project.stages[0], passive: 'BLAZE' }

    render(<BuildTab project={project} stage={stage} onChange={vi.fn()} />)

    const passive = inputByAriaLabel('Passive')
    expectDescribedOption(passive, 'BLAZE', ABILITY_METADATA)
    expect(screen.getByText(ABILITY_METADATA.BLAZE.description)).toBeInTheDocument()
    expect(passive).toHaveAttribute('title', ABILITY_METADATA.BLAZE.description)

    const move = inputByAriaLabel('Level-up move ID')
    expectDescribedOption(move, 'EMBER', MOVE_METADATA)
    await user.type(move, 'EMBER')
    expect(screen.getByText(MOVE_METADATA.EMBER.description)).toBeInTheDocument()
    expect(move).toHaveAttribute('title', MOVE_METADATA.EMBER.description)
  })

  it('changes the evolution requirement control to the matching enum catalog', async () => {
    const user = userEvent.setup()
    const project = addBlankStage(createBlankProject({ name: 'Emberline' }))

    render(<EvolutionTab project={project} activeStage={project.stages[0]} onChange={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'item')
    expectLinkedOption(inputByAriaLabel('Requirement value'), 'FIRE_STONE')

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'move')
    const move = inputByAriaLabel('Requirement value')
    expectDescribedOption(move, 'ANCIENT_POWER', MOVE_METADATA)
    await user.type(move, 'ANCIENT_POWER')
    expect(screen.getByText(MOVE_METADATA.ANCIENT_POWER.description)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'time')
    expectLinkedOption(inputByAriaLabel('Requirement value'), 'DAY')
  })

  it('links encounter biome authoring to the biome catalog', () => {
    const project = createBlankProject({ name: 'Emberline' })

    render(<EncountersTab project={project} official={null} onChange={vi.fn()} />)

    expectLinkedOption(inputByAriaLabel('Biome ID'), 'FOREST')
  })
})
