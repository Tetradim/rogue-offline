# Foundation and Blank-Line Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working Windows-local PokéRogue Mod Studio foundation with a Node companion service, portable blank evolution-family projects, autosave/reopen, a read-only official Pokédex, a dark Showdown-inspired editor shell, stage management, and synchronized base-stat sliders.

**Architecture:** A dependency-light Node HTTP service owns filesystem operations and serves the production Vite build. Shared pure ESM domain functions define project/stage identity and validation. The React UI calls the local JSON API, keeps an editable project draft in a reducer, and debounces saves to the portable project folder.

**Tech Stack:** Node.js 20+, React 19, Vite 6, Vitest, jsdom, Testing Library, built-in Node `http`, `fs`, `path`, `crypto`, and `child_process` modules.

---

## Program Roadmap

The approved product contains four independently testable subsystems. Implement them as four plans so each phase ends in working software:

1. **This plan — Foundation and Blank-Line Editor:** local service, project schema/repository, Windows launcher, dark UI shell, read-only Pokédex, stage strip, Build tab, stat sliders, autosave, reopen.
2. **Authoring Depth and Review:** evolution graph UI, complete battle fields, moves, forms, assets import/validation, encounter Keep/Suppress/Replace rules, custom placement, and the approved Review tab.
3. **Target Discovery and Binding:** arbitrary-checkout scanner, capability reports, fingerprints, numeric ID allocation, source anchors, and target-aware asset validation.
4. **Transactional Delivery:** patch planning, install/rebuild, update, rollback, uninstall, package export/import, legacy migration, checkout fixtures, and end-to-end acceptance.

Write the next phase's detailed plan after the current phase is committed and verified so its file paths and interfaces match the code that actually exists.

## File Responsibility Map

### Shared domain

- `shared/project-schema.js` — schema constants, blank project/stage factories, normalization, immutable edit helpers, validation, and BST calculation.
- `shared/project-schema.test.js` — deterministic project-domain tests.

### Local service

- `server/fs-utils.js` — atomic JSON writing and bounded autosave snapshots.
- `server/project-repository.js` — create, open, and save portable project folders.
- `server/windows-dialog.js` — Windows folder picker behind an injectable function.
- `server/http-utils.js` — JSON body parsing, JSON responses, and same-origin mutation check.
- `server/static-files.js` — production `dist/` serving.
- `server/app.js` — route composition with injected dependencies.
- `server/index.js` — port binding, startup output, and optional browser launch.
- `server/*.test.js` — repository and API tests using temporary directories and ephemeral ports.

### React application

- `src/api/client.js` — typed request helpers for project and folder APIs.
- `src/state/projectReducer.js` — project-session state transitions.
- `src/hooks/useAutosave.js` — debounced save orchestration.
- `src/hooks/usePokemonData.js` — official Pokédex loading.
- `src/features/projects/DashboardPage.jsx` — create/open project entry screen.
- `src/features/editor/EditorPage.jsx` — approved editor composition.
- `src/features/editor/OfficialPokedex.jsx` — searchable read-only official roster.
- `src/features/editor/EvolutionStageStrip.jsx` — stage selection, addition, and removal.
- `src/features/editor/BuildTab.jsx` — core blank-stage fields and base-stat section.
- `src/features/editor/StatSlider.jsx` — synchronized slider/numeric input.
- `src/App.jsx` — dashboard/editor routing and project-session ownership.
- `src/styles/*.css` — dark theme tokens, base styles, dashboard, and editor layouts.
- `src/**/*.test.*` — reducer, component, and autosave behavior.

### Tooling and launch

- `vitest.config.js` and `src/test/setup.js` — test environment.
- `scripts/dev.mjs` — start the API and Vite together for development.
- `vite.config.js` — development `/api` proxy and existing production build.
- `Launch.bat` and `Launch.bat.ps1` — Node-based Windows launcher.
- `package.json` and `package-lock.json` — scripts and test dependencies.

## Task 1: Install and Prove the Test Harness

**Files:**
- Modify: `package.json`
- Modify mechanically: `package-lock.json`
- Create: `vitest.config.js`
- Create: `src/test/setup.js`
- Create: `src/test/environment.test.js`

- [ ] **Step 1: Add a failing environment test**

Create `src/test/environment.test.js`:

```js
import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('provides a browser-like document', () => {
    const node = document.createElement('div')
    node.textContent = 'PokéRogue Mod Studio'
    document.body.appendChild(node)
    expect(document.body).toHaveTextContent('PokéRogue Mod Studio')
  })
})
```

- [ ] **Step 2: Run the missing test command and verify failure**

Run:

```powershell
npm test
```

Expected: command fails because `test` is not defined or `vitest` is not installed.

- [ ] **Step 3: Install focused test dependencies**

Run:

```powershell
npm install --save-dev vitest@^3.2.4 @vitest/coverage-v8@^3.2.4 jsdom@^26.1.0 @testing-library/react@^16.3.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.6.1
```

Update `package.json` scripts to include:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 4: Configure Vitest and DOM matchers**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
    clearMocks: true,
  },
})
```

Create `src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Run the test and verify success**

Run:

```powershell
npm test -- src/test/environment.test.js
```

Expected: one passing test.

- [ ] **Step 6: Commit the test foundation**

```powershell
git add package.json package-lock.json vitest.config.js src/test/setup.js src/test/environment.test.js
git commit -m "test: add Vitest and Testing Library foundation"
```

## Task 2: Define the Portable Blank Project Domain

**Files:**
- Create: `shared/project-schema.js`
- Create: `shared/project-schema.test.js`

- [ ] **Step 1: Write failing domain tests**

Create `shared/project-schema.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  addBlankStage,
  calculateBst,
  createBlankProject,
  removeStage,
  setStageField,
  setStageStat,
  validateProject,
} from './project-schema.js'

const makeIdFactory = () => {
  const ids = ['project-1', 'stage-1', 'stage-2', 'stage-3']
  return () => ids.shift()
}
const now = () => '2026-07-13T12:00:00.000Z'

describe('portable project domain', () => {
  it('creates a blank one-stage evolution family without official data', () => {
    const idFactory = makeIdFactory()
    const project = createBlankProject({ name: 'Emberline', idFactory, now })
    expect(project).toMatchObject({
      schemaVersion: 2,
      projectId: 'project-1',
      name: 'Emberline',
      slug: 'emberline',
      revision: 1,
    })
    expect(project.stages).toHaveLength(1)
    expect(project.stages[0]).toMatchObject({
      stageId: 'stage-1',
      name: 'Custom Stage 1',
      slug: 'custom-stage-1',
      source: 'custom',
      abilities: [],
      forms: [],
      assets: [],
    })
    expect(project.officialSpecies).toBeUndefined()
  })

  it('adds and removes stages while preserving immutable IDs', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    expect(project.stages.map(stage => stage.stageId)).toEqual(['stage-1', 'stage-2'])
    project = removeStage(project, 'stage-1', { now })
    expect(project.stages.map(stage => stage.stageId)).toEqual(['stage-2'])
  })

  it('synchronizes clamped base stats and calculates BST', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = setStageStat(project, 'stage-1', 'attack', 999, { now })
    project = setStageStat(project, 'stage-1', 'speed', 100, { now })
    expect(project.stages[0].baseStats.attack).toBe(255)
    expect(project.stages[0].baseStats.speed).toBe(100)
    expect(calculateBst(project.stages[0])).toBe(359)
  })

  it('normalizes slugs and reports duplicate stage slugs', () => {
    const idFactory = makeIdFactory()
    let project = createBlankProject({ name: 'Emberline', idFactory, now })
    project = addBlankStage(project, { idFactory, now })
    project = setStageField(project, 'stage-2', 'name', 'Custom Stage 1', { now })
    expect(project.stages[1].slug).toBe('custom-stage-1')
    expect(validateProject(project)).toContainEqual({
      path: 'stages.stage-2.slug',
      code: 'duplicate-stage-slug',
      message: 'Stage slug "custom-stage-1" is already used in this project.',
    })
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```powershell
npm test -- shared/project-schema.test.js
```

Expected: failure because `shared/project-schema.js` does not exist.

- [ ] **Step 3: Implement the project schema and edit helpers**

Create `shared/project-schema.js`:

```js
export const PROJECT_SCHEMA_VERSION = 2
export const STAT_NAMES = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed']

