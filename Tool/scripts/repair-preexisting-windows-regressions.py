from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    value = path.read_text(encoding='utf-8')
    if old not in value:
        raise SystemExit(f'{label} marker was not found in {path}.')
    path.write_text(value.replace(old, new, 1), encoding='utf-8', newline='\n')


root = Path(__file__).resolve().parents[2]

app_test = root / 'Tool' / 'server' / 'app.test.js'
replace_once(
    app_test,
    """    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-STA', '-Command'])
    expect(args[3]).toContain(\"$dialog.Description = 'Choose Trainer''s folder'\")
    expect(args[3]).toContain('$dialog.ShowNewFolderButton = $true')
    expect(args[3]).toMatch(/DialogResult.*OK/)
""",
    """    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-STA', '-Command'])
    expect(args[4]).toContain(\"$dialog.Description = 'Choose Trainer''s folder'\")
    expect(args[4]).toContain('$dialog.ShowNewFolderButton = $true')
    expect(args[4]).toContain('$dialog.ShowDialog($owner)')
    expect(args[4]).toMatch(/DialogResult.*OK/)
""",
    'folder-picker argument expectation',
)

guard = root / 'Tool' / 'installer-runtime-guard.cjs'
replace_once(
    guard,
    """function validateContainedPath(root, relative, label, { mustExist = false } = {}) {
""",
    """function nearestExistingParent(candidate) {
  let current = path.dirname(candidate)
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`Could not resolve an existing parent for ${candidate}.`)
    current = parent
  }
  return fs.realpathSync(current)
}

function validateContainedPath(root, relative, label, { mustExist = false } = {}) {
""",
    'nearest existing parent helper',
)
replace_once(
    guard,
    """  const parent = fs.realpathSync(path.dirname(candidate))
""",
    """  const parent = nearestExistingParent(candidate)
""",
    'prepared destination parent resolution',
)
replace_once(
    guard,
    """function scanForLinks(root, directory) {
  if (!fs.existsSync(directory)) return
""",
    """function scanForLinks(root, directory) {
  if (!fs.existsSync(directory)) return
  if (directory !== root) {
    const metadata = fs.lstatSync(directory)
    const canonical = fs.realpathSync(directory)
    if (metadata.isSymbolicLink() || path.resolve(canonical).toLowerCase() !== path.resolve(directory).toLowerCase()) {
      throw new Error(`Refusing target link or junction: ${path.relative(root, directory)}`)
    }
  }
""",
    'top-level junction detection',
)
replace_once(
    guard,
    """  if (fs.existsSync(mods)) {
    for (const owner of fs.readdirSync(mods)) {
      const file = path.join(mods, owner, 'journal.json')
""",
    """  if (fs.existsSync(mods)) {
    validateContainedPath(root, path.relative(root, mods), 'mods state directory', { mustExist: true })
    for (const owner of fs.readdirSync(mods)) {
      validateContainedPath(root, path.relative(root, path.join(mods, owner)), 'mod owner directory', { mustExist: true })
      const file = path.join(mods, owner, 'journal.json')
""",
    'linked mod-state containment',
)
replace_once(
    guard,
    """  if (fs.existsSync(updates)) {
    for (const owner of fs.readdirSync(updates)) {
      const file = path.join(updates, owner, 'state.json')
""",
    """  if (fs.existsSync(updates)) {
    validateContainedPath(root, path.relative(root, updates), 'updates state directory', { mustExist: true })
    for (const owner of fs.readdirSync(updates)) {
      validateContainedPath(root, path.relative(root, path.join(updates, owner)), 'update owner directory', { mustExist: true })
      const file = path.join(updates, owner, 'state.json')
""",
    'linked update-state containment',
)

discovery = root / 'Tool' / 'server' / 'target-discovery.js'
replace_once(
    discovery,
    """      execFileAsync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
""",
    """      execFileAsync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], {
""",
    'untracked Git status collection',
)
replace_once(
    discovery,
    """    return {
      available: true,
      revision: revision.trim(),
      clean: !statusOutput.trim(),
      changedPaths: parseStatusPaths(statusOutput),
    }
""",
    """    const changedPaths = parseStatusPaths(statusOutput).filter(candidate => (
      candidate !== '.pokerogue-mod-studio'
      && !candidate.startsWith('.pokerogue-mod-studio/')
    ))
    return {
      available: true,
      revision: revision.trim(),
      clean: changedPaths.length === 0,
      changedPaths,
    }
""",
    'filtered Git cleanliness result',
)
