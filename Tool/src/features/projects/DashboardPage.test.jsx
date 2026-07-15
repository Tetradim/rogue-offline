import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage.jsx'

describe('DashboardPage', () => {
  it('creates a blank evolution-line project in a chosen folder', async () => {
    const user = userEvent.setup()
    const payload = {
      projectDir: 'C:\\Mods\\Emberline',
      project: { name: 'Emberline' },
    }
    const api = {
      chooseFolder: vi.fn().mockResolvedValue('C:\\Mods'),
      createProject: vi.fn().mockResolvedValue(payload),
      openProject: vi.fn(),
    }
    const onOpen = vi.fn()

    render(<DashboardPage api={api} onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: /new evolution line/i }))
    await user.type(screen.getByLabelText(/project name/i), 'Emberline')
    await user.click(screen.getByRole('button', { name: /choose parent folder/i }))
    await user.click(screen.getByRole('button', { name: /^create project$/i }))

    expect(api.createProject).toHaveBeenCalledWith('C:\\Mods', 'Emberline')
    expect(onOpen).toHaveBeenCalledWith(payload)
  })

  it('shows a specific progress state while the native folder picker is open', async () => {
    const user = userEvent.setup()
    let resolveFolder
    const api = {
      chooseFolder: vi.fn().mockImplementation(() => new Promise(resolve => { resolveFolder = resolve })),
      createProject: vi.fn(),
      openProject: vi.fn(),
    }

    render(<DashboardPage api={api} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /new evolution line/i }))
    await user.click(screen.getByRole('button', { name: /choose parent folder/i }))

    expect(screen.getByRole('button', { name: /waiting for windows folder picker/i })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/folder picker is open in front/i)
    expect(screen.getByRole('button', { name: /^create project$/i })).toBeDisabled()

    resolveFolder('C:\\Mods')
    await waitFor(() => expect(screen.getByDisplayValue('C:\\Mods')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /choose parent folder/i })).toBeEnabled()
  })

  it('opens a selected portable project folder', async () => {
    const user = userEvent.setup()
    const payload = {
      projectDir: 'C:\\Mods\\Nightwing',
      project: { name: 'Nightwing' },
    }
    const api = {
      chooseFolder: vi.fn().mockResolvedValue(payload.projectDir),
      createProject: vi.fn(),
      openProject: vi.fn().mockResolvedValue(payload),
    }
    const onOpen = vi.fn()

    render(<DashboardPage api={api} onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: /open project folder/i }))

    expect(api.openProject).toHaveBeenCalledWith(payload.projectDir)
    expect(onOpen).toHaveBeenCalledWith(payload)
  })

  it('shows companion errors without leaving the dashboard', async () => {
    const user = userEvent.setup()
    const api = {
      chooseFolder: vi.fn().mockRejectedValue(new Error('Folder picker unavailable.')),
      createProject: vi.fn(),
      openProject: vi.fn(),
    }

    render(<DashboardPage api={api} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /open project folder/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Folder picker unavailable.')
  })
})
