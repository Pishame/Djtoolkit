# DJ TOOLKIT V2.5 (PowerShell)

# Features:

# - Settings (config.json)

# - Progress bars

# - Copyright builder: choose clip length + section (start/middle/end)

# - Auto-number output (_01, _02, ...)

# - Always open output folder when done (setting)

# - Optional: Demucs stems + BPM detect (only if you choose)



Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"
$script:ToolkitBootUtc = [DateTime]::UtcNow

$script:CtrlCHandler = $null

if (-not ("DjCtrlCBridge" -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Threading;
public static class DjCtrlCBridge {
  public static volatile bool Requested = false;
  private static int _activePid = 0;
  public static volatile bool ExitOnCancelInMenu = false;
  public static void SetExitOnCancelInMenu(bool v) { ExitOnCancelInMenu = v; }
  public static void SetActivePid(int pid) { Interlocked.Exchange(ref _activePid, pid); }
  public static void OnCancel(object sender, ConsoleCancelEventArgs e) {
    if (ExitOnCancelInMenu) {
      // At main menu, terminate the host process (don't drop to PS prompt).
      e.Cancel = true;
      Environment.Exit(0);
      return;
    }
    Requested = true;
    int pid = Interlocked.CompareExchange(ref _activePid, 0, 0);
    if (pid > 0) {
      try {
        var p = Process.GetProcessById(pid);
        if (!p.HasExited) { p.Kill(true); }
      } catch { }
    }
    e.Cancel = true;
  }
  public static bool ConsumeRequested() {
    if (Requested) {
      Requested = false;
      return true;
    }
    return false;
  }
  public static void Reset() { Requested = false; ExitOnCancelInMenu = false; Interlocked.Exchange(ref _activePid, 0); }
}
'@
}


$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$ToolsDir = $ScriptRoot
$script:CookiesDebugMode = $false
$script:ResolvedYdlcCookiesPath = $null
# Default locations

$Base   = Join-Path $env:USERPROFILE "Downloads\DJDownloads"

$MP4Dir = Join-Path $Base "MP4"
$MP3Dir = Join-Path $Base "MP3"
$VideoToMp3Dir = Join-Path $Base "Videos_to_MP3"
$TikTokDir = Join-Path $Base "TikToks"
$TikTokMp3Dir = Join-Path $Base "TikTok_MP3"

$Temp60 = Join-Path $Base "First60"
$ChecksDir = Join-Path $ToolsDir "Checks"
$CopyrightDbPath = Join-Path $ChecksDir "Copyright_Test_Registry.csv"
$CapabilityCachePath = Join-Path $ChecksDir "System_Capability_Cache.json"
$SessionSummaryCsvPath = Join-Path $ChecksDir "Session_Summary.csv"
$StartupProfileCsvPath = Join-Path $ChecksDir "Startup_Profile.csv"



$ConfigPath = Join-Path $ToolsDir "config.json"

$LogPath    = Join-Path $ToolsDir "DJ_TOOLKIT_V2.log"
$script:UiProgressMode = "Clean"
$script:UIThemeName = "NeonRed"
$script:UiColors = @{
  Frame   = "DarkRed"
  Title   = "Red"
  Subtle  = "DarkGray"
  Section = "Cyan"
  ItemKey = "Yellow"
  ItemTxt = "Gray"
  Accent  = "Magenta"
  Good    = "Green"
  Warn    = "Yellow"
  Bad     = "Red"
}



function Log([string]$msg) {

  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

  Add-Content -Path $LogPath -Value "$ts  $msg"

}


function Confirm-ReturnToMainMenuOnCtrlC {
  while ($true) {
    Write-Host "Cancel and return to main menu? (Y/N, default Y): " -NoNewline
    $k = [Console]::ReadKey($true)
    Write-Host ""
    if ($k.Key -eq [ConsoleKey]::Enter) { return $true }
    if ($k.KeyChar -eq 'y' -or $k.KeyChar -eq 'Y') { return $true }
    if ($k.KeyChar -eq 'n' -or $k.KeyChar -eq 'N') { return $false }
  }
}


function Get-PasteableClipboardText {
  try {
    $raw = Get-Clipboard -Raw -ErrorAction Stop
    if ($null -eq $raw) { return $null }
    $text = [string]$raw
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    # Keep input single-line for URL/path prompts.
    $text = $text -replace "`r`n", " "
    $text = $text -replace "`n", " "
    $text = $text -replace "`r", " "
    $text = $text -replace "`t", " "
    return $text
  } catch {
    return $null
  }
}


function Clear-InlineStatusLine {
  try {
    $w = [Math]::Max([Console]::WindowWidth - 1, 80)
    [Console]::Write("`r" + (" " * $w) + "`r")
  } catch {
    try { [Console]::Write("`r") } catch { }
  }
}


function Read-Host {
  param([Parameter(Position = 0)][object]$Prompt)
  $promptText = if ($null -eq $Prompt) { "" } else { [string]$Prompt }
  $old = $false
  try {
    $old = [Console]::TreatControlCAsInput
    [Console]::TreatControlCAsInput = $true
    while ($true) {
      $sb = New-Object System.Text.StringBuilder
      if ([string]::IsNullOrWhiteSpace($promptText)) {
        Write-Host "" -NoNewline
      } else {
        Write-Host ("{0}: " -f $promptText) -NoNewline
      }
      while ($true) {
        $k = [Console]::ReadKey($true)
        if ($k.Key -eq [ConsoleKey]::Enter) {
          Write-Host ""
          return $sb.ToString()
        }
        if (($k.Modifiers -band [ConsoleModifiers]::Control) -and $k.Key -eq [ConsoleKey]::C) {
          Write-Host ""
          if ([DjCtrlCBridge]::ExitOnCancelInMenu) { [Environment]::Exit(0) }
          if (Confirm-ReturnToMainMenuOnCtrlC) {
            throw ([System.OperationCanceledException]::new("__DJ_RETURN_MAIN_MENU__"))
          }
          Write-Host ("{0}: " -f $promptText) -NoNewline
          $null = $sb.Clear()
          continue
        }
        $pasteRequested = ((($k.Modifiers -band [ConsoleModifiers]::Control) -and ($k.Key -eq [ConsoleKey]::V)) -or ((($k.Modifiers -band [ConsoleModifiers]::Shift) -and ($k.Key -eq [ConsoleKey]::Insert))))
        if ($pasteRequested) {
          $paste = Get-PasteableClipboardText
          if (-not [string]::IsNullOrWhiteSpace($paste)) {
            $null = $sb.Append($paste)
            try { [Console]::Write($paste) } catch { }
          }
          continue
        }
        if ($k.Key -eq [ConsoleKey]::Backspace) {
          if ($sb.Length -gt 0) {
            $null = $sb.Remove($sb.Length - 1, 1)
            try { [Console]::Write("`b `b") } catch { }
          }
          continue
        }
        if (-not [char]::IsControl($k.KeyChar)) {
          $null = $sb.Append($k.KeyChar)
          try { [Console]::Write($k.KeyChar) } catch { }
        }
      }
    }
  } finally {
    try { [Console]::TreatControlCAsInput = $old } catch { }
  }
}


function Pause-User([string]$msg = "Press Enter to continue...") {

  Write-Host ""

  Read-Host $msg | Out-Null

}


function Resolve-PathFromScriptRoot([string]$pathValue) {
  if ([string]::IsNullOrWhiteSpace($pathValue)) { return $null }
  $candidate = [string]$pathValue
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $ScriptRoot $candidate
  }
  try { return [System.IO.Path]::GetFullPath($candidate) } catch { return $candidate }
}


function Resolve-YtDlpExecutablePath {
  try {
    $cmd = Get-Command yt-dlp -ErrorAction Stop
    if ($cmd -and $cmd.Source) { return [string]$cmd.Source }
    if ($cmd -and $cmd.Path) { return [string]$cmd.Path }
  } catch { }
  return "yt-dlp"
}


function Get-YdlcArgs([string]$url, [string]$cookiesPath) {
  @("--no-warnings","--no-overwrites","--cookies",$cookiesPath,"--paths",$MP4Dir,"-o","%(title)s [%(id)s].%(ext)s","-f","(299+140)/(137+140)/bv*[ext=mp4]+ba[ext=m4a]","--merge-output-format","mp4","--no-playlist",$url)
}


function Add-YtDlpResilienceArgs([string[]]$args) {
  $arr = @($args)
  if ($arr.Count -eq 0) { return $arr }

  if (-not ($arr -contains "--force-ipv4")) { $arr += @("--force-ipv4") }
  if (-not ($arr -contains "--socket-timeout")) { $arr += @("--socket-timeout", "15") }
  if (-not ($arr -contains "--extractor-retries")) { $arr += @("--extractor-retries", "1") }
  if (-not ($arr -contains "--retries")) { $arr += @("--retries", "2") }
  if (-not ($arr -contains "--fragment-retries")) { $arr += @("--fragment-retries", "2") }
  if (-not ($arr -contains "--concurrent-fragments")) { $arr += @("--concurrent-fragments", "4") }
  if (-not ($arr -contains "--no-playlist") -and -not ($arr -contains "--yes-playlist")) {
    $arr += @("--no-playlist")
  }
  return @($arr)
}

function Ensure-YtDlpUrlArg([string[]]$args, [string]$url) {
  $arr = @($args | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ([string]::IsNullOrWhiteSpace($url)) { return @($arr) }
  $u = [string]$url
  # Keep exactly one URL and force it to the tail so option/value parsing cannot swallow it.
  $arr = @($arr | Where-Object { [string]$_ -ne $u })
  $arr += @($u)
  return @($arr)
}


function Format-ArgsForDebug([string[]]$argList) {
  if ($null -eq $argList) { return "" }
  $safeArgs = @($argList | ForEach-Object {
    $s = [string]$_
    if ($s -match '\s') { '"' + ($s -replace '"','\"') + '"' } else { $s }
  })
  return [string]::Join(' ', $safeArgs)
}


function Write-CookiesDebugTail($res, [int]$tail = 50) {
  if (-not $script:CookiesDebugMode) { return }
  if ($null -eq $res) {
    Write-Host "[DEBUG][cookies] no process result captured." -ForegroundColor Yellow
    Log "[DEBUG][cookies] no process result captured."
    return
  }
  $outTail = @()
  $errTail = @()
  if ($res.StdOut) { $outTail = @($res.StdOut | Select-Object -Last $tail) }
  if ($res.StdErr) { $errTail = @($res.StdErr | Select-Object -Last $tail) }
  Write-Host ("[DEBUG][cookies] exitCode={0} | stdout_tail={1} | stderr_tail={2}" -f $res.ExitCode, $outTail.Count, $errTail.Count) -ForegroundColor DarkGray
  Log ("[DEBUG][cookies] exitCode={0} | stdout_tail={1} | stderr_tail={2}" -f $res.ExitCode, $outTail.Count, $errTail.Count)
  if ($outTail.Count -gt 0) {
    Write-Host "[DEBUG][cookies][stdout last 50]" -ForegroundColor DarkGray
    Log "[DEBUG][cookies][stdout last 50]"
    foreach ($l in $outTail) { Write-Host $l -ForegroundColor DarkGray }
    foreach ($l in $outTail) { Log ("[DEBUG][cookies][stdout] " + [string]$l) }
  }
  if ($errTail.Count -gt 0) {
    Write-Host "[DEBUG][cookies][stderr last 50]" -ForegroundColor DarkGray
    Log "[DEBUG][cookies][stderr last 50]"
    foreach ($l in $errTail) { Write-Host $l -ForegroundColor DarkGray }
    foreach ($l in $errTail) { Log ("[DEBUG][cookies][stderr] " + [string]$l) }
  }
}


function Apply-UiTheme([string]$themeName) {
  $t = ([string]$themeName).Trim()
  if ([string]::IsNullOrWhiteSpace($t)) { $t = "NeonRed" }
  switch ($t) {
    "CyberBlue" {
      $script:UIThemeName = "CyberBlue"
      $script:UiColors = @{ Frame="DarkCyan"; Title="Cyan"; Subtle="DarkGray"; Section="Blue"; ItemKey="Yellow"; ItemTxt="Gray"; Accent="Magenta"; Good="Green"; Warn="Yellow"; Bad="Red" }
    }
    "MatrixGreen" {
      $script:UIThemeName = "MatrixGreen"
      $script:UiColors = @{ Frame="DarkGreen"; Title="Green"; Subtle="DarkGray"; Section="Green"; ItemKey="Yellow"; ItemTxt="Gray"; Accent="Cyan"; Good="Green"; Warn="Yellow"; Bad="Red" }
    }
    default {
      $script:UIThemeName = "NeonRed"
      $script:UiColors = @{ Frame="DarkRed"; Title="Red"; Subtle="DarkGray"; Section="Cyan"; ItemKey="Yellow"; ItemTxt="Gray"; Accent="Magenta"; Good="Green"; Warn="Yellow"; Bad="Red" }
    }
  }
}


function Write-UiSection([string]$title) {
  Write-Host $title -ForegroundColor $script:UiColors.Section
}


function Write-UiItem([string]$key, [string]$text) {
  Write-Host ("  [{0}] " -f $key) -NoNewline -ForegroundColor $script:UiColors.ItemKey
  Write-Host $text -ForegroundColor $script:UiColors.ItemTxt
}


function Write-UiFooter([string]$left, [string]$right = "") {
  Write-Host ""
  Write-Host ("[{0}] {1}" -f $script:UIThemeName, $left) -NoNewline -ForegroundColor $script:UiColors.Subtle
  if (-not [string]::IsNullOrWhiteSpace($right)) {
    Write-Host "  |  " -NoNewline -ForegroundColor $script:UiColors.Subtle
    Write-Host $right -ForegroundColor $script:UiColors.Accent
  } else {
    Write-Host ""
  }
}


function Banner {

  Clear-Host

  Write-Host "+-------------------------------------------------------------------------------+" -ForegroundColor $script:UiColors.Frame
  Write-Host "|                               DJ TOOLKIT V2.5                                |" -ForegroundColor $script:UiColors.Title
  Write-Host "|                           PowerShell Production Console                       |" -ForegroundColor $script:UiColors.Subtle
  Write-Host "+-------------------------------------------------------------------------------+" -ForegroundColor $script:UiColors.Frame

}



function Ensure-Folders {

  foreach ($p in @($Base, $MP4Dir, $MP3Dir, $VideoToMp3Dir, $TikTokDir, $TikTokMp3Dir, $Temp60, $ChecksDir)) {

    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }

  }

}



function Test-Cmd([string]$name) {

  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}


function Test-FFmpegEncoder([string]$encoderName) {
  try {
    $out = @(& ffmpeg -hide_banner -encoders 2>$null)
    if ($out.Count -eq 0) { return $false }
    $pat = "(^|\s){0}(\s|$)" -f [regex]::Escape($encoderName)
    return [bool](($out -join "`n") -match $pat)
  } catch {
    return $false
  }
}


function Format-SecondsClock([double]$seconds) {
  if ($seconds -lt 0) { $seconds = 0 }
  $ts = [TimeSpan]::FromSeconds([int][math]::Round($seconds))
  return "{0:D2}:{1:D2}" -f [int]$ts.TotalMinutes, $ts.Seconds
}


function Should-PrintProcessLine([string]$line) {
  if ([string]::IsNullOrWhiteSpace($line)) { return $false }
  # Replace noisy yt-dlp age-restriction wall with a clearer custom message in queue handling.
  if ($line -match '(?i)sign in to confirm your age|how-do-i-pass-cookies|exporting-youtube-cookies') { return $false }
  if ($script:UiProgressMode -eq "Verbose") { return $true }
  if ($line -match '(?i)error|failed|exception|warning|destination:|\[merger\]') { return $true }
  return $false
}


function Get-ToolVersion([string]$toolName, [string[]]$args = @('--version')) {
  try {
    $out = @(& $toolName @args 2>$null)
    if ($out.Count -gt 0) { return [string]$out[0] }
  } catch { }
  return "unknown"
}


function Get-SystemCapabilities([bool]$refresh = $false) {
  Ensure-Folders
  if (-not $refresh -and (Test-Path $CapabilityCachePath)) {
    try {
      $cached = Get-Content $CapabilityCachePath -Raw | ConvertFrom-Json
      if ($cached -and $cached.GeneratedAt) {
        $gen = [DateTime]::Parse([string]$cached.GeneratedAt)
        if (((Get-Date) - $gen).TotalDays -lt 7) { return $cached }
      }
    } catch { }
  }

  $caps = [ordered]@{
    GeneratedAt   = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    FFmpegVersion = Get-ToolVersion "ffmpeg" @("-hide_banner","-version")
    YtDlpVersion  = Get-ToolVersion "yt-dlp" @("--version")
    HasH264Qsv    = (Test-FFmpegEncoder "h264_qsv")
    HasH264Nvenc  = (Test-FFmpegEncoder "h264_nvenc")
  }
  try { ($caps | ConvertTo-Json -Depth 4) | Set-Content -Path $CapabilityCachePath -Encoding UTF8 } catch { }
  return [pscustomobject]$caps
}


function Add-SessionSummaryRow([string]$jobName, [string]$status, [string]$mode, [int]$inputs, [string]$outputPath, [double]$prepSeconds, [double]$mergeSeconds, [double]$finalizeSeconds, [string]$notes = "") {
  Ensure-Folders
  $row = [pscustomobject]@{
    Timestamp       = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Job             = $jobName
    Status          = $status
    Mode            = $mode
    Inputs          = $inputs
    PrepElapsedSec  = [math]::Round([double]$prepSeconds, 2)
    MergeElapsedSec = [math]::Round([double]$mergeSeconds, 2)
    FinalElapsedSec = [math]::Round([double]$finalizeSeconds, 2)
    TotalElapsedSec = [math]::Round(([double]$prepSeconds + [double]$mergeSeconds + [double]$finalizeSeconds), 2)
    OutputPath      = $outputPath
    Notes           = $notes
  }
  $rows = @()
  if (Test-Path $SessionSummaryCsvPath) {
    try { $rows = @(Import-Csv -Path $SessionSummaryCsvPath) } catch { $rows = @() }
  }
  $rows += $row
  $rows | Export-Csv -Path $SessionSummaryCsvPath -NoTypeInformation -Encoding UTF8
  return $SessionSummaryCsvPath
}


