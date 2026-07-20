import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const toolRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const launcherPath = path.join(toolRoot, 'Launch-Updating.bat')
let launcher = await readFile(launcherPath, 'utf8')

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Could not find ${label}.`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Found ${label} more than once.`)
  return source.slice(0, first) + after + source.slice(first + before.length)
}

launcher = replaceOnce(
  launcher,
  '        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!PRMS_TEMP_PS!" -ToolPath "%~dp0"',
  '        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!PRMS_TEMP_PS!"',
  'the updater PowerShell invocation',
)

launcher = replaceOnce(
  launcher,
  `param(\n    [Parameter(Mandatory = $true)]\n    [string]$ToolPath\n)`,
  `param(\n    [switch]$ValidateToolPathOnly\n)`,
  'the updater parameter block',
)

launcher = replaceOnce(
  launcher,
  `$toolRoot = [IO.Path]::GetFullPath($ToolPath).TrimEnd([char[]]'\\/')`,
  `$toolRoot = (Resolve-Path -LiteralPath '.').ProviderPath\nif ($ValidateToolPathOnly) {\n    Write-Output $toolRoot\n    exit 0\n}`,
  'the updater Tool root initialization',
)

await writeFile(launcherPath, launcher, 'utf8')
console.log('Patched Launch-Updating.bat to resolve Tool/ from the launcher working directory.')
