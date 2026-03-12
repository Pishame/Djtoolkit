Write-Output 'MP4_TO_TEST files:'
Get-ChildItem -Path 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST' -File -ErrorAction SilentlyContinue | ForEach-Object { Write-Output (' - ' + $_.Name) }
Write-Output ''
$First60 = Join-Path $env:USERPROFILE 'Downloads\DJDownloads\First60'
Write-Output "Downloads DJDownloads\First60: $First60"
if (Test-Path $First60) { Get-ChildItem -Path $First60 -File -Recurse | ForEach-Object { Write-Output (" - " + $_.FullName + " (" + $_.Length + " bytes)") } } else { Write-Output ' (not found)' }
Write-Output ''
$tmp = Join-Path $PSScriptRoot 'tmp'
Write-Output "Workspace tmp folder: $tmp"
if (Test-Path $tmp) { Get-ChildItem -Path $tmp -Recurse | ForEach-Object { Write-Output (" - " + $_.FullName + " (" + $_.Length + " bytes)") } } else { Write-Output ' (no tmp folder)' }
Write-Output ''
$log = Join-Path $PSScriptRoot 'DJ_TOOLKIT_V2.log'
Write-Output "Log file: $log"
if (Test-Path $log) { Get-Content $log -Tail 200 | ForEach-Object { Write-Output ('LOG: ' + $_) } } else { Write-Output ' (no log file)' }