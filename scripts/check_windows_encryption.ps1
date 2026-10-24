[CmdletBinding()]
param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$drive = (Split-Path -Qualifier (Resolve-Path -LiteralPath $ProjectPath).Path).TrimEnd('\')
if (-not (Get-Command manage-bde.exe -ErrorAction SilentlyContinue)) {
    throw 'manage-bde.exe is unavailable; BitLocker state could not be checked.'
}
$status = & manage-bde.exe -status $drive
if ($LASTEXITCODE -ne 0) { throw 'BitLocker status command failed.' }
$joined = $status -join "`n"
if ($joined -notmatch 'Protection Status:\s+Protection On') {
    Write-Error "BitLocker protection is not confirmed for $drive."
    exit 1
}
Write-Output "BitLocker protection is on for $drive."
