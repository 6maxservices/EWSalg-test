# Windows egress guard

`scripts/network/Apply-EgressFirewall.ps1` changes the default outbound action
to `Block` for all Windows Firewall profiles and adds reviewed HTTPS/DNS allow
rules. This is intentionally not automatic: an incomplete allowlist can cut
off package installation, Git, updates, remote support, and other applications.

## Review and apply

1. Keep an administrator PowerShell window open and review both apply and
   disable scripts.
2. Record the existing firewall state and make sure no other security product
   replaces Windows Firewall policy.
3. Supply hostnames for the existing RunPod endpoint, registries, and
   self-hosted Git. If public routes are enabled, supply their API hosts through
   `-PublicProviderHost`. RunPod/public-provider rules are scoped to the exact
   `-GatewayProgram` Python executable; other client applications do not get
   those destinations.
4. Apply explicitly:

```powershell
.\scripts\network\Apply-EgressFirewall.ps1 `
  -RunPodHost api.runpod.ai `
  -PublicProviderHost api.openai.com,api.anthropic.com `
  -SelfHostedGitHost git.internal.example `
  -GatewayProgram C:\Path\To\Reviewed\python.exe `
  -PackageManagerProgram C:\Path\To\Reviewed\python.exe,C:\Path\To\Reviewed\node.exe `
  -GitProgram C:\Path\To\Reviewed\git.exe `
  -IUnderstandThisCanBlockNetwork
```

5. Run `scripts/network/Test-EgressFirewall.ps1`, verify the gateway/private
   endpoint, package install from lockfiles, self-hosted Git, and a connection
   to a disallowed host. Inspect the Windows Firewall log for the block.

## Emergency rollback

```powershell
.\scripts\network\Disable-EgressFirewall.ps1
```

The apply script saves the previous per-profile outbound actions to an ignored
state file and attempts this rollback if application fails. Do not delete the
state file manually.

## Maintenance limitation

Windows Firewall rules use resolved IP addresses, not durable FQDN policies.
RunPod and package registries can change addresses. Re-resolve and reapply the
reviewed allowlist after service changes and at least monthly. A failed guard
or stale IP is not a reason to disable the gateway/DLP path.

DNS is scoped to the Windows DNS Client service. Gateway, package-registry, and
self-hosted Git destinations are separately scoped to the reviewed gateway,
package-manager, and Git executables. Program scoping applies to an executable,
not one Python script: another process using the same interpreter could reuse
that allow rule. For a stronger boundary, run the gateway under a dedicated
service identity or packaged executable and scope the rule to it.
