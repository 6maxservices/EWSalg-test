# Signed commits

Commit and signing configuration remain human-owned. Do not put a private key
in this repository or on the RunPod.

## SSH signing example

1. Create or select a dedicated signing key in the local password manager or
   hardware-backed agent.
2. Configure only after confirming the public key identity:

```powershell
git config --global gpg.format ssh
git config --global user.signingkey "$env:USERPROFILE\.ssh\id_ed25519_signing.pub"
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

3. Add the public signing key to the trusted Git host and configure its allowed
   signers file if local verification is required.
4. Make a non-sensitive test commit in a disposable repository, then verify
   with `git log --show-signature -1`.

GPG signing is also acceptable when a reviewed key-management process already
exists. Signed commits prove control of a key at commit time; they do not prove
the correctness or exclusive human authorship of every line. Record substantive
design decisions separately with `python -m tools.evidence add-decision`.
