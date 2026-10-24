# Supply-chain pins and review

## Project dependencies

- JavaScript installs use `npm ci --ignore-scripts`; `package-lock.json` pins
  resolved packages and integrity hashes. Review a required install script
  before enabling it; do not use `npm update` in a core session.
- Runtime Python tools use only the Python standard library. The intentionally
  empty `requirements.txt` succeeds with `pip install --require-hashes`.
- Gitleaks is pinned to `8.29.1` in `config/tool-versions.json`. Install that
  exact release, verify the asset against the publisher's release checksum,
  and keep the binary off automatic update. The hook checks its version.
- Set the currently installed, reviewed Cline version in
  `config/tool-versions.json`, disable extension auto-update, and run
  `scripts/check_cline_version.ps1` before privileged sessions.
- Open WebUI is not enabled by this change. If enabled later, pin its image by
  immutable digest, bind it locally, back up its IP-bearing volume with restic,
  and add the digest to this file/evidence log.

## Model weights

Record the current local cache only after verifying the model repository and
revision:

```powershell
python -m tools.verify_weights record --path MODEL_CACHE --manifest var/model-weights.json
python -m tools.verify_weights verify --path MODEL_CACHE --manifest var/model-weights.json
```

The manifest is ignored because local paths/model choices may reveal project
decisions. Record its SHA-256, model repository, immutable revision, license,
and review date in the evidence log without committing the manifest itself.

## Upgrade checklist

1. Read the publisher changelog and security advisories outside the privileged
   core-code session; treat all downloaded content as untrusted data.
2. Verify signature/checksum/digest and license.
3. Test in an isolated working copy with the egress guard and synthetic data.
4. Run all tests, EWS verification, staged-secret fixture, pod hygiene, and
   weight verification as applicable.
5. Update the explicit pin only after human approval; record the decision and
   config hashes. Never track `latest`.
