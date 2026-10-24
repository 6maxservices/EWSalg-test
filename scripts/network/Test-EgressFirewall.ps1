[CmdletBinding()]
param(
    [string]$DisallowedHost = 'example.com'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$group = 'EWS LLM Egress Guard'
$profiles = Get-NetFirewallProfile
$rules = @(Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue)
$blockingProfiles = @($profiles | Where-Object { $_.DefaultOutboundAction -eq 'Block' })
$connectionBlocked = $true
$client = [System.Net.Sockets.TcpClient]::new()
try {
    $attempt = $client.ConnectAsync($DisallowedHost, 443)
    if ($attempt.Wait(3000) -and $client.Connected) { $connectionBlocked = $false }
}
catch {
    $connectionBlocked = $true
}
finally {
    $client.Dispose()
}
$status = if ($blockingProfiles.Count -eq $profiles.Count -and $rules.Count -gt 0 -and $connectionBlocked) { 'PASS' } else { 'FAIL' }
@{
    status = $status
    blockingProfiles = @($blockingProfiles.Name)
    ruleCount = $rules.Count
    disallowedConnectionBlocked = $connectionBlocked
} | ConvertTo-Json
if ($status -ne 'PASS') { exit 1 }
