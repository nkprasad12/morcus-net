# Ideas

For memory usage, it could be better to do it from outside the process.

For example, we can consider:

```
docker container ls --filter name=morcus-prod
```

which returns

```
CONTAINER ID   IMAGE                                   COMMAND                  CREATED      STATUS      PORTS      NAMES
0093023372c2   ghcr.io/nkprasad12/morcus:main-latest   "docker-entrypoint.s…"   9 days ago   Up 9 days   5757/tcp   morcus-prod-1
```

then we take the container ID

```
docker inspect --format '{{.State.Pid}}' 0093023372c2
```

to get the output

```
984599
```

Then we use `pstree` or a different util until get get to the `node` subprocess.

Then we can read the result using `top` or a different util.

---

# Telemetry Retention & Backups (`morcus-pruner`)

When `MONGODB_URI` is set in `.env`, the `pruner` service (`morcus-pruner`) runs a pass at startup and then every 24h (± 15m) to keep the MongoDB Atlas `M0` cluster (512 MB cap) within budget:

1. **Age-based pruning**: deletes completed UTC ISO weeks (`YYYY-Www`) older than `TELEMETRY_RETENTION_DAYS` (default `100`) from `ApiCalls`, `ServerHealth` and `ClientEvents`.
2. **Quota safety valve**: if `db.stats()` (`dataSize + indexSize`, for the database in `MONGODB_URI` only) exceeds `TELEMETRY_MAX_MB` (default `400`), deletes the oldest `ApiCalls` weeks until under the cap. It never deletes the current week or the two most recent completed weeks; if that isn't enough, it logs a warning to check other collections or databases on the cluster.

If `MONGODB_URI` is unset or empty, `morcus-pruner` logs a message and exits `0`, so no container stays resident.

## Configuring Cold Backups (`PRUNE_BACKUP_URI`)

> [!WARNING]
> If `PRUNE_BACKUP_URI` is unset or empty, `morcus-pruner` runs in **prune-only** mode and deletes expired weeks **without any backup**, starting on its first run. Set `PRUNE_BACKUP_URI` before starting the service if you want archives of older data.

With a backup destination, each week is written to `<namespace>/<collection>/<isoYear>/<collection>-<isoYear>-W<ww>.jsonl.gz` and verified before it's deleted from MongoDB. `<namespace>` is `<cluster host>-<database>` (e.g. `cluster0.abc.mongodb.net-test`), or `PRUNE_ARCHIVE_PREFIX` if set. Existing archives are never overwritten.

- **S3 / Cloudflare R2**:

  ```dotenv
  # Default bucket (`morcus-telemetry`, created if missing):
  PRUNE_BACKUP_URI="https://<access_key_id>:<secret_access_key>@<account_id>.r2.cloudflarestorage.com"

  # Explicit bucket name and region (region defaults to `auto`, which is right for R2):
  PRUNE_BACKUP_URI="https://<access_key_id>:<secret_access_key>@s3.us-east-1.amazonaws.com/my-bucket?region=us-east-1"
  ```

  Percent-encode special characters in the keys (`/` → `%2F`, `+` → `%2B`).

- **Local directory**: `$LOGS_DIR` is mounted at `/morcus/logs`. The pruner runs as UID 1000, so create the archive directory once on the host:

  ```bash
  sudo install -d -o 1000 -g 1000 "$LOGS_DIR/archives"
  ```

  ```dotenv
  PRUNE_BACKUP_URI="/morcus/logs/archives"
  ```

  Relative paths, `/`, and paths that aren't on a mounted volume are rejected at startup.

Each line of an archive is one document as plain JSON; `_id` is the 24-character hex string (`new ObjectId(doc._id)` restores it).

## Operations & Troubleshooting

- **Health**: `docker compose ps` shows `pruner` as `unhealthy` if no fully successful pass has completed in the last 36 hours (e.g. expired backup credentials, or a week refused because its existing archive doesn't match). Check the logs for the cause.
- **View pruner logs**:

  ```bash
  docker compose logs -f pruner
  ```

- **Run a one-shot prune pass manually** (exits non-zero if any errors occurred):

  ```bash
  docker compose run --rm pruner --once
  ```