function Run-ProcessWithProgress([string]$exe, [string[]]$argList, [string]$activity = "Running") {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  # Quote arguments that contain spaces to avoid broken command-line parsing
  $safeArgs = $argList | ForEach-Object {
    $s = [string]$_
    if ($s -match '\s') { '"' + ($s -replace '"','\"') + '"' } else { $s }
  }
  $psi.Arguments = [string]::Join(' ', $safeArgs)
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $false

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  if ($activity -ieq 'ffmpeg') { Log ("Run-ProcessWithProgress: ffmpeg args: " + $psi.FileName + " " + $psi.Arguments) }
  $stdOutLines = New-Object System.Collections.Generic.List[string]
  $stdErrLines = New-Object System.Collections.Generic.List[string]
  $inlineDownloadShown = $false
  $spinFrames = @('|','/','-','\')
  $spinIndex = 0

  $proc.Start() | Out-Null
  [DjCtrlCBridge]::SetActivePid($proc.Id)

  # Read stdout/stderr synchronously on the main thread and print lines inline.
  while (-not $proc.HasExited) {
    if ([DjCtrlCBridge]::ConsumeRequested()) {
      try { if (-not $proc.HasExited) { $proc.Kill($true) } } catch { }
      [DjCtrlCBridge]::SetActivePid(0)
      try { Write-Progress -Activity $activity -Completed } catch { }
      Clear-InlineStatusLine
      Write-Host ""
      Write-Host "Cancel requested (Ctrl+C)." -ForegroundColor Yellow
      if (Confirm-ReturnToMainMenuOnCtrlC) {
        throw ([System.OperationCanceledException]::new("__DJ_RETURN_MAIN_MENU__"))
      }
      throw "Operation cancelled by user (Ctrl+C)."
    }
    while (-not $proc.StandardOutput.EndOfStream) {
      $line = $proc.StandardOutput.ReadLine()
      if ($line -ne $null) {
        $stdOutLines.Add($line)
        $isDownloadProgress = $false
        if ($line -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%\s+of\s+([^\s]+)') {
          $isDownloadProgress = $true
          $pct = [double]$matches[1]
          $sz = $matches[2]
          $status = "{0} {1}" -f $sz, ("{0:N1}%" -f $pct)
          Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
          try {
            $frame = $spinFrames[$spinIndex % $spinFrames.Count]
            $spinIndex++
            $left = ("{0} Download " -f $frame)
            [Console]::Write("`r" + $left)
            $oldCol = [Console]::ForegroundColor
            [Console]::ForegroundColor = 'Cyan'
            [Console]::Write($sz + " ")
            [Console]::ForegroundColor = 'Green'
            [Console]::Write(("{0:N1}%" -f $pct))
            [Console]::ForegroundColor = $oldCol
            [Console]::Write("   ")
          } catch { }
        } elseif ($line -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%') {
          $isDownloadProgress = $true
          $pct = [double]$matches[1]
          $status = (("{0:N1}%" -f $pct))
          Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
          try {
            $frame = $spinFrames[$spinIndex % $spinFrames.Count]
            $spinIndex++
            $left = ("{0} Download " -f $frame)
            [Console]::Write("`r" + $left)
            $oldCol = [Console]::ForegroundColor
            [Console]::ForegroundColor = 'Green'
            [Console]::Write($status)
            [Console]::ForegroundColor = $oldCol
            [Console]::Write("     ")
          } catch { }
        } elseif ($line -match '^KEYPROG:(\d+):(\d+):(.+)$') {
          $done = [int]$matches[1]
          $total = [int]$matches[2]
          $name = [string]$matches[3]
          $pct = if ($total -gt 0) { [int](($done / [double]$total) * 100.0) } else { 0 }
          Write-Progress -Activity $activity -Status ("{0}/{1} {2}" -f $done, $total, $name) -PercentComplete $pct
          continue
        }
        if ($isDownloadProgress) {
          $inlineDownloadShown = $true
          continue
        }
        if ($inlineDownloadShown) {
          try { [Console]::WriteLine("") } catch { }
          $inlineDownloadShown = $false
        }
        if (Should-PrintProcessLine $line) { Write-Host $line }
      }
    }
    while ($proc.StandardError.Peek() -ge 0) {
      $eline = $proc.StandardError.ReadLine()
      if ($eline -ne $null) {
        $stdErrLines.Add($eline)
        $isDownloadProgress = $false
        if ($eline -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%\s+of\s+([^\s]+)') {
          $isDownloadProgress = $true
          $pct = [double]$matches[1]
          $sz = $matches[2]
          $status = "{0} {1}" -f $sz, ("{0:N1}%" -f $pct)
          Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
          try {
            $frame = $spinFrames[$spinIndex % $spinFrames.Count]
            $spinIndex++
            $left = ("{0} Download " -f $frame)
            [Console]::Write("`r" + $left)
            $oldCol = [Console]::ForegroundColor
            [Console]::ForegroundColor = 'Cyan'
            [Console]::Write($sz + " ")
            [Console]::ForegroundColor = 'Green'
            [Console]::Write(("{0:N1}%" -f $pct))
            [Console]::ForegroundColor = $oldCol
            [Console]::Write("   ")
          } catch { }
        } elseif ($eline -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%') {
          $isDownloadProgress = $true
          $pct = [double]$matches[1]
          $status = (("{0:N1}%" -f $pct))
          Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
          try {
            $frame = $spinFrames[$spinIndex % $spinFrames.Count]
            $spinIndex++
            $left = ("{0} Download " -f $frame)
            [Console]::Write("`r" + $left)
            $oldCol = [Console]::ForegroundColor
            [Console]::ForegroundColor = 'Green'
            [Console]::Write($status)
            [Console]::ForegroundColor = $oldCol
            [Console]::Write("     ")
          } catch { }
        }
        if ($isDownloadProgress) {
          $inlineDownloadShown = $true
          continue
        }
        if ($inlineDownloadShown) {
          try { [Console]::WriteLine("") } catch { }
          $inlineDownloadShown = $false
        }
        if (Should-PrintProcessLine $eline) { Write-Host $eline }
      }
    }
    Start-Sleep -Milliseconds 150
  }

  # Drain remaining stdout
  if ([DjCtrlCBridge]::ConsumeRequested()) {
    try { if (-not $proc.HasExited) { $proc.Kill($true) } } catch { }
    [DjCtrlCBridge]::SetActivePid(0)
    try { Write-Progress -Activity $activity -Completed } catch { }
    Clear-InlineStatusLine
    Write-Host ""
    Write-Host "Cancel requested (Ctrl+C)." -ForegroundColor Yellow
    if (Confirm-ReturnToMainMenuOnCtrlC) {
      throw ([System.OperationCanceledException]::new("__DJ_RETURN_MAIN_MENU__"))
    }
    throw "Operation cancelled by user (Ctrl+C)."
  }
  while (-not $proc.StandardOutput.EndOfStream) {
    $line = $proc.StandardOutput.ReadLine()
    if ($line -ne $null) {
      $stdOutLines.Add($line)
      if ($line -match '^KEYPROG:(\d+):(\d+):(.+)$') {
        $done = [int]$matches[1]
        $total = [int]$matches[2]
        $name = [string]$matches[3]
        $pct = if ($total -gt 0) { [int](($done / [double]$total) * 100.0) } else { 0 }
        Write-Progress -Activity $activity -Status ("{0}/{1} {2}" -f $done, $total, $name) -PercentComplete $pct
        continue
      }
      if ($line -match '^\[download\]') { continue }
      if ($inlineDownloadShown) {
        try { [Console]::WriteLine("") } catch { }
        $inlineDownloadShown = $false
      }
      if (Should-PrintProcessLine $line) { Write-Host $line }
    }
  }

  # Drain stderr
  while (-not $proc.StandardError.EndOfStream) {
    $eline = $proc.StandardError.ReadLine()
    if ($eline -ne $null) {
      $stdErrLines.Add($eline)
      if ($eline -match '^\[download\]') { continue }
      if ($inlineDownloadShown) {
        try { [Console]::WriteLine("") } catch { }
        $inlineDownloadShown = $false
      }
      if (Should-PrintProcessLine $eline) { Write-Host $eline }
    }
  }

  if ($inlineDownloadShown) {
    try { [Console]::WriteLine("") } catch { }
    $inlineDownloadShown = $false
  }
  Write-Progress -Activity $activity -Completed

  [DjCtrlCBridge]::SetActivePid(0)
  return [pscustomobject]@{ ExitCode = $proc.ExitCode; StdOut = $stdOutLines.ToArray(); StdErr = $stdErrLines.ToArray() }
}


# Run ffmpeg with -progress pipe:1 and show a progress bar based on total duration (seconds)
function Run-FFmpegWithProgress([string[]]$argList, [double]$totalSeconds, [string]$activity = "ffmpeg") {
  # ensure -progress pipe:1 is present
  $args = @($argList)
  if (-not ($args -contains '-progress')) { $args += ('-progress'); $args += ('pipe:1') }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'ffmpeg'
  # quote args containing spaces
  $safeArgs = $args | ForEach-Object { $s = [string]$_; if ($s -match '\s') { '"' + ($s -replace '"','\\"') + '"' } else { $s } }
  $psi.Arguments = [string]::Join(' ', $safeArgs)
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  Log ("Run-FFmpegWithProgress: ffmpeg " + $psi.Arguments)

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  $stdOut = New-Object System.Collections.Generic.List[string]
  $stdErr = New-Object System.Collections.Generic.List[string]
  $startedAt = Get-Date
  $lastMediaSeconds = 0.0
  $lastPrintedPct = -10
  $inlineFfmpegStatusShown = $false
  $spinFrames = @('|','/','-','\')
  $spinIndex = 0

  $proc.Start() | Out-Null
  [DjCtrlCBridge]::SetActivePid($proc.Id)

  # ffmpeg -progress emits key=value lines on stdout; parse out_time_ms
  while (-not $proc.HasExited) {
    if ([DjCtrlCBridge]::ConsumeRequested()) {
      try { if (-not $proc.HasExited) { $proc.Kill($true) } } catch { }
      [DjCtrlCBridge]::SetActivePid(0)
      try { Write-Progress -Activity $activity -Completed } catch { }
      Clear-InlineStatusLine
      Write-Host ""
      Write-Host "Cancel requested (Ctrl+C)." -ForegroundColor Yellow
      if (Confirm-ReturnToMainMenuOnCtrlC) {
        throw ([System.OperationCanceledException]::new("__DJ_RETURN_MAIN_MENU__"))
      }
      throw "Operation cancelled by user (Ctrl+C)."
    }
    while ($proc.StandardOutput.Peek() -ge 0) {
      $line = $proc.StandardOutput.ReadLine()
      if ($line -ne $null) {
        $stdOut.Add($line)
        $seconds = $null
        if ($line -match '^out_time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$') {
          $h = [double]$matches[1]
          $m = [double]$matches[2]
          $s = [double]$matches[3]
          $seconds = ($h * 3600.0) + ($m * 60.0) + $s
        } elseif ($line -match '^out_time_us=(\d+)') {
          $seconds = ([double]$matches[1]) / 1000000.0
        } elseif ($line -match '^out_time_ms=(\d+)') {
          # ffmpeg -progress uses microseconds in this field despite the name.
          $seconds = ([double]$matches[1]) / 1000000.0
        }
        if ($null -ne $seconds) {
          if ($seconds -lt $lastMediaSeconds) { $seconds = $lastMediaSeconds }
          $lastMediaSeconds = $seconds
          $pct = if ($totalSeconds -gt 0) { [int](([double]$seconds / $totalSeconds) * 100.0) } else { 0 }
          if ($pct -gt 100) { $pct = 100 }
          $eta = "--:--"
          if ($seconds -gt 0.25) {
            $elapsed = ((Get-Date) - $startedAt).TotalSeconds
            if ($elapsed -gt 0) {
              $speed = $seconds / $elapsed
              if ($speed -gt 0.01) {
                $remaining = [math]::Max((($totalSeconds - $seconds) / $speed), 0)
              } else {
                $remaining = 0
              }
              $etaTs = [TimeSpan]::FromSeconds([int][math]::Round($remaining))
              $eta = "{0:D2}:{1:D2}" -f [int]$etaTs.TotalMinutes, $etaTs.Seconds
            }
          }
          $elapsedClock = Format-SecondsClock (((Get-Date) - $startedAt).TotalSeconds)
          $status = ("{0:N1}s / {1:N1}s | elapsed {2} | ETA {3}" -f $seconds, $totalSeconds, $elapsedClock, $eta)
          Write-Progress -Activity $activity -Status $status -PercentComplete $pct
          if (($script:UiProgressMode -eq "Verbose") -or $pct -ge ($lastPrintedPct + 10)) {
            $lastPrintedPct = [int]([math]::Floor($pct / 10.0) * 10)
            try {
              $shownPct = if ($script:UiProgressMode -eq "Verbose") { $pct } else { $lastPrintedPct }
              $frame = $spinFrames[$spinIndex % $spinFrames.Count]
              $spinIndex++
              [Console]::Write("`r{0} {1}: {2}% | elapsed {3} | ETA {4}   " -f $frame, $activity, $shownPct, $elapsedClock, $eta)
              $inlineFfmpegStatusShown = $true
            } catch {
              Write-Host ("{0}: {1}% | elapsed {2} | ETA {3}" -f $activity, $pct, $elapsedClock, $eta) -ForegroundColor DarkGray
            }
          }
        }
      }
    }
    while ($proc.StandardError.Peek() -ge 0) {
      $eline = $proc.StandardError.ReadLine()
      if ($eline -ne $null) {
        $stdErr.Add($eline)
        if ($inlineFfmpegStatusShown) {
          try { [Console]::WriteLine("") } catch { }
          $inlineFfmpegStatusShown = $false
        }
        if (Should-PrintProcessLine $eline) { Write-Host $eline }
      }
    }
    Start-Sleep -Milliseconds 150
  }

  # drain remaining stdout
  if ([DjCtrlCBridge]::ConsumeRequested()) {
    try { if (-not $proc.HasExited) { $proc.Kill($true) } } catch { }
    [DjCtrlCBridge]::SetActivePid(0)
    try { Write-Progress -Activity $activity -Completed } catch { }
    Clear-InlineStatusLine
    Write-Host ""
    Write-Host "Cancel requested (Ctrl+C)." -ForegroundColor Yellow
    if (Confirm-ReturnToMainMenuOnCtrlC) {
      throw ([System.OperationCanceledException]::new("__DJ_RETURN_MAIN_MENU__"))
    }
    throw "Operation cancelled by user (Ctrl+C)."
  }
  while ($proc.StandardOutput.Peek() -ge 0) { $l = $proc.StandardOutput.ReadLine(); if ($l -ne $null) { $stdOut.Add($l) } }
  while ($proc.StandardError.Peek() -ge 0) {
    $l = $proc.StandardError.ReadLine()
    if ($l -ne $null) {
      $stdErr.Add($l)
      if ($inlineFfmpegStatusShown) {
        try { [Console]::WriteLine("") } catch { }
        $inlineFfmpegStatusShown = $false
      }
    }
  }

  if ($inlineFfmpegStatusShown) {
    try { [Console]::WriteLine("") } catch { }
    $inlineFfmpegStatusShown = $false
  }
  Write-Progress -Activity $activity -Completed

  [DjCtrlCBridge]::SetActivePid(0)
  return [pscustomobject]@{ ExitCode = $proc.ExitCode; StdOut = $stdOut.ToArray(); StdErr = $stdErr.ToArray() }
}



function Require-Tools {

  if (-not (Test-Cmd "yt-dlp")) { throw "yt-dlp not found in PATH." }

  if (-not (Test-Cmd "ffmpeg")) { throw "ffmpeg not found in PATH." }

  if (-not (Test-Cmd "ffprobe")) { throw "ffprobe not found in PATH (it comes with ffmpeg)." }

}


function Did-ProcessSucceed($res) {
  if ($null -eq $res) { return $false }
  if ($res.ExitCode -eq 0) { return $true }
  $out = @()
  if ($res.StdOut) { $out += $res.StdOut }
  if ($res.StdErr) { $out += $res.StdErr }
  $all = ($out -join "`n").ToLower()
  if ($all -match '100% of') { return $true }
  if ($all -match '\[merger\] merging formats') { return $true }
  if ($all -match 'destination:') { return $true }
  if ($all -match 'progress=end') { return $true }
  return $false
}



function Write-Utf8NoBom([string]$Path, [string[]]$Lines) {

  $enc = New-Object System.Text.UTF8Encoding($false)   # no BOM

  [System.IO.File]::WriteAllLines($Path, $Lines, $enc)

}



function Load-Config {

  $default = [ordered]@{

    AutoOpenOutputFolder = $true

    DefaultClipLengthSec = 60

    DefaultClipSection   = "Start"   # Start | Middle | End

    OutputMode           = "SameFolder" # SameFolder | DJDownloads

    EnableDemucs         = $false

    EnableBpmDetect      = $false

    DemucsModel          = "htdemucs"

    TempCleanupMode      = "AgeBased" # AgeBased | Immediate | ManualOnly

    TempRetentionDays    = 7

    ClipPresets          = @(
      [ordered]@{ Name = "30sec_middle"; LengthSec = 30; Section = "Middle" },
      [ordered]@{ Name = "60sec_start"; LengthSec = 60; Section = "Start" }
    )

    NotifyOnBatchComplete = $true

    NotifyOnBatchFailure  = $true

    UIProgressMode = "Clean" # Clean | Verbose

    EnableBlockedAutoQuarantine = $true

    EnableStartupProfiler = $true

    TikTokWatermarkMode = "Auto" # Auto | PreferNoWatermark | PreferWatermark
 
    UITheme = "NeonRed" # NeonRed | CyberBlue | MatrixGreen

    RecentCookiesPath = ""
    RecentAudioPath   = ""
    RecentVideoPath   = ""
 
  }



  if (-not (Test-Path $ConfigPath)) {

    ($default | ConvertTo-Json -Depth 5) | Set-Content -Path $ConfigPath -Encoding UTF8

    return [pscustomobject]$default

  }



  try {

    $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

  } catch {

    Log "Config parse failed; resetting to defaults. Error: $($_.Exception.Message)"

    ($default | ConvertTo-Json -Depth 5) | Set-Content -Path $ConfigPath -Encoding UTF8

    return [pscustomobject]$default

  }



  foreach ($k in $default.Keys) {

    if (-not ($cfg.PSObject.Properties.Name -contains $k)) {

      $cfg | Add-Member -NotePropertyName $k -NotePropertyValue $default[$k]

    }

  }

  if (-not (@("AgeBased","Immediate","ManualOnly") -contains [string]$cfg.TempCleanupMode)) { $cfg.TempCleanupMode = "AgeBased" }
  $ret = 7
  if ([int]::TryParse([string]$cfg.TempRetentionDays, [ref]$ret)) {
    if ($ret -lt 0) { $ret = 0 }
    if ($ret -gt 365) { $ret = 365 }
    $cfg.TempRetentionDays = $ret
  } else {
    $cfg.TempRetentionDays = 7
  }
  if ($null -eq $cfg.NotifyOnBatchComplete) { $cfg.NotifyOnBatchComplete = $true }
  if ($null -eq $cfg.NotifyOnBatchFailure) { $cfg.NotifyOnBatchFailure = $true }
  if (-not (@("Clean","Verbose") -contains [string]$cfg.UIProgressMode)) { $cfg.UIProgressMode = "Clean" }
  if ($null -eq $cfg.EnableBlockedAutoQuarantine) { $cfg.EnableBlockedAutoQuarantine = $true }
  if ($null -eq $cfg.EnableStartupProfiler) { $cfg.EnableStartupProfiler = $true }
  if (-not (@("Auto","PreferNoWatermark","PreferWatermark") -contains [string]$cfg.TikTokWatermarkMode)) { $cfg.TikTokWatermarkMode = "Auto" }
  if (-not (@("NeonRed","CyberBlue","MatrixGreen") -contains [string]$cfg.UITheme)) { $cfg.UITheme = "NeonRed" }
  if ($null -eq $cfg.RecentCookiesPath) { $cfg.RecentCookiesPath = "" }
  if ($null -eq $cfg.RecentAudioPath) { $cfg.RecentAudioPath = "" }
  if ($null -eq $cfg.RecentVideoPath) { $cfg.RecentVideoPath = "" }

  $defaultsPresets = @(
    [pscustomobject]@{ Name = "30sec_middle"; LengthSec = 30; Section = "Middle" },
    [pscustomobject]@{ Name = "60sec_start"; LengthSec = 60; Section = "Start" }
  )
  $norm = @()
  $seen = @{}
  foreach ($p in @($cfg.ClipPresets)) {
    try {
      $nm = [string]$p.Name
      $sec = [string]$p.Section
      $len = 0
      if (-not [int]::TryParse([string]$p.LengthSec, [ref]$len)) { continue }
      if ([string]::IsNullOrWhiteSpace($nm)) { continue }
      if ($len -lt 1 -or $len -gt 600) { continue }
      if (-not (@("Start","Middle","End") -contains $sec)) { continue }
      $k = $nm.Trim().ToLowerInvariant()
      if ($seen.ContainsKey($k)) { continue }
      $seen[$k] = $true
      $norm += [pscustomobject]@{ Name = $nm.Trim(); LengthSec = $len; Section = $sec }
    } catch { }
  }
  if ($norm.Count -eq 0) { $cfg.ClipPresets = $defaultsPresets } else { $cfg.ClipPresets = $norm }

  return $cfg

}



function Save-Config($cfg) {

  ($cfg | ConvertTo-Json -Depth 6) | Set-Content -Path $ConfigPath -Encoding UTF8

}



function Get-RecentPath($cfg, [string]$kind) {
  if ($null -eq $cfg) { return $null }
  $prop = ""
  switch ($kind) {
    "cookies" { $prop = "RecentCookiesPath" }
    "audio"   { $prop = "RecentAudioPath" }
    "video"   { $prop = "RecentVideoPath" }
    default   { return $null }
  }
  if (-not ($cfg.PSObject.Properties.Name -contains $prop)) { return $null }
  $p = [string]$cfg.$prop
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  if (Test-Path -LiteralPath $p) { return $p }
  return $null
}


function Set-RecentPath($cfg, [string]$kind, [string]$path) {
  if ($null -eq $cfg -or [string]::IsNullOrWhiteSpace($path)) { return }
  $prop = ""
  switch ($kind) {
    "cookies" { $prop = "RecentCookiesPath" }
    "audio"   { $prop = "RecentAudioPath" }
    "video"   { $prop = "RecentVideoPath" }
    default   { return }
  }
  $full = Resolve-PathFromScriptRoot $path
  try {
    if (-not (Test-Path -LiteralPath $full)) { return }
    if ($cfg.PSObject.Properties.Name -contains $prop) {
      $cfg.$prop = $full
    } else {
      $cfg | Add-Member -NotePropertyName $prop -NotePropertyValue $full -Force
    }
    Save-Config $cfg
  } catch { }
}


function Invoke-SafeReset($cfg) {
  Ensure-Folders
  $res = Invoke-TempCleanup -cfg $cfg -Now
  $deleted = 0
  $failed = 0
  $cleared = New-Object System.Collections.Generic.List[string]

  foreach ($p in @($SessionSummaryCsvPath, $StartupProfileCsvPath, $CapabilityCachePath)) {
    try {
      if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force -ErrorAction Stop
        $deleted++
        [void]$cleared.Add($p)
      }
    } catch { $failed++ }
  }
  try {
    if (Test-Path -LiteralPath $LogPath) {
      Set-Content -Path $LogPath -Value "" -Encoding UTF8
      [void]$cleared.Add($LogPath)
    }
  } catch { $failed++ }

  try {
    $cfg.RecentCookiesPath = ""
    $cfg.RecentAudioPath = ""
    $cfg.RecentVideoPath = ""
    Save-Config $cfg
  } catch { $failed++ }

  $script:CurrentJobName = $null
  $script:CookiesDebugMode = $false
  $script:ResolvedYdlcCookiesPath = $null

  return [pscustomobject]@{
    TempDeleted  = $res.Deleted
    TempFailed   = $res.Failed
    FilesDeleted = $deleted
    FilesFailed  = $failed
    ClearedItems = @($cleared.ToArray())
  }
}


function Send-DesktopNotification([string]$title, [string]$message, [string]$level = "Info") {
  $sent = $false
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $titleEsc = [System.Security.SecurityElement]::Escape($title)
    $messageEsc = [System.Security.SecurityElement]::Escape($message)
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$titleEsc</text><text>$messageEsc</text></binding></visual></toast>")
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("DJToolkitV2").Show($toast)
    $sent = $true
  } catch {
    Log ("Toast notification failed: " + $_.Exception.Message)
  }
  if ($sent) { return $true }

  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    Add-Type -AssemblyName System.Drawing | Out-Null
    $ni = New-Object System.Windows.Forms.NotifyIcon
    $ni.Icon = [System.Drawing.SystemIcons]::Information
    $ni.Visible = $true
    $ni.BalloonTipTitle = $title
    $ni.BalloonTipText = $message
    switch ($level) {
      "Error" { $ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Error }
      "Warning" { $ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning }
      default { $ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info }
    }
    $ni.ShowBalloonTip(5000)
    Start-Sleep -Milliseconds 1200
    $ni.Dispose()
    return $true
  } catch {
    Log ("Balloon notification failed: " + $_.Exception.Message)
    return $false
  }
}



function Notify-JobResult($cfg, [string]$jobName, [bool]$ok, [string]$details) {
  try {
    # In embedded GUI mode, keep notifications in-app only (no Windows toast/balloon popups).
    if ($env:DJ_TOOLKIT_RUN -eq '0') {
      Log ("Notify suppressed in GUI mode job={0} ok={1} details={2}" -f $jobName, $ok, $details)
      return
    }
    if ($ok -and -not $cfg.NotifyOnBatchComplete) { return }
    if ((-not $ok) -and -not $cfg.NotifyOnBatchFailure) { return }
    $title = "DJ Toolkit: $jobName"
    $state = if ($ok) { "Completed" } else { "Failed" }
    $msg = if ([string]::IsNullOrWhiteSpace($details)) { $state } else { "$state - $details" }
    $level = if ($ok) { "Info" } else { "Error" }
    $sent = Send-DesktopNotification -title $title -message $msg -level $level
    Log ("Notify job={0} state={1} sent={2} details={3}" -f $jobName, $state, $sent, $details)
  } catch {
    Log ("Notify-JobResult failed: " + $_.Exception.Message)
  }
}



function Get-IntermediateFiles {
  $patterns = @("*_clip.mp4","list.txt","Skipped_Clips.txt","*_ffmpeg_log.txt","merge_ffmpeg_log.txt","merged_audio.wav")
  $seen = @{}
  $out = @()
  foreach ($pat in $patterns) {
    foreach ($it in @(Get-ChildItem -Path $Temp60 -Filter $pat -File -ErrorAction SilentlyContinue)) {
      $k = $it.FullName.ToLowerInvariant()
      if (-not $seen.ContainsKey($k)) {
        $seen[$k] = $true
        $out += $it
      }
    }
  }
  return @($out)
}



function Invoke-TempCleanup($cfg, [switch]$Now) {
  Ensure-Folders
  $mode = [string]$cfg.TempCleanupMode
  if ([string]::IsNullOrWhiteSpace($mode)) { $mode = "AgeBased" }
  $files = @(Get-IntermediateFiles)
  if ($files.Count -eq 0) { return [pscustomobject]@{ Deleted = 0; Failed = 0 } }

  if ($Now) {
    $targets = $files
  } elseif ($mode -eq "Immediate") {
    $targets = $files
  } elseif ($mode -eq "AgeBased") {
    $days = 7
    [int]::TryParse([string]$cfg.TempRetentionDays, [ref]$days) | Out-Null
    if ($days -lt 0) { $days = 0 }
    if ($days -gt 365) { $days = 365 }
    $cutoff = (Get-Date).AddDays(-1 * $days)
    $targets = @($files | Where-Object { $_.LastWriteTime -lt $cutoff })
  } else {
    return [pscustomobject]@{ Deleted = 0; Failed = 0 }
  }

  $deleted = 0
  $failed = 0
  foreach ($f in @($targets)) {
    try {
      Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
      $deleted++
      Log ("Temp cleanup deleted: " + $f.FullName)
    } catch {
      $failed++
      Log ("Temp cleanup failed: " + $f.FullName + " :: " + $_.Exception.Message)
    }
  }
  return [pscustomobject]@{ Deleted = $deleted; Failed = $failed }
}



function Validate-ClipPreset([string]$name, [int]$lengthSec, [string]$section, [object[]]$existing, [string]$excludeName = "") {
  if ([string]::IsNullOrWhiteSpace($name)) { return [pscustomobject]@{ Ok = $false; Error = "Name is required." } }
  if ($lengthSec -lt 1 -or $lengthSec -gt 600) { return [pscustomobject]@{ Ok = $false; Error = "Length must be 1-600." } }
  if (-not (@("Start","Middle","End") -contains $section)) { return [pscustomobject]@{ Ok = $false; Error = "Section must be Start/Middle/End." } }
  $nameKey = $name.Trim().ToLowerInvariant()
  $excludeKey = $excludeName.Trim().ToLowerInvariant()
  foreach ($p in @($existing)) {
    $k = ([string]$p.Name).Trim().ToLowerInvariant()
    if ($k -eq $nameKey -and $k -ne $excludeKey) {
      return [pscustomobject]@{ Ok = $false; Error = "Preset name already exists." }
    }
  }
  return [pscustomobject]@{ Ok = $true; Error = "" }
}



