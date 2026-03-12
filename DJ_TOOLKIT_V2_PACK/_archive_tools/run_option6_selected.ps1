# Wrapper to run Copyright-PickFiles with a fixed set of MP4 files
Set-Location $PSScriptRoot

## automated responses for prompts: clip length, section, compress? ('' -> default 60s, '2' -> Middle, 'n' -> no compress)
# Provide non-interactive answers by overriding prompt functions
function Ask-ClipLengthSec($cfg) { return 60 }
function Ask-ClipSection($cfg) { return "Middle" }
function Ask-YesNo([string]$prompt, [bool]$defaultYes = $true) { return $false }

$selected = @(
    "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST\Akam Entertainment - Demarco - Build A Vibes [New Money Riddim] August 2014.mp4",
    "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST\Cecile - Topic - Tie Him.mp4",
    "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST\khells3 - Vybz Kartel - Tell You Say - June 2011.mp4",
    "C:\Users\User\Desktop\DJ_TOOLKIT_V2_PACK\MP4_TO_TEST\Lord of the Flies ｜ Official trailer - BBC.mp4"
)

function Pick-Files { param($title,$filter,$multi) return $selected }

. "$PSScriptRoot\DJ_TOOLKIT_V2.ps1"

$cfg = Load-Config
Write-Host "Running Copyright-PickFiles with selected MP4s..."
Copyright-PickFiles $cfg
Write-Host "Done."
