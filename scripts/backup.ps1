[CmdletBinding()]
param(
    [string]$Source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ExcludeFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'config\backup-excludes.txt')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command restic -ErrorAction SilentlyContinue)) {
    throw 'restic is not installed or is not on PATH.'
}
if (-not $env:RESTIC_REPOSITORY) {
    throw 'RESTIC_REPOSITORY must point to the encrypted backup destination.'
}
if (-not $env:RESTIC_PASSWORD_FILE) {
    throw 'RESTIC_PASSWORD_FILE is required; plaintext passwords in scripts are forbidden.'
}
if (-not (Test-Path -LiteralPath $env:RESTIC_PASSWORD_FILE -PathType Leaf)) {
    throw 'RESTIC_PASSWORD_FILE does not exist.'
}

$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
& restic backup --tag ewsalg --exclude-file $ExcludeFile -- $resolvedSource
if ($LASTEXITCODE -ne 0) {
    throw "restic backup failed with exit code $LASTEXITCODE"
}
& restic check --read-data-subset=1/20
if ($LASTEXITCODE -ne 0) {
    throw "restic repository check failed with exit code $LASTEXITCODE"
}
