# EWS Playback Lab

Minimal web app to test Early Warning anomaly detection algorithms on weekly metric time series.

## Overview

This lab allows users to upload a time series, smoothing it via EWMA, and playback the series week-by-week to observe how an anomaly detection algorithm (Modified Z-Score) would have performed without future data leakage.

## Getting Started

1.  Clone the repository.
2.  Run `npm install`.
3.  Run `npm run dev` to start the development server.
4.  Open the browser to the provided local URL.

## Documentation Index

- [ARCHITECTURE.md](ARCHITECTURE.md) - Application and security architecture.
- [SECURITY_IMPLEMENTATION.md](SECURITY_IMPLEMENTATION.md) - WP1-WP8 readiness and activation boundary.
- [POD_RUNBOOK.md](POD_RUNBOOK.md) - Connect and inspect the existing pod.
- [BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md) - Git hooks, encrypted backups, and restore tests.
- [NETWORK_GUARD.md](NETWORK_GUARD.md) - Reversible Windows egress guard.
- [SUPPLY_CHAIN.md](SUPPLY_CHAIN.md) - Package, extension, and model pins.
- [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md) - Four incident scenarios and monthly drills.
- [SIGNED_COMMITS.md](SIGNED_COMMITS.md) - Human-owned signing setup.
- [DECISIONS.md](DECISIONS.md) - Record of architectural and product decisions.
- [MODULES.md](MODULES.md) - Overview of system modules.
- [MODULE_PLAYBOOK.md](MODULE_PLAYBOOK.md) - Standards for creating and maintaining modules.
- [CHANGELOG.md](CHANGELOG.md) - Record of changes and versioning.