function Manage-ClipPresetsMenu($cfg) {
  while ($true) {
    Banner
    Write-Host ""
    Write-Host "Clip presets" -ForegroundColor Green
    $presets = @($cfg.ClipPresets)
    if ($presets.Count -eq 0) {
      Write-Host "  (none)" -ForegroundColor Yellow
    } else {
      for ($i = 0; $i -lt $presets.Count; $i++) {
        $p = $presets[$i]
        Write-Host ("  [{0}] {1}  ({2}s, {3})" -f ($i + 1), $p.Name, $p.LengthSec, $p.Section)
      }
    }
    Write-Host ""
    Write-Host "  [A] Add preset"
    Write-Host "  [R] Rename preset"
    Write-Host "  [D] Delete preset"
    Write-Host "  [0] Back"
    Write-Host ""
    $c = (Read-Host "Choose").Trim()
    if ($c -eq "0") { return }

    if ($c -match '^[aA]$') {
      $name = (Read-Host "Preset name").Trim()
      $len = Ask-ClipLengthSec $cfg
      if ($null -eq $len) { continue }
      $sec = Ask-ClipSection $cfg
      if ($null -eq $sec) { continue }
      $v = Validate-ClipPreset -name $name -lengthSec $len -section $sec -existing @($cfg.ClipPresets)
      if (-not $v.Ok) { Write-Host $v.Error -ForegroundColor Yellow; Pause-User; continue }
      $cfg.ClipPresets = @($cfg.ClipPresets) + @([pscustomobject]@{ Name = $name; LengthSec = $len; Section = $sec })
      Save-Config $cfg
      continue
    }

    if ($c -match '^[rR]$') {
      if (@($cfg.ClipPresets).Count -eq 0) { continue }
      $idxText = Read-Host "Preset number to rename"
      $idx = 0
      if (-not [int]::TryParse($idxText, [ref]$idx)) { continue }
      $idx = $idx - 1
      $arr = @($cfg.ClipPresets)
      if ($idx -lt 0 -or $idx -ge $arr.Count) { continue }
      $cur = $arr[$idx]
      $newName = (Read-Host ("New name for {0}" -f $cur.Name)).Trim()
      $v = Validate-ClipPreset -name $newName -lengthSec ([int]$cur.LengthSec) -section ([string]$cur.Section) -existing $arr -excludeName ([string]$cur.Name)
      if (-not $v.Ok) { Write-Host $v.Error -ForegroundColor Yellow; Pause-User; continue }
      $arr[$idx].Name = $newName
      $cfg.ClipPresets = $arr
      Save-Config $cfg
      continue
    }

    if ($c -match '^[dD]$') {
      if (@($cfg.ClipPresets).Count -eq 0) { continue }
      $idxText = Read-Host "Preset number to delete"
      $idx = 0
      if (-not [int]::TryParse($idxText, [ref]$idx)) { continue }
      $idx = $idx - 1
      $arr = @($cfg.ClipPresets)
      if ($idx -lt 0 -or $idx -ge $arr.Count) { continue }
      $cfg.ClipPresets = @($arr | Where-Object { $_ -ne $arr[$idx] })
      if (@($cfg.ClipPresets).Count -eq 0) {
        $cfg.ClipPresets = @(
          [pscustomobject]@{ Name = "30sec_middle"; LengthSec = 30; Section = "Middle" },
          [pscustomobject]@{ Name = "60sec_start"; LengthSec = 60; Section = "Start" }
        )
      }
      Save-Config $cfg
      continue
    }
  }
}



function Select-ClipPresetOrCustom($cfg) {
  while ($true) {
    Banner
    Write-Host ""
    Write-Host "Clip preset" -ForegroundColor Cyan
    $presets = @($cfg.ClipPresets)
    for ($i = 0; $i -lt $presets.Count; $i++) {
      $p = $presets[$i]
      Write-Host ("  [{0}] {1}  ({2}s, {3})" -f ($i + 1), $p.Name, $p.LengthSec, $p.Section)
    }
    Write-Host "  [C] Custom"
    Write-Host "  [B] Back"
    Write-Host ""
    $c = (Read-Host "Choose").Trim()
    if ($c -match '^\s*[bB]\s*$') { return $null }
    if ($c -match '^\s*[cC]\s*$') {
      $len = Ask-ClipLengthSec $cfg
      if ($null -eq $len) { return $null }
      $sec = Ask-ClipSection $cfg
      if ($null -eq $sec) { return $null }
      return [pscustomobject]@{ Name = "Custom"; LengthSec = $len; Section = $sec }
    }
    # Convenience: allow direct seconds entry here (e.g., 60).
    $secs = 0
    if ([int]::TryParse($c, [ref]$secs) -and $secs -ge 1 -and $secs -le 600) {
      if ($secs -le $presets.Count) {
        $idx = $secs - 1
        $sel = $presets[$idx]
        return [pscustomobject]@{ Name = [string]$sel.Name; LengthSec = [int]$sel.LengthSec; Section = [string]$sel.Section }
      }
      $sec = Ask-ClipSection $cfg
      if ($null -eq $sec) { return $null }
      return [pscustomobject]@{ Name = "Custom"; LengthSec = $secs; Section = $sec }
    }
    $idx = 0
    if ([int]::TryParse($c, [ref]$idx)) {
      $idx = $idx - 1
      if ($idx -ge 0 -and $idx -lt $presets.Count) {
        $sel = $presets[$idx]
        return [pscustomobject]@{ Name = [string]$sel.Name; LengthSec = [int]$sel.LengthSec; Section = [string]$sel.Section }
      }
    }
    Write-Host "Invalid choice. Pick a preset number, C, B, or enter seconds (1-600)." -ForegroundColor Yellow
  }
}



function Read-UrlQueueOrBack {
  Write-Host ""
  Write-Host "Enter one URL, or multiple URLs in one line (separate by space/comma/semicolon). Type B to go back." -ForegroundColor Cyan
  $seen = @{}
  $line = Read-Host "URL(s)"
  if ($line -match '^\s*[bB]\s*$') { return $null }
  if ([string]::IsNullOrWhiteSpace($line)) {
    Write-Host "No URL entered." -ForegroundColor Yellow
    return $null
  }

  $urls = New-Object System.Collections.Generic.List[string]
  $parts = @($line -split '[,\s;]+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  foreach ($part in $parts) {
    $u = $part.Trim().Trim('"').Trim("'")
    if ($u -match '^(www\.)?(youtube\.com|youtu\.be|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/') { $u = "https://$u" }
    if (-not ($u -match '^https?://')) {
      Write-Host ("Skipping invalid URL: {0}" -f $u) -ForegroundColor Yellow
      continue
    }
    if (Is-TikTokUrl $u) { $u = Normalize-TikTokUrl $u }
    if (-not $seen.ContainsKey($u)) {
      $seen[$u] = $true
      $urls.Add($u)
    }
  }

  if ($urls.Count -eq 0) {
    Write-Host "No valid URLs entered." -ForegroundColor Yellow
    return $null
  }
  return $urls.ToArray()
}


function Is-TikTokUrl([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $false }
  return ($url -match '(?i)^https?://([^/]+\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/')
}


function Normalize-TikTokUrl([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $url }
  if (-not (Is-TikTokUrl $url)) { return $url }
  try {
    $uri = [System.Uri]$url
    $path = $uri.AbsolutePath
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "/" }
    $clean = ("{0}://{1}{2}" -f $uri.Scheme, $uri.Host, $path.TrimEnd('/'))
    if ($clean -notmatch '^https?://') { return $url }
    return $clean
  } catch {
    return $url
  }
}


function Resolve-HttpRedirectUrl([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $url }
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Method = "GET"
    $req.AllowAutoRedirect = $true
    $req.UserAgent = "Mozilla/5.0"
    $req.Timeout = 15000
    $req.ReadWriteTimeout = 15000
    $res = $req.GetResponse()
    try {
      return [string]$res.ResponseUri.AbsoluteUri
    } finally {
      $res.Close()
    }
  } catch {
    return $url
  }
}


function Is-TikTokSoundUrl([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $false }
  return ($url -match '(?i)^https?://([^/]+\.)?tiktok\.com/.*/music/|(?i)^https?://([^/]+\.)?tiktok\.com/music/')
}


function Test-CookiesFile([string]$path) {
  $warnings = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path $path)) {
    [void]$warnings.Add("File not found.")
    return [pscustomobject]@{
      Exists = $false
      IsLikelyNetscape = $false
      HasYouTubeDomain = $false
      WarningCount = $warnings.Count
      Warnings = @($warnings.ToArray())
    }
  }

  $head = @()
  try { $head = @((Get-Content -LiteralPath $path -TotalCount 120 -ErrorAction Stop) | ForEach-Object { [string]$_ }) } catch { }
  if ((@($head)).Length -eq 0) {
    [void]$warnings.Add("File is empty or unreadable.")
    return [pscustomobject]@{
      Exists = $true
      IsLikelyNetscape = $false
      HasYouTubeDomain = $false
      WarningCount = $warnings.Count
      Warnings = @($warnings.ToArray())
    }
  }

  $joinedHead = ($head -join "`n")
  $first = [string]$head[0]
  $isJsonLike = ($first -match '^\s*[\{\[]')
  $isLikelyNetscape = ($joinedHead -match '(?i)netscape http cookie file')
  if ($isJsonLike) { [void]$warnings.Add("Looks like JSON export. yt-dlp needs Netscape cookies.txt format.") }
  if (-not $isLikelyNetscape) { [void]$warnings.Add("Missing 'Netscape HTTP Cookie File' header.") }

  $hasYouTubeDomain = $false
  foreach ($ln in $head) {
    $t = ([string]$ln).Trim()
    if ([string]::IsNullOrWhiteSpace($t) -or $t.StartsWith("#")) { continue }
    if ($t -match '(?i)(^|\s|\.)(youtube\.com|google\.com)\b') { $hasYouTubeDomain = $true; break }
  }
  if (-not $hasYouTubeDomain) { [void]$warnings.Add("No youtube.com/google.com cookie rows detected near top of file.") }

  return [pscustomobject]@{
    Exists = $true
    IsLikelyNetscape = $isLikelyNetscape
    HasYouTubeDomain = $hasYouTubeDomain
    WarningCount = $warnings.Count
    Warnings = @($warnings.ToArray())
  }
}


function Get-SafeName([string]$value, [string]$fallback = "TikTok_Sound") {
  $x = [string]$value
  if ([string]::IsNullOrWhiteSpace($x)) { return $fallback }
  $x = ($x -replace '[<>:"/\\|?*\x00-\x1F]+', '_')
  $x = ($x -replace '\s+', ' ').Trim().Trim('.')
  if ([string]::IsNullOrWhiteSpace($x)) { $x = $fallback }
  if ($x.Length -gt 80) { $x = $x.Substring(0, 80).Trim() }
  if ([string]::IsNullOrWhiteSpace($x)) { $x = $fallback }
  return $x
}


function Get-TikTokFormatSelector([string]$mode) {
  $m = [string]$mode
  switch ($m) {
    "PreferNoWatermark" {
      return "(bestvideo*[format_id!*=watermark]+bestaudio/best[format_id!*=watermark])/bestvideo*+bestaudio/best"
    }
    "PreferWatermark" {
      return "(bestvideo*[format_id*=watermark]+bestaudio/best[format_id*=watermark])/bestvideo*+bestaudio/best"
    }
    default {
      return "bestvideo*+bestaudio/best"
    }
  }
}


function Get-TikTokYtDlpArgs([string]$url, $cfg, [string]$outDir = $TikTokDir, [int]$playlistEnd = 0, [bool]$allowPlaylist = $false) {
  $mode = "Auto"
  try { if ($cfg -and $cfg.TikTokWatermarkMode) { $mode = [string]$cfg.TikTokWatermarkMode } } catch { }
  $fmt = Get-TikTokFormatSelector -mode $mode
  $args = @("--no-warnings","--no-overwrites","--paths",$outDir,"-o","%(title)s [%(id)s].%(ext)s","-f",$fmt,"--merge-output-format","mp4")
  if ($allowPlaylist) { $args += @("--yes-playlist") } else { $args += @("--no-playlist") }
  if ($playlistEnd -gt 0) { $args += @("--playlist-end", [string]$playlistEnd) }
  $args += @($url)
  return $args
}


function Get-AvailableVideoHeights([string]$url) {
  # Prefer JSON for reliable parsing across yt-dlp output variations.
  $jsonRaw = @(& yt-dlp --no-warnings --force-ipv4 --socket-timeout 12 --extractor-retries 1 --retries 1 --no-playlist -J $url 2>$null)
  $set = New-Object 'System.Collections.Generic.HashSet[int]'
  if ($jsonRaw -and $jsonRaw.Count -gt 0) {
    try {
      $obj = (($jsonRaw -join "`n") | ConvertFrom-Json -ErrorAction Stop)
      $formats = @($obj.formats)
      foreach ($f in $formats) {
        if ($null -eq $f) { continue }
        $vcodec = [string]$f.vcodec
        if ($vcodec -eq "none") { continue }
        $h = 0
        if ([int]::TryParse([string]$f.height, [ref]$h)) {
          if ($h -ge 144 -and $h -le 4320) { $null = $set.Add($h) }
        }
      }
    } catch { }
  }
  if ($set.Count -eq 0) {
    # Fallback parser for plain-text format listing.
    $lines = @(& yt-dlp --no-warnings --force-ipv4 --socket-timeout 12 --extractor-retries 1 --retries 1 -F --no-playlist $url 2>$null)
    foreach ($line in $lines) {
      if ($line -match '(?<!\d)(\d{3,4})p(?!\d)') {
        $h = [int]$matches[1]
        if ($h -ge 144 -and $h -le 4320) { $null = $set.Add($h) }
      }
    }
  }
  return @($set | Sort-Object)
}


function Select-DownloadHeightForUrl([string]$url, [int[]]$heights, [int]$defaultCap = 1080) {
  $choices = @($heights | Sort-Object -Descending)
  if ($choices.Count -eq 0) { return $null }

  $default = $null
  foreach ($h in $choices) {
    if ($h -le $defaultCap) { $default = $h; break }
  }
  if ($null -eq $default) { $default = $choices[0] }
  $defaultIndex = [array]::IndexOf($choices, $default) + 1
  if ($defaultIndex -lt 1) { $defaultIndex = 1 }

  while ($true) {
    Banner
    Write-Host ""
    Write-Host "ydl fallback quality selector" -ForegroundColor Cyan
    Write-Host ("URL: {0}" -f $url) -ForegroundColor DarkGray
    Write-Host ""
    for ($i = 0; $i -lt $choices.Count; $i++) {
      $h = [int]$choices[$i]
      $tag = if ($h -ge 2160) { " (4K class)" } else { "" }
      Write-Host ("  [{0}] {1}p{2}" -f ($i + 1), $h, $tag)
    }
    Write-Host "  [B] Back"
    Write-Host ""
    $c = (Read-Host ("Choose quality (default {0})" -f $defaultIndex)).Trim()
    if ($c -match '^\s*[bB]\s*$') { return $null }
    if ([string]::IsNullOrWhiteSpace($c)) { return [int]$default }
    $idx = 0
    if ([int]::TryParse($c, [ref]$idx) -and $idx -ge 1 -and $idx -le $choices.Count) {
      return [int]$choices[$idx - 1]
    }
    Write-Host "Invalid choice." -ForegroundColor Yellow
    Start-Sleep -Milliseconds 600
  }
}



