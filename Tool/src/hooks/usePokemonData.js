import { useEffect, useState } from 'react'

const INITIAL_STATE = { pokemon: [], loading: true, error: null }

export function usePokemonData() {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('./pokemon_data.json', { signal: controller.signal })
        if (!response.ok) throw new Error(`Pokédex request failed with ${response.status}.`)
        const pokemon = await response.json()
        if (!Array.isArray(pokemon)) throw new Error('Pokédex response must be an array.')
        setState({ pokemon, loading: false, error: null })
      } catch (error) {
        if (error.name === 'AbortError') return
        setState({ pokemon: [], loading: false, error: error.message })
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  return state
}
