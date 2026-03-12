param(
    [switch]$ForceInstall,
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$aistudio = Join-Path $root "Aistudio"

if (-not (Test-Path $aistudio)) {
    throw "Aistudio folder not found: $aistudio"
}

Write-Step "Applying desktop-safe Vite config"
$viteConfig = @'
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
'@
Write-Utf8NoBom -Path (Join-Path $aistudio "vite.config.ts") -Content $viteConfig

Write-Step "Replacing index.html with local-only entry (no CDN/importmap)"
$indexHtml = @'
<!DOCTYPE html>
<html class="dark" lang="en">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <title>DJ Toolkit Pro</title>
</head>
<body class="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 h-screen overflow-hidden">
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
</body>
</html>
'@
Write-Utf8NoBom -Path (Join-Path $aistudio "index.html") -Content $indexHtml

Write-Step "Ensuring index.tsx imports ./index.css"
$indexTsxPath = Join-Path $aistudio "index.tsx"
$indexTsx = Get-Content -Path $indexTsxPath -Raw -Encoding UTF8
if ($indexTsx -notmatch "import\s+['""]\./index\.css['""];?") {
    $indexTsx = $indexTsx -replace "(import\s+App\s+from\s+['""]\./App['""];?\s*)", "`$1`r`nimport './index.css';`r`n"
    if ($indexTsx -notmatch "import\s+['""]\./index\.css['""];?") {
        $indexTsx = "import './index.css';`r`n" + $indexTsx
    }
    Write-Utf8NoBom -Path $indexTsxPath -Content $indexTsx
}

Write-Step "Writing Tailwind + local font stylesheet"
$indexCss = @'
@import "@fontsource/inter/300.css";
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/inter/700.css";
@import "@fontsource/inter/800.css";
@import "@fontsource/material-symbols-outlined";

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: "Inter", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.material-symbols-outlined {
  font-family: "Material Symbols Outlined", "Segoe UI Symbol", sans-serif;
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}

.active-rail-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 4px;
  background-color: #ff0080;
  border-radius: 0 4px 4px 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(140, 146, 175, 0.35);
  border-radius: 999px;
}
'@
Write-Utf8NoBom -Path (Join-Path $aistudio "index.css") -Content $indexCss

Write-Step "Writing tailwind.config.cjs"
$tailwindConfig = @'
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './constants.tsx'],
  theme: {
    extend: {
      colors: {
        primary: '#ff0080',
        'background-light': '#f8f5f7',
        'background-dark': '#1e1e1e',
        'surface-dark': '#2d2d2d',
        'rail-dark': '#181818',
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
'@
Write-Utf8NoBom -Path (Join-Path $aistudio "tailwind.config.cjs") -Content $tailwindConfig

Write-Step "Writing postcss.config.cjs"
$postcssConfig = @'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
'@
Write-Utf8NoBom -Path (Join-Path $aistudio "postcss.config.cjs") -Content $postcssConfig

Write-Step "Patching package.json dependencies"
$packagePath = Join-Path $aistudio "package.json"
$packageJson = Get-Content -Path $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json

function Convert-ToMutableMap {
    param([object]$Source)
    $map = @{}
    if ($null -eq $Source) {
        return $map
    }
    foreach ($p in $Source.PSObject.Properties) {
        $map[$p.Name] = $p.Value
    }
    return $map
}

$deps = Convert-ToMutableMap $packageJson.dependencies
$devDeps = Convert-ToMutableMap $packageJson.devDependencies

$deps['@fontsource/inter'] = '^5.2.8'
$deps['@fontsource/material-symbols-outlined'] = '^5.2.31'

$devDeps['autoprefixer'] = '^10.4.21'
$devDeps['postcss'] = '^8.5.6'
$devDeps['tailwindcss'] = '^3.4.17'

if ($packageJson.PSObject.Properties['dependencies']) {
    $packageJson.dependencies = [pscustomobject]$deps
} else {
    $packageJson | Add-Member -MemberType NoteProperty -Name dependencies -Value ([pscustomobject]$deps)
}
if ($packageJson.PSObject.Properties['devDependencies']) {
    $packageJson.devDependencies = [pscustomobject]$devDeps
} else {
    $packageJson | Add-Member -MemberType NoteProperty -Name devDependencies -Value ([pscustomobject]$devDeps)
}

Write-Utf8NoBom -Path $packagePath -Content ($packageJson | ConvertTo-Json -Depth 100)

Write-Step "Syncing Stitch exports into public/stitch (if available)"
$publicStitch = Join-Path $aistudio "public\stitch"
New-Item -ItemType Directory -Path $publicStitch -Force | Out-Null

$stitchSource = Join-Path $root "design\stitch_exports\projects\7840244415652567030\screens"
$stitchPng = Join-Path $stitchSource "71928f812d044c948b4fdb3881edf348.png"
$stitchHtml = Join-Path $stitchSource "71928f812d044c948b4fdb3881edf348.html"

if (Test-Path $stitchPng) {
    Copy-Item -Path $stitchPng -Destination (Join-Path $publicStitch "youtube-settings-with-download-path.png") -Force
}
if (Test-Path $stitchHtml) {
    Copy-Item -Path $stitchHtml -Destination (Join-Path $publicStitch "youtube-settings-with-download-path.html") -Force
}

Push-Location $aistudio
try {
    $depsReady = $false
    $requiredModules = @(
        "react",
        "react-dom",
        "vite",
        "tailwindcss",
        "@fontsource/inter",
        "@fontsource/material-symbols-outlined"
    )
    if (Test-Path "node_modules") {
        $depsReady = $true
        foreach ($mod in $requiredModules) {
            $modPath = Join-Path "node_modules" ($mod -replace "/", "\")
            if (-not (Test-Path $modPath)) {
                $depsReady = $false
                break
            }
        }
    }

    if ($SkipInstall) {
        Write-Step "Skipping npm install"
    } elseif ($ForceInstall -or -not $depsReady) {
        Write-Step "Running npm install"
        npm install
    } else {
        Write-Step "Using existing node_modules (no install needed)"
    }

    if (-not $SkipBuild) {
        Write-Step "Running npm run build"
        npm run build
    } else {
        Write-Step "Skipping npm run build"
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Aistudio sync complete."
Write-Host "Run app: python app_pyside.py"