export function makeId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'
}

export function createBlankStage({ ordinal = 1, idFactory = () => makeId('stage') } = {}) {
  const name = `Custom Stage ${ordinal}`
  return {
    stageId: idFactory(),
    source: 'custom',
    name,
    slug: slugify(name),
    category: '',
    generation: 9,
    height: 1,
    weight: 1,
    growthRate: 'MEDIUM_FAST',
    baseFriendship: 50,
    captureRate: 45,
    genderRatio: 50,
    flags: { legendary: false, mythical: false, starter: false },
    types: ['NORMAL'],
    abilities: [],
    passive: '',
    baseStats: {
      hp: 1,
      attack: 1,
      defense: 1,
      specialAttack: 1,
      specialDefense: 1,
      speed: 1,
    },
    moves: { levelUp: [], tm: [], egg: [] },
    forms: [],
    assets: [],
    revision: 1,
  }
}

export function createBlankProject({
  name,
  idFactory = () => makeId('project'),
  now = () => new Date().toISOString(),
} = {}) {
  const timestamp = now()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: idFactory(),
    name: String(name || 'Untitled Evolution Line').trim(),
    slug: slugify(name || 'Untitled Evolution Line'),
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    stages: [createBlankStage({ ordinal: 1, idFactory })],
    evolutionEdges: [],
    encounterPolicy: { officialLines: [], placements: [] },
    targetBindings: [],
  }
}

function touch(project, now) {
  return { ...project, revision: project.revision + 1, updatedAt: now() }
}

export function addBlankStage(project, {
  idFactory = () => makeId('stage'),
  now = () => new Date().toISOString(),
} = {}) {
  const nextStage = createBlankStage({ ordinal: project.stages.length + 1, idFactory })
  return touch({ ...project, stages: [...project.stages, nextStage] }, now)
}

export function removeStage(project, stageId, { now = () => new Date().toISOString() } = {}) {
  if (project.stages.length === 1) return project
  return touch({
    ...project,
    stages: project.stages.filter(stage => stage.stageId !== stageId),
    evolutionEdges: project.evolutionEdges.filter(edge => edge.from !== stageId && edge.to !== stageId),
  }, now)
}

export function setStageField(project, stageId, field, value, {
  now = () => new Date().toISOString(),
} = {}) {
  const stages = project.stages.map(stage => {
    if (stage.stageId !== stageId) return stage
    const next = { ...stage, [field]: value, revision: stage.revision + 1 }
    if (field === 'name') next.slug = slugify(value)
    return next
  })
  return touch({ ...project, stages }, now)
}

export function setStageStat(project, stageId, stat, rawValue, options = {}) {
  if (!STAT_NAMES.includes(stat)) return project
  const value = Math.min(255, Math.max(1, Number.parseInt(rawValue, 10) || 1))
  const stage = project.stages.find(candidate => candidate.stageId === stageId)
  if (!stage) return project
  return setStageField(project, stageId, 'baseStats', { ...stage.baseStats, [stat]: value }, options)
}

export function calculateBst(stage) {
  return STAT_NAMES.reduce((total, stat) => total + Number(stage.baseStats[stat] || 0), 0)
}

export function validateProject(project) {
  const errors = []
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    errors.push({ path: 'schemaVersion', code: 'unsupported-schema', message: `Expected schema version ${PROJECT_SCHEMA_VERSION}.` })
  }
  if (!project.name?.trim()) errors.push({ path: 'name', code: 'required', message: 'Project name is required.' })
  if (!project.stages?.length) errors.push({ path: 'stages', code: 'required', message: 'At least one custom stage is required.' })

  const stageIds = new Set()
  const slugs = new Set()
  for (const stage of project.stages || []) {
    if (stageIds.has(stage.stageId)) {
      errors.push({ path: `stages.${stage.stageId}.stageId`, code: 'duplicate-stage-id', message: `Stage ID "${stage.stageId}" is duplicated.` })
    }
    stageIds.add(stage.stageId)
    if (slugs.has(stage.slug)) {
      errors.push({ path: `stages.${stage.stageId}.slug`, code: 'duplicate-stage-slug', message: `Stage slug "${stage.slug}" is already used in this project.` })
    }
    slugs.add(stage.slug)
    for (const stat of STAT_NAMES) {
      const value = Number(stage.baseStats?.[stat])
      if (!Number.isInteger(value) || value < 1 || value > 255) {
        errors.push({ path: `stages.${stage.stageId}.baseStats.${stat}`, code: 'invalid-stat', message: `${stat} must be an integer from 1 to 255.` })
      }
    }
  }
  return errors
}
```

- [ ] **Step 4: Run domain tests and verify success**

Run:

```powershell
npm test -- shared/project-schema.test.js
```

Expected: four passing tests.

- [ ] **Step 5: Commit the shared domain**

```powershell
git add shared/project-schema.js shared/project-schema.test.js
git commit -m "feat: define portable evolution-family project schema"
```

## Task 3: Persist Portable Projects Atomically

**Files:**
- Create: `server/fs-utils.js`
- Create: `server/project-repository.js`
- Create: `server/project-repository.test.js`

- [ ] **Step 1: Write failing repository tests**

Create `server/project-repository.test.js`:

```js
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectRepository } from './project-repository.js'

const roots = []
async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'pokerogue-studio-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('project repository', () => {
  it('creates a portable folder and reopens the canonical project', async () => {
    const root = await tempRoot()
    const repository = createProjectRepository({ now: () => '2026-07-13T12:00:00.000Z' })
    const created = await repository.create({ parentDir: root, name: 'Emberline' })
    expect(created.projectDir).toBe(path.join(root, 'Emberline'))
    expect(created.project.name).toBe('Emberline')
    expect(JSON.parse(await readFile(path.join(created.projectDir, 'project.json'), 'utf8'))).toEqual(created.project)
    await expect(repository.open(created.projectDir)).resolves.toEqual(created)
  })

  it('saves atomically and records a bounded autosave', async () => {
    const root = await tempRoot()
    const repository = createProjectRepository({ now: () => '2026-07-13T12:00:00.000Z' })
    const created = await repository.create({ parentDir: root, name: 'Emberline' })
    const edited = { ...created.project, name: 'Emberline Redux' }
    const saved = await repository.save(created.projectDir, edited)
    expect(saved.project.name).toBe('Emberline Redux')
    expect(saved.project.revision).toBe(created.project.revision + 1)
    expect(saved.project.updatedAt).toBe('2026-07-13T12:00:00.000Z')
    expect(JSON.parse(await readFile(path.join(created.projectDir, 'project.json'), 'utf8'))).toEqual(saved.project)
  })

  it('refuses a project whose schema validation fails', async () => {
    const root = await tempRoot()
    const repository = createProjectRepository()
    await expect(repository.create({ parentDir: root, name: '' })).rejects.toThrow('Project name is required.')
  })
})
```

- [ ] **Step 2: Run repository tests and verify failure**

Run:

```powershell
npm test -- server/project-repository.test.js
```

Expected: failure because the repository module does not exist.

- [ ] **Step 3: Implement atomic JSON writes**

Create `server/fs-utils.js`:

```js
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, filePath)
}

