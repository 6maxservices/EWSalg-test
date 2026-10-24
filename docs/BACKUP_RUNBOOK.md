# Git and encrypted-backup runbook

## Repository boundary

This GitHub repository is an external/shared remote. The staged guard therefore
applies the local `blocklist.txt` in addition to secret patterns. Future private
core IP belongs in a separate repository with no remote or only an explicitly
trusted self-hosted remote.

Review `.githooks/pre-commit`, then preview and activate it:

```powershell
.\scripts\install_git_hooks.ps1
.\scripts\install_git_hooks.ps1 -Install
```

The hook fails closed if the staged guard or the pinned gitleaks binary cannot
run. `SAFE_GIT_REMOTE_PREFIXES` may add reviewed self-hosted URL prefixes; do
not add GitHub or another third-party host merely to bypass a finding.

## Restic

1. Install a reviewed, pinned restic binary and verify its publisher checksum.
2. Create a strong repository password in the password manager and a separate
   offline recovery copy. Put the local password in a protected file outside
   the repository.
3. Set `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` in the current session.
4. Initialize the chosen destination once with `restic init`.
5. Run `scripts/check_cloud_sync.ps1` and
   `scripts/check_windows_encryption.ps1` before the first backup.
6. Run `scripts/backup.ps1`, then `scripts/restore_test.ps1`.

The backup excludes reproducible build output and dependencies, but includes
source, Git history, local policy/evidence, and security logs. Restic encrypts
before upload. Never configure a cloud provider's unencrypted sync client as a
substitute.

Schedule backups only after a successful restore test. Repeat the restore test
monthly and after restic upgrades. Record the restic version, config/script
hashes, destination class (not credentials), and last restore result in the
evidence log.