function Run-YtDlpQueue($cfg, [string[]]$urls, [scriptblock]$argsBuilder, [string]$jobLabel) {
  $urls = @($urls)
  $total = $urls.Count
  $ok = 0
  $fail = 0
  $skip = 0
  $failList = @()
  $cancelled = $false
  Log ("Queue start job={0} count={1}" -f $jobLabel, $total)
  Write-Progress -Activity "Queue progress" -Status ("0/{0} done" -f $total) -PercentComplete 0

  function Get-TempArtifactMap([string]$folder) {
    $map = @{}
    foreach ($pat in @("*.part","*.ytdl")) {
      foreach ($f in @(Get-ChildItem -Path $folder -Filter $pat -File -ErrorAction SilentlyContinue)) {
        $map[$f.FullName.ToLowerInvariant()] = $true
      }
    }
    return $map
  }

  function Remove-NewTempArtifacts([string]$folder, $beforeMap) {
    $deleted = 0
    $failedDelete = 0
    foreach ($pat in @("*.part","*.ytdl")) {
      foreach ($f in @(Get-ChildItem -Path $folder -Filter $pat -File -ErrorAction SilentlyContinue)) {
        $k = $f.FullName.ToLowerInvariant()
        if (-not $beforeMap.ContainsKey($k)) {
          try {
            Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
            $deleted++
          } catch {
            $failedDelete++
          }
        }
      }
    }
    return [pscustomobject]@{ Deleted = $deleted; Failed = $failedDelete }
  }

  function Should-TreatAsCancel([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    return ($text -match '(?i)cancel|interrupted|operation stopped|ctrl\+c|terminated')
  }

  function Is-AgeRestrictedError([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    return ($text -match '(?i)sign in to confirm your age|age-restricted|inappropriate for some users')
  }

  function Should-AutoRetryDownload([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $true }
    return ($text -match '(?i)timed out|timeout|network|connection|reset by peer|remote host|temporarily unavailable|http error 5\d\d|unable to download|fragment|read operation')
  }

  $queueCookiesPath = $null

  for ($i = 0; $i -lt $total; $i++) {
    $u = $urls[$i]
    $queueFolder = if ($jobLabel -eq "ydla") { $MP3Dir } elseif ($jobLabel -eq "ydlta") { $TikTokMp3Dir } elseif ($jobLabel -like "ydlt*") { $TikTokDir } else { $MP4Dir }
    $status = ("[{0}/{1}] Processing..." -f ($i + 1), $total)
    Write-Progress -Activity "Queue progress" -Status $status -PercentComplete ([int](($i / [double]$total) * 100))
    Write-Host ""
    Write-Host ("[{0}/{1}] URL: {2}" -f ($i + 1), $total, $u) -ForegroundColor DarkGray
    $ytArgs = @(& $argsBuilder $u)
    $ytArgsArr = Add-YtDlpResilienceArgs -args @($ytArgs)
    $ytArgsArr = Ensure-YtDlpUrlArg -args @($ytArgsArr) -url $u
    $ytExe = "yt-dlp"
    if ($jobLabel -eq "ydlc") {
      $ytExe = Resolve-YtDlpExecutablePath
      if ($script:CookiesDebugMode) {
        $cookiePathDbg = $null
        $cookieIdx = [array]::IndexOf($ytArgsArr, "--cookies")
        if ($cookieIdx -ge 0 -and ($cookieIdx + 1) -lt (@($ytArgsArr)).Length) { $cookiePathDbg = [string]$ytArgsArr[$cookieIdx + 1] }
        if ([string]::IsNullOrWhiteSpace($cookiePathDbg)) { $cookiePathDbg = [string]$script:ResolvedYdlcCookiesPath }
        $cookieExistsDbg = $false
        if (-not [string]::IsNullOrWhiteSpace($cookiePathDbg)) { $cookieExistsDbg = Test-Path -LiteralPath $cookiePathDbg }
        Write-Host ("[DEBUG][cookies] resolved cookies path: {0}" -f $cookiePathDbg) -ForegroundColor DarkGray
        Write-Host ("[DEBUG][cookies] Test-Path: {0}" -f $cookieExistsDbg) -ForegroundColor DarkGray
        Write-Host ("[DEBUG][cookies] yt-dlp executable: {0}" -f $ytExe) -ForegroundColor DarkGray
        Write-Host ("[DEBUG][cookies] command: {0} {1}" -f $ytExe, (Format-ArgsForDebug $ytArgsArr)) -ForegroundColor DarkGray
        Log ("[DEBUG][cookies] resolved cookies path: {0}" -f $cookiePathDbg)
        Log ("[DEBUG][cookies] Test-Path: {0}" -f $cookieExistsDbg)
        Log ("[DEBUG][cookies] yt-dlp executable: {0}" -f $ytExe)
        Log ("[DEBUG][cookies] command: {0} {1}" -f $ytExe, (Format-ArgsForDebug $ytArgsArr))
      }
    }
    Log ("Queue command [{0}] {1} {2}" -f $jobLabel, $ytExe, (Format-ArgsForDebug $ytArgsArr))
    $beforeMap = Get-TempArtifactMap -folder $queueFolder
    try {
      $res = Run-ProcessWithProgress -exe $ytExe -argList $ytArgsArr -activity "yt-dlp"
    } catch {
      $msg = $_.Exception.Message
      if (Should-TreatAsCancel $msg) {
        [DjCtrlCBridge]::Reset()
        $confirm = Ask-YesNo "Cancel queue and return to main menu?" $true
        if ($confirm) {
          $cleanup = Remove-NewTempArtifacts -folder $queueFolder -beforeMap $beforeMap
          Write-Host ("Cancelled. Temp cleanup: deleted={0}, failed={1}" -f $cleanup.Deleted, $cleanup.Failed) -ForegroundColor Yellow
          Log ("Queue cancelled. Cleanup deleted={0} failed={1}" -f $cleanup.Deleted, $cleanup.Failed)
          $cancelled = $true
          break
        }
      }
      $fail++
      $failList += $u
      Log ("Queue item failed to start: " + $u + " :: " + $msg)
      continue
    }
    if ($jobLabel -eq "ydlc" -and $script:CookiesDebugMode) { Write-CookiesDebugTail $res 50 }

    if (Did-ProcessSucceed $res) {
      $ok++
      continue
    }

    $all = @()
    if ($res.StdOut) { $all += $res.StdOut }
    if ($res.StdErr) { $all += $res.StdErr }
    $joined = ($all -join "`n")
    if ($joined -match "already been downloaded|file exists") {
      $skip++
      Log ("Queue item skipped (already exists): " + $u)
    } else {
      $attemptedRetry = $false
      if (Should-AutoRetryDownload $joined) {
        $attemptedRetry = $true
        Write-Host "Transient downloader issue detected. Retrying once with safer network settings..." -ForegroundColor DarkYellow
        $retryArgsAuto = @($ytArgsArr)
        $retryArgsAuto += @("--concurrent-fragments", "1", "--retries", "8", "--fragment-retries", "8", "--file-access-retries", "8", "--retry-sleep", "2")
        $retryArgsAuto = Ensure-YtDlpUrlArg -args @($retryArgsAuto) -url $u
        Log ("Queue auto-retry command [{0}] yt-dlp {1}" -f $jobLabel, (Format-ArgsForDebug $retryArgsAuto))
        try {
          $resRetryAuto = Run-ProcessWithProgress -exe "yt-dlp" -argList $retryArgsAuto -activity "yt-dlp (retry)"
          if ($null -ne $resRetryAuto -and (Did-ProcessSucceed $resRetryAuto)) {
            $ok++
            Log ("Queue item recovered by auto-retry: " + $u)
            continue
          }
          if ($null -ne $resRetryAuto) {
            $allRetry = @()
            if ($resRetryAuto.StdOut) { $allRetry += $resRetryAuto.StdOut }
            if ($resRetryAuto.StdErr) { $allRetry += $resRetryAuto.StdErr }
            if ($allRetry.Count -gt 0) { $joined = ($allRetry -join "`n") }
          }
        } catch {
          Log ("Queue auto-retry failed to start: " + $_.Exception.Message)
        }
      }

      if (Should-TreatAsCancel $joined) {
        [DjCtrlCBridge]::Reset()
        $confirm = Ask-YesNo "Cancel queue and return to main menu?" $true
        if ($confirm) {
          $cleanup = Remove-NewTempArtifacts -folder $queueFolder -beforeMap $beforeMap
          Write-Host ("Cancelled. Temp cleanup: deleted={0}, failed={1}" -f $cleanup.Deleted, $cleanup.Failed) -ForegroundColor Yellow
          Log ("Queue cancelled. Cleanup deleted={0} failed={1}" -f $cleanup.Deleted, $cleanup.Failed)
          $cancelled = $true
          break
        }
      }
      $isAgeRestricted = Is-AgeRestrictedError $joined
      if ($isAgeRestricted) {
        Write-Host ("Age-restricted video detected for URL: {0}" -f $u) -ForegroundColor Yellow
        Write-Host "This video needs an account session that can view age-restricted content." -ForegroundColor DarkYellow
        if ($jobLabel -ne "ydlc") {
          $retryWithCookies = Ask-YesNo "Pick/use cookies.txt now and retry this URL?" $true
          if ($retryWithCookies) {
            if ([string]::IsNullOrWhiteSpace($queueCookiesPath) -or -not (Test-Path $queueCookiesPath)) {
              $defaultCookies = Join-Path $ToolsDir "cookies.txt"
              if (Test-Path $defaultCookies) {
                if (Ask-YesNo "Use cookies.txt from toolkit folder?" $true) {
                  $queueCookiesPath = $defaultCookies
                } else {
                  $pick = Pick-OneFile -title "Select cookies.txt file" -filter "Cookies|cookies.txt|All files|*.*"
                  if ($null -ne $pick -and (Test-Path $pick)) { $queueCookiesPath = $pick }
                }
              } else {
                $pick = Pick-OneFile -title "Select cookies.txt file" -filter "Cookies|cookies.txt|All files|*.*"
                if ($null -ne $pick -and (Test-Path $pick)) { $queueCookiesPath = $pick }
              }
            }

            if (-not [string]::IsNullOrWhiteSpace($queueCookiesPath) -and (Test-Path $queueCookiesPath)) {
              $retryArgs = @($ytArgs)
              if (-not ($retryArgs -contains "--cookies")) {
                if ($retryArgs.Count -ge 1 -and [string]$retryArgs[-1] -eq [string]$u) {
                  $prefix = @()
                  if ($retryArgs.Count -gt 1) { $prefix = @($retryArgs[0..($retryArgs.Count - 2)]) }
                  $retryArgs = @($prefix + @("--cookies", $queueCookiesPath, $u))
                } else {
                  $retryArgs += @("--cookies", $queueCookiesPath)
                }
              }

              Write-Host "Retrying this URL with cookies..." -ForegroundColor Cyan
              try {
                $resRetry = Run-ProcessWithProgress -exe "yt-dlp" -argList $retryArgs -activity "yt-dlp (cookies retry)"
              } catch {
                $msgRetry = $_.Exception.Message
                if (Should-TreatAsCancel $msgRetry) {
                  [DjCtrlCBridge]::Reset()
                  $confirm = Ask-YesNo "Cancel queue and return to main menu?" $true
                  if ($confirm) {
                    $cleanup = Remove-NewTempArtifacts -folder $queueFolder -beforeMap $beforeMap
                    Write-Host ("Cancelled. Temp cleanup: deleted={0}, failed={1}" -f $cleanup.Deleted, $cleanup.Failed) -ForegroundColor Yellow
                    Log ("Queue cancelled. Cleanup deleted={0} failed={1}" -f $cleanup.Deleted, $cleanup.Failed)
                    $cancelled = $true
                    break
                  }
                }
                $resRetry = $null
              }

              if ($null -ne $resRetry -and (Did-ProcessSucceed $resRetry)) {
                $ok++
                Log ("Queue item recovered with cookies retry: " + $u)
                continue
              }

              if ($null -ne $resRetry) {
                $all = @()
                if ($resRetry.StdOut) { $all += $resRetry.StdOut }
                if ($resRetry.StdErr) { $all += $resRetry.StdErr }
                $joined = ($all -join "`n")
              }
            } else {
              Write-Host "No valid cookies file selected; keeping this URL as failed." -ForegroundColor Yellow
            }
          } else {
            Write-Host "Tip: use option [3] ydlc (Cookies queue) to handle age-restricted URLs." -ForegroundColor DarkGray
          }
        } else {
          Write-Host "Cookies mode is already enabled, but this URL is still blocked." -ForegroundColor Yellow
          Write-Host "Most common causes: expired cookies, wrong account, or cookies not exported in Netscape format." -ForegroundColor DarkYellow
          Write-Host "Re-export cookies while logged in to YouTube on the same browser profile." -ForegroundColor DarkGray
        }
      }

      if (($joined -match '(?i)no working app info is available') -and ($jobLabel -like "ydlt*")) {
        Write-Host ("TikTok extractor issue for URL: {0}" -f $u) -ForegroundColor Yellow
        $tryManualCookies = Ask-YesNo "Retry this TikTok URL with a cookies.txt file now?" $true
        if ($tryManualCookies) {
          if ([string]::IsNullOrWhiteSpace($queueCookiesPath) -or -not (Test-Path $queueCookiesPath)) {
            $defaultCookies = Join-Path $ToolsDir "cookies.txt"
            if (Test-Path $defaultCookies) {
              if (Ask-YesNo "Use cookies.txt from toolkit folder?" $true) {
                $queueCookiesPath = $defaultCookies
              } else {
                $pick = Pick-OneFile -title "Select cookies.txt file for TikTok retry" -filter "Cookies|cookies.txt|All files|*.*"
                if ($null -ne $pick -and (Test-Path $pick)) { $queueCookiesPath = $pick }
              }
            } else {
              $pick = Pick-OneFile -title "Select cookies.txt file for TikTok retry" -filter "Cookies|cookies.txt|All files|*.*"
              if ($null -ne $pick -and (Test-Path $pick)) { $queueCookiesPath = $pick }
            }
          }

          if (-not [string]::IsNullOrWhiteSpace($queueCookiesPath) -and (Test-Path $queueCookiesPath)) {
            $retryArgs = @($ytArgs)
            if (-not ($retryArgs -contains "--cookies")) {
              if ($retryArgs.Count -ge 1 -and [string]$retryArgs[-1] -eq [string]$u) {
                $prefix = @()
                if ($retryArgs.Count -gt 1) { $prefix = @($retryArgs[0..($retryArgs.Count - 2)]) }
                $retryArgs = @($prefix + @("--cookies", $queueCookiesPath, $u))
              } else {
                $retryArgs += @("--cookies", $queueCookiesPath)
              }
            }
            try {
              $resRetryTk = Run-ProcessWithProgress -exe "yt-dlp" -argList $retryArgs -activity "yt-dlp (TikTok cookies retry)"
              if ($null -ne $resRetryTk -and (Did-ProcessSucceed $resRetryTk)) {
                $ok++
                Log ("Queue item recovered with manual cookies retry (TikTok): " + $u)
                continue
              }
              if ($null -ne $resRetryTk) {
                $all = @()
                if ($resRetryTk.StdOut) { $all += $resRetryTk.StdOut }
                if ($resRetryTk.StdErr) { $all += $resRetryTk.StdErr }
                $joined = ($all -join "`n")
              }
            } catch {
              $msgRetry = $_.Exception.Message
              if (Should-TreatAsCancel $msgRetry) {
                [DjCtrlCBridge]::Reset()
                $confirm = Ask-YesNo "Cancel queue and return to main menu?" $true
                if ($confirm) {
                  $cleanup = Remove-NewTempArtifacts -folder $queueFolder -beforeMap $beforeMap
                  Write-Host ("Cancelled. Temp cleanup: deleted={0}, failed={1}" -f $cleanup.Deleted, $cleanup.Failed) -ForegroundColor Yellow
                  Log ("Queue cancelled. Cleanup deleted={0} failed={1}" -f $cleanup.Deleted, $cleanup.Failed)
                  $cancelled = $true
                  break
                }
              }
            }
          } else {
            Write-Host "No valid cookies.txt selected; keeping this URL as failed." -ForegroundColor Yellow
          }
          if ($cancelled) { break }
        }
      }

      $fail++
      $failList += $u
      if ($attemptedRetry) {
        Log ("Queue item failed after auto-retry: " + $u + " :: " + $joined)
      } else {
        Log ("Queue item failed: " + $u + " :: " + $joined)
      }
      if ($joined -match '(?i)no working app info is available') {
        Write-Host ("TikTok extractor issue for URL: {0}" -f $u) -ForegroundColor Yellow
        Write-Host "This usually means yt-dlp needs an update or the URL is not a direct supported page." -ForegroundColor DarkYellow
        Write-Host "Try: [11] Update yt-dlp, then retry." -ForegroundColor DarkGray
        Write-Host "For sound mode, use a TikTok sound page URL containing /music/ ." -ForegroundColor DarkGray
      } elseif (-not $isAgeRestricted) {
        Write-Host ("yt-dlp failed for URL: {0}" -f $u) -ForegroundColor Yellow
      }
    }
  }

  Write-Progress -Activity "yt-dlp" -Completed
  Write-Progress -Activity "Queue progress" -Status ("{0}/{1} done" -f $total, $total) -PercentComplete 100
  Write-Progress -Activity "Queue progress" -Completed
  Write-Host ""
  Write-Host ("Queue done. Success={0}, Failed={1}, Skipped={2}" -f $ok, $fail, $skip) -ForegroundColor Green
  Log ("Queue end job={0} success={1} failed={2} skipped={3}" -f $jobLabel, $ok, $fail, $skip)
  return [pscustomobject]@{
    SuccessCount = $ok
    FailCount = $fail
    SkippedCount = $skip
    FailedUrls = @($failList)
    Cancelled = $cancelled
  }
}



function Read-UrlOrBack {

  while ($true) {

    Write-Host ""

    Write-Host "Paste URL then press Enter, or type B to go back:" -ForegroundColor Cyan

    $u = Read-Host "URL"

    if ($u -match '^\s*[bB]\s*$') { return $null }

    if ([string]::IsNullOrWhiteSpace($u)) {

      Write-Host "No URL entered." -ForegroundColor Yellow

      continue

    }

    return $u.Trim()

  }

}



function Pick-Files([string]$title, [string]$filter, [bool]$multi = $true, [string]$initialDir = "") {

  Add-Type -AssemblyName System.Windows.Forms | Out-Null

  $dlg = New-Object System.Windows.Forms.OpenFileDialog

  $dlg.Title = $title

  $dlg.Filter = $filter

  $dlg.Multiselect = $multi
 
  $dlg.RestoreDirectory = $true
  if (-not [string]::IsNullOrWhiteSpace($initialDir) -and (Test-Path -LiteralPath $initialDir)) {
    $dlg.InitialDirectory = $initialDir
  }

  $null = $dlg.ShowDialog()

  $picked = @($dlg.FileNames)
  if ($picked.Length -eq 0) { return @() }

  return $picked

}



function Pick-OneFile([string]$title, [string]$filter, [string]$initialDir = "") {

  $files = Pick-Files -title $title -filter $filter -multi:$false -initialDir $initialDir

  if ((@($files)).Length -eq 0) { return $null }

  return $files[0]

}


function Get-CopyrightRows {
  if (-not (Test-Path $CopyrightDbPath)) { return @() }
  try { return @(Import-Csv -Path $CopyrightDbPath) } catch { return @() }
}


function Save-CopyrightRows($rows) {
  $rows = @($rows)
  $rows |
    Sort-Object LastUpdatedAt, FileName |
    Export-Csv -Path $CopyrightDbPath -NoTypeInformation -Encoding UTF8
}


function Export-CopyrightStatsCsv($rows) {
  $rows = @($rows)
  $total = $rows.Count
  $testedNotBlocked = @($rows | Where-Object { $_.Status -eq "Tested_NotBlocked" }).Count
  $testedBlocked = @($rows | Where-Object { $_.Status -eq "Tested_Blocked" }).Count
  $testedClaimed = @($rows | Where-Object { $_.Status -eq "Tested_Claimed" }).Count
  $notTested = @($rows | Where-Object { $_.Status -eq "NotTested" }).Count
  $audio = @($rows | Where-Object { $_.MediaType -eq "Audio" }).Count
  $video = @($rows | Where-Object { $_.MediaType -eq "Video" }).Count
  $statsPath = Join-Path $ChecksDir "Copyright_Test_Stats.csv"
  @([pscustomobject]@{
    GeneratedAt        = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    TotalTracked       = $total
    TestedTotal        = ($testedNotBlocked + $testedBlocked + $testedClaimed)
    Tested_NotBlocked  = $testedNotBlocked
    Tested_Blocked     = $testedBlocked
    Tested_Claimed     = $testedClaimed
    NotTested          = $notTested
    AudioTracked       = $audio
    VideoTracked       = $video
  }) | Export-Csv -Path $statsPath -NoTypeInformation -Encoding UTF8
  return $statsPath
}


function Get-CopyrightFileKey($fileObj) {
  $name = [string]$fileObj.Name
  $len = [string]$fileObj.Length
  return ("{0}|{1}" -f $name.ToLowerInvariant(), $len)
}


function Get-CopyrightStatusChoice {
  Banner
  Write-Host ""
  Write-Host "Set status for selected files" -ForegroundColor Cyan
  Write-Host "  [1] Tested_NotBlocked"
  Write-Host "  [2] Tested_Blocked"
  Write-Host "  [3] Tested_Claimed"
  Write-Host "  [4] NotTested"
  Write-Host "  [B] Back"
  Write-Host ""
  $c = (Read-Host "Choose").Trim()
  switch ($c) {
    "1" { return "Tested_NotBlocked" }
    "2" { return "Tested_Blocked" }
    "3" { return "Tested_Claimed" }
    "4" { return "NotTested" }
    default { return $null }
  }
}


function Get-MediaTypeFromExtension([string]$ext) {
  $e = $ext.ToLowerInvariant()
  if (@(".mp3",".wav",".m4a",".aac",".flac",".ogg") -contains $e) { return "Audio" }
  if (@(".mp4",".mov",".mkv",".webm",".avi") -contains $e) { return "Video" }
  return "Other"
}


function Get-CopyrightBucketFolder([string]$section, [string]$ext) {
  $e = $ext.ToLowerInvariant()
  $bucket = "Other"
  if ($e -eq ".mp4") { $bucket = "MP4" }
  elseif ($e -eq ".mp3") { $bucket = "MP3" }
  $root = Join-Path $ChecksDir $section
  $folder = Join-Path $root $bucket
  if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
  return $folder
}

function Move-FileToBucket([string]$sourcePath, [string]$section, [string]$ext) {
  if (-not (Test-Path $sourcePath)) { return $sourcePath }
  $fi = Get-Item -LiteralPath $sourcePath -ErrorAction SilentlyContinue
  if ($null -eq $fi) { return $sourcePath }
  $destFolder = Get-CopyrightBucketFolder -section $section -ext $ext
  $destPath = Join-Path $destFolder $fi.Name
  if ([string]::Compare($fi.FullName, $destPath, $true) -eq 0) { return $fi.FullName }
  if (Test-Path $destPath) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension([string]$fi.Name)
    $destPath = Get-NextIndexedPath -folder $destFolder -baseName $baseName -ext $ext
  }
  Move-Item -LiteralPath $fi.FullName -Destination $destPath -Force -ErrorAction Stop
  return $destPath
}


function Export-CopyrightNotTestedCsv([object[]]$rows) {
  $rows = @($rows)
  $path = Join-Path $ChecksDir ("Copyright_NotTested_{0}.csv" -f (Get-Date).ToString("yyyyMMdd_HHmmss"))
  @(
    $rows |
      Where-Object { $_.Status -eq "NotTested" } |
      Sort-Object LastUpdatedAt, FileName |
      Select-Object LastUpdatedAt, MediaType, FileName, Extension, SizeBytes, Path
  ) | Export-Csv -Path $path -NoTypeInformation -Encoding UTF8
  return $path
}


function CopyrightTracker-Import($cfg, [string[]]$InputFiles = @(), [string]$ForceStatus = "", [switch]$NoPause) {
  $files = @($InputFiles)
  if ($files.Count -eq 0) {
    $files = Pick-Files -title "Pick tested/not-tested media files" -filter "Media|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.mp4;*.mov;*.mkv;*.webm;*.avi|All files|*.*" -multi:$true
  }
  if ($files.Count -eq 0) { return }

  $status = if ([string]::IsNullOrWhiteSpace($ForceStatus)) { Get-CopyrightStatusChoice } else { $ForceStatus }
  if ($null -eq $status) { return }

  $rows = @(Get-CopyrightRows)
  $map = @{}
  foreach ($r in $rows) {
    $k = [string]$r.FileKey
    if (-not [string]::IsNullOrWhiteSpace($k)) { $map[$k] = $r }
  }

  $testedStates = @("Tested_NotBlocked","Tested_Blocked","Tested_Claimed")
  $isIncomingTested = $testedStates -contains $status
  $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $added = 0
  $updated = 0
  $skipped = 0
  $movedToTested = 0
  $failedMoveToTested = 0
  $blockedMp4Names = New-Object System.Collections.Generic.List[string]

  foreach ($path in @($files)) {
    if (-not (Test-Path $path)) { continue }
    $fi = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
    if ($null -eq $fi) { continue }
    $key = Get-CopyrightFileKey $fi
    $ext = [string]$fi.Extension
    $mediaType = Get-MediaTypeFromExtension $ext
    $currentPath = [string]$fi.FullName

    if ($map.ContainsKey($key)) {
      $existing = $map[$key]
      $existingStatus = [string]$existing.Status
      $isExistingTested = $testedStates -contains $existingStatus
      if ($isIncomingTested -and $isExistingTested) {
        $skipped++
        continue
      }
      $existing.Status = $status
      $existing.MediaType = $mediaType
      $existing.LastUpdatedAt = $now
      $existing.Path = $currentPath
      if ($status -eq "Tested_Blocked" -and $ext.ToLowerInvariant() -eq ".mp4") { $blockedMp4Names.Add([string]$fi.Name) | Out-Null }
      $updated++
    } else {
      $newRow = [pscustomobject]@{
        FileKey       = $key
        FileName      = [string]$fi.Name
        Extension     = $ext
        MediaType     = $mediaType
        SizeBytes     = [string]$fi.Length
        Status        = $status
        FirstSeenAt   = $now
        LastUpdatedAt = $now
        Path          = $currentPath
      }
      $rows += $newRow
      $map[$key] = $newRow
      if ($status -eq "Tested_Blocked" -and $ext.ToLowerInvariant() -eq ".mp4") { $blockedMp4Names.Add([string]$fi.Name) | Out-Null }
      $added++
    }

    # Route tested MP4/MP3 into dedicated buckets.
    if ($isIncomingTested -and @(".mp4",".mp3") -contains $ext.ToLowerInvariant()) {
      $targetSection = "Tested"
      if ($status -eq "Tested_Blocked" -and $cfg.EnableBlockedAutoQuarantine) { $targetSection = "Blocked" }
      try {
        $destPath = Move-FileToBucket -sourcePath $currentPath -section $targetSection -ext $ext
        if ([string]::Compare($destPath, $currentPath, $true) -ne 0) { $movedToTested++ }
        $currentPath = $destPath
      } catch {
        $failedMoveToTested++
      }
      if ($map.ContainsKey($key)) {
        $map[$key].Path = $currentPath
        $map[$key].LastUpdatedAt = $now
      }
    }
  }

  Save-CopyrightRows $rows
  $statsCsv = Export-CopyrightStatsCsv $rows
  Write-Host ""
  Write-Host ("Import done. Added={0}, Updated={1}, Skipped(existing tested)={2}" -f $added, $updated, $skipped) -ForegroundColor Green
  Write-Host ("Moved to Tested buckets={0}, Move failed={1}" -f $movedToTested, $failedMoveToTested) -ForegroundColor Green
  Write-Host ("Tested MP4 folder: {0}" -f (Join-Path (Join-Path $ChecksDir "Tested") "MP4")) -ForegroundColor DarkGray
  Write-Host ("Tested MP3 folder: {0}" -f (Join-Path (Join-Path $ChecksDir "Tested") "MP3")) -ForegroundColor DarkGray
  if ($cfg.EnableBlockedAutoQuarantine) {
    Write-Host ("Blocked MP4 folder: {0}" -f (Join-Path (Join-Path $ChecksDir "Blocked") "MP4")) -ForegroundColor DarkGray
    Write-Host ("Blocked MP3 folder: {0}" -f (Join-Path (Join-Path $ChecksDir "Blocked") "MP3")) -ForegroundColor DarkGray
  }
  Write-Host ("DB: {0}" -f $CopyrightDbPath) -ForegroundColor DarkGray
  Write-Host ("Stats CSV: {0}" -f $statsCsv) -ForegroundColor DarkGray
  if ($blockedMp4Names.Count -gt 0) {
    Write-Host ""
    Write-Host ("WARNING: {0} blocked MP4 item(s) detected/imported." -f $blockedMp4Names.Count) -ForegroundColor Yellow
    foreach ($n in @($blockedMp4Names | Sort-Object -Unique | Select-Object -First 10)) {
      Write-Host ("  - {0}" -f $n) -ForegroundColor Yellow
    }
    if ($blockedMp4Names.Count -gt 10) {
      Write-Host ("  ...and {0} more" -f ($blockedMp4Names.Count - 10)) -ForegroundColor Yellow
    }
  }
  if (-not $NoPause) { Pause-User }
}


function CopyrightTracker-Stats($cfg) {
  $rows = @(Get-CopyrightRows)
  $total = $rows.Count
  $testedNotBlocked = @($rows | Where-Object { $_.Status -eq "Tested_NotBlocked" }).Count
  $testedBlocked = @($rows | Where-Object { $_.Status -eq "Tested_Blocked" }).Count
  $testedClaimed = @($rows | Where-Object { $_.Status -eq "Tested_Claimed" }).Count
  $notTested = @($rows | Where-Object { $_.Status -eq "NotTested" }).Count
  $audio = @($rows | Where-Object { $_.MediaType -eq "Audio" }).Count
  $video = @($rows | Where-Object { $_.MediaType -eq "Video" }).Count
  $testedTotal = $testedNotBlocked + $testedBlocked + $testedClaimed

  Banner
  Write-Host ""
  Write-Host "Copyright Test Stats" -ForegroundColor Cyan
  Write-Host ("  Total tracked:       {0}" -f $total)
  Write-Host ("  Tested total:        {0}" -f $testedTotal)
  Write-Host ("  Tested_NotBlocked:   {0}" -f $testedNotBlocked)
  Write-Host ("  Tested_Blocked:      {0}" -f $testedBlocked)
  Write-Host ("  Tested_Claimed:      {0}" -f $testedClaimed)
  Write-Host ("  NotTested:           {0}" -f $notTested)
  Write-Host ("  Audio tracked:       {0}" -f $audio)
  Write-Host ("  Video tracked:       {0}" -f $video)
  Write-Host ""
  Write-Host ("DB: {0}" -f $CopyrightDbPath) -ForegroundColor DarkGray
  $statsCsv = Export-CopyrightStatsCsv $rows
  Write-Host ("Stats CSV: {0}" -f $statsCsv) -ForegroundColor DarkGray
  Pause-User
}


function CopyrightTracker-Recent($cfg) {
  $rows = @(Get-CopyrightRows)
  Banner
  Write-Host ""
  Write-Host "Recent Copyright Entries (latest 25)" -ForegroundColor Cyan
  Write-Host ""
  if ($rows.Count -eq 0) {
    Write-Host "No entries yet." -ForegroundColor Yellow
    Pause-User
    return
  }
  $recent = @($rows | Sort-Object LastUpdatedAt -Descending | Select-Object -First 25)
  foreach ($r in $recent) {
    Write-Host ("[{0}] {1} | {2} | {3}" -f $r.LastUpdatedAt, $r.Status, $r.MediaType, $r.FileName)
  }
  Pause-User
}


function CopyrightTracker-RouteUntestedToFolderCore([object[]]$files, [string]$sourceLabel = "Selection", $cfg = $null) {
  if ($null -eq $files) { return }
  $files = @($files | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($files.Count -eq 0) { return }

  $rows = @(Get-CopyrightRows)
  $map = @{}
  foreach ($r in $rows) {
    $k = [string]$r.FileKey
    if (-not [string]::IsNullOrWhiteSpace($k)) { $map[$k] = $r }
  }

  $toTestRoot = Join-Path $ChecksDir "To_Test"
  if (-not (Test-Path $toTestRoot)) { New-Item -ItemType Directory -Path $toTestRoot -Force | Out-Null }

  $testedStates = @("Tested_NotBlocked","Tested_Blocked","Tested_Claimed")
  $autoQuarantineBlocked = $true
  if ($null -ne $cfg -and ($cfg.PSObject.Properties.Name -contains "EnableBlockedAutoQuarantine")) { $autoQuarantineBlocked = [bool]$cfg.EnableBlockedAutoQuarantine }
  $blockedFiles = New-Object System.Collections.Generic.List[string]
  $untestedFiles = New-Object System.Collections.Generic.List[string]
  $alreadyTestedFiles = New-Object System.Collections.Generic.List[string]
  $moved = 0
  $failedMove = 0
  $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $report = New-Object System.Collections.Generic.List[object]

  foreach ($path in @($files)) {
    if (-not (Test-Path $path)) { continue }
    $fi = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
    if ($null -eq $fi) { continue }
    $key = Get-CopyrightFileKey $fi
    $ext = [string]$fi.Extension
    $mediaType = Get-MediaTypeFromExtension $ext
    $status = "NotInRegistry"
    $action = "None"
    $destPath = ""

    if ($map.ContainsKey($key)) {
      $status = [string]$map[$key].Status
    }

    if ($status -eq "Tested_Blocked") {
      $blockedFiles.Add([string]$fi.Name) | Out-Null
      if ($autoQuarantineBlocked -and @(".mp4",".mp3") -contains $ext.ToLowerInvariant()) {
        try {
          $destPath = Move-FileToBucket -sourcePath $fi.FullName -section "Blocked" -ext $ext
          $action = "Blocked_Quarantined"
          if ($map.ContainsKey($key)) {
            $map[$key].Path = $destPath
            $map[$key].LastUpdatedAt = $now
          }
        } catch {
          $action = "Blocked_QuarantineFailed"
        }
      } else {
        $action = "Blocked_Keep"
      }
    } elseif ($testedStates -contains $status) {
      $alreadyTestedFiles.Add([string]$fi.Name) | Out-Null
      $action = "AlreadyTested_Keep"
    } else {
      $untestedFiles.Add([string]$fi.Name) | Out-Null
      $destFolder = Get-CopyrightBucketFolder -section "To_Test" -ext $ext
      $baseName = [System.IO.Path]::GetFileNameWithoutExtension([string]$fi.Name)
      $destPath = Join-Path $destFolder $fi.Name
      if (Test-Path $destPath) { $destPath = Get-NextIndexedPath -folder $destFolder -baseName $baseName -ext $ext }
      try {
        Move-Item -LiteralPath $fi.FullName -Destination $destPath -Force -ErrorAction Stop
        $moved++
        $action = "Moved_To_Test"
      } catch {
        $failedMove++
        $action = "MoveFailed"
      }

      if ($map.ContainsKey($key)) {
        $map[$key].Status = "NotTested"
        $map[$key].MediaType = $mediaType
        $map[$key].LastUpdatedAt = $now
        if ($destPath) { $map[$key].Path = $destPath }
      } else {
        $newRow = [pscustomobject]@{
          FileKey       = $key
          FileName      = [string]$fi.Name
          Extension     = $ext
          MediaType     = $mediaType
          SizeBytes     = [string]$fi.Length
          Status        = "NotTested"
          FirstSeenAt   = $now
          LastUpdatedAt = $now
          Path          = if ($destPath) { $destPath } else { [string]$fi.FullName }
        }
        $rows += $newRow
        $map[$key] = $newRow
      }
    }

    $report.Add([pscustomobject]@{
      FileName      = [string]$fi.Name
      OriginalPath  = [string]$fi.FullName
      MediaType     = $mediaType
      DetectedStatus= $status
      Action        = $action
      Destination   = $destPath
      CheckedAt     = $now
    }) | Out-Null
  }

  Save-CopyrightRows $rows
  $statsCsv = Export-CopyrightStatsCsv $rows
  $ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
  $labelSafe = (($sourceLabel -replace '[^A-Za-z0-9_-]','_').Trim('_'))
  if ([string]::IsNullOrWhiteSpace($labelSafe)) { $labelSafe = "Selection" }
  $reportPath = Join-Path $ChecksDir ("Copyright_Test_ToTest_Report_{0}_{1}.csv" -f $labelSafe, $ts)
  @($report) | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8

  Write-Host ""
  Write-Host ("Check complete. Moved to test={0}, Move failed={1}, Already tested={2}, Blocked={3}" -f $moved, $failedMove, $alreadyTestedFiles.Count, $blockedFiles.Count) -ForegroundColor Green
  Write-Host ("To-Test root: {0}" -f $toTestRoot) -ForegroundColor DarkGray
  Write-Host ("To-Test MP4: {0}" -f (Join-Path $toTestRoot "MP4")) -ForegroundColor DarkGray
  Write-Host ("To-Test MP3: {0}" -f (Join-Path $toTestRoot "MP3")) -ForegroundColor DarkGray
  Write-Host ("Report CSV: {0}" -f $reportPath) -ForegroundColor DarkGray
  Write-Host ("Stats CSV: {0}" -f $statsCsv) -ForegroundColor DarkGray

  if ($blockedFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Blocked files detected in selection:" -ForegroundColor Yellow
    foreach ($n in @($blockedFiles | Sort-Object -Unique | Select-Object -First 15)) {
      Write-Host ("  - {0}" -f $n) -ForegroundColor Yellow
    }
    if ($blockedFiles.Count -gt 15) { Write-Host ("  ...and {0} more" -f ($blockedFiles.Count - 15)) -ForegroundColor Yellow }
  }

  if ($untestedFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Untested files identified and routed to To_Test." -ForegroundColor Cyan
  } else {
    Write-Host ""
    Write-Host "No untested files found in this selection." -ForegroundColor Cyan
  }
  Pause-User
}


function CopyrightTracker-RouteUntestedToFolder($cfg) {
  $picked = Pick-Files -title "Pick media files to check against tracker" -filter "Media|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.mp4;*.mov;*.mkv;*.webm;*.avi|All files|*.*" -multi:$true
  if ($picked.Count -eq 0) { return }
  CopyrightTracker-RouteUntestedToFolderCore -files @($picked) -sourceLabel "Selection" -cfg $cfg
}


function CopyrightTracker-ProcessInbox($cfg) {
  Ensure-Folders
  $inbox = Join-Path $ChecksDir "Inbox"
  if (-not (Test-Path $inbox)) {
    New-Item -ItemType Directory -Path $inbox -Force | Out-Null
    Write-Host ""
    Write-Host ("Inbox created: {0}" -f $inbox) -ForegroundColor DarkGray
    Write-Host "Drop MP3/MP4 files there, then run this option again." -ForegroundColor Yellow
    Pause-User
    return
  }

  $allowed = @(".mp3",".wav",".m4a",".aac",".flac",".ogg",".mp4",".mov",".mkv",".webm",".avi")
  $files = @(
    Get-ChildItem -Path $inbox -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $allowed -contains $_.Extension.ToLowerInvariant() } |
      Select-Object -ExpandProperty FullName
  )
  if ($files.Count -eq 0) {
    Write-Host ""
    Write-Host ("No media files found in inbox: {0}" -f $inbox) -ForegroundColor Yellow
    Pause-User
    return
  }

  CopyrightTracker-RouteUntestedToFolderCore -files @($files) -sourceLabel "Inbox" -cfg $cfg
}


function CopyrightTracker-Dashboard($cfg) {
  while ($true) {
    $rows = @(Get-CopyrightRows)
    $notTested = @($rows | Where-Object { $_.Status -eq "NotTested" })
    $ntMp4 = @($notTested | Where-Object { $_.Extension -ieq ".mp4" }).Count
    $ntMp3 = @($notTested | Where-Object { $_.Extension -ieq ".mp3" }).Count
    $tested = @($rows | Where-Object { $_.Status -in @("Tested_NotBlocked","Tested_Blocked","Tested_Claimed") }).Count
    $blocked = @($rows | Where-Object { $_.Status -eq "Tested_Blocked" }).Count

    Banner
    Write-Host ""
    Write-Host "To_Test Dashboard" -ForegroundColor Cyan
    Write-Host ("  Total tracked: {0}" -f $rows.Count)
    Write-Host ("  Tested: {0}" -f $tested)
    Write-Host ("  Blocked: {0}" -f $blocked)
    Write-Host ("  NotTested: {0} (MP4={1}, MP3={2})" -f $notTested.Count, $ntMp4, $ntMp3)
    Write-Host ""
    Write-Host "Oldest untested (top 8):" -ForegroundColor DarkGray
    $oldest = @($notTested | Sort-Object LastUpdatedAt, FileName | Select-Object -First 8)
    if ($oldest.Count -eq 0) {
      Write-Host "  none" -ForegroundColor DarkGray
    } else {
      foreach ($r in $oldest) {
        Write-Host ("  {0} | {1} | {2}" -f $r.LastUpdatedAt, $r.MediaType, $r.FileName)
      }
    }
    Write-Host ""
    Write-Host "Quick actions:"
    Write-Host "  [1] Mark selected files as Tested_NotBlocked"
    Write-Host "  [2] Open To_Test folder"
    Write-Host "  [3] Export NotTested list to CSV"
    Write-Host "  [4] Open Blocked folder"
    Write-Host "  [B] Back"
    Write-Host ""
    $c = (Read-Host "Choose").Trim().ToUpperInvariant()
    switch ($c) {
      "1" {
        $picked = Pick-Files -title "Pick files to mark as Tested_NotBlocked" -filter "Media|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg;*.mp4;*.mov;*.mkv;*.webm;*.avi|All files|*.*" -multi:$true
        if ($picked.Count -gt 0) { CopyrightTracker-Import $cfg @($picked) "Tested_NotBlocked" }
      }
      "2" {
        $p = Join-Path $ChecksDir "To_Test"
        if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
        Start-Process $p | Out-Null
      }
      "3" {
        $csv = Export-CopyrightNotTestedCsv $rows
        Write-Host ""
        Write-Host ("Exported: {0}" -f $csv) -ForegroundColor Green
        Pause-User
      }
      "4" {
        $p = Join-Path $ChecksDir "Blocked"
        if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
        Start-Process $p | Out-Null
      }
      "B" { return }
      default { }
    }
  }
}


function CopyrightTest-Menu($cfg) {
  Ensure-Folders
  while ($true) {
    Banner
    Write-Host ""
    Write-Host "Copyright Test" -ForegroundColor Cyan
    Write-Host "  [1] Import/Update statuses"
    Write-Host "      Pick files and mark as Tested_NotBlocked / Tested_Blocked / Tested_Claimed / NotTested."
    Write-Host "      Tested MP4/MP3 files are routed to Checks\\Tested\\MP4 or Checks\\Tested\\MP3."
    Write-Host "      Blocked status auto-quarantines to Checks\\Blocked\\MP4 or \\MP3."
    Write-Host "  [2] Show stats (and export CSV)"
    Write-Host "      Displays totals and refreshes Checks\\Copyright_Test_Stats.csv."
    Write-Host "  [3] Show recent entries"
    Write-Host "      Shows latest 25 tracker updates."
    Write-Host "  [4] Check selected files -> move untested"
    Write-Host "      Scans selected files against tracker; untested move to Checks\\To_Test\\MP4 or \\MP3."
    Write-Host "      Blocked files are warned and kept in place."
    Write-Host "  [5] Process Inbox (one-click)"
    Write-Host "      Scans Checks\\Inbox recursively and runs same untested-routing + CSV report."
    Write-Host "  [6] To_Test Dashboard"
    Write-Host "      Counts + oldest untested + quick actions (mark tested/open/export CSV)."
    Write-Host "  [B] Back"
    Write-Host ""
    $c = (Read-Host "Choose").Trim()
    switch ($c.ToUpperInvariant()) {
      "1" { CopyrightTracker-Import $cfg }
      "2" { CopyrightTracker-Stats $cfg }
      "3" { CopyrightTracker-Recent $cfg }
      "4" { CopyrightTracker-RouteUntestedToFolder $cfg }
      "5" { CopyrightTracker-ProcessInbox $cfg }
      "6" { CopyrightTracker-Dashboard $cfg }
      "B" { return }
      default { }
    }
  }
}



function Get-NextIndexedPath([string]$folder, [string]$baseName, [string]$ext) {

  for ($i = 1; $i -le 999; $i++) {

    $n = "{0}_{1:D2}{2}" -f $baseName, $i, $ext

    $p = Join-Path $folder $n

    if (-not (Test-Path $p)) { return $p }

  }

  throw "Too many versions exist for $baseName"

}



function Open-IfEnabled($cfg, [string]$pathOrFolder) {

  if ($cfg.AutoOpenOutputFolder) {

    try { Start-Process $pathOrFolder | Out-Null } catch { }

  }

}



function Get-DurationSeconds([string]$filePath) {

  $raw = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $filePath

  $raw = ($raw | Out-String).Trim()

  [double]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture)

}