export async function writeAutosave(projectDir, project, limit = 10) {
  const dir = path.join(projectDir, '.studio', 'autosaves')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${String(project.revision).padStart(6, '0')}.json`)
  await writeJsonAtomic(file, project)
  const files = (await readdir(dir)).filter(name => name.endsWith('.json')).sort()
  await Promise.all(files.slice(0, Math.max(0, files.length - limit)).map(name => rm(path.join(dir, name), { force: true })))
}
```

- [ ] **Step 4: Implement the repository**

Create `server/project-repository.js`:

```js
import { access, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createBlankProject, slugify, validateProject } from '../shared/project-schema.js'
import { writeAutosave, writeJsonAtomic } from './fs-utils.js'

async function pathExists(candidate) {
  try { await access(candidate); return true } catch { return false }
}

async function availableProjectDir(parentDir, name) {
  const base = path.join(path.resolve(parentDir), String(name).trim())
  if (!(await pathExists(base))) return base
  let suffix = 2
  while (await pathExists(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function assertValid(project) {
  const errors = validateProject(project)
  if (errors.length) throw new Error(errors.map(error => error.message).join(' '))
}

export function createProjectRepository({
  now = () => new Date().toISOString(),
  idFactory,
} = {}) {
  return {
    async create({ parentDir, name }) {
      if (!String(name || '').trim()) throw new Error('Project name is required.')
      const projectDir = await availableProjectDir(parentDir, String(name).trim())
      const project = createBlankProject({ name, now, ...(idFactory ? { idFactory } : {}) })
      assertValid(project)
      await mkdir(path.join(projectDir, 'assets'), { recursive: true })
      await mkdir(path.join(projectDir, '.studio', 'operation-logs'), { recursive: true })
      await writeJsonAtomic(path.join(projectDir, 'project.json'), project)
      await writeAutosave(projectDir, project)
      return { projectDir, project }
    },

    async open(projectDir) {
      const resolved = path.resolve(projectDir)
      const project = JSON.parse(await readFile(path.join(resolved, 'project.json'), 'utf8'))
      assertValid(project)
      return { projectDir: resolved, project }
    },

    async save(projectDir, draft) {
      const timestamp = now()
      const project = {
        ...draft,
        slug: slugify(draft.name),
        revision: Number(draft.revision || 0) + 1,
        updatedAt: timestamp,
      }
      assertValid(project)
      const resolved = path.resolve(projectDir)
      await writeJsonAtomic(path.join(resolved, 'project.json'), project)
      await writeAutosave(resolved, project)
      return { projectDir: resolved, project }
    },
  }
}
```

- [ ] **Step 5: Run repository tests and verify success**

Run:

```powershell
npm test -- server/project-repository.test.js
```

Expected: three passing tests.

- [ ] **Step 6: Commit portable persistence**

```powershell
git add server/fs-utils.js server/project-repository.js server/project-repository.test.js
git commit -m "feat: persist portable projects atomically"
```

## Task 4: Expose the Local Companion API

**Files:**
- Create: `server/http-utils.js`
- Create: `server/static-files.js`
- Create: `server/windows-dialog.js`
- Create: `server/app.js`
- Create: `server/index.js`
- Create: `server/app.test.js`

- [ ] **Step 1: Write failing API tests**

Create `server/app.test.js`:

```js
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createProjectRepository } from './project-repository.js'

const cleanups = []
async function startApp(app) {
  const server = createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
})

describe('local companion API', () => {
  it('creates, saves, and opens a project through JSON routes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pokerogue-api-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const app = createApp({
      repository: createProjectRepository(),
      selectFolder: async () => root,
      staticHandler: async () => false,
    })
    const baseUrl = await startApp(app)

    expect(await (await fetch(`${baseUrl}/api/health`)).json()).toEqual({ ok: true, service: 'pokerogue-mod-studio' })
    const created = await (await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentDir: root, name: 'Emberline' }),
    })).json()
    created.project.name = 'Emberline Redux'
    const saved = await (await fetch(`${baseUrl}/api/projects`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(created),
    })).json()
    expect(saved.project.name).toBe('Emberline Redux')
    const opened = await (await fetch(`${baseUrl}/api/projects/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectDir: created.projectDir }),
    })).json()
    expect(opened.project.name).toBe('Emberline Redux')
  })

  it('returns the injected Windows folder choice', async () => {
    const app = createApp({
      repository: createProjectRepository(),
      selectFolder: async () => 'C:\\Projects',
      staticHandler: async () => false,
    })
    const baseUrl = await startApp(app)
    const response = await fetch(`${baseUrl}/api/dialog/folder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Choose project parent folder' }),
    })
    expect(await response.json()).toEqual({ path: 'C:\\Projects' })
  })
})
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```powershell
npm test -- server/app.test.js
```

Expected: failure because `server/app.js` does not exist.

- [ ] **Step 3: Implement HTTP helpers and static serving**

Create `server/http-utils.js`:

```js
export async function readJson(request) {
  const contentType = request.headers['content-type'] || ''
  if (!contentType.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Expected application/json.'), { statusCode: 415 })
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length })
  response.end(body)
}

export function mutationOriginAllowed(request) {
  const origin = request.headers.origin
  if (!origin) return true
  try { return new URL(origin).host === request.headers.host } catch { return false }
}
```

Create `server/static-files.js`:

```js
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' }

export function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir)
  return async function staticHandler(request, response) {
    const pathname = new URL(request.url, 'http://local').pathname
    const relative = pathname === '/' ? 'dev.html' : pathname.replace(/^\/+/, '')
    const filePath = path.resolve(root, relative)
    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) return false
    try {
      if (!(await stat(filePath)).isFile()) return false
      const body = await readFile(filePath)
      response.writeHead(200, { 'content-type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'content-length': body.length })
      response.end(body)
      return true
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 4: Implement the Windows folder picker**

Create `server/windows-dialog.js`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function selectWindowsFolder(description = 'Choose a folder') {
  const escaped = String(description).replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = '${escaped}'`,
    '$dialog.ShowNewFolderButton = $true',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
  ].join('; ')
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true })
  return stdout.trim()
}
```

- [ ] **Step 5: Implement API routing and startup**

Create `server/app.js`:

```js
import { mutationOriginAllowed, readJson, sendJson } from './http-utils.js'

export function createApp({ repository, selectFolder, staticHandler }) {
  return async function app(request, response) {
    try {
      const { pathname } = new URL(request.url, 'http://local')
      if (request.method === 'GET' && pathname === '/api/health') return sendJson(response, 200, { ok: true, service: 'pokerogue-mod-studio' })

      if (pathname.startsWith('/api/') && request.method !== 'GET' && !mutationOriginAllowed(request)) {
        return sendJson(response, 403, { error: 'Request origin is not the local application.' })
      }

      if (request.method === 'POST' && pathname === '/api/dialog/folder') {
        const body = await readJson(request)
        return sendJson(response, 200, { path: await selectFolder(body.description) })
      }
      if (request.method === 'POST' && pathname === '/api/projects') {
        return sendJson(response, 201, await repository.create(await readJson(request)))
      }
      if (request.method === 'POST' && pathname === '/api/projects/open') {
        const body = await readJson(request)
        return sendJson(response, 200, await repository.open(body.projectDir))
      }
      if (request.method === 'PUT' && pathname === '/api/projects') {
        const body = await readJson(request)
        return sendJson(response, 200, await repository.save(body.projectDir, body.project))
      }
      if (pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API route not found.' })
      if (await staticHandler(request, response)) return
      sendJson(response, 404, { error: 'File not found.' })
    } catch (error) {
      sendJson(response, error.statusCode || 400, { error: error.message })
    }
  }
}
```

Create `server/index.js`:

```js
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createProjectRepository } from './project-repository.js'
import { createStaticHandler } from './static-files.js'
import { selectWindowsFolder } from './windows-dialog.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = '127.0.0.1'
const requestedPort = Number(process.env.POKEROGUE_STUDIO_PORT || 0)
const server = createServer(createApp({
  repository: createProjectRepository(),
  selectFolder: selectWindowsFolder,
  staticHandler: createStaticHandler(path.join(root, 'dist')),
}))

server.listen(requestedPort, host, () => {
  const url = `http://${host}:${server.address().port}/`
  console.log(JSON.stringify({ type: 'server-started', url }))
  if (process.argv.includes('--open')) spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
})
```

- [ ] **Step 6: Run API tests and syntax checks**

Run:

```powershell
npm test -- server/app.test.js server/project-repository.test.js
node --check server/index.js
```

Expected: all five service tests pass and the syntax check exits zero.

- [ ] **Step 7: Commit the local service**

```powershell
git add server/http-utils.js server/static-files.js server/windows-dialog.js server/app.js server/index.js server/app.test.js
git commit -m "feat: add local project companion service"
```

## Task 5: Replace the Python Launcher with the Node Companion

**Files:**
- Create: `scripts/dev.mjs`
- Modify: `package.json`
- Modify: `vite.config.js`
- Modify: `Launch.bat`
- Replace: `Launch.bat.ps1`
- Modify: `SimpleLaunch.bat`

- [ ] **Step 1: Add a development-process script**

Create `scripts/dev.mjs`:

```js
import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(process.execPath, ['--watch', 'server/index.js'], {
    stdio: 'inherit',
    env: { ...process.env, POKEROGUE_STUDIO_PORT: '43123' },
  }),
  spawn(npmCommand, ['run', 'dev:ui'], { stdio: 'inherit' }),
]

function shutdown(code = 0) {
  for (const child of children) child.kill()
  process.exit(code)
}

for (const child of children) child.on('exit', code => shutdown(code || 0))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
```

- [ ] **Step 2: Update Vite development proxy and scripts**

In `vite.config.js`, add:

```js
server: {
  host: '127.0.0.1',
  proxy: { '/api': 'http://127.0.0.1:43123' },
},
```

Replace the relevant `package.json` scripts with:

```json
{
  "dev": "node scripts/dev.mjs",
  "dev:ui": "vite --open /dev.html",
  "start": "node server/index.js --open",
  "build": "vite build",
  "postbuild": "node postbuild.js",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "check:service": "node --check server/index.js",
  "check-installer": "node --check pokerogue-mod-installer.cjs"
}
```

- [ ] **Step 3: Replace the Windows launcher**

Replace `Launch.bat.ps1` with:

```powershell
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host 'PokéRogue Mod Studio' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] Node.js 20 or newer is required.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

if (-not (Test-Path 'node_modules')) {
    Write-Host '[SETUP] Installing local dependencies...'
    npm install
}
Write-Host '[BUILD] Creating the local application bundle...'
npm run build

Write-Host '[START] Opening the local studio. Close this window to stop it.' -ForegroundColor Green
node server\index.js --open
```

Replace `Launch.bat` and `SimpleLaunch.bat` with:

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch.bat.ps1"
if errorlevel 1 pause
```

- [ ] **Step 4: Verify development and production startup**

Run:

```powershell
npm run build
$process = Start-Process -FilePath node -ArgumentList @('server/index.js') -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 500
Stop-Process -Id $process.Id
```

Expected: build succeeds; the service starts without a syntax or missing-file error.

- [ ] **Step 5: Commit launcher replacement**

```powershell
git add scripts/dev.mjs package.json package-lock.json vite.config.js Launch.bat Launch.bat.ps1 SimpleLaunch.bat
git commit -m "feat: launch the studio through the Node companion"
```

## Task 6: Add the React API Client and Project Session State

**Files:**
- Create: `src/api/client.js`
- Create: `src/state/projectReducer.js`
- Create: `src/state/projectReducer.test.js`
- Create: `src/hooks/useAutosave.js`
- Create: `src/hooks/useAutosave.test.jsx`

- [ ] **Step 1: Write failing reducer and autosave tests**

Create `src/state/projectReducer.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { createBlankProject } from '../../shared/project-schema.js'
import { initialProjectState, projectReducer } from './projectReducer.js'

describe('project reducer', () => {
  it('opens a project and marks edits dirty', () => {
    const project = createBlankProject({ name: 'Emberline' })
    const opened = projectReducer(initialProjectState, { type: 'opened', payload: { projectDir: 'C:\\Mods\\Emberline', project } })
    const edited = projectReducer(opened, { type: 'draft-changed', project: { ...project, name: 'Emberline Redux' } })
    expect(edited).toMatchObject({ projectDir: 'C:\\Mods\\Emberline', dirty: true, saveState: 'pending' })
  })

  it('adopts the canonical saved revision', () => {
    const state = { ...initialProjectState, dirty: true, saveState: 'saving' }
    const project = createBlankProject({ name: 'Emberline' })
    const saved = projectReducer(state, { type: 'saved', payload: { projectDir: 'C:\\Mods\\Emberline', project } })
    expect(saved).toMatchObject({ project, dirty: false, saveState: 'saved', error: null })
  })
})
```

Create `src/hooks/useAutosave.test.jsx`:

```jsx
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAutosave } from './useAutosave.js'

describe('useAutosave', () => {
  it('saves the latest dirty project after the debounce', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue({ projectDir: 'C:\\Mods\\Emberline', project: { revision: 2 } })
    renderHook(() => useAutosave({ dirty: true, projectDir: 'C:\\Mods\\Emberline', project: { revision: 1 }, save, onSaved: vi.fn(), onError: vi.fn(), delay: 350 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(350) })
    expect(save).toHaveBeenCalledWith('C:\\Mods\\Emberline', { revision: 1 })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```powershell
npm test -- src/state/projectReducer.test.js src/hooks/useAutosave.test.jsx
```

Expected: failure because the reducer and hook do not exist.

- [ ] **Step 3: Implement the API client**

Create `src/api/client.js`:

```js
async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || `Request failed with ${response.status}.`)
  return value
}

