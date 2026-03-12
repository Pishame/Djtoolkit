DJ TOOLKIT V2.5 (PowerShell)
=========================

Files:
- DJ_TOOLKIT_V2.ps1   (the PowerShell app)
- RUN_DJ_TOOLKIT_V2.cmd (double-click this to start V2)

Why V2?
- PowerShell is safer with URLs (no & breaking)
- Built-in file picker for MP4 selection (no drag-drop headaches)
- Keeps your V1 BAT toolkit untouched as a backup

How to run
----------
1) Double-click: RUN_DJ_TOOLKIT_V2.cmd
2) Pick an option.

If PowerShell blocks running scripts
------------------------------------
We use a launcher that runs:
  powershell -ExecutionPolicy Bypass -File DJ_TOOLKIT_V2.ps1

If Windows still blocks it, open PowerShell and run:
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
Then try again.