function Get-VideoDimensions([string]$filePath) {
  try {
    $raw = @(& ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x $filePath)
    if ($raw.Count -eq 0) { return $null }
    $line = [string]$raw[0]
    if ($line -match '^(\d+)x(\d+)$') {
      return [pscustomobject]@{ Width = [int]$matches[1]; Height = [int]$matches[2] }
    }
  } catch { }
  return $null
}



function Ask-ClipLengthSec($cfg) {

  Banner

  Write-Host ""

  Write-Host "Clip length" -ForegroundColor Cyan

  Write-Host "  [1] 15 seconds"

  Write-Host "  [2] 30 seconds"

  Write-Host "  [3] 60 seconds"

  Write-Host "  [4] Custom"

  Write-Host "  [B] Back"

  Write-Host ""

  $c = Read-Host ("Choose (default: {0}s)" -f $cfg.DefaultClipLengthSec)

  if ($c -match '^\s*[bB]\s*$') { return $null }

  $directSecs = 0
  if ([int]::TryParse([string]$c, [ref]$directSecs) -and $directSecs -ge 1 -and $directSecs -le 600) {
    return $directSecs
  }

  switch ($c) {

    "1" { return 15 }

    "2" { return 30 }

    "3" { return 60 }

    "4" {

      while ($true) {

        $x = Read-Host "Enter seconds (1 - 600)"

        $n = 0

        if ([int]::TryParse($x, [ref]$n) -and $n -ge 1 -and $n -le 600) { return $n }

        Write-Host "Invalid number." -ForegroundColor Yellow

      }

    }

    default {
      if ([string]::IsNullOrWhiteSpace($c)) { return [int]$cfg.DefaultClipLengthSec }
      Write-Host "Invalid choice. Use 1/2/3/4, B, or type seconds (1-600)." -ForegroundColor Yellow
      return Ask-ClipLengthSec $cfg
    }

  }

}



function Ask-ClipSection($cfg) {

  Banner

  Write-Host ""

  Write-Host "Which part of the video?" -ForegroundColor Cyan

  Write-Host "  [1] Start"

  Write-Host "  [2] Middle"

  Write-Host "  [3] End"

  Write-Host "  [B] Back"

  Write-Host ""

  $c = Read-Host ("Choose (default: {0})" -f $cfg.DefaultClipSection)

  if ($c -match '^\s*[bB]\s*$') { return $null }

  switch ($c) {

    "1" { return "Start" }

    "2" { return "Middle" }

    "3" { return "End" }

    default { return [string]$cfg.DefaultClipSection }

  }

}



function Ask-YesNo([string]$prompt, [bool]$defaultYes = $true) {

  $d = if ($defaultYes) { "Y" } else { "N" }

  while ($true) {

    $a = Read-Host "$prompt (Y/N, default $d)"

    if ([string]::IsNullOrWhiteSpace($a)) { return $defaultYes }

    if ($a -match '^\s*[yY]\s*$') { return $true }

    if ($a -match '^\s*[nN]\s*$') { return $false }

  }

}



function Read-CookiesPathInputOrCancel([string]$prompt = "cookies.txt path") {
  $old = $false
  try {
    $old = [Console]::TreatControlCAsInput
    [Console]::TreatControlCAsInput = $true
    $sb = New-Object System.Text.StringBuilder
    Write-Host ("{0}: " -f $prompt) -NoNewline
    while ($true) {
      $k = [Console]::ReadKey($true)
      if ($k.Key -eq [ConsoleKey]::Enter) {
        Write-Host ""
        return $sb.ToString()
      }
      if (($k.Modifiers -band [ConsoleModifiers]::Control) -and $k.Key -eq [ConsoleKey]::C) {
        Write-Host ""
        $cancelToMenu = Ask-YesNo "Cancel and return to main menu?" $true
        if ($cancelToMenu) { return $null }
        $null = $sb.Clear()
        Write-Host ("{0}: " -f $prompt) -NoNewline
        continue
      }
      $pasteRequested = ((($k.Modifiers -band [ConsoleModifiers]::Control) -and ($k.Key -eq [ConsoleKey]::V)) -or ((($k.Modifiers -band [ConsoleModifiers]::Shift) -and ($k.Key -eq [ConsoleKey]::Insert))))
      if ($pasteRequested) {
        $paste = Get-PasteableClipboardText
        if (-not [string]::IsNullOrWhiteSpace($paste)) {
          $null = $sb.Append($paste)
          try { [Console]::Write($paste) } catch { }
        }
        continue
      }
      if ($k.Key -eq [ConsoleKey]::Backspace) {
        if ($sb.Length -gt 0) {
          $null = $sb.Remove($sb.Length - 1, 1)
          try { [Console]::Write("`b `b") } catch { }
        }
        continue
      }
      if (-not [char]::IsControl($k.KeyChar)) {
        $null = $sb.Append($k.KeyChar)
        try { [Console]::Write($k.KeyChar) } catch { }
      }
    }
  } catch {
    return (Read-Host $prompt)
  } finally {
    try { [Console]::TreatControlCAsInput = $old } catch { }
  }
}


function Ask-CopyrightMergeMode {

  while ($true) {
    Banner
    Write-Host ""
    Write-Host "Merge output mode" -ForegroundColor Cyan
    Write-Host "  [1] Fast stable (recommended, keep original resolution, AR-preserved, smooth seeking)"
    Write-Host "  [2] Re-encode 720p (AR-preserved)"
    Write-Host "  [3] Re-encode 480p (AR-preserved, lower profile)"
    Write-Host "  [B] Back"
    Write-Host ""
    $c = (Read-Host "Choose (default: 1)").Trim()
    if ([string]::IsNullOrWhiteSpace($c)) { return "copy" }
    if ($c -match '^\s*[bB]\s*$') { return $null }
    switch ($c) {
      "1" { return "copy" }
      "2" { return "720" }
      "3" { return "480" }
      default { Write-Host "Invalid choice." -ForegroundColor Yellow; Start-Sleep -Milliseconds 500 }
    }
  }
}


function Maybe-RunDemucs($cfg, [string[]]$audioFiles, [string]$outFolder) {

  # Normalize: always treat as array

  $audioFiles = @($audioFiles)



  if (-not $cfg.EnableDemucs) { return }

  if (-not (Ask-YesNo "Run Demucs stems extraction now?" $true)) { return }



  $useDemucsCmd = Test-Cmd "demucs"

  $usePython    = Test-Cmd "python"

  if (-not $useDemucsCmd -and -not $usePython) {

    Write-Host ""

    Write-Host "Demucs not found." -ForegroundColor Yellow

    Write-Host "Install: pip install demucs" -ForegroundColor DarkGray

    Pause-User

    return

  }



  $stemsOut = Join-Path $outFolder "stems"

  if (-not (Test-Path $stemsOut)) { New-Item -ItemType Directory -Path $stemsOut | Out-Null }



  $total = $audioFiles.Count

  for ($i = 0; $i -lt $total; $i++) {

    $f = $audioFiles[$i]

    Write-Progress -Activity "Demucs stems" -Status ("{0}/{1} {2}" -f ($i+1),$total,(Split-Path $f -Leaf)) -PercentComplete ([int]((($i+1)/$total)*100))

    if ($useDemucsCmd) { & demucs -n $cfg.DemucsModel -o $stemsOut $f }

    else { & python -m demucs -n $cfg.DemucsModel -o $stemsOut $f }

  }

  Write-Progress -Activity "Demucs stems" -Completed

  Write-Host ""

  Write-Host "Demucs done. Stems saved to: $stemsOut" -ForegroundColor Green

  Pause-User

}



