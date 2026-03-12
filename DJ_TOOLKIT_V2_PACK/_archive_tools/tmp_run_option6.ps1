# Temporary test script: run option 6 against MP4_TO_TEST
$MP4Dir = 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST'
$Base = 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK'
$Temp60 = Join-Path $Base 'First60_test'
if (-not (Test-Path $Temp60)) { New-Item -ItemType Directory -Path $Temp60 | Out-Null }

function Get-NextIndexedPath([string]$folder, [string]$baseName, [string]$ext) {
  for ($i = 1; $i -le 999; $i++) {
    $n = "{0}_{1:D2}{2}" -f $baseName, $i, $ext
    $p = Join-Path $folder $n
    if (-not (Test-Path $p)) { return $p }
  }
  throw "Too many versions exist for $baseName"
}

$clipLen = 60
$section = 'Start'
$outFolder = $Base
$outPath = Get-NextIndexedPath -folder $outFolder -baseName "First60_Merged_test" -ext ".mp4"

$files = Get-ChildItem -Path $MP4Dir -Filter "*.mp4" -File -ErrorAction SilentlyContinue
if (-not $files -or $files.Count -eq 0) { Write-Host "No MP4 files found in: $MP4Dir" -ForegroundColor Yellow; exit 1 }

$list = Join-Path $Temp60 "list.txt"
$skippedPath = Join-Path $Temp60 "Skipped_Clips.txt"
if (Test-Path $list) { Remove-Item $list -Force }
if (Test-Path $skippedPath) { Remove-Item $skippedPath -Force }

Write-Host "Creating clips in: $Temp60"
foreach ($f in $files) {
  Write-Host "Processing: $($f.Name)"
  $durRaw = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $f.FullName
  $dur = 0
  try { $dur = [double]::Parse(($durRaw | Out-String).Trim(), [System.Globalization.CultureInfo]::InvariantCulture) } catch { $dur = 0 }
  $start = 0.0
  if ($section -eq 'Middle') { $start = [math]::Max((($dur - $clipLen) / 2.0), 0.0) }
  elseif ($section -eq 'End') { $start = [math]::Max(($dur - $clipLen), 0.0) }
  $startStr = $start.ToString('0.###',[System.Globalization.CultureInfo]::InvariantCulture)
  $name = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $clip = Join-Path $Temp60 ("{0}_clip.mp4" -f $name)

  & ffmpeg -hide_banner -loglevel error -y -ss $startStr -i $f.FullName -t $clipLen -c copy $clip
  if (-not (Test-Path $clip)) {
    Write-Host "Stream-copy failed; re-encoding: $($f.Name)" -ForegroundColor Yellow
    & ffmpeg -hide_banner -loglevel error -y -ss $startStr -i $f.FullName -t $clipLen -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k $clip
    if (-not (Test-Path $clip)) {
      Add-Content -Path $skippedPath -Value ("SKIP: {0}  ({1})" -f $f.Name, "clip creation failed")
      Write-Host "Failed to create clip for: $($f.Name)" -ForegroundColor Red
      continue
    }
  }
}

$clipNames = @(Get-ChildItem $Temp60 -Filter "*_clip.mp4" | Sort-Object Name)
if (-not $clipNames -or $clipNames.Count -eq 0) { Write-Host "No clips created; check: $skippedPath" -ForegroundColor Yellow; exit 1 }
$lines = $clipNames | ForEach-Object { "file '{0}'" -f $_.Name }
# Write UTF8 without BOM
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($list, $lines, $enc)

Write-Host "Merging clips to: $outPath"
$m1 = @('-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',$list,'-c','copy',$outPath)
$proc = Start-Process -FilePath ffmpeg -ArgumentList $m1 -NoNewWindow -Wait -PassThru
if (-not (Test-Path $outPath) -or $proc.ExitCode -ne 0) {
  Write-Host "Fast concat failed, re-encoding..." -ForegroundColor Yellow
  $m2 = @('-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',$list,'-fflags','+genpts','-af','aresample=async=1:first_pts=0','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','aac','-b:a','128k','-movflags','+faststart',$outPath)
  $proc2 = Start-Process -FilePath ffmpeg -ArgumentList $m2 -NoNewWindow -Wait -PassThru
  if ($proc2.ExitCode -ne 0 -or -not (Test-Path $outPath)) { Write-Host "Merge failed." -ForegroundColor Red; exit 1 }
}

Write-Host "DONE: $outPath" -ForegroundColor Green
exit 0
