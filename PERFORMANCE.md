# Production hardening and capacity testing

## Main fixes

- Production refuses weak/missing `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `CLIENT_ORIGIN`.
- Login brute-force limiter: 8 attempts / 15 minutes per source IP.
- Auth middleware selects only needed user fields and caches user authorization data for a short TTL.
- MongoDB connection pool is explicitly tunable.
- Startup index synchronization is opt-in (`SYNC_INDEXES_ON_START=true`).
- Dashboard statistics no longer load all `lines` documents into Node.js.
- Entity endpoints are bounded and paginated while preserving the existing array response format.
- Settings writes use `bulkWrite()` instead of one MongoDB write per field.
- Public configuration endpoints use short HTTP caching.
- Request/body limits and HTTP server timeouts are configurable.
- Added `/api/health/ready` for MongoDB readiness checks.
- Added a read-only load-test script.

## Important deployment setting

Set these in the backend host:

- `CLIENT_ORIGIN=https://iptv-admin-panel-nu.vercel.app`
- strong `JWT_SECRET`
- strong `ADMIN_USERNAME`
- strong `ADMIN_PASSWORD`
- `MONGODB_URI`

Never copy `.env` into a repository or deployment artifact.

## Capacity test

Example:

```bash
BASE_URL=https://your-backend.example.com \
ENDPOINT=/api/health \
CONCURRENCY=20 \
DURATION_SECONDS=30 \
node scripts/load-test.js
```

For an authenticated read endpoint:

```bash
BASE_URL=https://your-backend.example.com \
ENDPOINT=/api/stats \
AUTH_TOKEN="YOUR_TOKEN" \
CONCURRENCY=20 \
DURATION_SECONDS=30 \
node scripts/load-test.js
```

Start at 5, 10, 20, 40, 80 concurrent workers. Record p95 latency and error rate.

Do not run destructive/write endpoints in the load tester.

## Interpreting the result

A healthy production target for an admin API is usually:

- p95 under 300 ms for small indexed reads
- p95 under 800 ms for heavier aggregated reads
- error rate below 1%
- no sustained MongoDB connection wait/timeout errors

The actual ceiling depends on the Railway instance size, MongoDB Atlas tier, network latency, dataset size, and number of instances. The test script gives a measured ceiling for your real deployment.

## Index deployment

For the first deployment after these model changes, run:

```bash
npm run db:indexes
```

Then keep `SYNC_INDEXES_ON_START=false` in normal production runs so restarts do not repeatedly compare and synchronize indexes.
