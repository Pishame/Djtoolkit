$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'DJ_TOOLKIT_V2.lnk'
$w = New-Object -ComObject WScript.Shell
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell -ErrorAction SilentlyContinue).Source }
$sc = $w.CreateShortcut($lnk)
$sc.TargetPath = $pwsh
$sc.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\DJ_TOOLKIT_V2.ps1"'
$sc.WorkingDirectory = 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK'
$sc.IconLocation = $pwsh + ',0'
$sc.Save()
Write-Output "Created: $lnk"