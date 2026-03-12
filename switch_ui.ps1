param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("classic", "new")]
  [string]$Variant
)

if ($Variant -eq "classic") {
  Write-Warning "Classic UI is disabled; forcing variant to 'new'."
  $Variant = "new"
}

$cfgPath = Join-Path $PSScriptRoot "app_config.json"
if (Test-Path $cfgPath) {
  $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
} else {
  $cfg = [pscustomobject]@{}
}

$cfg | Add-Member -NotePropertyName "ui_variant" -NotePropertyValue $Variant -Force
$cfg | ConvertTo-Json -Depth 10 | Set-Content -Path $cfgPath -Encoding UTF8

Write-Host "UI variant set to '$Variant'. Restart app_pyside.py"
