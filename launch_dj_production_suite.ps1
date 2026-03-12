$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\User\Desktop\Copyright"
$appScript = Join-Path $projectRoot "app_pyside.py"

function Get-PythonCommand {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }

    $commonCandidates = @(
        "C:\Users\User\AppData\Local\Programs\Python\Python313\python.exe",
        "C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe",
        "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe",
        "C:\Users\User\AppData\Local\Programs\Python\Python310\python.exe",
        "C:\Program Files\Python313\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe",
        "C:\Program Files\Image-Line\FL Studio 2025\Shared\Python\python.exe"
    )

    foreach ($candidate in $commonCandidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

Set-Location $projectRoot

$pythonExe = Get-PythonCommand
if (-not $pythonExe) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Python could not be found for DJ Production Suite.`n`nInstall Python or update launch_dj_production_suite.ps1 with the correct path.",
        "DJ Production Suite",
        [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Error
    ) | Out-Null
    exit 1
}

Start-Process -FilePath $pythonExe -WorkingDirectory $projectRoot -ArgumentList "`"$appScript`""
