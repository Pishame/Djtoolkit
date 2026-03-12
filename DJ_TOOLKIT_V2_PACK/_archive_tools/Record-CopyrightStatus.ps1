# Record-CopyrightStatus.ps1
# Updates a SINGLE CSV in:
# C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks\Copyright_Checks.csv
# Columns: MP4_Name,Copyright
# Values allowed: Blocked, NotBlocked, Claimed, Unknown

Add-Type -AssemblyName System.Windows.Forms

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$checksDir = "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\Checks"
if (!(Test-Path $checksDir)) { New-Item -ItemType Directory -Path $checksDir -Force | Out-Null }

$csvPath = Join-Path $checksDir "Copyright_Checks.csv"

function Load-Table {
    if (Test-Path $csvPath) {
        return Import-Csv -Path $csvPath
    }
    return @()
}

function Save-Table($rows) {
    $rows | Sort-Object MP4_Name | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
}

Write-Host ""
Write-Host "Record copyright status -> single file"
Write-Host "CSV: $csvPath"
Write-Host ""

# Choose MP4s by folder or file
Write-Host "Pick MP4s to record:"
Write-Host "1) Pick a folder"
Write-Host "2) Pick files directly"
$pickMode = Read-Host "Enter 1 or 2"

$mp4Files = @()

if ($pickMode -eq "1") {
    $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $folderDialog.Description = "Select folder containing MP4s"
    $result = $folderDialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host "Cancelled."; return }
    $folder = $folderDialog.SelectedPath
    $mp4Files = Get-ChildItem -Path $folder -Filter *.mp4 -File -ErrorAction SilentlyContinue
} elseif ($pickMode -eq "2") {
    $openDialog = New-Object System.Windows.Forms.OpenFileDialog
    $openDialog.Title = "Select MP4 files"
    $openDialog.Filter = "MP4 Files (*.mp4)|*.mp4"
    $openDialog.Multiselect = $true
    $result = $openDialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host "Cancelled."; return }
    $mp4Files = $openDialog.FileNames | ForEach-Object { Get-Item $_ }
} else {
    Write-Host "Invalid choice."
    return
}

if (-not $mp4Files -or $mp4Files.Count -eq 0) {
    Write-Host "No MP4s found/selected."
    return
}

# Select names
$selectedNames = @()
if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
    $selected = $mp4Files |
        Select-Object @{n="MP4_Name";e={$_.BaseName}}, @{n="FullPath";e={$_.FullName}} |
        Out-GridView -Title "Select MP4s to record (multi-select, then OK)" -PassThru
    if ($selected -and $selected.Count -gt 0) {
        $selectedNames = $selected | ForEach-Object { $_.MP4_Name }
    }
} else {
    Write-Host ""
    Write-Host "Out-GridView not available. Using numbered selection."
    Write-Host "Type numbers separated by commas (example: 1,3,7) or 'all'."
    Write-Host ""
    for ($i=0; $i -lt $mp4Files.Count; $i++) {
        Write-Host ("{0}) {1}" -f ($i+1), $mp4Files[$i].BaseName)
    }
    $resp = Read-Host "Select"
    if ($resp -match '^\s*all\s*$') {
        $selectedNames = $mp4Files | ForEach-Object { $_.BaseName }
    } else {
        $idx = $resp -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ }
        foreach ($j in $idx) {
            if ($j -ge 1 -and $j -le $mp4Files.Count) {
                $selectedNames += $mp4Files[$j-1].BaseName
            }
        }
    }
}

$selectedNames = $selectedNames | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" } | Sort-Object -Unique
if (-not $selectedNames -or $selectedNames.Count -eq 0) { Write-Host "Nothing selected."; return }

# Choose status
Write-Host ""
Write-Host "Set Copyright status for selected MP4(s):"
Write-Host "1) Blocked"
Write-Host "2) NotBlocked"
Write-Host "3) Claimed"
Write-Host "4) Unknown"
$statusChoice = Read-Host "Enter 1-4"

switch ($statusChoice) {
    "1" { $status = "Blocked" }
    "2" { $status = "NotBlocked" }
    "3" { $status = "Claimed" }
    "4" { $status = "Unknown" }
    default { Write-Host "Invalid status choice."; return }
}

# Load + update
$rows = @(Load-Table)

# Build index
$map = @{}
foreach ($r in $rows) {
    $name = ($r.MP4_Name).Trim()
    if ($name -ne "" -and -not $map.ContainsKey($name)) {
        $map[$name] = $r
    }
}

foreach ($name in $selectedNames) {
    if ($map.ContainsKey($name)) {
        $map[$name].Copyright = $status
    } else {
        $rows += [pscustomobject]@{
            MP4_Name = $name
            Copyright = $status
        }
    }
}

Save-Table $rows

Write-Host ""
Write-Host ("Updated {0} item(s) -> {1}" -f $selectedNames.Count, $status)
Write-Host ("Saved: {0}" -f $csvPath)
