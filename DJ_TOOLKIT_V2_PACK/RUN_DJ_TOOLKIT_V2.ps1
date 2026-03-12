# PowerShell-native launcher for DJ_TOOLKIT_V2
# Starts the main toolkit in a new PowerShell window and sets DJ_TOOLKIT_RUN=1.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script = Join-Path $ScriptDir 'DJ_TOOLKIT_V2.ps1'
$env:DJ_TOOLKIT_RUN = '1'

# Prefer PowerShell Core (pwsh) if available, otherwise use Windows PowerShell.
if (Get-Command pwsh -ErrorAction SilentlyContinue) {
  Start-Process pwsh -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy','Bypass',
    '-NoExit',
    '-File', $Script
  ) -WorkingDirectory $ScriptDir -WindowStyle Maximized
} else {
  Start-Process powershell -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy','Bypass',
    '-NoExit',
    '-File', $Script
  ) -WorkingDirectory $ScriptDir -WindowStyle Maximized
}

exit 0