function Maybe-DetectBpm($cfg, [string[]]$audioFiles, [string]$outFolder) {

  # Normalize: always treat as array

  $audioFiles = @($audioFiles)



  if (-not $cfg.EnableBpmDetect) { return }

  if (-not (Ask-YesNo "Run BPM detect now?" $true)) { return }



  $hasAubio = Test-Cmd "aubio"

  if (-not $hasAubio) {

    Write-Host ""

    Write-Host "BPM detect tool not found (aubio)." -ForegroundColor Yellow

    Write-Host "Install: pip install aubio" -ForegroundColor DarkGray

    Pause-User

    return

  }



  $report = Join-Path $outFolder "bpm_report.txt"

  if (Test-Path $report) { Remove-Item $report -Force -ErrorAction SilentlyContinue }



  $total = $audioFiles.Count

  for ($i = 0; $i -lt $total; $i++) {

    $f = $audioFiles[$i]

    Write-Progress -Activity "BPM detect" -Status ("{0}/{1} {2}" -f ($i+1),$total,(Split-Path $f -Leaf)) -PercentComplete ([int]((($i+1)/$total)*100))

    $out = & aubio tempo $f 2>$null

    $lines = @($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $bpm = if ($lines.Count -gt 0) { $lines[-1].ToString().Trim() } else { "?" }

    Add-Content -Path $report -Value ("{0}`t{1}" -f $bpm, (Split-Path $f -Leaf))

  }

  Write-Progress -Activity "BPM detect" -Completed

  Write-Host ""

  Write-Host "BPM report saved to: $report" -ForegroundColor Green

  Pause-User

}



function Copyright-PickFiles($cfg, [string[]]$PreselectedFiles = @(), [string]$OutBaseName = "First60_Merged", [string]$SourceLabel = "Option 6") {

  Ensure-Folders

  Require-Tools



  $preset = Select-ClipPresetOrCustom $cfg
  if ($null -eq $preset) { return }
  $clipLen = [int]$preset.LengthSec
  $section = [string]$preset.Section



  $files = @($PreselectedFiles)
  if ($files.Count -eq 0) {
    $recentVideo = Get-RecentPath $cfg "video"
    if (-not [string]::IsNullOrWhiteSpace($recentVideo)) {
      Write-Host ("Recent video file: {0}" -f $recentVideo) -ForegroundColor DarkGray
      if (Ask-YesNo "Use recent video file for this run?" $false) {
        $files = @($recentVideo)
      }
    }
    if ($files.Count -eq 0) {
      $videoDir = ""
      if (-not [string]::IsNullOrWhiteSpace($recentVideo)) { $videoDir = Split-Path -Parent $recentVideo }
      $files = Pick-Files -title "Pick one or more MP4 files" -filter "MP4 Video|*.mp4|All files|*.*" -multi:$true -initialDir $videoDir
    }
  }

  if ($files.Count -eq 0) { return }
  Set-RecentPath $cfg "video" $files[0]



  $firstFolder = Split-Path -Parent $files[0]

  $outFolder = if ($cfg.OutputMode -eq "DJDownloads") { $Base } else { $firstFolder }

  $outPath = Get-NextIndexedPath -folder $outFolder -baseName $OutBaseName -ext ".mp4"



  $cleanupNow = Invoke-TempCleanup -cfg $cfg -Now
  Log ("Pre-run temp cleanup: deleted={0} failed={1}" -f $cleanupNow.Deleted, $cleanupNow.Failed)
  $list = Join-Path $Temp60 "list.txt"

  $skippedPath = Join-Path $Temp60 "Skipped_Clips.txt"
  if (Test-Path $list) { Remove-Item $list -Force -ErrorAction SilentlyContinue }
  if (Test-Path $skippedPath) { Remove-Item $skippedPath -Force -ErrorAction SilentlyContinue }
  try { Get-ChildItem -Path $Temp60 -Filter "clip_*.mp4" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }
  try { Get-ChildItem -Path $Temp60 -Filter "*_ffmpeg_log.txt" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }

  $mergeMode = Ask-CopyrightMergeMode
  if ($null -eq $mergeMode) { return }
  $modeText = if ($mergeMode -eq "copy") { "fast stable" } elseif ($mergeMode -eq "480") { "encode 480p" } else { "encode 720p" }
  $targetWidth = 1280
  $targetHeight = 720
  if ($mergeMode -eq "480") { $targetWidth = 854; $targetHeight = 480 }
  if ($mergeMode -eq "copy") {
    # Fast-stable: keep source resolution (from first selected file) for better quality.
    $dims = Get-VideoDimensions $files[0]
    if ($null -ne $dims -and $dims.Width -gt 0 -and $dims.Height -gt 0) {
      $targetWidth = [int]($dims.Width  - ($dims.Width  % 2))
      $targetHeight = [int]($dims.Height - ($dims.Height % 2))
      if ($targetWidth -lt 2) { $targetWidth = 2 }
      if ($targetHeight -lt 2) { $targetHeight = 2 }
    }
  }
  $targetVf = ("scale={0}:{1}:force_original_aspect_ratio=decrease,pad={0}:{1}:(ow-iw)/2:(oh-ih)/2,setsar=1" -f $targetWidth, $targetHeight)
  Write-Host ""
  Write-Host ("Starting {0} processing ({1})..." -f $SourceLabel, $modeText) -ForegroundColor Cyan
  Write-Host "Working... clip preparation is running." -ForegroundColor DarkGray
  $caps = Get-SystemCapabilities $false
  $useQsv = [bool]$caps.HasH264Qsv
  $videoArgs = @('-c:v','libx264','-preset','ultrafast','-crf','23','-x264-params','keyint=30:min-keyint=30:scenecut=0','-g','30')
  if ($useQsv) {
    $videoArgs = @('-c:v','h264_qsv','-global_quality','23','-g','30')
  }
  if ($useQsv) { Write-Host "Video encoder: h264_qsv (hardware accelerated)" -ForegroundColor DarkGray }
  else { Write-Host "Video encoder: libx264 (QSV not detected)" -ForegroundColor DarkGray }
  Write-Host "Encode preset: ultrafast (faster, larger files)." -ForegroundColor DarkGray
  Write-Host ("Target canvas: {0}x{1} (AR-preserved + pad)." -f $targetWidth, $targetHeight) -ForegroundColor DarkGray
  Write-Host "Clip prep: normalize each clip for stable playback and smooth seeking." -ForegroundColor DarkGray



  $total = $files.Count
  $prepSw = [System.Diagnostics.Stopwatch]::StartNew()
  $mergeSw = [System.Diagnostics.Stopwatch]::new()
  $finalSw = [System.Diagnostics.Stopwatch]::new()
  $sessionStatus = "Failed"
  $sessionNotes = ""
  $sessionSummaryPath = $null
  $createdClips = New-Object System.Collections.Generic.List[string]

  for ($i = 0; $i -lt $total; $i++) {

    $f = $files[$i]

    $leaf = Split-Path $f -Leaf
    Write-Progress -Activity "Creating clips" -Status ("{0}/{1} {2}" -f ($i+1),$total,$leaf) -PercentComplete ([int]((($i+1)/$total)*100))
    $elapsedPrep = $prepSw.Elapsed.TotalSeconds
    $avgPer = if (($i + 1) -gt 0) { $elapsedPrep / ($i + 1) } else { 0.0 }
    $etaPrep = $avgPer * ($total - ($i + 1))
    try { [Console]::Write("`rclip prep: {0}/{1} | elapsed {2} | ETA {3}   " -f ($i+1),$total,(Format-SecondsClock $elapsedPrep),(Format-SecondsClock $etaPrep)) } catch { }



    $dur = Get-DurationSeconds $f

    $start = 0.0

    if ($section -eq "Middle") { $start = [math]::Max((($dur - $clipLen) / 2.0), 0.0) }

    elseif ($section -eq "End") { $start = [math]::Max(($dur - $clipLen), 0.0) }



    $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
    $clip = Join-Path $Temp60 ("clip_{0:D4}.mp4" -f ($i + 1))



    $startStr = $start.ToString('0.###',[System.Globalization.CultureInfo]::InvariantCulture)



    $logFile = Join-Path $Temp60 ("{0}_ffmpeg_log.txt" -f $name)
    # Stable path: always re-encode normalized clip (CFR + keyframe cadence + fixed canvas).
    $seekArgs = @('-ss',$startStr,'-i',$f,'-t',$clipLen.ToString())
    if ($mergeMode -ne "copy") {
      # For 720p/480p quality modes, prefer accurate seek so requested clip length is preserved.
      $seekArgs = @('-i',$f,'-ss',$startStr,'-t',$clipLen.ToString())
    }
    $args1 = @('-hide_banner','-loglevel','error','-xerror','-y') + $seekArgs + @('-vf',$targetVf,'-vsync','cfr','-r','30') + $videoArgs + @('-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-af','aresample=async=1:first_pts=0','-movflags','+faststart',$clip)
    $res1 = Run-ProcessWithProgress -exe 'ffmpeg' -argList $args1 -activity 'ffmpeg'
    if (-not (Test-Path $clip)) {
      try { Set-Content -Path $logFile -Value ((@($res1.StdErr) + @($res1.StdOut)) -join "`r`n") -Encoding UTF8 } catch { }
      Add-Content -Path $skippedPath -Value (("SKIP: {0}  ({1})" -f $leaf, "clip creation failed - see {0}" -f $logFile))
      Log ("Clip creation failed for {0}. See log: {1}" -f $f, $logFile)
      continue
    }
    # Guardrail: if ffmpeg returned a much shorter clip than requested, auto-retry with accurate seek.
    try {
      $expected = [math]::Max([math]::Min([double]$clipLen, ([double]$dur - [double]$start)), 0.0)
      $actual = Get-DurationSeconds $clip
      if ($expected -ge 20 -and $actual -lt ($expected * 0.80)) {
        $retryArgs = @('-hide_banner','-loglevel','error','-xerror','-y','-i',$f,'-ss',$startStr,'-t',$clipLen.ToString(),'-vf',$targetVf,'-vsync','cfr','-r','30') + $videoArgs + @('-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-af','aresample=async=1:first_pts=0','-movflags','+faststart',$clip)
        $resRetry = Run-ProcessWithProgress -exe 'ffmpeg' -argList $retryArgs -activity 'ffmpeg'
        $actual2 = if (Test-Path $clip) { Get-DurationSeconds $clip } else { 0.0 }
        if ($actual2 -lt ($expected * 0.80)) {
          try { Add-Content -Path $logFile -Value ((@($resRetry.StdErr) + @($resRetry.StdOut)) -join "`r`n") } catch { }
          Add-Content -Path $skippedPath -Value (("SKIP: {0}  ({1})" -f $leaf, ("clip duration too short: expected~{0:N1}s actual~{1:N1}s" -f $expected, $actual2)))
          Log ("Clip too short for {0}: expected~{1:N1}s actual~{2:N1}s" -f $f, $expected, $actual2)
          continue
        }
      }
    } catch { }
    $createdClips.Add($clip) | Out-Null
    if (Test-Path $logFile) { Remove-Item $logFile -ErrorAction SilentlyContinue }

  }

  $prepSw.Stop()
  try { [Console]::WriteLine("") } catch { }
  Write-Progress -Activity "Creating clips" -Completed

  Push-Location $Temp60
  try {
    $clipNames = @($createdClips | ForEach-Object { Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue } | Where-Object { $null -ne $_ } | Sort-Object Name)
    if (-not $clipNames -or $clipNames.Count -eq 0) {
      $sessionStatus = "Failed"
      $sessionNotes = "No clips were created"
      Write-Host "No clips were created. Check skipped clips at: $skippedPath" -ForegroundColor Yellow
      Notify-JobResult $cfg "Copyright Pick MP4s" $false "No clips were created."
      return
    }
    if ($clipNames.Count -lt $total) {
      Write-Host ("WARNING: {0} of {1} clips were created. Check: {2}" -f $clipNames.Count, $total, $skippedPath) -ForegroundColor Yellow
      $sessionNotes = ("Partial clip set created: {0}/{1}" -f $clipNames.Count, $total)
    }

    $lines = $clipNames | ForEach-Object { "file '{0}'" -f $_.Name }
    try { Write-Utf8NoBom -Path $list -Lines $lines } catch { Write-Host "Failed to write concat list: $($_.Exception.Message)" -ForegroundColor Red; Log ("Write-Utf8NoBom failed: " + $_.Exception.ToString()); Notify-JobResult $cfg "Copyright Pick MP4s" $false "Failed to build concat list."; return }

    Write-Host ""
    Write-Host "Merging..." -ForegroundColor Green
    $mergeModeLabel = "Fast stable (auto target, ultrafast, smooth seeking)"
    if ($mergeMode -eq "720") { $mergeModeLabel = "Encode 720p ultrafast (AR-preserved)" }
    elseif ($mergeMode -eq "480") { $mergeModeLabel = "Encode 480p ultrafast (AR-preserved)" }
    Write-Host ("Mode: {0}" -f $mergeModeLabel) -ForegroundColor DarkGray
    Write-Host "Working... merge in progress. Progress updates will print below." -ForegroundColor DarkGray

    # Compute total duration once for progress + ETA.
    $totalSeconds = 0.0
    foreach ($cn in $clipNames) { $p = Join-Path $Temp60 $cn.Name; $d = Get-DurationSeconds $p; $totalSeconds += $d }
    if ($totalSeconds -le 0) { $totalSeconds = 1 }
    $mergeSw.Start()

    # Always encode on final merge to avoid concat-copy timestamp glitches (e.g., very short outputs).
    $mergeLog = Join-Path $Temp60 "merge_ffmpeg_log.txt"
    $menc = @('-hide_banner','-loglevel','error','-xerror','-y','-f','concat','-safe','0','-i',$list,'-vsync','cfr','-r','30') + $videoArgs + @('-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart',$outPath)
    $mrEnc = Run-FFmpegWithProgress -argList $menc -totalSeconds $totalSeconds -activity 'ffmpeg merge-encode'
    if (-not (Test-Path $outPath) -or -not (Did-ProcessSucceed $mrEnc)) {
      try { Set-Content -Path $mergeLog -Value ((@($mrEnc.StdErr) + @($mrEnc.StdOut)) -join "`r`n") -Encoding UTF8 } catch { }
      throw "Merge failed. See: $mergeLog"
    }
    $mergeSw.Stop()
    $sessionStatus = "Success"
    $encName = if ($useQsv) { "h264_qsv" } else { "libx264" }
    $sessionNotes = ("Output {0}x{1}; encoder={2}" -f $targetWidth, $targetHeight, $encName)

  } catch {
    if ($mergeSw.IsRunning) { $mergeSw.Stop() }
    $cancelled = ($_.Exception.Message -match '(?i)cancelled by user|ctrl\+c')
    if ($cancelled) {
      $confirmCancel = Ask-YesNo "Cancel merge and return to main menu?" $true
      if ($confirmCancel) {
        # Cancel during merge: remove partially-written outputs and temp merge artifacts.
        try { if (Test-Path $outPath) { Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue } } catch { }
        try { $rp = $outPath + ".remux.mp4"; if (Test-Path $rp) { Remove-Item -LiteralPath $rp -Force -ErrorAction SilentlyContinue } } catch { }
        try { if (Test-Path $list) { Remove-Item -LiteralPath $list -Force -ErrorAction SilentlyContinue } } catch { }
        try { if (Test-Path (Join-Path $Temp60 "merge_ffmpeg_log.txt")) { Remove-Item -LiteralPath (Join-Path $Temp60 "merge_ffmpeg_log.txt") -Force -ErrorAction SilentlyContinue } } catch { }
        try { Get-ChildItem -Path $Temp60 -Filter "clip_*.mp4" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }
        Write-Host "Merge cancelled. Temp merge files were deleted." -ForegroundColor Yellow
        Log "Merge cancelled by user; partial output/temp merge files cleaned."
        $sessionStatus = "Cancelled"
        $sessionNotes = "Cancelled by user during merge"
        $sessionSummaryPath = Add-SessionSummaryRow -jobName "Copyright Pick MP4s" -status $sessionStatus -mode $modeText -inputs $total -outputPath "" -prepSeconds $prepSw.Elapsed.TotalSeconds -mergeSeconds $mergeSw.Elapsed.TotalSeconds -finalizeSeconds 0 -notes $sessionNotes
        return
      }
      Write-Host "Merge was interrupted but not cancelled. Restart option 6 to run merge again." -ForegroundColor Yellow
      Log "Merge interrupted by Ctrl+C; user chose not to cancel/cleanup."
      $sessionStatus = "Interrupted"
      $sessionNotes = "Interrupted by Ctrl+C; cleanup declined"
      $sessionSummaryPath = Add-SessionSummaryRow -jobName "Copyright Pick MP4s" -status $sessionStatus -mode $modeText -inputs $total -outputPath "" -prepSeconds $prepSw.Elapsed.TotalSeconds -mergeSeconds $mergeSw.Elapsed.TotalSeconds -finalizeSeconds 0 -notes $sessionNotes
      Pause-User
      return
    }
    Write-Host "ERROR during merge/prepare: $($_.Exception.Message)" -ForegroundColor Red
    Log $_.Exception.ToString()
    Notify-JobResult $cfg "Copyright Pick MP4s" $false $_.Exception.Message
    $sessionStatus = "Failed"
    $sessionNotes = $_.Exception.Message
    $sessionSummaryPath = Add-SessionSummaryRow -jobName "Copyright Pick MP4s" -status $sessionStatus -mode $modeText -inputs $total -outputPath "" -prepSeconds $prepSw.Elapsed.TotalSeconds -mergeSeconds $mergeSw.Elapsed.TotalSeconds -finalizeSeconds 0 -notes $sessionNotes
    Pause-User
    return
  } finally { Pop-Location }

  if ($cfg.EnableBpmDetect) {

    $tmpAudio = Join-Path $Temp60 "merged_audio.wav"

    if (Test-Path $tmpAudio) { Remove-Item $tmpAudio -Force -ErrorAction SilentlyContinue }

    & ffmpeg -hide_banner -loglevel error -y -i $outPath -vn -ac 2 -ar 44100 $tmpAudio

    if (Test-Path $tmpAudio) {

      $audioList = @($tmpAudio)

      Maybe-DetectBpm $cfg $audioList $outFolder

      Remove-Item $tmpAudio -Force -ErrorAction SilentlyContinue

    }

  }

  $finalSw.Start()
  $cleanupAfter = Invoke-TempCleanup -cfg $cfg
  $finalSw.Stop()
  Log ("Post-run temp cleanup: deleted={0} failed={1}" -f $cleanupAfter.Deleted, $cleanupAfter.Failed)

  Write-Host ""
  Write-Host "DONE: $outPath" -ForegroundColor Green
  Write-Host ("Step timers | prep {0} | merge {1} | finalize {2}" -f (Format-SecondsClock $prepSw.Elapsed.TotalSeconds), (Format-SecondsClock $mergeSw.Elapsed.TotalSeconds), (Format-SecondsClock $finalSw.Elapsed.TotalSeconds)) -ForegroundColor DarkGray
  $sessionSummaryPath = Add-SessionSummaryRow -jobName "Copyright Pick MP4s" -status "Success" -mode $modeText -inputs $total -outputPath $outPath -prepSeconds $prepSw.Elapsed.TotalSeconds -mergeSeconds $mergeSw.Elapsed.TotalSeconds -finalizeSeconds $finalSw.Elapsed.TotalSeconds -notes $sessionNotes
  Write-Host ("Session summary CSV: {0}" -f $sessionSummaryPath) -ForegroundColor DarkGray
  Open-IfEnabled $cfg $outFolder
  Notify-JobResult $cfg "Copyright Pick MP4s" $true $outPath


  Pause-User

}



function Copyright-FixedFolder($cfg) {

  Ensure-Folders

  Require-Tools



  $inFiles = @(Get-ChildItem $MP4Dir -Filter "*.mp4" -File -ErrorAction SilentlyContinue)

  if ($inFiles.Count -eq 0) { Banner; Write-Host ""; Write-Host "No MP4 files found in: $MP4Dir" -ForegroundColor Yellow; Pause-User; return }
  $files = @($inFiles | Select-Object -ExpandProperty FullName)
  Copyright-PickFiles -cfg $cfg -PreselectedFiles $files -OutBaseName "copyright_test_full" -SourceLabel "Fixed-folder"

}



function Download-yDLQ($cfg) {

  Ensure-Folders; Require-Tools

  Banner

  Write-Host ""

  Write-Host "ydlq (MAIN): Vegas-friendly 1080p MP4" -ForegroundColor Cyan

  Write-Host "Saves to: $MP4Dir" -ForegroundColor DarkGray

  while ($true) {
    $u = Read-UrlOrBack
    if ($null -eq $u) { return }
    if (Is-TikTokUrl $u) {
      $u = Normalize-TikTokUrl (Resolve-HttpRedirectUrl $u)
      Write-Host "TikTok URL detected. Using max-quality TikTok format automatically." -ForegroundColor DarkGray
    }

    $result = Run-YtDlpQueue -cfg $cfg -urls @($u) -argsBuilder {
      param($u1)
      if (Is-TikTokUrl $u1) {
        Get-TikTokYtDlpArgs -url $u1 -cfg $cfg
      } else {
        @("--no-warnings","--no-overwrites","--paths",$MP4Dir,"-o","%(title)s [%(id)s].%(ext)s","-f","(299+140)/(137+140)/bv*[ext=mp4]+ba[ext=m4a]","--merge-output-format","mp4","--no-playlist",$u1)
      }
    } -jobLabel "ydlq"
    if ($result.Cancelled) { return }
    if (-not (Is-TikTokUrl $u)) { Open-IfEnabled $cfg $MP4Dir }
    $ok = ($result.FailCount -eq 0)
    $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
    Notify-JobResult $cfg "ydlq" $ok $summary
    Write-Host ""
    Write-Host "Ready for next URL. Type B to return." -ForegroundColor DarkGray
  }

}



function Download-yDL($cfg) {

  Ensure-Folders; Require-Tools

  Banner

  Write-Host ""

  Write-Host "ydl (Fallback): choose target quality per URL" -ForegroundColor Cyan

  Write-Host "Saves to: $MP4Dir" -ForegroundColor DarkGray

  while ($true) {
    $u = Read-UrlOrBack
    if ($null -eq $u) { return }

    $h = 1080
    if (Is-TikTokUrl $u) {
      $u = Normalize-TikTokUrl (Resolve-HttpRedirectUrl $u)
      Write-Host ""
      Write-Host ("TikTok URL detected, using maximum available quality: {0}" -f $u) -ForegroundColor DarkGray
    } else {
      Write-Host ""
      Write-Host ("Checking available qualities for: {0}" -f $u) -ForegroundColor DarkGray
      $heights = @(Get-AvailableVideoHeights -url $u)
      if ($heights.Count -eq 0) {
        Write-Host "Could not detect exact qualities; showing fallback list." -ForegroundColor Yellow
        $heights = @(240,360,480,720,1080,1440,2160)
      }
      $picked = Select-DownloadHeightForUrl -url $u -heights $heights -defaultCap 1080
      if ($null -eq $picked) { return }
      $h = [int]$picked
    }

    $result = Run-YtDlpQueue -cfg $cfg -urls @($u) -argsBuilder {
      param($u1)
      if (Is-TikTokUrl $u1) {
        Get-TikTokYtDlpArgs -url $u1 -cfg $cfg
        return
      }
      $fmt = ("bv*[vcodec^=avc1][ext=mp4][height<={0}]+ba[acodec^=mp4a]/b[ext=mp4][vcodec^=avc1][height<={0}]/bv*[ext=mp4][height<={0}]+ba[ext=m4a]/b[ext=mp4][height<={0}]" -f $h)
      @("--no-warnings","--no-overwrites","--paths",$MP4Dir,"-o","%(title)s [%(id)s].%(ext)s","-f",$fmt,"--merge-output-format","mp4","--no-playlist",$u1)
    } -jobLabel "ydl"
    if ($result.Cancelled) { return }
    if (-not (Is-TikTokUrl $u)) { Open-IfEnabled $cfg $MP4Dir }
    $ok = ($result.FailCount -eq 0)
    $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
    Notify-JobResult $cfg "ydl" $ok $summary
    Write-Host ""
    Write-Host "Ready for next URL. Type B to return." -ForegroundColor DarkGray
  }

}



function Download-yDLCookies($cfg) {

  Ensure-Folders; Require-Tools

  $defaultCookies = Resolve-PathFromScriptRoot "cookies.txt"
  $Cookies = $null

  Banner

  Write-Host ""

  Write-Host "ydlc (Cookies): age-restricted / login-needed downloads" -ForegroundColor Cyan
  $script:CookiesDebugMode = $false
  $recentCookiePath = Get-RecentPath $cfg "cookies"
  Write-Host "Drag & drop cookies.txt here, or paste full path. Press Enter to use toolkit cookies.txt. Type B to cancel." -ForegroundColor DarkGray
  if (-not [string]::IsNullOrWhiteSpace($recentCookiePath)) {
    Write-Host ("Type R to use recent cookies path: {0}" -f $recentCookiePath) -ForegroundColor DarkGray
  }
  $rawCookieInput = Read-CookiesPathInputOrCancel "cookies.txt path"
  if ($null -eq $rawCookieInput) { return }
  if ($rawCookieInput -match '^\s*[bB]\s*$') { return }

  if ($rawCookieInput -match '^\s*[rR]\s*$' -and -not [string]::IsNullOrWhiteSpace($recentCookiePath)) {
    $Cookies = $recentCookiePath
  } elseif ([string]::IsNullOrWhiteSpace($rawCookieInput)) {
    if (Test-Path -LiteralPath $defaultCookies) {
      $Cookies = $defaultCookies
    } else {
      Write-Host ""
      Write-Host "ERROR: toolkit cookies.txt not found. Paste a full cookies path." -ForegroundColor Red
      Pause-User
      return
    }
  } else {
    $candidate = ([string]$rawCookieInput).Trim().Trim('"')
    $Cookies = Resolve-PathFromScriptRoot $candidate
  }

  $Cookies = Resolve-PathFromScriptRoot $Cookies
  Write-Host ("Selected cookies file: {0}" -f $Cookies) -ForegroundColor Cyan
  $script:ResolvedYdlcCookiesPath = $Cookies

  if (-not (Test-Path -LiteralPath $Cookies)) { Write-Host ""; Write-Host "ERROR: cookies file not provided." -ForegroundColor Red; Pause-User; return }
  Set-RecentPath $cfg "cookies" $Cookies

  $urls = Read-UrlQueueOrBack
  if ($null -eq $urls) { return }

  $result = Run-YtDlpQueue -cfg $cfg -urls $urls -argsBuilder {
    param($u)
    Get-YdlcArgs -url $u -cookiesPath $Cookies
  } -jobLabel "ydlc"
  if ($result.Cancelled) { return }
  Open-IfEnabled $cfg $MP4Dir
  $ok = ($result.FailCount -eq 0)
  $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
  Notify-JobResult $cfg "ydlc" $ok $summary
  $script:CookiesDebugMode = $false
  $script:ResolvedYdlcCookiesPath = $null
  Pause-User

}



function Download-yDLTikTok($cfg) {

  Ensure-Folders; Require-Tools

  Banner

  Write-Host ""

  Write-Host "ydlt: TikTok -> MP4 (maximum quality)" -ForegroundColor Cyan
  Write-Host ("Watermark mode: {0}" -f [string]$cfg.TikTokWatermarkMode) -ForegroundColor DarkGray
  Write-Host "Saves to: $TikTokDir" -ForegroundColor DarkGray

  Write-Host ""
  Write-Host "Mode:" -ForegroundColor Cyan
  Write-Host "  [1] Normal TikTok URL queue"
  Write-Host "  [2] Sound URL batch (download first N videos from one sound)"
  Write-Host "  [3] TikTok URL queue -> MP3 (HQ)"
  Write-Host "  [B] Back"
  $mode = (Read-Host "Choose mode").Trim()
  if ($mode -match '^[bB]$') { return }

  if ($mode -eq "2") {
    $soundUrlInput = Read-UrlOrBack
    if ($null -eq $soundUrlInput) { return }
    if (-not (Is-TikTokUrl $soundUrlInput)) {
      Write-Host "Not a TikTok URL." -ForegroundColor Yellow
      Pause-User
      return
    }
    $soundUrl = Resolve-HttpRedirectUrl $soundUrlInput
    $soundUrl = Normalize-TikTokUrl $soundUrl
    if (-not (Is-TikTokSoundUrl $soundUrl)) {
      Write-Host ""
      Write-Host "This is not a TikTok SOUND page URL." -ForegroundColor Yellow
      Write-Host "For sound batch mode, paste a URL that contains /music/ ..." -ForegroundColor DarkGray
      Write-Host ("Detected URL: {0}" -f $soundUrl) -ForegroundColor DarkGray
      Write-Host "Tip: Open the sound page in TikTok, then copy that link." -ForegroundColor DarkGray
      Pause-User
      return
    }

    $n = 20
    $nRaw = Read-Host "How many videos from this sound? (1-200, default 20)"
    if (-not [string]::IsNullOrWhiteSpace($nRaw)) {
      $tmp = 0
      if ([int]::TryParse($nRaw, [ref]$tmp) -and $tmp -ge 1 -and $tmp -le 200) { $n = $tmp }
    }

    $soundName = "TikTok_Sound"
    try {
      $jsonLines = @(& yt-dlp --no-warnings --force-ipv4 --socket-timeout 12 --extractor-retries 1 --retries 1 --flat-playlist -J $soundUrl 2>$null)
      if ($jsonLines.Count -gt 0) {
        $obj = (($jsonLines -join "`n") | ConvertFrom-Json -ErrorAction SilentlyContinue)
        if ($obj) {
          if ($obj.title) { $soundName = [string]$obj.title }
          elseif ($obj.playlist_title) { $soundName = [string]$obj.playlist_title }
        }
      }
    } catch { }
    $soundName = Get-SafeName -value $soundName -fallback "TikTok_Sound"
    $soundFolder = Join-Path $TikTokDir $soundName
    if (-not (Test-Path $soundFolder)) { New-Item -ItemType Directory -Path $soundFolder | Out-Null }

    Write-Host ("Sound folder: {0}" -f $soundFolder) -ForegroundColor DarkGray
    Write-Host ("Downloading first {0} videos from this sound..." -f $n) -ForegroundColor DarkGray

    $result = Run-YtDlpQueue -cfg $cfg -urls @($soundUrl) -argsBuilder {
      param($u)
      Get-TikTokYtDlpArgs -url $u -cfg $cfg -outDir $soundFolder -playlistEnd $n -allowPlaylist $true
    } -jobLabel "ydlt-sound"
    if ($result.Cancelled) { return }

    if ($result.FailCount -gt 0) {
      Write-Host ""
      Write-Host "Sound-page extraction failed for this URL." -ForegroundColor Yellow
      $useManualList = Ask-YesNo "Use a .txt/.csv file with TikTok video links for this sound?" $true
      if ($useManualList) {
        $listFile = Pick-OneFile -title "Select .txt/.csv containing TikTok video URLs" -filter "Text/CSV|*.txt;*.csv|All files|*.*"
        if ($null -ne $listFile -and (Test-Path $listFile)) {
          $raw = Get-Content -Path $listFile -Raw -ErrorAction SilentlyContinue
          $tokens = @([regex]::Matches([string]$raw, 'https?://[^\s,"''<>]+') | ForEach-Object { $_.Value })
          $seen = @{}
          $manualUrls = New-Object System.Collections.Generic.List[string]
          foreach ($t in $tokens) {
            $u2 = Normalize-TikTokUrl ([string]$t)
            if (-not (Is-TikTokUrl $u2)) { continue }
            if ($seen.ContainsKey($u2)) { continue }
            $seen[$u2] = $true
            $manualUrls.Add($u2)
          }
          if ($manualUrls.Count -eq 0) {
            Write-Host "No valid TikTok URLs found in file." -ForegroundColor Yellow
          } else {
            Write-Host ("Found {0} TikTok URL(s) in file. Downloading into sound folder..." -f $manualUrls.Count) -ForegroundColor DarkGray
            $resultManual = Run-YtDlpQueue -cfg $cfg -urls $manualUrls.ToArray() -argsBuilder {
              param($u)
              Get-TikTokYtDlpArgs -url $u -cfg $cfg -outDir $soundFolder
            } -jobLabel "ydlt-sound-manual"
            if ($resultManual.Cancelled) { return }
            $okManual = ($resultManual.FailCount -eq 0)
            $summaryManual = ("Success={0}, Failed={1}, Skipped={2}, Folder={3}" -f $resultManual.SuccessCount, $resultManual.FailCount, $resultManual.SkippedCount, $soundFolder)
            Notify-JobResult $cfg "ydlt-sound-manual" $okManual $summaryManual
            Pause-User
            return
          }
        } else {
          Write-Host "No list file selected." -ForegroundColor Yellow
        }
      }
    }

    $ok = ($result.FailCount -eq 0)
    $summary = ("Success={0}, Failed={1}, Skipped={2}, Folder={3}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount, $soundFolder)
    Notify-JobResult $cfg "ydlt-sound" $ok $summary
    Pause-User
    return
  }

  if ($mode -eq "3") {
    Write-Host "Saves MP3 to: $TikTokMp3Dir" -ForegroundColor DarkGray
    $urls = Read-UrlQueueOrBack
    if ($null -eq $urls) { return }

    $tkUrls = @($urls | Where-Object { Is-TikTokUrl $_ })
    $nonTk = @($urls | Where-Object { -not (Is-TikTokUrl $_) })
    if ($tkUrls.Count -eq 0) {
      Write-Host ""
      Write-Host "No TikTok URLs detected. Use this option for TikTok links only." -ForegroundColor Yellow
      Pause-User
      return
    }
    if ($nonTk.Count -gt 0) {
      Write-Host ""
      Write-Host ("Skipping {0} non-TikTok URL(s) in this option." -f $nonTk.Count) -ForegroundColor Yellow
    }

    $result = Run-YtDlpQueue -cfg $cfg -urls $tkUrls -argsBuilder {
      param($u)
      @("--no-warnings","--no-overwrites","--paths",$TikTokMp3Dir,"-o","%(title)s [%(id)s].%(ext)s","-f","bestaudio/best","-x","--audio-format","mp3","--audio-quality","0","--no-playlist",$u)
    } -jobLabel "ydlta"
    if ($result.Cancelled) { return }
    $ok = ($result.FailCount -eq 0)
    $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
    Notify-JobResult $cfg "ydlta" $ok $summary
    Pause-User
    return
  }

  if ($mode -ne "1" -and -not [string]::IsNullOrWhiteSpace($mode)) {
    Write-Host "Invalid mode." -ForegroundColor Yellow
    Pause-User
    return
  }

  while ($true) {
    $u = Read-UrlOrBack
    if ($null -eq $u) { return }

    $u = Normalize-TikTokUrl (Resolve-HttpRedirectUrl $u)
    if (-not (Is-TikTokUrl $u)) {
      Write-Host "No TikTok URL detected. Paste a TikTok link, or B to go back." -ForegroundColor Yellow
      continue
    }

    $result = Run-YtDlpQueue -cfg $cfg -urls @($u) -argsBuilder {
      param($u1)
      Get-TikTokYtDlpArgs -url $u1 -cfg $cfg
    } -jobLabel "ydlt"
    if ($result.Cancelled) { return }
    $ok = ($result.FailCount -eq 0)
    $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
    Notify-JobResult $cfg "ydlt" $ok $summary
    Write-Host ""
    Write-Host "Ready for next TikTok URL. Type B to return." -ForegroundColor DarkGray
  }

}


function Download-yDLAMp3($cfg) {

  Ensure-Folders; Require-Tools

  Banner

  Write-Host ""

  Write-Host "ydla: YouTube -> MP3 (HQ)" -ForegroundColor Cyan

  Write-Host "Saves to: $MP3Dir" -ForegroundColor DarkGray

  $urls = Read-UrlQueueOrBack
  if ($null -eq $urls) { return }

  $result = Run-YtDlpQueue -cfg $cfg -urls $urls -argsBuilder {
    param($u)
    @("--no-warnings","--no-overwrites","--paths",$MP3Dir,"-o","%(title)s [%(id)s].%(ext)s","-f","bestaudio","-x","--audio-format","mp3","--audio-quality","0","--no-playlist",$u)
  } -jobLabel "ydla"
  if ($result.Cancelled) { return }
  Open-IfEnabled $cfg $MP3Dir
  $ok = ($result.FailCount -eq 0)
  $summary = ("Success={0}, Failed={1}, Skipped={2}" -f $result.SuccessCount, $result.FailCount, $result.SkippedCount)
  Notify-JobResult $cfg "ydla" $ok $summary
  Pause-User

}


function Convert-VideoFilesToMp3($cfg) {

  Ensure-Folders; Require-Tools

  Banner
  Write-Host ""
  Write-Host "v2a: Convert local videos to MP3 (HQ)" -ForegroundColor Cyan
  Write-Host "Saves to: $VideoToMp3Dir" -ForegroundColor DarkGray

  $recentVideo = Get-RecentPath $cfg "video"
  $videoDir = ""
  if (-not [string]::IsNullOrWhiteSpace($recentVideo)) { $videoDir = Split-Path -Parent $recentVideo }

  $files = Pick-Files -title "Pick one or more video files to convert to MP3" -filter "Video|*.mp4;*.mov;*.mkv;*.webm;*.avi;*.m4v|All files|*.*" -multi:$true -initialDir $videoDir
  $files = @($files)
  if ($files.Count -eq 0) { return }

  Set-RecentPath $cfg "video" $files[0]
  if (-not (Test-Path $VideoToMp3Dir)) { New-Item -ItemType Directory -Path $VideoToMp3Dir -Force | Out-Null }

  $ok = 0
  $failed = 0
  $total = $files.Count

  for ($i = 0; $i -lt $total; $i++) {
    $f = $files[$i]
    $leaf = Split-Path $f -Leaf
    $baseName = ([System.IO.Path]::GetFileNameWithoutExtension($leaf) -replace '[^\w\.-]+','_').Trim('_')
    if ([string]::IsNullOrWhiteSpace($baseName)) { $baseName = "audio" }
    $outPath = Get-NextIndexedPath -folder $VideoToMp3Dir -baseName $baseName -ext ".mp3"

    Write-Host ""
    Write-Host ("[{0}/{1}] {2}" -f ($i+1), $total, $leaf) -ForegroundColor DarkGray

    try {
      $dur = Get-DurationSeconds $f
      if ($dur -lt 1) { $dur = 1 }
      $res = Run-FFmpegWithProgress -argList @("-hide_banner","-y","-i",$f,"-vn","-map_metadata","-1","-c:a","libmp3lame","-q:a","0",$outPath) -totalSeconds $dur -activity "video -> mp3"
      if ($res.ExitCode -eq 0 -and (Test-Path $outPath)) {
        $ok++
      } else {
        $failed++
        Write-Host ("Failed to convert: {0}" -f $leaf) -ForegroundColor Yellow
      }
    } catch {
      if ($_.Exception -is [System.OperationCanceledException] -and $_.Exception.Message -eq "__DJ_RETURN_MAIN_MENU__") {
        throw
      }
      $failed++
      Write-Host ("Failed to convert: {0}" -f $leaf) -ForegroundColor Yellow
      Log $_.Exception.ToString()
    }
  }

  Write-Host ""
  Write-Host ("DONE. Converted={0}, Failed={1}" -f $ok, $failed) -ForegroundColor Green
  Open-IfEnabled $cfg $VideoToMp3Dir
  Notify-JobResult $cfg "Video -> MP3" ($failed -eq 0) ("Converted={0}, Failed={1}" -f $ok, $failed)
  Pause-User

}



function Wrap-AudioToMp4($cfg) {

  Ensure-Folders; Require-Tools

  Banner

  Write-Host ""
 
  Write-Host "wrap: MP3 + image -> MP4" -ForegroundColor Cyan
 
  $recentAudio = Get-RecentPath $cfg "audio"
  if (-not [string]::IsNullOrWhiteSpace($recentAudio)) {
    Write-Host ("Recent audio file: {0}" -f $recentAudio) -ForegroundColor DarkGray
    if (Ask-YesNo "Use recent audio file?" $true) {
      $audio = $recentAudio
    } else {
      $audio = $null
    }
  } else {
    $audio = $null
  }
  if ([string]::IsNullOrWhiteSpace($audio)) {
    $audioDir = ""
    if (-not [string]::IsNullOrWhiteSpace($recentAudio)) { $audioDir = Split-Path -Parent $recentAudio }
    $audio = Pick-OneFile -title "Pick ONE MP3 file" -filter "MP3 Audio|*.mp3|All files|*.*" -initialDir $audioDir
  }
 
  if ($null -eq $audio) { return }
  Set-RecentPath $cfg "audio" $audio
 
  $image = Pick-OneFile -title "Pick ONE image file" -filter "Image|*.jpg;*.jpeg;*.png;*.webp;*.bmp|All files|*.*" -initialDir (Split-Path -Parent $audio)

  if ($null -eq $image) { return }

  $folder = Split-Path -Parent $audio

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($audio)

  $out = Get-NextIndexedPath -folder $folder -baseName $baseName -ext ".mp4"

  Write-Progress -Activity "ffmpeg" -Status "Wrapping..." -PercentComplete 10

  & ffmpeg -y -loop 1 -i $image -i $audio -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a copy -shortest $out

  if ($LASTEXITCODE -ne 0) {
    Notify-JobResult $cfg "wrap" $false "ffmpeg wrap failed."
    throw "ffmpeg wrap failed."
  }

  Write-Progress -Activity "ffmpeg" -Completed

  Write-Host ""; Write-Host "DONE: $out" -ForegroundColor Green

  Open-IfEnabled $cfg $folder
  Notify-JobResult $cfg "wrap" $true $out

  Pause-User

}



function Update-ytdlp {

  if (-not (Test-Cmd "yt-dlp")) { Write-Host ""; Write-Host "yt-dlp not found in PATH." -ForegroundColor Yellow; Pause-User; return }

  Banner

  Write-Host ""; Write-Host "Updating yt-dlp..." -ForegroundColor Green

  & yt-dlp -U

  Pause-User

}



function Settings-Menu($cfg) {

  while ($true) {
    $script:UiProgressMode = [string]$cfg.UIProgressMode
    Apply-UiTheme ([string]$cfg.UITheme)

    Banner

    Write-Host ""

    Write-Host "SETTINGS (saved to config.json)" -ForegroundColor Green

    Write-Host ("  [1] Auto-open output folder: {0}" -f $cfg.AutoOpenOutputFolder)

    Write-Host ("  [2] Default clip length (sec): {0}" -f $cfg.DefaultClipLengthSec)

    Write-Host ("  [3] Default clip section: {0}" -f $cfg.DefaultClipSection)

    Write-Host ("  [4] Output mode for Pick MP4s: {0}" -f $cfg.OutputMode)

    Write-Host ("  [5] Enable Demucs option: {0}" -f $cfg.EnableDemucs)

    Write-Host ("  [6] Enable BPM detect option: {0}" -f $cfg.EnableBpmDetect)

    Write-Host ("  [7] Demucs model: {0}" -f $cfg.DemucsModel)
    Write-Host ("  [8] Temp cleanup mode: {0}" -f $cfg.TempCleanupMode)
    Write-Host ("  [9] Temp retention days: {0}" -f $cfg.TempRetentionDays)
    Write-Host "  [10] Delete temp/intermediate files now"
    Write-Host ("  [11] Manage clip presets ({0})" -f (@($cfg.ClipPresets).Count))
    Write-Host ("  [12] Notify on batch complete: {0}" -f $cfg.NotifyOnBatchComplete)
    Write-Host ("  [13] Notify on batch failure: {0}" -f $cfg.NotifyOnBatchFailure)
    Write-Host ("  [14] Progress output mode: {0}" -f $cfg.UIProgressMode)
    Write-Host ("  [15] Blocked auto-quarantine: {0}" -f $cfg.EnableBlockedAutoQuarantine)
    Write-Host "  [16] Refresh system capability cache"
    Write-Host ("  [17] UI theme: {0}" -f $cfg.UITheme)
    Write-Host ("  [18] TikTok watermark mode: {0}" -f $cfg.TikTokWatermarkMode)
    Write-Host "  [19] Safe reset (clear temp/session state, keep outputs)"

    Write-Host "  [0] Back"

    Write-Host ""

    $c = Read-Host "Choose"

    switch ($c) {

      "1" { $cfg.AutoOpenOutputFolder = -not $cfg.AutoOpenOutputFolder; Save-Config $cfg }

      "2" { $x = Read-Host "Enter default clip seconds (1-600)"; $n=0; if ([int]::TryParse($x,[ref]$n) -and $n -ge 1 -and $n -le 600) { $cfg.DefaultClipLengthSec=$n; Save-Config $cfg } }

      "3" { $x = (Read-Host "Enter Start / Middle / End").Trim(); if (@("Start","Middle","End") -contains $x) { $cfg.DefaultClipSection=$x; Save-Config $cfg } }

      "4" { $x = (Read-Host "Enter SameFolder or DJDownloads").Trim(); if (@("SameFolder","DJDownloads") -contains $x) { $cfg.OutputMode=$x; Save-Config $cfg } }

      "5" { $cfg.EnableDemucs = -not $cfg.EnableDemucs; Save-Config $cfg }

      "6" { $cfg.EnableBpmDetect = -not $cfg.EnableBpmDetect; Save-Config $cfg }

      "7" { $x = (Read-Host "Enter Demucs model (example: htdemucs)").Trim(); if ($x) { $cfg.DemucsModel=$x; Save-Config $cfg } }

      "8" {
        $x = (Read-Host "Enter AgeBased / Immediate / ManualOnly").Trim()
        if (@("AgeBased","Immediate","ManualOnly") -contains $x) { $cfg.TempCleanupMode = $x; Save-Config $cfg }
      }

      "9" {
        $x = Read-Host "Enter retention days (0-365)"
        $n = 0
        if ([int]::TryParse($x,[ref]$n) -and $n -ge 0 -and $n -le 365) { $cfg.TempRetentionDays = $n; Save-Config $cfg }
      }

      "10" {
        $res = Invoke-TempCleanup -cfg $cfg -Now
        Write-Host ("Deleted: {0}, Failed: {1}" -f $res.Deleted, $res.Failed) -ForegroundColor Green
        Pause-User
      }

      "11" { Manage-ClipPresetsMenu $cfg; Save-Config $cfg }

      "12" { $cfg.NotifyOnBatchComplete = -not $cfg.NotifyOnBatchComplete; Save-Config $cfg }

      "13" { $cfg.NotifyOnBatchFailure = -not $cfg.NotifyOnBatchFailure; Save-Config $cfg }

      "14" {
        $x = (Read-Host "Enter Clean or Verbose").Trim()
        if (@("Clean","Verbose") -contains $x) { $cfg.UIProgressMode = $x; $script:UiProgressMode = $x; Save-Config $cfg }
      }

      "15" { $cfg.EnableBlockedAutoQuarantine = -not $cfg.EnableBlockedAutoQuarantine; Save-Config $cfg }

      "16" {
        $caps = Get-SystemCapabilities $true
        Write-Host ""
        Write-Host ("Capability cache refreshed: {0}" -f $CapabilityCachePath) -ForegroundColor Green
        Write-Host ("  Has h264_qsv: {0}" -f $caps.HasH264Qsv)
        Write-Host ("  Has h264_nvenc: {0}" -f $caps.HasH264Nvenc)
        Pause-User
      }

      "17" {
        $x = (Read-Host "Enter NeonRed / CyberBlue / MatrixGreen").Trim()
        if (@("NeonRed","CyberBlue","MatrixGreen") -contains $x) {
          $cfg.UITheme = $x
          Apply-UiTheme $x
          Save-Config $cfg
        }
      }

      "18" {
        $x = (Read-Host "Enter Auto / PreferNoWatermark / PreferWatermark").Trim()
        if (@("Auto","PreferNoWatermark","PreferWatermark") -contains $x) {
          $cfg.TikTokWatermarkMode = $x
          Save-Config $cfg
        }
      }

      "19" {
        if (-not (Ask-YesNo "Run safe reset now? This will clear temp/session state only." $false)) { continue }
        $r = Invoke-SafeReset $cfg
        Write-Host ""
        Write-Host "Safe reset complete." -ForegroundColor Green
        Write-Host ("  Temp cleanup: deleted={0}, failed={1}" -f $r.TempDeleted, $r.TempFailed) -ForegroundColor DarkGray
        Write-Host ("  Session files removed: {0}, failed ops: {1}" -f $r.FilesDeleted, $r.FilesFailed) -ForegroundColor DarkGray
        Pause-User
      }

      "0" { return }

      default { }

    }

  }

}



function Producer-Demucs($cfg) {

  Ensure-Folders

  if (-not $cfg.EnableDemucs) {
    Banner
    Write-Host ""
    Write-Host "Demucs is DISABLED in Settings." -ForegroundColor Yellow
    Write-Host "Go to [10] Settings and enable: EnableDemucs" -ForegroundColor DarkGray
    Pause-User
    return
  }

  $recentAudio = Get-RecentPath $cfg "audio"
  $audioDir = ""
  if (-not [string]::IsNullOrWhiteSpace($recentAudio)) { $audioDir = Split-Path -Parent $recentAudio }
  $files = Pick-Files -title "Pick one or more audio files for Demucs" -filter "Audio|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg|All files|*.*" -multi:$true -initialDir $audioDir
  $files = @($files)
  if ($files.Count -eq 0) {
    $audioExt = @(".mp3",".wav",".m4a",".aac",".flac",".ogg")
    $fallback = @(
      Get-ChildItem -Path $ToolsDir -File -ErrorAction SilentlyContinue |
        Where-Object { $audioExt -contains $_.Extension.ToLowerInvariant() } |
        Select-Object -ExpandProperty FullName
    )
    if ($fallback.Count -gt 0) {
      Write-Host ""
      Write-Host ("No file selected. Found {0} audio file(s) in toolkit folder." -f $fallback.Count) -ForegroundColor Yellow
      if (Ask-YesNo "Use toolkit-folder audio files for Demucs test?" $true) {
        $files = @($fallback)
      } else {
        return
      }
    } else {
      Write-Host ""
      Write-Host "No audio selected and none found in toolkit folder." -ForegroundColor Yellow
      Pause-User
      return
    }
  }
  if ($files.Count -gt 0) { Set-RecentPath $cfg "audio" $files[0] }

  $outFolder = Split-Path -Parent $files[0]
  $stemsOut = Join-Path $outFolder "stems"
  if (-not (Test-Path $stemsOut)) { New-Item -ItemType Directory -Path $stemsOut | Out-Null }

  # Prefer demucs.exe if present. Otherwise fall back to python -m demucs (but verify module exists).
  $useDemucsCmd = Test-Cmd "demucs"
  $usePython    = Test-Cmd "python"

  if (-not $useDemucsCmd -and -not $usePython) {
    Banner
    Write-Host ""
    Write-Host "Demucs not found (no 'demucs' command and no 'python')." -ForegroundColor Yellow
    Write-Host "Install Python + Demucs, then run again." -ForegroundColor DarkGray
    Write-Host "Quick install: pip install -U demucs" -ForegroundColor DarkGray
    Pause-User
    return
  }

  if (-not $useDemucsCmd -and $usePython) {
    # Check that python can import demucs before we start (otherwise the tool will 'finish' instantly with no output).
    $importOk = $true
    try {
      $null = & python -c "import demucs" 2>$null
      if ($LASTEXITCODE -ne 0) { $importOk = $false }
    } catch { $importOk = $false }

    if (-not $importOk) {
      Banner
      Write-Host ""
      Write-Host "Python found, but Demucs is not installed for that Python." -ForegroundColor Yellow
      Write-Host "Fix: pip install -U demucs" -ForegroundColor DarkGray
      Write-Host "Then restart this toolkit and try again." -ForegroundColor DarkGray
      Pause-User
      return
    }
  }

  $total = $files.Count
  $failures = @()
  $retrySucceeded = 0
  $demucsSaveArgs = @("--mp3","--mp3-bitrate","320","--mp3-preset","2")

  for ($i = 0; $i -lt $total; $i++) {

    $f = $files[$i]
    Write-Progress -Activity "Demucs stems" -Status ("{0}/{1} {2}" -f ($i+1),$total,(Split-Path $f -Leaf)) -PercentComplete ([int]((($i+1)/$total)*100))

    try {
      $exit = 1
      $used = ""
      if ($useDemucsCmd) {
        $used = "demucs"
        & demucs -n $cfg.DemucsModel -o $stemsOut @demucsSaveArgs $f 2>&1 | Out-Host
        $exit = $LASTEXITCODE
      } else {
        $used = "python -m demucs"
        & python -m demucs -n $cfg.DemucsModel -o $stemsOut @demucsSaveArgs $f 2>&1 | Out-Host
        $exit = $LASTEXITCODE
      }

      # On some Windows setups demucs.exe can fail while python module run works.
      if ($exit -ne 0 -and $usePython -and $used -ne "python -m demucs") {
        Write-Host ("Demucs command failed for {0}; retrying with python -m demucs..." -f (Split-Path $f -Leaf)) -ForegroundColor Yellow
        & python -m demucs -n $cfg.DemucsModel -o $stemsOut @demucsSaveArgs $f 2>&1 | Out-Host
        $exit = $LASTEXITCODE
        if ($exit -eq 0) { $retrySucceeded++ }
      }

      if ($exit -ne 0) {
        $failures += (Split-Path $f -Leaf)
      }
    } catch {
      $failures += (Split-Path $f -Leaf)
    }
  }

  Write-Progress -Activity "Demucs stems" -Completed

  Write-Host ""

  # Validate that demucs actually created output (mp3/wav depending on demucs args/version)
  $hasAnyOutput = $false
  try {
    $items = Get-ChildItem -Path $stemsOut -Recurse -File -ErrorAction SilentlyContinue
    if ($items -and $items.Count -gt 0) { $hasAnyOutput = $true }
  } catch { }

  if (-not $hasAnyOutput) {
    Write-Host "Demucs finished but no stems were created in: $stemsOut" -ForegroundColor Yellow
    Write-Host ("Expected model subfolder: {0}" -f (Join-Path $stemsOut [string]$cfg.DemucsModel)) -ForegroundColor DarkGray
    if ($failures.Count -gt 0) {
      Write-Host ("Files with failed exit code: {0}" -f ($failures -join ", ")) -ForegroundColor Yellow
    }
    Write-Host "Most common cause: Demucs isn't installed (or model download failed)." -ForegroundColor DarkGray
    Write-Host "Try in a normal terminal:" -ForegroundColor DarkGray
    Write-Host "  demucs --help" -ForegroundColor DarkGray
    Write-Host "  OR: python -m demucs --help" -ForegroundColor DarkGray
    Write-Host "Install/update: pip install -U demucs" -ForegroundColor DarkGray
    Notify-JobResult $cfg "Demucs" $false "No stems created."
    Pause-User
    return
  }

  if ($failures.Count -gt 0) {
    Write-Host ("DONE (with warnings). Some files failed: {0}" -f ($failures -join ", ")) -ForegroundColor Yellow
    if ($retrySucceeded -gt 0) { Write-Host ("Retry via python -m demucs succeeded for {0} file(s)." -f $retrySucceeded) -ForegroundColor DarkGray }
    Write-Host "Stems folder: $stemsOut" -ForegroundColor Green
    Notify-JobResult $cfg "Demucs" $false ("Failures={0}; Output={1}" -f $failures.Count, $stemsOut)
  } else {
    Write-Host "DONE. Stems saved to: $stemsOut" -ForegroundColor Green
    if ($retrySucceeded -gt 0) { Write-Host ("Retry via python -m demucs succeeded for {0} file(s)." -f $retrySucceeded) -ForegroundColor DarkGray }
    Notify-JobResult $cfg "Demucs" $true $stemsOut
  }

  Open-IfEnabled $cfg $outFolder
  Pause-User
}



function Producer-Bpm($cfg) {

  Ensure-Folders

  if (-not $cfg.EnableBpmDetect) {

    Banner

    Write-Host ""

    Write-Host "BPM Detect is DISABLED in Settings." -ForegroundColor Yellow

    Write-Host "Go to [10] Settings and enable: EnableBpmDetect" -ForegroundColor DarkGray

    Pause-User

    return

  }



  $recentAudio = Get-RecentPath $cfg "audio"
  $audioDir = ""
  if (-not [string]::IsNullOrWhiteSpace($recentAudio)) { $audioDir = Split-Path -Parent $recentAudio }
  $files = Pick-Files -title "Pick one or more audio files for BPM detect" -filter "Audio|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg|All files|*.*" -multi:$true -initialDir $audioDir

  $files = @($files)

  if ($files.Count -eq 0) { return }
  Set-RecentPath $cfg "audio" $files[0]



  $outFolder = Split-Path -Parent $files[0]



  $hasAubio = Test-Cmd "aubio"

  if (-not $hasAubio) {

    Banner

    Write-Host ""

    Write-Host "BPM detect tool not found (aubio)." -ForegroundColor Yellow

    Write-Host "Install: pip install aubio" -ForegroundColor DarkGray

    Pause-User

    return

  }



  $report = Join-Path $outFolder "bpm_report.txt"

  if (Test-Path $report) { Remove-Item $report -Force -ErrorAction SilentlyContinue }



  $total = $files.Count

  for ($i = 0; $i -lt $total; $i++) {

    $f = $files[$i]

    Write-Progress -Activity "BPM detect" -Status ("{0}/{1} {2}" -f ($i+1),$total,(Split-Path $f -Leaf)) -PercentComplete ([int]((($i+1)/$total)*100))

    $out = & aubio tempo $f 2>$null

    $lines = @($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $bpm = if ($lines.Count -gt 0) { $lines[-1].ToString().Trim() } else { "?" }

    Add-Content -Path $report -Value ("{0}`t{1}" -f $bpm, (Split-Path $f -Leaf))

  }

  Write-Progress -Activity "BPM detect" -Completed



  Write-Host ""

  Write-Host "DONE. BPM report saved to: $report" -ForegroundColor Green
  Notify-JobResult $cfg "BPM Detect" $true $report

  Open-IfEnabled $cfg $outFolder

  Pause-User

}





function Producer-KeyDetect($cfg) {
  Ensure-Folders

  $recentAudio = Get-RecentPath $cfg "audio"
  $audioDir = ""
  if (-not [string]::IsNullOrWhiteSpace($recentAudio)) { $audioDir = Split-Path -Parent $recentAudio }
  $files = Pick-Files -title "Pick one or more audio files for Key detect" -filter "Audio|*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg|All files|*.*" -multi:$true -initialDir $audioDir
  $files = @($files)
  if ($files.Count -eq 0) {
    $audioExt = @(".mp3",".wav",".m4a",".aac",".flac",".ogg")
    $fallback = @(
      Get-ChildItem -Path $ToolsDir -File -ErrorAction SilentlyContinue |
        Where-Object { $audioExt -contains $_.Extension.ToLowerInvariant() } |
        Select-Object -ExpandProperty FullName
    )
    if ($fallback.Count -eq 0) { return }
    Write-Host ""
    Write-Host ("No file selected. Found {0} audio file(s) in toolkit folder." -f $fallback.Count) -ForegroundColor Yellow
    if (-not (Ask-YesNo "Use toolkit-folder audio files for key detection?" $true)) { return }
    $files = @($fallback)
  }
  Set-RecentPath $cfg "audio" $files[0]

  $keyReportsDir = Join-Path $Base "KeyReports"
  if (-not (Test-Path $keyReportsDir)) { New-Item -ItemType Directory -Path $keyReportsDir | Out-Null }
  $stamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
  $nameParts = @(
    @(
      $files |
        Select-Object -First 2 |
        ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_) } |
        ForEach-Object { ($_ -replace '[^\w\.-]+','_').Trim('_') }
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
  $baseLabel = if ($nameParts.Count -eq 0) {
    "unknown"
  } elseif ($files.Count -eq 1) {
    $nameParts[0]
  } elseif ($files.Count -eq 2) {
    ($nameParts -join "__")
  } else {
    ("{0}__and_{1}_more" -f $nameParts[0], ($files.Count - 1))
  }
  if ($baseLabel.Length -gt 80) { $baseLabel = $baseLabel.Substring(0,80) }
  $reportTxt = Join-Path $keyReportsDir ("key_report_{0}_{1}.txt" -f $baseLabel, $stamp)
  $manifest = Join-Path $Temp60 ("key_detect_manifest_{0}.txt" -f $stamp)
  $pyFile = Join-Path $Temp60 ("key_detect_{0}.py" -f $stamp)

  @($files) | Set-Content -Path $manifest -Encoding UTF8

  $py = @'
import argparse, os, sys

try:
    import numpy as np
    import librosa
except Exception as e:
    print("MISSING_LIBS:" + str(e), file=sys.stderr)
    sys.exit(3)

NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], dtype=float)
MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17], dtype=float)

