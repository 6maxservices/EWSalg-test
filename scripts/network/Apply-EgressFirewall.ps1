[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string[]]$RunPodHost,
    [string[]]$PublicProviderHost = @(),
    [string[]]$PackageRegistryHost = @('registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org'),
    [string[]]$SelfHostedGitHost = @(),
    [string]$GatewayProgram = (Get-Command python -ErrorAction Stop).Source,
    [string[]]$PackageManagerProgram = @((Get-Command python -ErrorAction Stop).Source, (Get-Command node -ErrorAction Stop).Source),
    [string]$GitProgram = (Get-Command git -ErrorAction Stop).Source,
    [switch]$IUnderstandThisCanBlockNetwork
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$group = 'EWS LLM Egress Guard'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$statePath = Join-Path $repoRoot 'var\firewall\windows-state.json'

if (-not $IUnderstandThisCanBlockNetwork) {
    throw 'Re-run with -IUnderstandThisCanBlockNetwork after reviewing docs/NETWORK_GUARD.md.'
}
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator privileges are required.'
}
if (Test-Path -LiteralPath $statePath) {
    throw "Existing firewall state file found at $statePath. Disable/restore it before applying again."
}

$profiles = Get-NetFirewallProfile | ForEach-Object {
    [pscustomobject]@{
        Name = $_.Name
        DefaultOutboundAction = $_.DefaultOutboundAction.ToString()
    }
}
New-Item -ItemType Directory -Path (Split-Path -Parent $statePath) -Force | Out-Null
$profiles | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

try {
    Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    $dnsProgram = Join-Path $env:SystemRoot 'System32\svchost.exe'
    New-NetFirewallRule -DisplayName 'EWS Allow DNS Client UDP' -Group $group -Direction Outbound -Action Allow -Program $dnsProgram -Service Dnscache -Protocol UDP -RemotePort 53 | Out-Null
    New-NetFirewallRule -DisplayName 'EWS Allow DNS Client TCP' -Group $group -Direction Outbound -Action Allow -Program $dnsProgram -Service Dnscache -Protocol TCP -RemotePort 53 | Out-Null

    $gatewayHosts = @($RunPodHost + $PublicProviderHost) | Sort-Object -Unique
    foreach ($hostName in $gatewayHosts) {
        $addresses = [System.Net.Dns]::GetHostAddresses($hostName) |
            ForEach-Object { $_.IPAddressToString } |
            Sort-Object -Unique
        if (-not $addresses) { throw "No address resolved for $hostName" }
        New-NetFirewallRule -DisplayName "EWS Allow gateway HTTPS $hostName" -Group $group -Direction Outbound -Action Allow -Program $GatewayProgram -Protocol TCP -RemotePort 443 -RemoteAddress $addresses | Out-Null
    }
    foreach ($hostName in ($PackageRegistryHost | Sort-Object -Unique)) {
        $addresses = [System.Net.Dns]::GetHostAddresses($hostName) |
            ForEach-Object { $_.IPAddressToString } |
            Sort-Object -Unique
        if (-not $addresses) { throw "No address resolved for $hostName" }
        foreach ($program in ($PackageManagerProgram | Sort-Object -Unique)) {
            New-NetFirewallRule -DisplayName "EWS Allow package HTTPS $hostName ($([IO.Path]::GetFileName($program)))" -Group $group -Direction Outbound -Action Allow -Program $program -Protocol TCP -RemotePort 443 -RemoteAddress $addresses | Out-Null
        }
    }
    foreach ($hostName in ($SelfHostedGitHost | Sort-Object -Unique)) {
        $addresses = [System.Net.Dns]::GetHostAddresses($hostName) |
            ForEach-Object { $_.IPAddressToString } |
            Sort-Object -Unique
        if (-not $addresses) { throw "No address resolved for $hostName" }
        New-NetFirewallRule -DisplayName "EWS Allow Git HTTPS $hostName" -Group $group -Direction Outbound -Action Allow -Program $GitProgram -Protocol TCP -RemotePort 443 -RemoteAddress $addresses | Out-Null
    }
    Set-NetFirewallProfile -Profile Domain,Private,Public -DefaultOutboundAction Block
    Write-Output "Strict outbound policy applied. State saved to $statePath"
}
catch {
    & (Join-Path $PSScriptRoot 'Disable-EgressFirewall.ps1') -StatePath $statePath -ForceRestore
    throw
}
