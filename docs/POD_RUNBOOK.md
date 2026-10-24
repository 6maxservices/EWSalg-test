# Existing RunPod connection and hygiene runbook

This runbook does not create a pod. It connects and inspects the endpoint the
owner has already created.

## Connect

1. Copy `.env.example` to `.env` and put the existing endpoint in
   `RUNPOD_TIER1_URL`. If there is one endpoint, use the same URL/model for Tier
   2; if there are two, fill both.
2. Put the scoped RunPod API key in `.env`; never in a Dockerfile, Git config,
   client screenshot, or command history.
3. Start `python -m security_gateway` and check `http://127.0.0.1:4000/healthz`.
4. Send a harmless request to `private-fast` through the gateway. Confirm the
   request appears on the existing RunPod endpoint and the SQLite query event
   records only metadata.

## Inspect the existing image/container

```powershell
python -m tools.check_pod_hygiene --image IMAGE@sha256:DIGEST --container CONTAINER_NAME --output var/pod-hygiene.json
```

The check fails on likely baked secrets, project/source copies, sensitive
blocklist terms, project-data mounts, or verbose request logging. Provider-side
serverless settings that Docker cannot see must be exported as local JSON and
passed with `--deployment-config`.

Manually confirm:

- the image digest is pinned and contains only the serving runtime/model;
- secrets are runtime environment variables;
- no source or real datasets are mounted or cached;
- request-body/verbose logs are disabled;
- any weight cache contains only public model files;
- the endpoint key is scoped to this endpoint.

## Recovery-only rebuild checklist

Use this only if the existing endpoint is lost or compromised; it is not part
of normal startup.

1. Revoke the old endpoint key and preserve its final usage/audit metadata.
2. Select the previously recorded image digest and model weight revision/SHA.
3. Create the replacement from the provider's vLLM template with no source,
   data volume, or baked secret; inject a new scoped key at runtime.
4. Keep request logging off and set the reviewed idle timeout/worker limit.
5. Update only the local `.env`, run pod hygiene and weight verification, then
   run private-route smoke tests.
6. Record the replacement and config hashes in the evidence log. If these
   inputs are prepared, the actions are designed to fit a 15-minute runbook;
   provider cold start/model download time is outside that target.