export const studioApi = {
  health: () => request('/api/health'),
  chooseFolder: description => request('/api/dialog/folder', { method: 'POST', body: JSON.stringify({ description }) }).then(result => result.path),
  createProject: (parentDir, name) => request('/api/projects', { method: 'POST', body: JSON.stringify({ parentDir, name }) }),
  openProject: projectDir => request('/api/projects/open', { method: 'POST', body: JSON.stringify({ projectDir }) }),
  saveProject: (projectDir, project) => request('/api/projects', { method: 'PUT', body: JSON.stringify({ projectDir, project }) }),
}
```

- [ ] **Step 4: Implement reducer and autosave hook**

Create `src/state/projectReducer.js`:

```js
export const initialProjectState = { projectDir: null, project: null, dirty: false, saveState: 'idle', error: null }

export function projectReducer(state, action) {
  switch (action.type) {
    case 'opened': return { ...state, ...action.payload, dirty: false, saveState: 'saved', error: null }
    case 'draft-changed': return { ...state, project: action.project, dirty: true, saveState: 'pending', error: null }
    case 'saving': return { ...state, saveState: 'saving', error: null }
    case 'saved': return { ...state, ...action.payload, dirty: false, saveState: 'saved', error: null }
    case 'save-failed': return { ...state, saveState: 'error', error: action.error }
    case 'closed': return initialProjectState
    default: return state
  }
}
```

Create `src/hooks/useAutosave.js`:

```js
import { useEffect, useRef } from 'react'

