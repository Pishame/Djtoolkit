# Compare-NewVsChecks.ps1
# Shows which items in new.txt are already in Copyright_Checks.csv (tested),
# and which still need testing. Does NOT export extra files (per request).

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$checksDir = "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks"
if (!(Test-Path $checksDir)) { New-Item -ItemType Directory -Path $checksDir -Force | Out-Null }

$newPath = Join-Path $scriptRoot "new.txt"
$csvPath = Join-Path $checksDir "Copyright_Checks.csv"

if (!(Test-Path $newPath)) { throw "Missing file: $newPath (Build it with option 1 first.)" }

function Get-NamesFromTxt($path) {
    Get-Content $path -Encoding UTF8 |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -ne "" -and -not $_.StartsWith("#") } |
        Sort-Object -Unique
}

function Get-NamesFromCsv($path) {
    if (!(Test-Path $path)) { return @() }
    $rows = Import-Csv -Path $path
    $rows | ForEach-Object { ($_.MP4_Name).Trim() } | Where-Object { $_ -ne "" } | Sort-Object -Unique
}

$newNames = Get-NamesFromTxt $newPath
$testedNames = Get-NamesFromCsv $csvPath

$testedSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$testedNames)

$already = New-Object System.Collections.Generic.List[string]
$needs   = New-Object System.Collections.Generic.List[string]

foreach ($n in $newNames) {
    if ($testedSet.Contains($n)) { $already.Add($n) } else { $needs.Add($n) }
}

Write-Host ""
Write-Host ("Already tested (found in Copyright_Checks.csv): {0}" -f $already.Count)
Write-Host ("Needs testing (NOT in Copyright_Checks.csv):    {0}" -f $needs.Count)
Write-Host ""

if ($needs.Count -gt 0) {
    Write-Host "---- NeedsTesting ----"
    $needs | ForEach-Object { Write-Host $_ }
    Write-Host ""
}

if ($already.Count -gt 0) {
    Write-Host "---- AlreadyTested ----"
    $already | ForEach-Object { Write-Host $_ }
    Write-Host ""
}

Write-Host ("CSV location: {0}" -f $csvPath)
