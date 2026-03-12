$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'DJ_TOOLKIT_V2 (launcher).lnk'
$w = New-Object -ComObject WScript.Shell
$wsh = Join-Path $env:WINDIR 'System32\wscript.exe'
$vbs = 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\RUN_DJ_TOOLKIT_V2.vbs'
$sc = $w.CreateShortcut($lnk)
$sc.TargetPath = $wsh
$sc.Arguments = '"' + $vbs + '"'
$sc.WorkingDirectory = 'C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK'
$sc.IconLocation = $wsh + ',0'
$sc.Save()
Write-Output "Created: $lnk"