$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'DJ_TOOLKIT_V2.lnk'
$w = New-Object -ComObject WScript.Shell
if (-not (Test-Path $lnk)) { Write-Output "Shortcut not found: $lnk"; exit 1 }
$s = $w.CreateShortcut($lnk)
Write-Output "TargetPath: $($s.TargetPath)"
Write-Output "Arguments: $($s.Arguments)"
Write-Output "WorkingDirectory: $($s.WorkingDirectory)"
Write-Output "IconLocation: $($s.IconLocation)"