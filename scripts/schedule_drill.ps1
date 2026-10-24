[CmdletBinding()]
param(
    [ValidateRange(1, 28)][int]$DayOfMonth = 1,
    [string]$Time = '09:00',
    [switch]$Install
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = (Get-Command python).Source
$arguments = "-m tools.drill --project-root `"$repoRoot`" --record-evidence"

if (-not $Install) {
    Write-Output 'Dry run only. This would create the monthly EWS Security Drill task:'
    Write-Output "$python $arguments on day $DayOfMonth at $Time"
    Write-Output 'Re-run with -Install after the gateway and firewall are configured.'
    exit 0
}

$taskCommand = "cmd.exe /d /c cd /d `"$repoRoot`" && `"$python`" $arguments"
& schtasks.exe /Create /SC MONTHLY /D $DayOfMonth /ST $Time /TN 'EWS Security Drill' /TR $taskCommand /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Task Scheduler registration failed.' }
Write-Output 'Scheduled task installed. Configure Task Scheduler failure notifications for your local alerting channel.'
