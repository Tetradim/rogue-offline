import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const defaultExecFileAsync = promisify(execFile)

function escapePowerShellSingleQuoted(value) {
  return String(value).replaceAll("'", "''")
}

export async function selectWindowsFolder(
  description = 'Choose a folder',
  { execFileAsync = defaultExecFileAsync } = {},
) {
  const escapedDescription = escapePowerShellSingleQuoted(description)
  const command = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = '${escapedDescription}'`,
    '$dialog.ShowNewFolderButton = $true',
    'try {',
    '  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '    [Console]::Out.Write($dialog.SelectedPath)',
    '  }',
    '} finally {',
    '  $dialog.Dispose()',
    '}',
  ].join('\n')

  const { stdout = '' } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', command],
    { windowsHide: true, encoding: 'utf8' },
  )
  return stdout.trim()
}