CAMELOT_MAJ = {"B":"1B","F#":"2B","C#":"3B","G#":"4B","D#":"5B","A#":"6B","F":"7B","C":"8B","G":"9B","D":"10B","A":"11B","E":"12B"}
CAMELOT_MIN = {"G#":"1A","D#":"2A","A#":"3A","F":"4A","C":"5A","G":"6A","D":"7A","A":"8A","E":"9A","B":"10A","F#":"11A","C#":"12A"}

def normalize(v):
    n = np.linalg.norm(v)
    return v / (n + 1e-9)

def detect(chroma):
    p = normalize(np.mean(chroma, axis=1))
    scores = []
    for i, note in enumerate(NOTES):
        maj = normalize(np.roll(MAJ, i))
        minn = normalize(np.roll(MIN, i))
        scores.append((float(np.dot(p, maj)), note, "major"))
        scores.append((float(np.dot(p, minn)), note, "minor"))
    scores.sort(key=lambda x: x[0], reverse=True)
    best, second = scores[0], scores[1]
    conf = max(0.0, best[0] - second[0])
    return best[1], best[2], conf

def key_text(note, mode):
    return f"{note} {'maj' if mode == 'major' else 'min'}"

def camelot(note, mode):
    if mode == "major":
        return CAMELOT_MAJ.get(note, "?")
    return CAMELOT_MIN.get(note, "?")

