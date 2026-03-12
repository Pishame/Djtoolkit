$responses = @('','1','')
$idx = 0
function Read-Host { param($prompt) ; if ($idx -lt $responses.Count) { $r = $responses[$idx]; $idx++; return $r } else { return '' } }
. "$PSScriptRoot\DJ_TOOLKIT_V2.ps1"
Set-Location $PSScriptRoot
$cfg = Load-Config
Write-Host "Starting automated Copyright-PickFiles test..."
Copyright-PickFiles $cfg
Write-Host "Done."