export function useAutosave({ dirty, projectDir, project, save, onSaving, onSaved, onError, delay = 350 }) {
  const sequence = useRef(0)
  useEffect(() => {
    if (!dirty || !projectDir || !project) return undefined
    const current = ++sequence.current
    const timer = setTimeout(async () => {
      try {
        onSaving?.()
        const payload = await save(projectDir, project)
        if (current === sequence.current) onSaved(payload)
      } catch (error) {
        if (current === sequence.current) onError(error)
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [dirty, projectDir, project, save, onSaving, onSaved, onError, delay])
}
```

- [ ] **Step 5: Run state tests and verify success**

Run:

```powershell
npm test -- src/state/projectReducer.test.js src/hooks/useAutosave.test.jsx
```

Expected: three passing tests.

- [ ] **Step 6: Commit frontend state infrastructure**

```powershell
git add src/api/client.js src/state/projectReducer.js src/state/projectReducer.test.js src/hooks/useAutosave.js src/hooks/useAutosave.test.jsx
git commit -m "feat: add project API client and autosave state"
```

## Task 7: Build the Dark Project Dashboard

**Files:**
- Create: `src/features/projects/DashboardPage.jsx`
- Create: `src/features/projects/DashboardPage.test.jsx`
- Replace: `src/App.jsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Create: `src/styles/dashboard.css`
- Replace: `src/index.css`

- [ ] **Step 1: Write a failing dashboard test**

Create `src/features/projects/DashboardPage.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage.jsx'

describe('DashboardPage', () => {
  it('creates a blank evolution-line project in a chosen folder', async () => {
    const user = userEvent.setup()
    const api = {
      chooseFolder: vi.fn().mockResolvedValue('C:\\Mods'),
      createProject: vi.fn().mockResolvedValue({ projectDir: 'C:\\Mods\\Emberline', project: { name: 'Emberline' } }),
      openProject: vi.fn(),
    }
    const onOpen = vi.fn()
    render(<DashboardPage api={api} onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: /new evolution line/i }))
    await user.type(screen.getByLabelText(/project name/i), 'Emberline')
    await user.click(screen.getByRole('button', { name: /choose parent folder/i }))
    await user.click(screen.getByRole('button', { name: /^create project$/i }))
    expect(api.createProject).toHaveBeenCalledWith('C:\\Mods', 'Emberline')
    expect(onOpen).toHaveBeenCalledWith({ projectDir: 'C:\\Mods\\Emberline', project: { name: 'Emberline' } })
  })
})
```

- [ ] **Step 2: Run the dashboard test and verify failure**

Run:

```powershell
npm test -- src/features/projects/DashboardPage.test.jsx
```

Expected: failure because `DashboardPage.jsx` does not exist.

- [ ] **Step 3: Implement the dashboard**

Create `src/features/projects/DashboardPage.jsx`:

```jsx
import { useState } from 'react'

export function DashboardPage({ api, onOpen }) {
  const [mode, setMode] = useState(null)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [error, setError] = useState('')

  async function chooseFolder(description) {
    const selected = await api.chooseFolder(description)
    if (selected) setFolder(selected)
  }

  async function createProject(event) {
    event.preventDefault()
    try { onOpen(await api.createProject(folder, name.trim())) } catch (cause) { setError(cause.message) }
  }

  async function openProject() {
    try {
      const projectDir = await api.chooseFolder('Choose a PokéRogue Mod Studio project folder')
      if (projectDir) onOpen(await api.openProject(projectDir))
    } catch (cause) { setError(cause.message) }
  }

  return <main className="dashboard-shell">
    <section className="dashboard-hero">
      <div className="brand-orb" aria-hidden="true" />
      <p className="eyebrow">Windows local creation studio</p>
      <h1>PokéRogue Mod Studio</h1>
      <p>Create one complete custom evolutionary family, validate it, and prepare it for your local game.</p>
      <div className="dashboard-actions">
        <button className="button button-primary" onClick={() => setMode('create')}>New Evolution Line</button>
        <button className="button button-secondary" onClick={openProject}>Open Project Folder</button>
      </div>
    </section>
    {mode === 'create' && <form className="dialog-card" onSubmit={createProject}>
      <h2>Create blank evolution line</h2>
      <label>Project name<input value={name} onChange={event => setName(event.target.value)} required /></label>
      <label>Parent folder<div className="folder-row"><input value={folder} readOnly /><button type="button" className="button button-secondary" onClick={() => chooseFolder('Choose project parent folder')}>Choose Parent Folder</button></div></label>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-ghost" onClick={() => setMode(null)}>Cancel</button><button className="button button-primary" disabled={!name.trim() || !folder}>Create Project</button></div>
    </form>}
  </main>
}
```

- [ ] **Step 4: Replace the application root**

Replace `src/App.jsx` with:

```jsx
import { useCallback, useReducer } from 'react'
import { studioApi } from './api/client.js'
import { DashboardPage } from './features/projects/DashboardPage.jsx'
import { useAutosave } from './hooks/useAutosave.js'
import { initialProjectState, projectReducer } from './state/projectReducer.js'

export default function App() {
  const [session, dispatch] = useReducer(projectReducer, initialProjectState)
  const save = useCallback((projectDir, project) => studioApi.saveProject(projectDir, project), [])
  const onSaving = useCallback(() => dispatch({ type: 'saving' }), [])
  const onSaved = useCallback(payload => dispatch({ type: 'saved', payload }), [])
  const onError = useCallback(error => dispatch({ type: 'save-failed', error: error.message }), [])

  useAutosave({ dirty: session.dirty, projectDir: session.projectDir, project: session.project, save, onSaving, onSaved, onError })

  if (!session.project) return <DashboardPage api={studioApi} onOpen={payload => dispatch({ type: 'opened', payload })} />
  return <main className="dashboard-shell"><section className="dialog-card"><h1>{session.project.name}</h1><p>The project is open at {session.projectDir}.</p><button className="button button-secondary" onClick={() => dispatch({ type: 'closed' })}>Back to Projects</button></section></main>
}
```

- [ ] **Step 5: Add the approved theme foundation**

Create `src/styles/tokens.css`:

```css
:root {
  color-scheme: dark;
  --bg: #070a12;
  --nav: #0b1020;
  --surface: #101629;
  --raised: #151d33;
  --line: #293552;
  --text: #f1f5ff;
  --muted: #8996b3;
  --blue: #4d8dff;
  --red: #ff5968;
  --purple: #925cff;
  --radius: 10px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Create `src/styles/base.css`:

```css
* { box-sizing: border-box; }
html, body, #root { min-height: 100%; margin: 0; }
body { background: var(--bg); color: var(--text); }
button, input, select { font: inherit; }
button { cursor: pointer; }
input, select { width: 100%; border: 1px solid var(--line); border-radius: 7px; background: var(--nav); color: var(--text); padding: 10px 12px; }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.button { border: 1px solid transparent; border-radius: 7px; padding: 10px 14px; color: var(--text); font-weight: 750; }
.button-primary { background: var(--blue); }
.button-secondary { background: #241b45; border-color: #5d43a0; }
.button-ghost { background: transparent; border-color: var(--line); }
.error-banner { border: 1px solid #6a2b38; background: #30141c; color: #ffabb3; border-radius: 7px; padding: 10px; }
```

Create `src/styles/dashboard.css`:

```css
.dashboard-shell { min-height: 100vh; display: grid; place-items: center; padding: 32px; background: radial-gradient(circle at 20% 10%, #111e38 0, transparent 40%), radial-gradient(circle at 80% 80%, #21133a 0, transparent 35%); }
.dashboard-hero, .dialog-card { width: min(680px, 100%); border: 1px solid var(--line); border-radius: 14px; background: rgba(16, 22, 41, .96); padding: 32px; box-shadow: 0 24px 70px rgba(0, 0, 0, .42); }
.brand-orb { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, var(--blue), var(--purple)); box-shadow: 0 0 28px rgba(105, 90, 255, .35); }
.eyebrow { color: #9bbcff; text-transform: uppercase; letter-spacing: .12em; font-size: 12px; font-weight: 800; }
.dashboard-hero h1 { margin: 8px 0; font-size: clamp(36px, 6vw, 64px); }
.dashboard-hero p { color: var(--muted); line-height: 1.6; }
.dashboard-actions, .dialog-actions, .folder-row { display: flex; gap: 10px; }
.dialog-card label { display: grid; gap: 7px; margin: 16px 0; color: #cad5ed; font-weight: 700; }
.dialog-actions { justify-content: flex-end; margin-top: 22px; }
```

Replace `src/index.css` with:

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/dashboard.css';
```

- [ ] **Step 6: Run dashboard test and build**

Run:

```powershell
npm test -- src/features/projects/DashboardPage.test.jsx
npm run build
```

Expected: dashboard test passes and Vite build succeeds.

- [ ] **Step 7: Commit the dashboard**

```powershell
git add src/App.jsx src/index.css src/features/projects/DashboardPage.jsx src/features/projects/DashboardPage.test.jsx src/styles/tokens.css src/styles/base.css src/styles/dashboard.css
git commit -m "feat: add dark portable-project dashboard"
```

## Task 8: Add the Read-Only Pokédex and Evolution Stage Strip

**Files:**
- Create: `src/hooks/usePokemonData.js`
- Create: `src/features/editor/OfficialPokedex.jsx`
- Create: `src/features/editor/EvolutionStageStrip.jsx`
- Create: `src/features/editor/EditorPage.jsx`
- Create: `src/features/editor/EditorPage.test.jsx`
- Create: `src/styles/editor.css`
- Modify: `src/App.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write a failing editor-shell test**

Create `src/features/editor/EditorPage.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBlankProject } from '../../../shared/project-schema.js'
import { EditorPage } from './EditorPage.jsx'

describe('EditorPage', () => {
  it('keeps official Pokémon read-only and adds blank custom stages', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const onChange = vi.fn()
    render(<EditorPage project={project} projectDir="C:\\Mods\\Emberline" saveState="saved" pokemon={[{ speciesNumber: 4, name: 'Charmander', primaryType: 'FIRE', speciesId: 'charmander' }]} onChange={onChange} onClose={vi.fn()} />)
    await user.click(screen.getByText('Charmander'))
    expect(screen.getByText(/official reference/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit official/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add stage/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stages: expect.arrayContaining([expect.objectContaining({ name: 'Custom Stage 2', source: 'custom' })]) }))
  })
})
```

- [ ] **Step 2: Run the editor test and verify failure**

Run:

```powershell
npm test -- src/features/editor/EditorPage.test.jsx
```

Expected: failure because the editor components do not exist.

- [ ] **Step 3: Implement official data loading and read-only list**

Create `src/hooks/usePokemonData.js`:

```js
import { useEffect, useState } from 'react'

export function usePokemonData() {
  const [state, setState] = useState({ pokemon: [], loading: true, error: null })
  useEffect(() => {
    let active = true
    fetch('./pokemon_data.json')
      .then(response => { if (!response.ok) throw new Error(`Pokédex request failed with ${response.status}.`); return response.json() })
      .then(pokemon => { if (active) setState({ pokemon, loading: false, error: null }) })
      .catch(error => { if (active) setState({ pokemon: [], loading: false, error: error.message }) })
    return () => { active = false }
  }, [])
  return state
}
```

Create `src/features/editor/OfficialPokedex.jsx`:

```jsx
import { useMemo, useState } from 'react'

export function OfficialPokedex({ pokemon, selected, onSelect }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => pokemon.filter(entry => `${entry.name} ${entry.speciesId} ${entry.speciesNumber}`.toLowerCase().includes(search.toLowerCase())).slice(0, 200), [pokemon, search])
  return <aside className="pokedex-panel">
    <div className="pokedex-heading"><strong>Pokédex</strong><span>{pokemon.length}</span></div>
    <input aria-label="Search official Pokédex" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search species…" />
    <div className="pokedex-list">{filtered.map(entry => <button key={entry.speciesNumber} className={selected?.speciesNumber === entry.speciesNumber ? 'pokedex-row active' : 'pokedex-row'} onClick={() => onSelect(entry)}><span>#{String(entry.speciesNumber).padStart(4, '0')}</span><b>{entry.name}</b><small>{entry.primaryType}</small></button>)}</div>
    {selected && <section className="official-reference"><strong>Official reference</strong><p>{selected.name} is read-only. Availability policies are configured in the Encounters workflow.</p></section>}
  </aside>
}
```

- [ ] **Step 4: Implement stage strip and editor composition**

Create `src/features/editor/EvolutionStageStrip.jsx`:

```jsx
export function EvolutionStageStrip({ stages, activeStageId, onSelect, onAdd, onRemove }) {
  return <nav className="stage-strip" aria-label="Evolution stages">
    {stages.map((stage, index) => <div key={stage.stageId} className={stage.stageId === activeStageId ? 'stage-chip active' : 'stage-chip'}>
      <button onClick={() => onSelect(stage.stageId)}>{index + 1} · {stage.name}</button>
      {stages.length > 1 && <button className="stage-remove" aria-label={`Remove ${stage.name}`} onClick={() => onRemove(stage.stageId)}>×</button>}
    </div>)}
    <button className="stage-add" onClick={onAdd}>＋ Add Stage</button>
  </nav>
}
```

Create `src/features/editor/EditorPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { addBlankStage, removeStage } from '../../../shared/project-schema.js'
import { EvolutionStageStrip } from './EvolutionStageStrip.jsx'
import { OfficialPokedex } from './OfficialPokedex.jsx'

export function EditorPage({ project, projectDir, saveState, pokemon, onChange, onClose }) {
  const [activeStageId, setActiveStageId] = useState(project.stages[0].stageId)
  const [official, setOfficial] = useState(null)
  useEffect(() => {
    if (!project.stages.some(stage => stage.stageId === activeStageId)) setActiveStageId(project.stages[0].stageId)
  }, [project.stages, activeStageId])
  const activeStage = project.stages.find(stage => stage.stageId === activeStageId) || project.stages[0]

  return <div className="studio-shell">
    <header className="studio-header"><div className="brand-mini" /><strong>PokéRogue Mod Studio</strong><span className="project-pill">{project.name}</span><span className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Autosaved'}</span><button className="button button-ghost" onClick={onClose}>Projects</button></header>
    <div className="studio-workspace">
      <OfficialPokedex pokemon={pokemon} selected={official} onSelect={setOfficial} />
      <main className="editor-panel">
        <EvolutionStageStrip stages={project.stages} activeStageId={activeStage.stageId} onSelect={setActiveStageId} onAdd={() => onChange(addBlankStage(project))} onRemove={stageId => onChange(removeStage(project, stageId))} />
        <div className="editor-tabs"><button className="active">Build</button></div>
        <section className="editor-canvas"><h1>{activeStage.name}</h1><p className="muted">{projectDir}</p></section>
      </main>
    </div>
  </div>
}
```

- [ ] **Step 5: Wire the editor into App**

Add imports for `EditorPage` and `usePokemonData` in `src/App.jsx`. Replace the open-project fallback with:

```jsx
const pokemonState = usePokemonData()

return <EditorPage
  project={session.project}
  projectDir={session.projectDir}
  saveState={session.saveState}
  pokemon={pokemonState.pokemon}
  onChange={project => dispatch({ type: 'draft-changed', project })}
  onClose={() => dispatch({ type: 'closed' })}
/>
```

Call `usePokemonData()` unconditionally near the other hooks so React hook order never changes.

- [ ] **Step 6: Add editor layout styles**

Create `src/styles/editor.css`:

```css
.studio-shell { height: 100vh; display: flex; flex-direction: column; background: var(--bg); overflow: hidden; }
.studio-header { height: 54px; display: flex; align-items: center; gap: 11px; padding: 0 16px; background: var(--nav); border-bottom: 1px solid var(--line); }
.brand-mini { width: 25px; height: 25px; border-radius: 7px; background: linear-gradient(135deg, var(--blue), var(--purple)); }
.project-pill { border: 1px solid #5d43a0; background: #211945; color: #d8cbff; border-radius: 999px; padding: 5px 10px; }
.save-state { margin-left: auto; color: #86b0ff; font-size: 12px; }
.save-state.error { color: #ff9aa4; }
.studio-workspace { min-height: 0; flex: 1; display: grid; grid-template-columns: 270px 1fr; }
.pokedex-panel { min-height: 0; display: flex; flex-direction: column; gap: 9px; padding: 12px; background: #0a0e1a; border-right: 1px solid #202b45; }
.pokedex-heading { display: flex; justify-content: space-between; }
.pokedex-list { overflow: auto; display: grid; gap: 5px; }
.pokedex-row { display: grid; grid-template-columns: 48px 1fr auto; gap: 8px; text-align: left; align-items: center; border: 1px solid transparent; border-radius: 7px; background: #0f1525; color: var(--text); padding: 9px; }
.pokedex-row span, .pokedex-row small { color: var(--muted); }
.pokedex-row.active { border-color: #396fca; background: #121f38; box-shadow: inset 3px 0 0 var(--blue); }
.official-reference { border: 1px solid #384563; border-radius: 8px; background: #11182a; padding: 10px; }
.official-reference p, .muted { color: var(--muted); }
.editor-panel { min-width: 0; display: flex; flex-direction: column; }
.stage-strip { display: flex; gap: 7px; padding: 10px; overflow-x: auto; background: #0d1322; border-bottom: 1px solid var(--line); }
.stage-chip { display: flex; border: 1px solid var(--line); border-radius: 8px; background: var(--raised); overflow: hidden; }
.stage-chip button, .stage-add { border: 0; background: transparent; color: var(--muted); padding: 9px 12px; white-space: nowrap; }
.stage-chip.active { border-color: #5d43a0; background: #17152c; }
.stage-chip.active button { color: #d8cbff; }
.stage-remove { color: #ff9aa4 !important; padding-inline: 8px !important; }
.stage-add { border: 1px dashed #52617a; border-radius: 8px; }
.editor-tabs { display: flex; background: #0e1423; border-bottom: 1px solid var(--line); }
.editor-tabs button { border: 0; border-bottom: 3px solid var(--blue); background: #111a2d; color: #82adff; padding: 11px 16px; font-weight: 800; }
.editor-canvas { min-height: 0; flex: 1; overflow: auto; padding: 20px; }
```

Append to `src/index.css`:

```css
@import './styles/editor.css';
```

- [ ] **Step 7: Run editor tests and build**

Run:

```powershell
npm test -- src/features/editor/EditorPage.test.jsx
npm run build
```

Expected: editor test passes and the production build succeeds.

- [ ] **Step 8: Commit the editor shell**

```powershell
git add src/App.jsx src/index.css src/hooks/usePokemonData.js src/features/editor/OfficialPokedex.jsx src/features/editor/EvolutionStageStrip.jsx src/features/editor/EditorPage.jsx src/features/editor/EditorPage.test.jsx src/styles/editor.css
git commit -m "feat: add read-only Pokédex and evolution stage editor"
```

## Task 9: Implement the Functional Build Tab and Base-Stat Sliders

**Files:**
- Create: `src/features/editor/StatSlider.jsx`
- Create: `src/features/editor/BuildTab.jsx`
- Create: `src/features/editor/BuildTab.test.jsx`
- Modify: `src/features/editor/EditorPage.jsx`
- Modify: `src/styles/editor.css`

- [ ] **Step 1: Write failing slider and Build-tab tests**

Create `src/features/editor/BuildTab.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBlankProject } from '../../../shared/project-schema.js'
import { BuildTab } from './BuildTab.jsx'

describe('BuildTab', () => {
  it('keeps the Attack slider and exact input synchronized and updates BST', async () => {
    const user = userEvent.setup()
    const project = createBlankProject({ name: 'Emberline' })
    const stage = project.stages[0]
    const onChange = vi.fn()
    const { rerender } = render(<BuildTab project={project} stage={stage} onChange={onChange} />)
    const exact = screen.getByLabelText('Attack exact value')
    await user.clear(exact)
    await user.type(exact, '130')
    await user.tab()
    const next = onChange.mock.calls.at(-1)[0]
    rerender(<BuildTab project={next} stage={next.stages[0]} onChange={onChange} />)
    expect(screen.getByLabelText('Attack slider')).toHaveValue('130')
    expect(screen.getByLabelText('Attack exact value')).toHaveValue(130)
    expect(screen.getByText('BST 135')).toBeInTheDocument()
  })

  it('edits blank-stage identity without changing its immutable stage ID', async () => {
    const project = createBlankProject({ name: 'Emberline' })
    const originalId = project.stages[0].stageId
    const onChange = vi.fn()
    render(<BuildTab project={project} stage={project.stages[0]} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Species name'), { target: { value: 'Embercub' } })
    const next = onChange.mock.calls.at(-1)[0]
    expect(next.stages[0]).toMatchObject({ stageId: originalId, name: 'Embercub', slug: 'embercub' })
  })
})
```

- [ ] **Step 2: Run Build-tab tests and verify failure**

Run:

```powershell
npm test -- src/features/editor/BuildTab.test.jsx
```

Expected: failure because `BuildTab.jsx` does not exist.

- [ ] **Step 3: Implement synchronized stat control**

Create `src/features/editor/StatSlider.jsx`:

```jsx
import { useEffect, useState } from 'react'

export function StatSlider({ label, value, onChange }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const updateRange = event => onChange(Number.parseInt(event.target.value, 10))
  const commitExact = () => {
    const committed = Math.min(255, Math.max(1, Number.parseInt(draft, 10) || 1))
    setDraft(String(committed))
    onChange(committed)
  }

  return <div className="stat-control">
    <label htmlFor={`${label}-range`}>{label}</label>
    <input id={`${label}-range`} aria-label={`${label} slider`} type="range" min="1" max="255" value={value} onChange={updateRange} />
    <input aria-label={`${label} exact value`} type="number" min="1" max="255" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commitExact} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </div>
}
```

- [ ] **Step 4: Implement the Build tab**

Create `src/features/editor/BuildTab.jsx`:

```jsx
import { calculateBst, setStageField, setStageStat } from '../../../shared/project-schema.js'
import { StatSlider } from './StatSlider.jsx'

const STATS = [
  ['hp', 'HP'],
  ['attack', 'Attack'],
  ['defense', 'Defense'],
  ['specialAttack', 'Sp. Atk'],
  ['specialDefense', 'Sp. Def'],
  ['speed', 'Speed'],
]

export function BuildTab({ project, stage, onChange }) {
  const field = (name, value) => onChange(setStageField(project, stage.stageId, name, value))
  return <div className="build-grid">
    <section className="editor-card identity-card">
      <h2>Identity</h2>
      <label>Species name<input value={stage.name} onChange={event => field('name', event.target.value)} /></label>
      <label>Internal slug<input value={stage.slug} onChange={event => field('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} /></label>
      <label>Category<input value={stage.category} onChange={event => field('category', event.target.value)} /></label>
      <div className="field-pair"><label>Primary type<select value={stage.types[0]} onChange={event => field('types', [event.target.value, stage.types[1]].filter(Boolean))}>{['NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON','GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'].map(type => <option key={type}>{type}</option>)}</select></label><label>Secondary type<select value={stage.types[1] || ''} onChange={event => field('types', [stage.types[0], event.target.value].filter(Boolean))}><option value="">None</option>{['NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON','GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'].map(type => <option key={type}>{type}</option>)}</select></label></div>
    </section>
    <section className="editor-card battle-card">
      <h2>Battle data</h2>
      <label>Ability<input value={stage.abilities[0] || ''} onChange={event => field('abilities', event.target.value ? [event.target.value.toUpperCase().replace(/\s+/g, '_')] : [])} /></label>
      <label>Passive<input value={stage.passive} onChange={event => field('passive', event.target.value.toUpperCase().replace(/\s+/g, '_'))} /></label>
      <div className="field-pair"><label>Height (m)<input type="number" min="0.1" step="0.1" value={stage.height} onChange={event => field('height', Number(event.target.value))} /></label><label>Weight (kg)<input type="number" min="0.1" step="0.1" value={stage.weight} onChange={event => field('weight', Number(event.target.value))} /></label></div>
    </section>
    <section className="editor-card stats-card">
      <div className="card-heading"><h2>Base Stats</h2><strong className="bst-pill">BST {calculateBst(stage)}</strong></div>
      {STATS.map(([name, label]) => <StatSlider key={name} label={label} value={stage.baseStats[name]} onChange={value => onChange(setStageStat(project, stage.stageId, name, value))} />)}
    </section>
  </div>
}
```

- [ ] **Step 5: Render the Build tab in the editor**

In `src/features/editor/EditorPage.jsx`, import `BuildTab` and replace the `editor-canvas` contents with:

```jsx
<section className="editor-canvas">
  <BuildTab project={project} stage={activeStage} onChange={onChange} />
</section>
```

- [ ] **Step 6: Style the dense Showdown sheet**

Append to `src/styles/editor.css`:

```css
.build-grid { display: grid; grid-template-columns: minmax(230px, .85fr) minmax(260px, 1fr) minmax(320px, 1.1fr); gap: 12px; align-items: start; }
.editor-card { border: 1px solid var(--line); border-radius: 9px; background: var(--surface); padding: 14px; }
.editor-card h2 { margin: 0 0 12px; font-size: 15px; }
.editor-card label { display: grid; gap: 6px; margin: 10px 0; color: #b9c6df; font-size: 12px; font-weight: 750; }
.field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.card-heading { display: flex; align-items: center; justify-content: space-between; }
.bst-pill { border: 1px solid #5d43a0; background: #281b48; color: #c4adff; border-radius: 999px; padding: 5px 9px; font-size: 12px; }
.stat-control { display: grid; grid-template-columns: 62px 1fr 62px; gap: 9px; align-items: center; margin: 11px 0; }
.stat-control label { margin: 0; }
.stat-control input[type='range'] { padding: 0; accent-color: var(--blue); }
.stat-control input[type='number'] { text-align: center; padding-inline: 6px; }
@media (max-width: 1050px) { .studio-workspace { grid-template-columns: 220px 1fr; } .build-grid { grid-template-columns: 1fr 1fr; } .stats-card { grid-column: 1 / -1; } }
```

- [ ] **Step 7: Run Build-tab, editor, and autosave tests**

Run:

```powershell
npm test -- src/features/editor/BuildTab.test.jsx src/features/editor/EditorPage.test.jsx src/hooks/useAutosave.test.jsx
```

Expected: all tests pass.

- [ ] **Step 8: Commit the functional Build tab**

```powershell
git add src/features/editor/StatSlider.jsx src/features/editor/BuildTab.jsx src/features/editor/BuildTab.test.jsx src/features/editor/EditorPage.jsx src/styles/editor.css
git commit -m "feat: add blank species Build tab and stat sliders"
```

## Task 10: Verify the Phase and Document the New Workflow

**Files:**
- Modify: `README.md`
- Modify: `BUILD_REPORT.md`

- [ ] **Step 1: Run the complete phase verification**

Run:

```powershell
npm test
npm run build
npm run check:service
npm run check-installer
git diff --check
```

Expected:

- all Vitest suites pass;
- Vite build succeeds;
- service and legacy installer syntax checks exit zero;
- `git diff --check` prints no errors.

- [ ] **Step 2: Perform a local launcher smoke test**

Run:

```powershell
$log = Join-Path $env:TEMP ("pokerogue-mod-studio-{0}.log" -f [guid]::NewGuid())
$process = Start-Process -FilePath node -ArgumentList @('server/index.js') -PassThru -WindowStyle Hidden -RedirectStandardOutput $log
try {
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 100
        $line = if (Test-Path $log) { Get-Content $log | Select-Object -First 1 } else { $null }
    } while (-not $line -and (Get-Date) -lt $deadline)
    if (-not $line) { throw 'Studio did not report a startup URL within 10 seconds.' }
    $info = $line | ConvertFrom-Json
    $response = Invoke-WebRequest -Uri $info.url -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "Studio returned HTTP $($response.StatusCode)" }
} finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id }
}
```

Expected: HTTP 200 from the production studio page.

- [ ] **Step 3: Update README with exact phase capabilities**

Add these sections to `README.md`:

````markdown
## Local Studio Launcher

Double-click `Launch.bat`. The launcher verifies Node.js, installs local dependencies when needed, builds the UI when needed, starts the localhost companion, and opens the studio in the default browser.

For development:

```powershell
npm install
npm run dev
```

## Portable Evolution-Line Projects

Choose **New Evolution Line**, enter a project name, and select a parent folder. The studio creates a self-contained project folder with `project.json`, `assets/`, and `.studio/` autosave data. Official Pokémon in the left Pokédex are read-only references. Custom stages begin blank and are edited from the stage strip and Build tab.

The Build tab supports identity, type, ability/passive, dimensions, six synchronized base-stat sliders and exact numeric inputs, and a live BST total. Changes autosave to the portable project folder.
````

- [ ] **Step 4: Replace BUILD_REPORT with current evidence**

Set `BUILD_REPORT.md` to:

```markdown
# Build report — PokéRogue Mod Studio foundation

Validated on 2026-07-13:

- `npm test`: passed
- `npm run build`: passed
- `npm run check:service`: passed
- `npm run check-installer`: passed
- Production localhost HTTP smoke test: passed
- Portable project create/open/save tests: passed
- Read-only Pokédex and blank-stage editor tests: passed
- Synchronized base-stat slider and autosave tests: passed

This phase establishes the local companion, portable project persistence, dark Showdown-inspired editor shell, official reference Pokédex, stage management, and functional Build tab. The approved subsequent plans add complete authoring depth, target discovery, and transactional delivery.
```

- [ ] **Step 5: Commit documentation and final evidence**

```powershell
git add README.md BUILD_REPORT.md
git commit -m "docs: document portable project editor foundation"
```

- [ ] **Step 6: Confirm a clean working tree and phase history**

Run:

```powershell
git status --short
git log --oneline -12
```

Expected: clean working tree and one focused commit for each completed task group.
