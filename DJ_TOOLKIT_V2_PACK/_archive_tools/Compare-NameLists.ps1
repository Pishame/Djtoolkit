# Compare-NameLists.ps1 (CSV export to Checks folder)
# Compares new.txt vs tested.txt (exact match on MP4 base-name).
# Exports:
# - NeedsTesting.csv
# - AlreadyTested.csv
# - ComparisonResults.csv
# All to: C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks

$ErrorActionPreference = "Stop"
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

$testedPath = Join-Path $base "tested.txt"
$newPath    = Join-Path $base "new.txt"

if (!(Test-Path $testedPath)) { throw "Missing file: $testedPath" }
if (!(Test-Path $newPath))    { throw "Missing file: $newPath" }

function Get-NormalizedList($path) {
    Get-Content $path -Encoding UTF8 |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -ne "" -and -not $_.StartsWith("#") } |
        Sort-Object -Unique
}

$tested = Get-NormalizedList $testedPath
$new    = Get-NormalizedList $newPath

$testedSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$tested)

$already = New-Object System.Collections.Generic.List[string]
$needs   = New-Object System.Collections.Generic.List[string]

foreach ($item in $new) {
    if ($testedSet.Contains($item)) { $already.Add($item) }
    else { $needs.Add($item) }
}

$checksDir = "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks"
New-Item -ItemType Directory -Force -Path $checksDir | Out-Null

# CSV exports (columns focused on copyright test workflow)
$needsCsv   = Join-Path $checksDir "NeedsTesting.csv"
$alreadyCsv = Join-Path $checksDir "AlreadyTested.csv"
$allCsv     = Join-Path $checksDir "ComparisonResults.csv"

$needs   | ForEach-Object { [pscustomobject]@{ MP4_Name = $_; Status = "NeedsTesting" } } |
    Export-Csv -NoTypeInformation -Encoding UTF8 -Path $needsCsv

$already | ForEach-Object { [pscustomobject]@{ MP4_Name = $_; Status = "AlreadyTested" } } |
    Export-Csv -NoTypeInformation -Encoding UTF8 -Path $alreadyCsv

@(
    ($needs   | ForEach-Object { [pscustomobject]@{ MP4_Name = $_; Status = "NeedsTesting" } })
    ($already | ForEach-Object { [pscustomobject]@{ MP4_Name = $_; Status = "AlreadyTested" } })
) | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $allCsv

Write-Host ""
Write-Host "Done."
Write-Host ("Already tested: {0}" -f $already.Count)
Write-Host ("Needs testing:  {0}" -f $needs.Count)
Write-Host ""
Write-Host "CSV saved to:"
Write-Host " - $needsCsv"
Write-Host " - $alreadyCsv"
Write-Host " - $allCsv"
