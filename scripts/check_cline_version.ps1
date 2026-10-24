[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$versions = Get-Content -LiteralPath (Join-Path $repoRoot 'config\tool-versions.json') -Raw | ConvertFrom-Json
if ($versions.cline -eq 'SET_TO_LOCALLY_REVIEWED_VERSION') {
    Write-Error 'Pin a reviewed Cline version in config/tool-versions.json first.'
    exit 1
}
if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    throw 'VS Code command-line tool is unavailable.'
}
$entry = & code --list-extensions --show-versions |
    Where-Object { $_ -match '^(saoudrizwan\.cline|cline\.cline)@' } |
    Select-Object -First 1
if (-not $entry) {
    Write-Error 'Cline extension was not found.'
    exit 1
}
$actual = ($entry -split '@')[-1]
if ($actual -ne $versions.cline) {
    Write-Error "Cline version mismatch: required $($versions.cline), found $actual."
    exit 1
}
Write-Output "Cline version $actual matches the reviewed pin."
