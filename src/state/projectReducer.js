export const initialProjectState = Object.freeze({
  projectDir: null,
  project: null,
  dirty: false,
  saveState: 'idle',
  error: null,
})

export function projectReducer(state, action) {
  switch (action.type) {
    case 'opened':
      return {
        ...state,
        ...action.payload,
        dirty: false,
        saveState: 'saved',
        error: null,
      }
    case 'draft-changed':
      return {
        ...state,
        project: action.project,
        dirty: true,
        saveState: 'pending',
        error: null,
      }
    case 'saving':
      return { ...state, saveState: 'saving', error: null }
    case 'saved':
      return {
        ...state,
        ...action.payload,
        dirty: false,
        saveState: 'saved',
        error: null,
      }
    case 'save-failed':
      return {
        ...state,
        dirty: true,
        saveState: 'error',
        error: action.error,
      }
    case 'closed':
      return initialProjectState
    default:
      return state
  }
}
