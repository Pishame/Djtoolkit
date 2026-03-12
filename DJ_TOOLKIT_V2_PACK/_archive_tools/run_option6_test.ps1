. "$PSScriptRoot\DJ_TOOLKIT_V2.ps1"
Set-Location $PSScriptRoot
$cfg = Load-Config
Write-Host "Starting Copyright-PickFiles test..."
Copyright-PickFiles $cfg
Write-Host "Done."