def pick(r1, r2):
    n1,m1,c1 = r1
    n2,m2,c2 = r2
    if n1 == n2 and m1 == m2:
        return n1,m1,(c1+c2)/2.0,"cqt+stft","agreed"
    if c1 >= c2 + 0.02:
        return n1,m1,c1,"cqt","mixed"
    if c2 >= c1 + 0.02:
        return n2,m2,c2,"stft","mixed"
    if c1 >= c2:
        return n1,m1,c1,"cqt","needs_review"
    return n2,m2,c2,"stft","needs_review"

def process(path):
    y, sr = librosa.load(path, sr=44100, mono=True)
    if y is None or len(y) < 4096:
        raise RuntimeError("audio too short")
    yh = librosa.effects.harmonic(y)
    cqt = librosa.feature.chroma_cqt(y=yh, sr=sr)
    stf = librosa.feature.chroma_stft(y=yh, sr=sr, n_fft=8192, hop_length=2048)
    r1 = detect(cqt)
    r2 = detect(stf)
    note, mode, conf, method, status = pick(r1, r2)
    confpct = max(0.0, min(100.0, conf * 300.0))
    return {
        "FileName": os.path.basename(path),
        "FilePath": path,
        "Key": key_text(note, mode),
        "Camelot": camelot(note, mode),
        "ConfidencePct": f"{confpct:.1f}",
        "Method": method,
        "Status": status,
        "Error": ""
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with open(args.manifest, "r", encoding="utf-8") as f:
        files = [ln.strip() for ln in f if ln.strip()]

    rows = []
    total = len(files)
    for i, p in enumerate(files, start=1):
        print(f"KEYPROG:{i}:{total}:{os.path.basename(p)}", flush=True)
        try:
            rows.append(process(p))
        except Exception as e:
            rows.append({
                "FileName": os.path.basename(p),
                "FilePath": p,
                "Key": "",
                "Camelot": "",
                "ConfidencePct": "0.0",
                "Method": "",
                "Status": "failed",
                "Error": str(e)
            })

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("FileName\tKey\tCamelot\tConfidencePct\tStatus\tMethod\tError\n")
        for r in rows:
            f.write(
                f"{r['FileName']}\t{r['Key']}\t{r['Camelot']}\t{r['ConfidencePct']}\t{r['Status']}\t{r['Method']}\t{r['Error']}\n"
            )

if __name__ == "__main__":
    main()
'@
  Set-Content -Path $pyFile -Value $py -Encoding UTF8

  Write-Host ""
  Write-Host "Running key detection (hybrid CQT+STFT)..." -ForegroundColor Cyan
  Write-Host ("Working... analyzing {0} file(s). Progress bar updates below." -f $files.Count) -ForegroundColor DarkGray
  $res = Run-ProcessWithProgress -exe "python" -argList @($pyFile, "--manifest", $manifest, "--out", $reportTxt) -activity "key detect"

  if ($res.ExitCode -ne 0 -and -not (Test-Path $reportTxt)) {
    $all = ((@($res.StdOut) + @($res.StdErr)) -join "`n")
    if ($all -match "MISSING_LIBS") {
      Write-Host ""
      Write-Host "Key detection dependencies missing (scipy/librosa)." -ForegroundColor Yellow
      Write-Host "Install now: python -m pip install -U numpy scipy librosa soundfile" -ForegroundColor DarkGray
      if (Ask-YesNo "Install missing key-detect dependencies now?" $true) {
        & python -m pip install -U numpy scipy librosa soundfile
        $res2 = Run-ProcessWithProgress -exe "python" -argList @($pyFile, "--manifest", $manifest, "--out", $reportTxt) -activity "key detect"
        if ($res2.ExitCode -ne 0 -and -not (Test-Path $reportTxt)) {
          Write-Host "Key detection still failed after dependency install." -ForegroundColor Red
          Pause-User
          return
        }
      } else {
        Pause-User
        return
      }
    } else {
      Write-Host "Key detection failed." -ForegroundColor Red
      Pause-User
      return
    }
  }

  if (-not (Test-Path $reportTxt)) {
    Write-Host "Key report TXT was not created." -ForegroundColor Red
    Pause-User
    return
  }

  $rows = @(Import-Csv -Path $reportTxt -Delimiter "`t")
  $ok = @($rows | Where-Object { $_.Status -ne "failed" }).Count
  $review = @($rows | Where-Object { $_.Status -eq "needs_review" }).Count
  $failed = @($rows | Where-Object { $_.Status -eq "failed" }).Count

  Write-Host ""
  Write-Host ("DONE. Key report TXT: {0}" -f $reportTxt) -ForegroundColor Green
  Write-Host ""
  $rows | Select-Object FileName, Key, Camelot, ConfidencePct, Status | Format-Table -AutoSize
  Write-Host ("Summary: detected={0}, needs_review={1}, failed={2}" -f $ok, $review, $failed) -ForegroundColor DarkGray
  Open-IfEnabled $cfg $keyReportsDir
  Notify-JobResult $cfg "Key Detect" ($failed -eq 0) ("Detected={0}; Review={1}; Failed={2}" -f $ok, $review, $failed)
  Pause-User
}


function MainMenu {

  if ($script:CtrlCHandler -eq $null) {
    [DjCtrlCBridge]::Reset()
    $script:CtrlCHandler = [ConsoleCancelEventHandler][DjCtrlCBridge]::OnCancel
    [Console]::add_CancelKeyPress($script:CtrlCHandler)
  }

  $startupClock = [System.Diagnostics.Stopwatch]::StartNew()
  $startupState = [pscustomobject]@{ LastMs = 0.0 }
  $startupSteps = New-Object System.Collections.Generic.List[object]

  function Add-StartupStep([string]$name) {
    $nowMs = $startupClock.Elapsed.TotalMilliseconds
    $deltaMs = [math]::Round(($nowMs - [double]$startupState.LastMs), 2)
    $startupState.LastMs = $nowMs
    $startupSteps.Add([pscustomobject]@{
      Step = $name
      Ms   = $deltaMs
    })
  }

  $cfg = Load-Config
  Add-StartupStep "Load-Config"

  Apply-UiTheme ([string]$cfg.UITheme)
  Add-StartupStep "Apply-UiTheme"

  Ensure-Folders
  Add-StartupStep "Ensure-Folders"

  try {
    $cleanupStartup = Invoke-TempCleanup -cfg $cfg
    Log ("Startup temp cleanup: deleted={0} failed={1}" -f $cleanupStartup.Deleted, $cleanupStartup.Failed)
    Add-StartupStep ("Startup-TempCleanup (deleted={0} failed={1})" -f $cleanupStartup.Deleted, $cleanupStartup.Failed)
  } catch {
    Log ("Startup temp cleanup failed: " + $_.Exception.Message)
    Add-StartupStep "Startup-TempCleanup (failed)"
  }

  if ([bool]$cfg.EnableStartupProfiler) {
    try {
      $totalMs = [math]::Round($startupClock.Elapsed.TotalMilliseconds, 2)
      $bootMs = [math]::Round(([DateTime]::UtcNow - $script:ToolkitBootUtc).TotalMilliseconds, 2)
      $runId = (Get-Date).ToString("yyyyMMdd_HHmmss_fff")
      $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
      $rows = @(
        $startupSteps | ForEach-Object {
          [pscustomobject]@{
            Timestamp = $ts
            RunId     = $runId
            Step      = [string]$_.Step
            StepMs    = [math]::Round([double]$_.Ms, 2)
            TotalMs   = $totalMs
            BootMs    = $bootMs
          }
        }
      )
      if ($rows.Count -gt 0) {
        if (Test-Path $StartupProfileCsvPath) {
          $rows | Export-Csv -Path $StartupProfileCsvPath -NoTypeInformation -Encoding UTF8 -Append
        } else {
          $rows | Export-Csv -Path $StartupProfileCsvPath -NoTypeInformation -Encoding UTF8
        }
      }
      $line = ($startupSteps | ForEach-Object { "{0}={1}ms" -f $_.Step, ([int][math]::Round([double]$_.Ms, 0)) }) -join " | "
      Write-Host ("Startup profile: in-script={0}ms | boot={1}ms | {2}" -f ([int][math]::Round($totalMs, 0)), ([int][math]::Round($bootMs, 0)), $line) -ForegroundColor DarkGray
      Log ("Startup profile: in-script={0}ms; boot={1}ms; {2}" -f ([int][math]::Round($totalMs, 0)), ([int][math]::Round($bootMs, 0)), $line)
    } catch {
      Log ("Startup profiler failed: " + $_.Exception.Message)
    }
  }



  while ($true) {
    Apply-UiTheme ([string]$cfg.UITheme)

    Banner

    Write-Host ""

    Write-UiSection "DOWNLOADERS"

    Write-UiItem "1" "Main 1080p MP4 (Vegas-friendly)"

    Write-UiItem "2" "Fallback 1080p MP4 (alternative selector)"

    Write-UiItem "3" "Cookies Mode (age-restricted / login needed)"

    Write-UiItem "4" "TikTok (video + audio tools)"

    Write-Host ""

    Write-UiSection "AUDIO"

    Write-UiItem "5" "YouTube to MP3 (HQ)"

    Write-UiItem "6" "MP3 + image to MP4"
    Write-UiItem "7" "Convert local videos to MP3"

    Write-Host ""

    Write-UiSection "COPYRIGHT TEST (VIDEO + AUDIO)"

    Write-UiItem "8" "Pick MP4s - stable engine (custom clip + merge, auto _01/_02)"

    Write-UiItem "9" "Fixed-folder (MP4 folder) - same stable engine/settings"
    Write-UiItem "10" "Copyright Test - Tracker (tested/non-tested list + stats)"

    Write-UiSection "SYSTEM"

    Write-UiItem "11" "Settings"

    Write-UiItem "12" "Update yt-dlp"

    $prodEnabled = ($cfg.EnableDemucs -or $cfg.EnableBpmDetect)

    $prodStatus = if ($prodEnabled) { '(Enabled)' } else { '(Partially disabled in Settings)' }

    Write-Host ""

    Write-UiSection ("PRODUCER TOOLS {0}" -f $prodStatus)

    Write-UiItem "13" "Demucs - Separate stems from audio file(s)"

    Write-UiItem "14" "BPM Detect - Analyze audio file(s)"

    Write-UiItem "15" "Key Detect - Analyze musical key + Camelot"

    Write-Host ""

    Write-UiItem "0" "Exit"

    Write-UiFooter "Type option number then Enter" ("Time " + (Get-Date).ToString("hh:mm:ss tt"))

    [DjCtrlCBridge]::SetExitOnCancelInMenu($true)
    $c = Read-Host "> Choose option"
    [DjCtrlCBridge]::SetExitOnCancelInMenu($false)
    if ([string]::IsNullOrWhiteSpace($c)) {
      Write-Host "No input. Enter an option number." -ForegroundColor $script:UiColors.Warn
      Start-Sleep -Milliseconds 700
      continue
    }



    try {

      $script:CurrentJobName = $null
      switch ($c) {

        "1" { $script:CurrentJobName = "ydlq"; Download-yDLQ $cfg }

        "2" { $script:CurrentJobName = "ydl"; Download-yDL  $cfg }

        "3" { $script:CurrentJobName = "ydlc"; Download-yDLCookies $cfg }

        "4" { $script:CurrentJobName = "ydlt"; Download-yDLTikTok $cfg }

        "5" { $script:CurrentJobName = "ydla"; Download-yDLAMp3 $cfg }

        "6" { $script:CurrentJobName = "wrap"; Wrap-AudioToMp4 $cfg }

        "7" { $script:CurrentJobName = "Video -> MP3"; Convert-VideoFilesToMp3 $cfg }

        "8" { $script:CurrentJobName = "Copyright Pick MP4s"; Copyright-PickFiles $cfg }

        "9" { $script:CurrentJobName = "Copyright Fixed Folder"; Copyright-FixedFolder $cfg }

        "10" { $script:CurrentJobName = "Copyright Test Tracker"; CopyrightTest-Menu $cfg }

        "11" { Settings-Menu $cfg }

        "12" { Update-ytdlp }

        "13" { $script:CurrentJobName = "Demucs"; Producer-Demucs $cfg }

        "14" { $script:CurrentJobName = "BPM Detect"; Producer-Bpm $cfg }

        "15" { $script:CurrentJobName = "Key Detect"; Producer-KeyDetect $cfg }

        "0" { return }

        default { }

      }

    } catch {
      [DjCtrlCBridge]::SetExitOnCancelInMenu($false)
      if ($_.Exception -is [System.OperationCanceledException] -and $_.Exception.Message -eq "__DJ_RETURN_MAIN_MENU__") {
        continue
      }

      Banner

      Write-Host ""

      Write-Host "ERROR:" -ForegroundColor Red

      Write-Host $_.Exception.Message -ForegroundColor Yellow

      Log $_.Exception.ToString()
      if ($script:CurrentJobName) { Notify-JobResult $cfg $script:CurrentJobName $false $_.Exception.Message }

      Pause-User

    }

  }

}



$shouldRunMain = $false
if ($env:DJ_TOOLKIT_RUN -eq '1') { $shouldRunMain = $true }
elseif ($MyInvocation.InvocationName -ne '.') { $shouldRunMain = $true } # direct run (not dot-sourced)

if ($shouldRunMain) {
  [DjCtrlCBridge]::Reset()
  $script:CtrlCHandler = [ConsoleCancelEventHandler][DjCtrlCBridge]::OnCancel
  [Console]::add_CancelKeyPress($script:CtrlCHandler)
  try { MainMenu } catch {
    if ($_.Exception -is [System.OperationCanceledException] -and $_.Exception.Message -eq "__DJ_RETURN_MAIN_MENU__") {
      return
    }

    Banner

    Write-Host ""

    Write-Host "Crash:" -ForegroundColor Red

    Write-Host $_.Exception.Message -ForegroundColor Yellow

    Log $_.Exception.ToString()

    Pause-User

  } finally {
    if ($script:CtrlCHandler -ne $null) {
      [Console]::remove_CancelKeyPress($script:CtrlCHandler)
      $script:CtrlCHandler = $null
    }
  }
}
