[CmdletBinding()]
param(
    [string]$Source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command restic -ErrorAction SilentlyContinue)) {
    throw 'restic is not installed or is not on PATH.'
}
if (-not $env:RESTIC_REPOSITORY -or -not $env:RESTIC_PASSWORD_FILE) {
    throw 'RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE are required.'
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ewsalg-restore-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    & restic restore latest --tag ewsalg --target $tempRoot
    if ($LASTEXITCODE -ne 0) {
        throw "restic restore failed with exit code $LASTEXITCODE"
    }
    $sourceLeaf = Split-Path -Leaf (Resolve-Path -LiteralPath $Source).Path
    $restored = Get-ChildItem -LiteralPath $tempRoot -Directory -Recurse |
        Where-Object { $_.Name -eq $sourceLeaf } |
        Select-Object -First 1
    if (-not $restored) {
        throw 'Restored snapshot does not contain the expected project directory.'
    }
    $required = @('package.json', 'src\logic\engineV2.js', 'evidence\README.md')
    foreach ($relative in $required) {
        $originalPath = Join-Path $Source $relative
        $restoredPath = Join-Path $restored.FullName $relative
        if (-not (Test-Path -LiteralPath $restoredPath -PathType Leaf)) {
            throw "Restore is missing required file: $relative"
        }
        $originalHash = (Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash
        $restoredHash = (Get-FileHash -LiteralPath $restoredPath -Algorithm SHA256).Hash
        if ($originalHash -ne $restoredHash) {
            throw "Checksum mismatch after restore: $relative"
        }
    }
    Write-Output 'Restore test passed.'
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
