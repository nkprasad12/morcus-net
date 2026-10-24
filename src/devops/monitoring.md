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

1. **Age-based pruning**: archives and then deletes completed UTC ISO weeks (`YYYY-Www`) older than `TELEMETRY_RETENTION_DAYS` (default `100`) from `ApiCalls`, `ServerHealth` and `ClientEvents` (legacy, pre-#592 client events).
2. **Quota safety valve**: if `db.stats()` (`dataSize + indexSize`, for the database in `MONGODB_URI` only) exceeds `TELEMETRY_MAX_MB` (default `400`), archives and deletes the oldest `ApiCalls` weeks until under the cap. It never deletes the current week or the two most recent completed weeks; if that isn't enough, it logs a warning to check other collections or databases on the cluster.

If `MONGODB_URI` is unset or empty, `morcus-pruner` logs a message and exits `0`, so no container stays resident.

## Backups (`PRUNE_BACKUP_URI`)

Each week is archived **before** it is deleted from MongoDB, to `<namespace>/<collection>/<isoYear>/<collection>-<isoYear>-W<ww>.jsonl.gz`, and the archive is verified (document count, and last `_id`) before the delete. `<namespace>` is `<cluster host>-<database>` (e.g. `cluster0.abc.mongodb.net-test`), or `PRUNE_ARCHIVE_PREFIX` if set. Existing archives are never overwritten. Archives are small: a week of human-only `ApiCalls` is typically a few MB gzipped.

- **Default (blank): local disk.** Archives go to `/morcus/logs/archives` in the container, which is `$LOGS_DIR/archives` on the host. The pruner runs as UID 1000, so that directory must be owned by UID 1000; `vm_setup.sh` creates it, or do it once by hand:

  ```bash
  sudo install -d -o 1000 -g 1000 "$LOGS_DIR/archives"
  ```

  If the directory is missing or not writable, the pruner exits with that command in its error message and deletes nothing (`docker compose ps` shows it restarting).

  > [!WARNING]
  > Once a week is deleted from MongoDB, the file under `$LOGS_DIR/archives` is its **only copy**. Nothing rotates, prunes, or copies these archives anywhere else. If that matters, use S3/R2 below, or sync the directory off the VM yourself.

- **S3 / Cloudflare R2**:

  ```dotenv
  # Default bucket (`morcus-telemetry`, created if missing):
  PRUNE_BACKUP_URI="https://<access_key_id>:<secret_access_key>@<account_id>.r2.cloudflarestorage.com"

  # Explicit bucket name and region (region defaults to `auto`, which is right for R2).
  # A bucket you name explicitly must already exist; only the default one is auto-created.
  PRUNE_BACKUP_URI="https://<access_key_id>:<secret_access_key>@s3.us-east-1.amazonaws.com/my-bucket?region=us-east-1"
  ```

  Percent-encode special characters in the keys (`/` → `%2F`, `+` → `%2B`).

- **Another local directory**: an absolute path inside the container (`file:///...` also works). Relative paths, `/`, and paths that aren't on a mounted volume are rejected at startup.

- **No backup at all**: `PRUNE_BACKUP_URI=none`. This is the only value that deletes without archiving; anything else that isn't a recognised destination is rejected, so a typo can never silently disable backups.

Each line of an archive is one document as plain JSON; `_id` is the 24-character hex string. To load an archive back with `mongoimport`, convert `_id` to an `ObjectId` first (e.g. `jq -c '._id |= {"$oid": .}'`), or use `new ObjectId(doc._id)` in a script.

## Upgrading an existing VM

The first `docker compose up -d` after pulling the pruner starts it immediately, and its first pass archives and deletes everything older than `TELEMETRY_RETENTION_DAYS`. On a VM that predates the pruner:

```bash
# 1. Create the archive directory (UID 1000) that the default local backup needs.
sudo install -d -o 1000 -g 1000 "$LOGS_DIR/archives"

# 2. Pull the image and preview the first pass. This connects to MongoDB read-only, lists
#    each week it would archive and delete (document count and gzipped size), and reports
#    whether the backup destination is ready. It changes nothing.
docker compose pull pruner
docker compose run --rm pruner --dry-run

# 3. Start it for real.
docker compose up -d
```

## Operations & Troubleshooting

- **Health**: `docker compose ps` shows `pruner` as `unhealthy` if no fully successful pass has completed in the last 36 hours (e.g. expired backup credentials, or a week refused because its existing archive doesn't match). Check the logs for the cause.
- **View pruner logs**:

  ```bash
  docker compose logs -f pruner
  ```

- **Preview the next pass without changing anything** (exits non-zero if the backup destination isn't ready or a week can't be read):

  ```bash
  docker compose run --rm pruner --dry-run
  ```

- **Run a one-shot prune pass manually** (exits non-zero if any errors occurred). Running it next to the daemon is safe: archives can't be overwritten (`If-None-Match` on S3, `link()` locally), each instance deletes only up to its own last exported `_id`, and temp files younger than an hour are left alone.

  ```bash
  docker compose run --rm pruner --once
  ```
