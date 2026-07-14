import { execFile } from 'node:child_process'
import { access, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function verificationError(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { statusCode: 422 })
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

function packageCommand(packageManager) {
  const suffix = process.platform === 'win32' ? '.cmd' : ''
  if (packageManager === 'pnpm') return `pnpm${suffix}`
  if (packageManager === 'yarn') return `yarn${suffix}`
  return `npm${suffix}`
}

export async function verifyTargetBuild({
  analysis,
  manifestPath,
  installerPath,
  nodePath = process.execPath,
  runProcess = (file, args, options) => execFileAsync(file, args, options),
} = {}) {
  if (!analysis?.git?.available || !analysis.git.clean || !analysis.revision) {
    throw verificationError('Isolated preflight requires a clean Git checkout with a resolved revision.')
  }
  if (!analysis.buildScript) throw verificationError('The selected checkout has no typecheck or build script.')
  const targetModules = path.join(analysis.targetDir, 'node_modules')
  if (!await exists(targetModules)) throw verificationError('Install the target checkout dependencies before delivery.')

  const temporaryParent = await mkdtemp(path.join(tmpdir(), 'pokerogue-mod-preflight-'))
  const worktree = path.join(temporaryParent, 'checkout')
  let worktreeAdded = false
  const outputs = []
  const options = {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }
  try {
    const added = await runProcess('git', ['-C', analysis.targetDir, 'worktree', 'add', '--detach', worktree, analysis.revision], options)
    worktreeAdded = true
    outputs.push(added.stdout || '', added.stderr || '')
    await symlink(targetModules, path.join(worktree, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')

    const installed = await runProcess(nodePath, [installerPath, '--manifest', manifestPath, '--project', worktree], options)
    outputs.push(installed.stdout || '', installed.stderr || '')

    const command = packageCommand(analysis.packageManager)
    const args = analysis.packageManager === 'yarn'
      ? [analysis.buildScript]
      : ['run', analysis.buildScript]
    const built = await runProcess(command, args, { ...options, cwd: worktree })
    outputs.push(built.stdout || '', built.stderr || '')
    return outputs.join('').trim()
  } catch (error) {
    const output = `${outputs.join('')}${error.stdout || ''}${error.stderr || ''}`.trim()
    throw verificationError(output || error.message || 'Isolated target build failed.', error)
  } finally {
    if (worktreeAdded) {
      try {
        await runProcess('git', ['-C', analysis.targetDir, 'worktree', 'remove', '--force', worktree], options)
      } catch {
        await rm(worktree, { recursive: true, force: true }).catch(() => {})
      }
    }
    await rm(temporaryParent, { recursive: true, force: true }).catch(() => {})
  }
}
