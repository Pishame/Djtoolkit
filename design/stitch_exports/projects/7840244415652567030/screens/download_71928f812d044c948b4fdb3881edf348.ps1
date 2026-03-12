$ErrorActionPreference = "Stop"

$screenDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$screenshotOut = Join-Path $screenDir "71928f812d044c948b4fdb3881edf348.png"
$htmlOut = Join-Path $screenDir "71928f812d044c948b4fdb3881edf348.html"

$screenshotUrl = "https://lh3.googleusercontent.com/aida/AOfcidVswrFm8FSLPIJIXDdYfg1sIeLhIJfLSuIclbUpM4NQ0yrhIIemQgnxV9NsE3mqAz0OIx-drFPzcx_J1UqWtEK3VRI2odXL-pJMrp6-2GbZ4ikyEy-yhgOtZmE2VNAc_egLw3V5NVCWFwh4Co8LxBTk9W43i7kqrCMLMI8O7fA2b8BJGKKRM96m7MX1QmHq2u-TpjcLsE2A6VyqiCt607q9R-uo_AZOYem72oKc0OGUa4FUBHKuGn_zsXU"
$htmlUrl = "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzdiODFmMDhhOGRiMTQ4M2U5Yjg5MDNkNWIwMWMxZTkzEgsSBxDBtdHS3hAYAZIBIwoKcHJvamVjdF9pZBIVQhM3ODQwMjQ0NDE1NjUyNTY3MDMw&filename=&opi=89354086"

curl.exe -L $screenshotUrl -o $screenshotOut
curl.exe -L $htmlUrl -o $htmlOut

Write-Host "Saved:"
Write-Host " - $screenshotOut"
Write-Host " - $htmlOut"
