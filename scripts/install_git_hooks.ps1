[CmdletBinding()]
param(
    [switch]$Install
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $Install) {
    Write-Output 'Dry run: this will set core.hooksPath=.githooks for this repository only.'
    Write-Output 'Review .githooks/pre-commit, then re-run with -Install.'
    exit 0
}
& git -C $repoRoot config --local core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the local hooks path.' }
Write-Output 'Local Git hooks enabled. Run a synthetic staged-secret test before relying on them.'
