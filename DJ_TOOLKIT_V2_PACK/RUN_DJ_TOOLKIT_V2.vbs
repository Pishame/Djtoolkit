 ' Silent launcher for DJ_TOOLKIT_V2 (double-click to run in PowerShell without a visible CMD window)
On Error Resume Next
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptFull = WScript.ScriptFullName
scriptDir = Left(scriptFull, InStrRev(scriptFull, "\"))

' Ensure interactive menu runs in child process
WshShell.Environment("Process")("DJ_TOOLKIT_RUN") = "1"

' Prefer PowerShell Core if installed
pwshPath = ""
possible = WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\PowerShell\7\pwsh.exe"
If fso.FileExists(possible) Then pwshPath = possible
If pwshPath = "" Then
  possible = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\PowerShell\7\pwsh.exe"
  If fso.FileExists(possible) Then pwshPath = possible
End If

If pwshPath = "" Then pwshPath = "powershell.exe"

args = "-NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File " & Chr(34) & scriptDir & "DJ_TOOLKIT_V2.ps1" & Chr(34)

' Start PowerShell in a new maximized window, do not wait
WshShell.Run Chr(34) & pwshPath & Chr(34) & " " & args, 3, False

WScript.Quit 0
