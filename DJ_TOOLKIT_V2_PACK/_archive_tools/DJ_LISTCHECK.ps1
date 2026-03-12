# DJ_LISTCHECK.ps1
# Minimal ListCheck module:
# - Build/Update new.txt from MP4 names
# - Compare new.txt against Copyright_Checks.csv (already-tested list)
# - Record copyright test result into a single CSV (Copyright_Checks.csv)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Fixed output directory (as requested)
$checksDir = "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks"
if (!(Test-Path $checksDir)) {
    New-Item -ItemType Directory -Path $checksDir -Force | Out-Null
}

$builder = Join-Path $scriptRoot "Build-MP4List.ps1"
$compare = Join-Path $scriptRoot "Compare-NewVsChecks.ps1"
$record  = Join-Path $scriptRoot "Record-CopyrightStatus.ps1"

function Pause-Me { Read-Host "Press Enter to continue" | Out-Null }

while ($true) {
    Clear-Host
    Write-Host "DJ Toolkit 2.0 - ListCheck Module"
    Write-Host "================================"
    Write-Host "1) Build/Update new.txt from MP4 names"
    Write-Host "2) Compare new.txt vs Copyright_Checks.csv (shows NeedsTesting / AlreadyTested)"
    Write-Host "3) Record copyright test result -> Copyright_Checks.csv (single file)"
    Write-Host "0) Back to Main Menu / Exit"
    Write-Host ""

    $choice = Read-Host "Choose 0-3"
    switch ($choice) {
        "1" {
            if (!(Test-Path $builder)) { Write-Host "Missing: $builder"; Pause-Me; continue }
            & $builder
            Pause-Me
        }
        "2" {
            if (!(Test-Path $compare)) { Write-Host "Missing: $compare"; Pause-Me; continue }
            & $compare
            Pause-Me
        }
        "3" {
            if (!(Test-Path $record)) { Write-Host "Missing: $record"; Pause-Me; continue }
            & $record
            Pause-Me
        }
        "0" { return }
        default { Write-Host "Invalid choice."; Pause-Me }
    }
}
