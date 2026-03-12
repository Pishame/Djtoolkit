$path = Join-Path $PSScriptRoot 'DJ_TOOLKIT_V2.ps1'
$s = Get-Content $path -Raw
$opens = ($s.ToCharArray() | Where-Object { $_ -eq '{' } | Measure-Object).Count
$closes = ($s.ToCharArray() | Where-Object { $_ -eq '}' } | Measure-Object).Count
Write-Host "Opens: $opens ; Closes: $closes"
# Print a few lines around suspicious regions: show line numbers where braces occur
$lines = Get-Content $path
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '\{' -or $lines[$i] -match '\}') { Write-Host ("{0,5}: {1}" -f ($i+1), $lines[$i]) }
}