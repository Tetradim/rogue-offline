// @vitest-environment node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'authoring.css')

describe('authoring enum menu styles', () => {
  it('wraps option headings and descriptions instead of clipping them', async () => {
    const css = await readFile(stylesPath, 'utf8')
    expect(css).toMatch(/\.enum-option-description\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s)
    expect(css).toMatch(/\.enum-option-heading\s*\{[^}]*flex-wrap:\s*wrap;/s)
    expect(css).not.toMatch(/\.enum-option-description\s*\{[^}]*text-overflow:\s*ellipsis;/s)
  })
})
