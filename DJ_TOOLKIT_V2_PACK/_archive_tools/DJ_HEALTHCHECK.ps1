Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Base   = Join-Path $env:USERPROFILE "Downloads\DJDownloads"
$MP4Dir = Join-Path $Base "MP4"
$MP3Dir = Join-Path $Base "MP3"
$Checks = Join-Path $Base "Checks"
$Temp60 = Join-Path $Base "First60"
$Already = Join-Path $Base "Already_Checked"

function Ensure-Dir($p){ if(-not (Test-Path $p)){ New-Item -ItemType Directory -Path $p | Out-Null } }
function CmdExists($n){ $null -ne (Get-Command $n -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "DJ TOOLKIT - Health Check" -ForegroundColor Green
Write-Host "==========================" -ForegroundColor Green
Write-Host ""

# Folders
foreach($d in @($Base,$MP4Dir,$MP3Dir,$Checks,$Temp60,$Already)){
  try { Ensure-Dir $d; Write-Host ("[OK] Folder: {0}" -f $d) -ForegroundColor DarkGray }
  catch { Write-Host ("[FAIL] Folder: {0}" -f $d) -ForegroundColor Red }
}

Write-Host ""

# Tools
$tools = @("ffmpeg","yt-dlp","python","ffprobe")
foreach($t in $tools){
  if (CmdExists $t){ Write-Host ("[OK] {0}" -f $t) -ForegroundColor Green }
  else { Write-Host ("[MISSING] {0}" -f $t) -ForegroundColor Yellow }
}

# Demucs import (optional)
if (CmdExists "python"){
  $ok = $true
  try { $null = & python -c "import demucs" 2>$null; if ($LASTEXITCODE -ne 0){ $ok=$false } } catch { $ok=$false }
  if ($ok){ Write-Host "[OK] Demucs import" -ForegroundColor Green }
  else { Write-Host "[INFO] Demucs not installed for this Python (only needed for stems)." -ForegroundColor Yellow }
}

# Disk space
try {
  $drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($Base).TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
  if ($drive){
    $gb = [math]::Round($drive.Free/1GB,2)
    Write-Host ""
    Write-Host ("Free space on {0}: {1} GB" -f $drive.Name,$gb) -ForegroundColor Cyan
  }
} catch { }

Write-Host ""
Write-Host "If something is missing:" -ForegroundColor DarkGray
Write-Host " - ffmpeg: install or add to PATH" -ForegroundColor DarkGray
Write-Host " - yt-dlp: pip install -U yt-dlp" -ForegroundColor DarkGray
Write-Host " - python: install from python.org" -ForegroundColor DarkGray
Write-Host " - demucs: pip install -U demucs" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to return..." | Out-Null
