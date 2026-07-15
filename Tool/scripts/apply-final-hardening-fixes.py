from pathlib import Path
from textwrap import dedent


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f'{label} anchor count was {text.count(old)}, expected 1.')
    return text.replace(old, new, 1)


guard_path = Path('Tool/installer-runtime-guard.cjs')
guard = guard_path.read_text(encoding='utf-8')

guard = replace_once(
    guard,
    dedent('''\
    function validateContainedPath(root, relative, label, { mustExist = false } = {}) {
      const candidate = path.resolve(root, safeRelative(relative, label))
      if (!isInside(root, candidate) || candidate === root) {
        throw new Error(`Invalid ${label}: path escapes the checkout.`)
      }
      const parent = fs.realpathSync(path.dirname(candidate))
      if (!isInside(root, parent)) throw new Error(`Invalid ${label}: parent escapes the checkout.`)
      if (!fs.existsSync(candidate)) {
        if (mustExist) throw new Error(`Required ${label} is missing: ${relative}`)
        return candidate
      }
      const metadata = fs.lstatSync(candidate)
      if (metadata.isSymbolicLink()) throw new Error(`Invalid ${label}: links are not allowed.`)
      const canonical = fs.realpathSync(candidate)
      if (!isInside(root, canonical) || canonical === root) {
        throw new Error(`Invalid ${label}: canonical path escapes the checkout.`)
      }
      return canonical
    }
    '''),
    dedent('''\
    function nearestExistingParent(root, candidate, label) {
      let current = path.dirname(candidate)
      while (!fs.existsSync(current)) {
        if (!isInside(root, current) || current === root) {
          throw new Error(`Invalid ${label}: parent escapes the checkout.`)
        }
        const parent = path.dirname(current)
        if (parent === current) throw new Error(`Invalid ${label}: parent escapes the checkout.`)
        current = parent
      }
      const metadata = fs.lstatSync(current)
      if (metadata.isSymbolicLink()) throw new Error(`Invalid ${label}: parent links are not allowed.`)
      const canonical = fs.realpathSync(current)
      if (!isInside(root, canonical)) throw new Error(`Invalid ${label}: parent escapes the checkout.`)
      return canonical
    }

    function validateContainedPath(root, relative, label, { mustExist = false } = {}) {
      const candidate = path.resolve(root, safeRelative(relative, label))
      if (!isInside(root, candidate) || candidate === root) {
        throw new Error(`Invalid ${label}: path escapes the checkout.`)
      }
      nearestExistingParent(root, candidate, label)
      if (!fs.existsSync(candidate)) {
        if (mustExist) throw new Error(`Required ${label} is missing: ${relative}`)
        return candidate
      }
      const metadata = fs.lstatSync(candidate)
      if (metadata.isSymbolicLink()) throw new Error(`Invalid ${label}: links are not allowed.`)
      const canonical = fs.realpathSync(candidate)
      if (!isInside(root, canonical) || canonical === root) {
        throw new Error(`Invalid ${label}: canonical path escapes the checkout.`)
      }
      return canonical
    }
    '''),
    'contained-path',
)

guard = replace_once(
    guard,
    dedent('''\
    function validateTransactionState(root) {
      const mods = path.join(root, STATE_DIR, 'mods')
      if (fs.existsSync(mods)) {
        for (const owner of fs.readdirSync(mods)) {
          const file = path.join(mods, owner, 'journal.json')
          if (fs.existsSync(file)) validateJournal(root, file)
        }
      }
      const updates = path.join(root, STATE_DIR, 'updates')
      if (fs.existsSync(updates)) {
        for (const owner of fs.readdirSync(updates)) {
          const file = path.join(updates, owner, 'state.json')
          if (fs.existsSync(file)) validateUpdateState(root, file)
        }
      }
    }
    '''),
    dedent('''\
    function validateTransactionState(root) {
      const mods = path.join(root, STATE_DIR, 'mods')
      if (fs.existsSync(mods)) {
        validateContainedPath(root, path.relative(root, mods), 'mod state directory', { mustExist: true })
        for (const owner of fs.readdirSync(mods)) {
          const ownerDirectory = path.join(mods, owner)
          validateContainedPath(root, path.relative(root, ownerDirectory), 'mod owner directory', { mustExist: true })
          const file = path.join(ownerDirectory, 'journal.json')
          if (fs.existsSync(file)) {
            validateContainedPath(root, path.relative(root, file), 'journal file', { mustExist: true })
            validateJournal(root, file)
          }
        }
      }
      const updates = path.join(root, STATE_DIR, 'updates')
      if (fs.existsSync(updates)) {
        validateContainedPath(root, path.relative(root, updates), 'update state directory', { mustExist: true })
        for (const owner of fs.readdirSync(updates)) {
          const ownerDirectory = path.join(updates, owner)
          validateContainedPath(root, path.relative(root, ownerDirectory), 'update owner directory', { mustExist: true })
          const file = path.join(ownerDirectory, 'state.json')
          if (fs.existsSync(file)) {
            validateContainedPath(root, path.relative(root, file), 'update state file', { mustExist: true })
            validateUpdateState(root, file)
          }
        }
      }
    }
    '''),
    'transaction-state',
)

guard = replace_once(
    guard,
    dedent('''\
      for (const relative of ['src', 'public', 'assets']) {
        const directory = path.join(root, relative)
        if (fs.existsSync(directory)) scanForLinks(root, directory)
      }
    '''),
    dedent('''\
      for (const relative of ['src', 'public', 'assets']) {
        const directory = path.join(root, relative)
        if (fs.existsSync(directory)) {
          validateContainedPath(root, relative, `target ${relative} directory`, { mustExist: true })
          scanForLinks(root, directory)
        }
      }
    '''),
    'top-level-target-directory',
)

guard_path.write_bytes(guard.encode('utf-8'))

target_path = Path('Tool/server/target-discovery.js')
target = target_path.read_text(encoding='utf-8')
target = replace_once(
    target,
    dedent('''\
          execFileAsync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
            encoding: 'utf8',
            windowsHide: true,
          }),
        ])
        return {
          available: true,
          revision: revision.trim(),
          clean: !statusOutput.trim(),
          changedPaths: parseStatusPaths(statusOutput),
        }
    '''),
    dedent('''\
          execFileAsync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], {
            encoding: 'utf8',
            windowsHide: true,
          }),
        ])
        const changedPaths = parseStatusPaths(statusOutput).filter(relative => (
          relative !== '.pokerogue-mod-studio'
          && !relative.startsWith('.pokerogue-mod-studio/')
        ))
        return {
          available: true,
          revision: revision.trim(),
          clean: changedPaths.length === 0,
          changedPaths,
        }
    '''),
    'git-status',
)
target_path.write_bytes(target.encode('utf-8'))
