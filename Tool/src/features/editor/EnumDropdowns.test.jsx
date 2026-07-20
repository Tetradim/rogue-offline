import { readFile } from 'node:fs/promises'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { addStageForm } from '../../../shared/project-authoring.js'
import { addBlankStage, createBlankProject } from '../../../shared/project-schema.js'
import { ABILITY_METADATA, MOVE_METADATA } from '../../enum-metadata.generated.js'
import { BuildTab } from './BuildTab.jsx'
import { EncountersTab } from './EncountersTab.jsx'
import { EnumInput } from './EnumInput.jsx'
import { EvolutionTab } from './EvolutionTab.jsx'

function inputByAriaLabel(label) {
  const input = document.querySelector(`input[aria-label="${label}"]`)
  expect(input).toBeInTheDocument()
  return input
}

async function openListbox(user, input) {
  await user.click(input)
  expect(input).toHaveAttribute('role', 'combobox')
  expect(input).toHaveAttribute('aria-expanded', 'true')
  const listId = input.getAttribute('aria-controls')
  expect(listId).toBeTruthy()
  const listbox = document.getElementById(listId)
  expect(listbox).toHaveAttribute('role', 'listbox')
  return listbox
}

async function expectLinkedOption(user, input, expectedValue) {
  const listbox = await openListbox(user, input)
  const option = listbox.querySelector(`[data-enum-value="${expectedValue}"]`)
  expect(option).toHaveAttribute('role', 'option')
  return option
}

async function expectDescribedOption(user, input, expectedValue, metadata) {
  const option = await expectLinkedOption(user, input, expectedValue)
  expect(option.querySelector('.enum-option-heading')).toHaveTextContent(expectedValue)
  expect(option.querySelector('.enum-option-heading')).toHaveTextContent(metadata[expectedValue].name)
  const description = option.querySelector('.enum-option-description')
  expect(description).toHaveTextContent(metadata[expectedValue].description)
  return option
}

function ControlledEnumInput({ label, options, metadata, initialValue = '' }) {
  const [value, setValue] = useState(initialValue)
  return <EnumInput aria-label={label} value={value} options={options} metadata={metadata} onChange={event => setValue(event.target.value)} />
}

describe('enum-backed editor dropdowns', () => {
  it('links ability, passive, move, form, and item fields to populated option catalogs', async () => {
    const user = userEvent.setup()
    let project = createBlankProject({ name: 'Emberline' })
    project = addStageForm(project, project.stages[0].stageId, { name: 'Mega' })
    const stage = project.stages[0]

    render(<BuildTab project={project} stage={stage} onChange={vi.fn()} />)

    await expectLinkedOption(user, inputByAriaLabel('Primary ability'), 'BLAZE')
    await expectLinkedOption(user, inputByAriaLabel('Passive'), 'SOLAR_POWER')
    await expectLinkedOption(user, inputByAriaLabel('Level-up move ID'), 'EMBER')
    await expectLinkedOption(user, inputByAriaLabel('TM pool move ID'), 'THUNDERBOLT')
    await expectLinkedOption(user, inputByAriaLabel('Egg moves move ID'), 'ANCIENT_POWER')
    await expectLinkedOption(user, inputByAriaLabel('Mega form key'), 'mega')
    await expectLinkedOption(user, inputByAriaLabel('Mega primary ability'), 'BLAZE')
    await expectLinkedOption(user, inputByAriaLabel('Mega change item'), 'FIRE_STONE')
  })

  it('renders wrapping description rows and keeps selected explanations visible', async () => {
    const user = userEvent.setup()

    render(
      <>
        <ControlledEnumInput label="Controlled passive" options={Object.keys(ABILITY_METADATA)} metadata={ABILITY_METADATA} initialValue="BLAZE" />
        <ControlledEnumInput label="Controlled move" options={Object.keys(MOVE_METADATA)} metadata={MOVE_METADATA} />
      </>,
    )

    const passive = inputByAriaLabel('Controlled passive')
    await expectDescribedOption(user, passive, 'BLAZE', ABILITY_METADATA)
    await user.keyboard('{Escape}')
    expect(document.querySelector('[data-enum-description="BLAZE"]')).toHaveTextContent(ABILITY_METADATA.BLAZE.description)
    expect(passive).toHaveAttribute('title', ABILITY_METADATA.BLAZE.description)

    const move = inputByAriaLabel('Controlled move')
    const ember = await expectDescribedOption(user, move, 'EMBER', MOVE_METADATA)
    await user.click(ember)
    expect(move).toHaveValue('EMBER')
    expect(document.querySelector('[data-enum-description="EMBER"]')).toHaveTextContent(MOVE_METADATA.EMBER.description)
    expect(move).toHaveAttribute('title', MOVE_METADATA.EMBER.description)
  })

  it('changes the evolution requirement control to the matching enum catalog', async () => {
    const user = userEvent.setup()
    const project = addBlankStage(createBlankProject({ name: 'Emberline' }))

    render(<EvolutionTab project={project} activeStage={project.stages[0]} onChange={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'item')
    await expectLinkedOption(user, inputByAriaLabel('Requirement value'), 'FIRE_STONE')

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'move')
    const move = inputByAriaLabel('Requirement value')
    const ancientPower = await expectDescribedOption(user, move, 'ANCIENT_POWER', MOVE_METADATA)
    await user.click(ancientPower)
    expect(move).toHaveValue('ANCIENT_POWER')
    expect(document.querySelector('[data-enum-description="ANCIENT_POWER"]')).toHaveTextContent(MOVE_METADATA.ANCIENT_POWER.description)

    await user.selectOptions(screen.getByLabelText(/^Requirement$/), 'time')
    await expectLinkedOption(user, inputByAriaLabel('Requirement value'), 'DAY')
  })

  it('links encounter biome authoring to the biome catalog', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })

    render(<EncountersTab project={project} official={null} onChange={vi.fn()} />)

    await expectLinkedOption(user, inputByAriaLabel('Biome ID'), 'FOREST')
  })

  it('keeps enum option descriptions configured for multi-line wrapping', async () => {
    const css = await readFile(new URL('../../styles/authoring.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.enum-option-description\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s)
    expect(css).toMatch(/\.enum-option-heading\s*\{[^}]*flex-wrap:\s*wrap;/s)
  })
})
