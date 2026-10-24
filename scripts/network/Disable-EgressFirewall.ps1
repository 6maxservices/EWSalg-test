[CmdletBinding()]
param(
    [string]$StatePath,
    [switch]$ForceRestore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$group = 'EWS LLM Egress Guard'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $StatePath) { $StatePath = Join-Path $repoRoot 'var\firewall\windows-state.json' }

if (-not $ForceRestore) {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator privileges are required.'
    }
}
if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    throw "Firewall state file not found: $StatePath"
}
$profiles = @(Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json)
Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
foreach ($profile in $profiles) {
    Set-NetFirewallProfile -Profile $profile.Name -DefaultOutboundAction $profile.DefaultOutboundAction
}
Remove-Item -LiteralPath $StatePath -Force
Write-Output 'EWS firewall rules removed and previous outbound policies restored.'
