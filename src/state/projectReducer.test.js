import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../shared/project-schema.js'
import { initialProjectState, projectReducer } from './projectReducer.js'

const projectDir = 'C:\\Mods\\Emberline'

describe('project reducer', () => {
  it('opens a project and marks edits dirty', () => {
    const project = createBlankProject({ name: 'Emberline' })
    const opened = projectReducer(initialProjectState, {
      type: 'opened',
      payload: { projectDir, project },
    })
    const edited = projectReducer(opened, {
      type: 'draft-changed',
      project: { ...project, name: 'Emberline Redux' },
    })

    expect(edited).toMatchObject({
      projectDir,
      dirty: true,
      saveState: 'pending',
      error: null,
    })
  })

  it('adopts the canonical saved revision', () => {
    const project = createBlankProject({ name: 'Emberline' })
    const state = {
      ...initialProjectState,
      projectDir,
      project: { ...project, revision: 1 },
      dirty: true,
      saveState: 'saving',
    }
    const canonical = { ...project, revision: 2 }
    const saved = projectReducer(state, {
      type: 'saved',
      payload: { projectDir, project: canonical },
    })

    expect(saved).toMatchObject({
      projectDir,
      project: canonical,
      dirty: false,
      saveState: 'saved',
      error: null,
    })
  })

  it('keeps the draft dirty after a failed save and can close the session', () => {
    const failure = new Error('disk full')
    const failed = projectReducer({
      ...initialProjectState,
      projectDir,
      project: { revision: 3 },
      dirty: true,
      saveState: 'saving',
    }, { type: 'save-failed', error: failure })

    expect(failed).toMatchObject({ dirty: true, saveState: 'error', error: failure })
    expect(projectReducer(failed, { type: 'closed' })).toEqual(initialProjectState)
  })
})
