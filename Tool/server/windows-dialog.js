import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const defaultExecFileAsync = promisify(execFile)

export const FOLDER_PICKER_TIMEOUT_MS = 5 * 60 * 1000

function escapePowerShellSingleQuoted(value) {
  return String(value).replaceAll("'", "''")
}

function folderPickerTimeout(cause) {
  return Object.assign(
    new Error('The Windows folder picker did not return. Close any hidden picker window and try again.'),
    { statusCode: 408, cause },
  )
}

export async function selectWindowsFolder(
  description = 'Choose a folder',
  { execFileAsync = defaultExecFileAsync } = {},
) {
  const escapedDescription = escapePowerShellSingleQuoted(description)
  const command = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '[System.Windows.Forms.Application]::EnableVisualStyles()',
    '$owner = New-Object System.Windows.Forms.Form',
    "$owner.Text = 'PokéRogue Mod Studio'",
    '$owner.ShowInTaskbar = $false',
    '$owner.TopMost = $true',
    '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
    '$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow',
    '$owner.Size = New-Object System.Drawing.Size(1, 1)',
    '$owner.Opacity = 0.01',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$dialog.Description = '${escapedDescription}'`,
    '$dialog.ShowNewFolderButton = $true',
    'try {',
    '  $owner.Show()',
    '  $owner.Activate()',
    '  $owner.BringToFront()',
    '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {',
    '    [Console]::Out.Write($dialog.SelectedPath)',
    '  }',
    '} finally {',
    '  $dialog.Dispose()',
    '  $owner.Close()',
    '  $owner.Dispose()',
    '}',
  ].join('\n')

  try {
    const { stdout = '' } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-STA', '-Command', command],
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: FOLDER_PICKER_TIMEOUT_MS,
        killSignal: 'SIGTERM',
        maxBuffer: 64 * 1024,
      },
    )
    return stdout.trim()
  } catch (error) {
    if (error?.killed || error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM') {
      throw folderPickerTimeout(error)
    }
    throw error
  }
}
