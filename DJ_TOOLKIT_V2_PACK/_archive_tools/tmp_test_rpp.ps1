function Run-ProcessWithProgress($exe,$argList,$activity='Running'){
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName=$exe
  $psi.Arguments=[string]::Join(' ',$argList)
  $psi.UseShellExecute=$false
  $psi.RedirectStandardOutput=$true
  $psi.RedirectStandardError=$true
  $psi.CreateNoWindow=$true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo=$psi
  $stdOutLines = New-Object System.Collections.Generic.List[string]
  $stdErrLines = New-Object System.Collections.Generic.List[string]
  $proc.Start() | Out-Null
  $stdoutQueue = New-Object System.Collections.Concurrent.ConcurrentQueue[object]
  $stderrQueue = New-Object System.Collections.Concurrent.ConcurrentQueue[object]
  $outThread = [System.Threading.Thread]::new([System.Threading.ThreadStart]{
    try {
      while (-not $proc.HasExited -or -not $proc.StandardOutput.EndOfStream) {
        $l=$proc.StandardOutput.ReadLine(); if($l -ne $null){ $stdoutQueue.Enqueue($l) }
      }
    } catch{}
  })
  $errThread = [System.Threading.Thread]::new([System.Threading.ThreadStart]{
    try {
      while (-not $proc.HasExited -or -not $proc.StandardError.EndOfStream) {
        $l=$proc.StandardError.ReadLine(); if($l -ne $null){ $stderrQueue.Enqueue($l) }
      }
    } catch{}
  })
  $outThread.IsBackground=$true; $errThread.IsBackground=$true
  $outThread.Start(); $errThread.Start()
  while (-not $proc.HasExited -or -not $stdoutQueue.IsEmpty -or -not $stderrQueue.IsEmpty) {
    Start-Sleep -Milliseconds 150
    $localLine=$null
    while ($stdoutQueue.TryDequeue([ref]$localLine)) {
      $stdOutLines.Add($localLine)
      $line=$localLine.ToString()
      if ($line -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%\s+of\s+([^\s]+)') {
        $pct=[double]$matches[1]; $sz=$matches[2]; $status = "{0} {1}" -f $sz, ("{0:N1}%" -f $pct);
        Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
      } elseif ($line -match '\[download\]\s+([0-9]{1,3}(?:\.[0-9]+)?)%') {
        $pct=[double]$matches[1]; $status=("{0:N1}%" -f $pct); Write-Progress -Activity $activity -Status $status -PercentComplete ([int]$pct)
      }
    }
    $localErr=$null
    while ($stderrQueue.TryDequeue([ref]$localErr)) { $stdErrLines.Add($localErr) }
  }
  Write-Progress -Activity $activity -Completed
  return [pscustomobject]@{ ExitCode=$proc.ExitCode; StdOut=$stdOutLines.ToArray(); StdErr=$stdErrLines.ToArray() }
}

$argList=@('/c','for /L %%i in (0,10,100) do @echo [download] %%i%% of 100.00MiB & ping -n 1 127.0.0.1 >nul')
$res=Run-ProcessWithProgress 'cmd' $argList 'test'
Write-Host 'Exit:' $res.ExitCode