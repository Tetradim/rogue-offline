// Regenerates Tool/index.html — the file Launch.bat/SimpleLaunch.bat
// actually opens — from the fresh build output every time `npm run build`
// runs. This exists specifically so the dev-entry (dev.html) and the
// launcher-entry (index.html) can never accidentally get swapped again:
// index.html is now purely generated output, never hand-edited.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distHtmlPath = join(__dirname, 'dist', 'dev.html')
const outPath = join(__dirname, 'index.html')

let html = readFileSync(distHtmlPath, 'utf-8')
// dist/dev.html references assets as "./assets/..." (relative to dist/).
// Tool/index.html is served from the Tool/ root, one level up from dist/,
// so those paths need the "dist/" prefix restored.
html = html.replace(/(src|href)="\.\/assets\//g, '$1="./dist/assets/')

writeFileSync(outPath, html)
console.log(`[postbuild] Regenerated ${outPath} from dist/dev.html`)

// pokemon_data.json lives in public/ (so `npm run dev` and a standalone
// dist/ deploy both work), which lands it at dist/pokemon_data.json after
// build. The launcher serves the whole Tool/ folder and opens Tool/index.html,
// so App.jsx's `fetch('./pokemon_data.json')` needs a copy at the Tool/
// root too, alongside index.html.
const distDataPath = join(__dirname, 'dist', 'pokemon_data.json')
const rootDataPath = join(__dirname, 'pokemon_data.json')
if (existsSync(distDataPath)) {
  copyFileSync(distDataPath, rootDataPath)
  console.log(`[postbuild] Copied pokemon_data.json to Tool/ root for the launcher`)
}
