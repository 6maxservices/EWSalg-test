[CmdletBinding()]
param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$project = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProjectPath).Path)
$candidateRoots = @(
    $env:OneDrive,
    $env:OneDriveCommercial,
    $env:OneDriveConsumer,
    (Join-Path $env:USERPROFILE 'Dropbox'),
    (Join-Path $env:USERPROFILE 'Google Drive')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$insideSync = $false
foreach ($root in $candidateRoots) {
    $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $root).Path)
    if ($project.StartsWith($resolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Error "Project is inside a known cloud-sync root: $resolved"
        $insideSync = $true
    }
}
if ($insideSync) { exit 1 }
Write-Output 'No known cloud-sync parent was detected. Verify any third-party sync client manually.'
