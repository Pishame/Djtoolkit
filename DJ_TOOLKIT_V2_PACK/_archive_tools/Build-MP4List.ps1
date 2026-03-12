# Build-MP4List.ps1
# Build/Update new.txt by selecting MP4s. Stores BaseName only (no .mp4).

Add-Type -AssemblyName System.Windows.Forms

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$outFile = Join-Path $scriptRoot "new.txt"

Write-Host ""
Write-Host "Build/Update NEW list (new.txt) from MP4 names"
Write-Host "---------------------------------------------"
Write-Host "How do you want to pick MP4s?"
Write-Host "1) Pick a folder (shows all MP4s inside)"
Write-Host "2) Pick files directly (multi-select)"
$pickMode = Read-Host "Enter 1 or 2"

$mp4Files = @()

if ($pickMode -eq "1") {
    $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $folderDialog.Description = "Select the folder containing MP4s"
    $result = $folderDialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host "Cancelled."; return }

    $folder = $folderDialog.SelectedPath
    $mp4Files = Get-ChildItem -Path $folder -Filter *.mp4 -File -ErrorAction SilentlyContinue
}
elseif ($pickMode -eq "2") {
    $openDialog = New-Object System.Windows.Forms.OpenFileDialog
    $openDialog.Title = "Select MP4 files"
    $openDialog.Filter = "MP4 Files (*.mp4)|*.mp4"
    $openDialog.Multiselect = $true
    $result = $openDialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { Write-Host "Cancelled."; return }

    $mp4Files = $openDialog.FileNames | ForEach-Object { Get-Item $_ }
}
else {
    Write-Host "Invalid choice."
    return
}

if (-not $mp4Files -or $mp4Files.Count -eq 0) {
    Write-Host "No MP4s found/selected."
    return
}

# Selection UI: Out-GridView if available; fallback: numbered prompt
$selectedNames = @()

if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
    $selected = $mp4Files |
        Select-Object @{n="MP4_Name";e={$_.BaseName}}, @{n="FullPath";e={$_.FullName}} |
        Out-GridView -Title "Select MP4s to include in new.txt (multi-select, then OK)" -PassThru

    if ($selected -and $selected.Count -gt 0) {
        $selectedNames = $selected | ForEach-Object { $_.MP4_Name }
    }
} else {
    Write-Host ""
    Write-Host "Out-GridView not available. Using numbered selection."
    Write-Host "Type numbers separated by commas (example: 1,3,7) or 'all' to select everything."
    Write-Host ""

    for ($i=0; $i -lt $mp4Files.Count; $i++) {
        $n = $mp4Files[$i].BaseName
        Write-Host ("{0}) {1}" -f ($i+1), $n)
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

if (-not $selectedNames -or $selectedNames.Count -eq 0) {
    Write-Host "Nothing selected."
    return
}

$mergeChoice = Read-Host "Merge into existing new.txt? (Y/N)"
if ($mergeChoice -match '^[Yy]') {
    $existing = @()
    if (Test-Path $outFile) {
        $existing = Get-Content $outFile -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    }
    $final = ($existing + $selectedNames) | Sort-Object -Unique
    $final | Set-Content -Encoding UTF8 $outFile
} else {
    $selectedNames | Set-Content -Encoding UTF8 $outFile
}

Write-Host ""
Write-Host "Saved: $outFile"
Write-Host ("Items in new.txt: {0}" -f ((Get-Content $outFile -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }).Count))
