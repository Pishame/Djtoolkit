# DJ_COPYRIGHT_BUILDER.ps1
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("PickFiles","FixedFolder")]
  [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Base     = Join-Path $env:USERPROFILE "Downloads\DJDownloads"
$MP4Dir   = Join-Path $Base "MP4"
$ChecksDir = Join-Path $Base "Checks"
$AlreadyCheckedDir = Join-Path $Base "Already_Checked"

function Banner {
  Clear-Host
  Write-Host "===============================================================================" -ForegroundColor Green
  Write-Host "  DJ TOOLKIT V2.1  -  Copyright Builder" -ForegroundColor Green
  Write-Host "===============================================================================" -ForegroundColor Green
}

function Pause-User([string]$msg="Press Enter to continue..."){ Write-Host ""; Read-Host $msg | Out-Null }

function Ensure-Dir([string]$p){
  if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Test-Cmd([string]$name){ return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Require-Tools {
  if (-not (Test-Cmd "ffmpeg"))  { throw "ffmpeg not found in PATH." }
  if (-not (Test-Cmd "ffprobe")) { throw "ffprobe not found in PATH (comes with ffmpeg)." }
}

function Next-SessionFolder {
  $date = (Get-Date).ToString("yyyy-MM-dd")
  for ($i=1; $i -le 99; $i++){
    $tag = "{0}_{1:00}" -f $date, $i
    $p = Join-Path $ChecksDir $tag
    if (-not (Test-Path -LiteralPath $p)) { return $p }
  }
  return (Join-Path $ChecksDir ($date + "_99"))
}

function Ask-ClipLengthSec {
  Banner
  Write-Host ""
  Write-Host "Clip length" -ForegroundColor Cyan
  Write-Host "  [1] 60 seconds"
  Write-Host "  [2] 30 seconds"
  Write-Host "  [3] 20 seconds"
  Write-Host "  [4] Custom"
  Write-Host "  [B] Back"
  Write-Host ""
  $c = Read-Host "Choose (default: 60s)"
  if ($c -match '^\s*[bB]\s*$') { return $null }
  switch ($c) {
    "1" { return 60 }
    "2" { return 30 }
    "3" { return 20 }
    "4" {
      while ($true) {
        $x = Read-Host "Enter seconds (1 - 600)"
        $n = 0
        if ([int]::TryParse($x, [ref]$n) -and $n -ge 1 -and $n -le 600) { return $n }
        Write-Host "Invalid number." -ForegroundColor Yellow
      }
    }
    default { return 60 }
  }
}

function Ask-ClipSection {
  Banner
  Write-Host ""
  Write-Host "Which part of the video?" -ForegroundColor Cyan
  Write-Host "  [1] Start"
  Write-Host "  [2] Middle"
  Write-Host "  [3] End"
  Write-Host "  [B] Back"
  Write-Host ""
  $c = Read-Host "Choose (default: Start)"
  if ($c -match '^\s*[bB]\s*$') { return $null }
  switch ($c) {
    "2" { return "Middle" }
    "3" { return "End" }
    default { return "Start" }
  }
}

function Ask-YesNo([string]$prompt, [bool]$defaultYes=$true){
  $def = $(if ($defaultYes) {"Y"} else {"N"})
  $x = Read-Host ("{0} (Y/N) [Default: {1}]" -f $prompt, $def)
  if ([string]::IsNullOrWhiteSpace($x)) { return $defaultYes }
  return ($x.Trim().ToUpper().StartsWith("Y"))
}

function Pick-MP4Files {
  Add-Type -AssemblyName System.Windows.Forms
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Title = "Select MP4 files"
  $dlg.Filter = "MP4 Files (*.mp4)|*.mp4"
  $dlg.Multiselect = $true
  $res = $dlg.ShowDialog()
  if ($res -ne [System.Windows.Forms.DialogResult]::OK) { return @() }
  return @($dlg.FileNames | ForEach-Object { Get-Item -LiteralPath $_ })
}

function Get-AlreadyCheckedSet([string]$csvPath){
  $set = [System.Collections.Generic.HashSet[string]]::new()
  if (-not (Test-Path -LiteralPath $csvPath)) { return $set }
  try {
    $rows = Import-Csv -LiteralPath $csvPath
    foreach ($r in $rows) {
      if ($null -eq $r.MP4_Name) { continue }
      $status = ($r.Copyright | ForEach-Object { "$_".Trim() })
      if ($status -and $status -ne "Unknown") {
        [void]$set.Add($r.MP4_Name.Trim())
      }
    }
  } catch {
    # If CSV is malformed, treat as "no CSV"
  }
  return $set
}

function Upsert-CsvRow([string]$csvPath, [string]$name, [string]$status){
  $rows = @()
  if (Test-Path -LiteralPath $csvPath) {
    try { $rows = @(Import-Csv -LiteralPath $csvPath) } catch { $rows = @() }
  }
  $found = $false
  for ($i=0; $i -lt $rows.Count; $i++){
    if ($rows[$i].MP4_Name -eq $name) { $rows[$i].Copyright = $status; $found = $true; break }
  }
  if (-not $found){
    $rows += [pscustomobject]@{ MP4_Name=$name; Copyright=$status }
  }
  $rows | Sort-Object MP4_Name | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
}

function Ensure-NamesInCsv([string]$csvPath, [string[]]$names){
  if (-not (Test-Path -LiteralPath $csvPath)) {
    $names | Sort-Object | ForEach-Object { [pscustomobject]@{ MP4_Name=$_; Copyright="Unknown" } } |
      Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
    return
  }
  foreach ($n in $names){ Upsert-CsvRow $csvPath $n "Unknown" }
}

function Compute-StartTime([string]$file, [int]$clipLen, [string]$section){
  $dur = 0.0
  try {
    $durStr = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 -- "$file"
    [double]::TryParse($durStr, [ref]$dur) | Out-Null
  } catch { $dur = 0.0 }
  if ($dur -le 0) { return 0 }
  switch ($section) {
    "End"    { return [Math]::Max(0, [int]($dur - $clipLen)) }
    "Middle" { return [Math]::Max(0, [int](($dur/2) - ($clipLen/2))) }
    default  { return 0 }
  }
}

# MAIN
try {
  Require-Tools
  Ensure-Dir $Base
  Ensure-Dir $MP4Dir
  Ensure-Dir $ChecksDir
  Ensure-Dir $AlreadyCheckedDir

  $clipLen = Ask-ClipLengthSec
  if ($null -eq $clipLen) { return }

  $section = Ask-ClipSection
  if ($null -eq $section) { return }

  $fastUpload = Ask-YesNo "Enable Fast Upload Compression?" $true

  $files = @()
  if ($Mode -eq "PickFiles") {
    $files = Pick-MP4Files
  } else {
    $files = @(Get-ChildItem -LiteralPath $MP4Dir -Filter *.mp4 -File -ErrorAction SilentlyContinue)
  }

  if (-not $files -or $files.Count -eq 0) {
    Banner
    Write-Host "No MP4s selected/found." -ForegroundColor Yellow
    Pause-User
    return
  }

  # Precheck against CSV (if exists)
  $csvPath = Join-Path $ChecksDir "Copyright_Checks.csv"
  $alreadySet = Get-AlreadyCheckedSet $csvPath

  $toProcess = New-Object System.Collections.Generic.List[object]
  $moved = 0
  foreach ($f in $files) {
    $name = $f.Name
    if ($alreadySet.Contains($name)) {
      try {
        $dest = Join-Path $AlreadyCheckedDir $name
        Move-Item -LiteralPath $f.FullName -Destination $dest -Force
        $moved++
      } catch {
        # If move fails, just skip processing it
      }
    } else {
      $toProcess.Add($f) | Out-Null
    }
  }

  Banner
  if ($moved -gt 0) { Write-Host ("Moved already-checked MP4s to Already_Checked: {0}" -f $moved) -ForegroundColor DarkGray }

  if ($toProcess.Count -eq 0) {
    Write-Host "Nothing new to test (all selected MP4s already checked)." -ForegroundColor Yellow
    Pause-User
    return
  }

  $sessionDir = Next-SessionFolder
  Ensure-Dir $sessionDir

  $outName = "Copyright_Test_{0}.mp4" -f (Split-Path -Leaf $sessionDir)
  $outPath = Join-Path $sessionDir $outName

  # temp clips
  $tmpRoot = Join-Path $env:TEMP ("DJTK_CLIPS_" + (Split-Path -Leaf $sessionDir))
  Ensure-Dir $tmpRoot

  $skippedPath = Join-Path $sessionDir "Skipped_Clips.txt"
  if (Test-Path -LiteralPath $skippedPath) { Remove-Item -LiteralPath $skippedPath -Force -ErrorAction SilentlyContinue }

  $clipList = New-Object System.Collections.Generic.List[string]
  $idx = 0
  foreach ($f in $toProcess) {
    $idx++
    $clipFile = Join-Path $tmpRoot ("{0:000}_clip.mp4" -f $idx)
    $start = Compute-StartTime $f.FullName $clipLen $section
    try {
      # Accurate seek to avoid broken starts; still stream-copy for speed
      & ffmpeg -hide_banner -loglevel error -y -i $f.FullName -ss $start -t $clipLen -c copy $clipFile
      if (-not (Test-Path -LiteralPath $clipFile)) { throw "clip not created" }
      $clipList.Add($clipFile) | Out-Null
    } catch {
      Add-Content -Path $skippedPath -Value ("SKIP: {0}  ({1})" -f $f.Name, $_.Exception.Message)
    }
  }

  if ($clipList.Count -eq 0) {
    Banner
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host "No clips could be created. Check Skipped_Clips.txt for details." -ForegroundColor Yellow
    Pause-User
    return
  }

  # Write concat list
  $listPath = Join-Path $tmpRoot "concat_list.txt"
  $lines = $clipList | ForEach-Object { "file '{0}'" -f ($_.Replace("'", "''")) }
  $lines | Set-Content -LiteralPath $listPath -Encoding UTF8

  Banner
  Write-Host "Merging + encoding (YouTube-safe)..." -ForegroundColor Green

  if ($fastUpload) {
    $vf = "scale=1280:-2,setsar=1,fps=30"
    $crf = 24
  } else {
    $vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=30"
    $crf = 18
  }

  # Try a fast concat copy first (very quick if clips are codec-compatible),
  # otherwise fall back to a safe re-encode (YouTube-friendly).
  & ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $listPath -c copy $outPath
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Concat copy failed, falling back to re-encode..." -ForegroundColor Yellow
    & ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $listPath `
      -fflags +genpts `
      -vf $vf `
      -af "aresample=async=1:first_pts=0" `
      -c:v libx264 -preset veryfast -crf $crf -pix_fmt yuv420p -r 30 -g 60 -keyint_min 60 -sc_threshold 0 `
      -c:a aac -b:a 192k `
      -movflags +faststart $outPath
    if ($LASTEXITCODE -ne 0) { throw "Final encode failed." }
  }

  # Ensure CSV has names
  $names = $toProcess | ForEach-Object { $_.Name }
  Ensure-NamesInCsv $csvPath $names

  Write-Host ""
  Write-Host ("DONE: {0}" -f $outPath) -ForegroundColor Green
  Write-Host ("Names saved to: {0}" -f $csvPath) -ForegroundColor DarkGray

  # Done checking prompt (optional)
  $doneNow = Ask-YesNo "Are you done checking copyright RIGHT NOW?" $false
  if ($doneNow) {
    $anyBlocked = Ask-YesNo "Were any blocked?" $false
    if (-not $anyBlocked) {
      foreach ($n in $names) { Upsert-CsvRow $csvPath $n "NotBlocked" }
      Write-Host "CSV updated." -ForegroundColor Green
    } else {
      Banner
      Write-Host "Type/paste the BLOCKED filenames (one per line)."
      Write-Host "When finished, enter an empty line."
      $blocked = New-Object System.Collections.Generic.HashSet[string]
      while ($true) {
        $l = Read-Host
        if ([string]::IsNullOrWhiteSpace($l)) { break }
        [void]$blocked.Add($l.Trim())
      }
      foreach ($n in $names) {
        if ($blocked.Contains($n)) { Upsert-CsvRow $csvPath $n "Blocked" }
        else { Upsert-CsvRow $csvPath $n "NotBlocked" }
      }
      Write-Host "CSV updated." -ForegroundColor Green
    }
  }

} finally {
  # cleanup temp clips folder quietly
  try { if ($tmpRoot -and (Test-Path -LiteralPath $tmpRoot)) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue } } catch {}
  Pause-User
}
