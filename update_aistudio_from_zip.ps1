param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,
    [switch]$SkipBuild,
    [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Resolve-AistudioSource {
    param([string]$ExtractRoot)
    $candidates = Get-ChildItem -Path $ExtractRoot -Recurse -Directory -ErrorAction SilentlyContinue
    foreach ($d in $candidates) {
        $pkg = Join-Path $d.FullName "package.json"
        $idx = Join-Path $d.FullName "index.html"
        if ((Test-Path $pkg) -and (Test-Path $idx)) {
            return $d.FullName
        }
    }
    if ((Test-Path (Join-Path $ExtractRoot "package.json")) -and (Test-Path (Join-Path $ExtractRoot "index.html"))) {
        return $ExtractRoot
    }
    throw "Could not find Aistudio project root (needs package.json + index.html) inside zip."
}

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$aistudio = Join-Path $root "Aistudio"

if (-not (Test-Path $ZipPath)) {
    throw "Zip not found: $ZipPath"
}
if (-not (Test-Path $aistudio)) {
    New-Item -ItemType Directory -Path $aistudio | Out-Null
}

$zipAbs = (Resolve-Path $ZipPath).Path
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("aistudio_zip_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
    Write-Step "Extracting zip to temp"
    Expand-Archive -Path $zipAbs -DestinationPath $tmp -Force

    $sourceRoot = Resolve-AistudioSource -ExtractRoot $tmp
    Write-Step "Source root: $sourceRoot"

    Write-Step "Replacing Aistudio files but preserving node_modules"
    $keep = @("node_modules")
    Get-ChildItem -Path $aistudio -Force | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force
    }

    Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $aistudio -Recurse -Force

    Write-Step "Running sync_aistudio.ps1"
    $syncScript = Join-Path $root "sync_aistudio.ps1"
    $syncArgs = @("-ExecutionPolicy", "Bypass", "-File", $syncScript)
    if ($SkipBuild) { $syncArgs += "-SkipBuild" }
    if ($ForceInstall) { $syncArgs += "-ForceInstall" }
    & powershell @syncArgs

    Write-Host ""
    Write-Host "Aistudio update complete."
    Write-Host "Run app: python app_pyside.py"
}
finally {
    if (Test-Path $tmp) {
        Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
