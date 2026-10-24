# Evidence log

`measures.jsonl` and `decisions.jsonl` are created locally on the first append
and are append-only, hash-chained records. They are ignored in this public/shared
repository. Use `python -m tools.evidence`; do not edit existing lines manually.
A changed or deleted line makes `python -m tools.evidence verify` fail.

Keep the logs in encrypted backups or a separate local-only signed repository.
They prove what the local chain records; they do not replace legal advice,
provider records, or signed Git history.
