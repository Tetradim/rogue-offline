import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from './useAutosave.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('useAutosave', () => {
  it('saves the latest dirty project after the debounce', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue({
      projectDir: 'C:\\Mods\\Emberline',
      project: { revision: 2 },
    })
    const onSaving = vi.fn()
    const onSaved = vi.fn()
    const onError = vi.fn()

    renderHook(() => useAutosave({
      dirty: true,
      projectDir: 'C:\\Mods\\Emberline',
      project: { revision: 1 },
      save,
      onSaving,
      onSaved,
      onError,
      delay: 350,
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(349)
    })
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(onSaving).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('C:\\Mods\\Emberline', { revision: 1 })
    expect(onSaved).toHaveBeenCalledWith({
      projectDir: 'C:\\Mods\\Emberline',
      project: { revision: 2 },
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('debounces edits and ignores completion from an obsolete save', async () => {
    vi.useFakeTimers()
    const resolvers = []
    const save = vi.fn(() => new Promise(resolve => resolvers.push(resolve)))
    const onSaved = vi.fn()
    const onError = vi.fn()
    const base = {
      dirty: true,
      projectDir: 'C:\\Mods\\Emberline',
      save,
      onSaved,
      onError,
      delay: 100,
    }
    const { rerender } = renderHook(
      ({ project }) => useAutosave({ ...base, project }),
      { initialProps: { project: { revision: 1 } } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender({ project: { revision: 2 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    await act(async () => {
      resolvers[0]({ project: { revision: 2 } })
      await Promise.resolve()
    })
    expect(onSaved).not.toHaveBeenCalled()

    await act(async () => {
      resolvers[1]({ project: { revision: 3 } })
      await Promise.resolve()
    })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({ project: { revision: 3 } })
  })

  it('reports only the current save failure and does nothing for clean sessions', async () => {
    vi.useFakeTimers()
    const failure = new Error('save failed')
    const save = vi.fn().mockRejectedValue(failure)
    const onError = vi.fn()
    const { rerender } = renderHook(
      props => useAutosave({ ...props, save, onError, delay: 50 }),
      {
        initialProps: {
          dirty: false,
          projectDir: 'C:\\Mods\\Emberline',
          project: { revision: 1 },
        },
      },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(save).not.toHaveBeenCalled()

    rerender({
      dirty: true,
      projectDir: 'C:\\Mods\\Emberline',
      project: { revision: 1 },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)
  })
})
