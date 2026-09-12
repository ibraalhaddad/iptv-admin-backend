# Cloudflare R2 asset storage

The backend now supports direct browser uploads to Cloudflare R2 using short-lived presigned PUT URLs. The Railway/Node process no longer receives the image bytes for the new upload flow.

Cloudflare documents R2 as S3-compatible and supports presigned PUT URLs for direct browser uploads. Configure bucket CORS for the Vercel origin before using the upload flow.

## 1. Create the bucket

Create an R2 bucket, for example `iptv-assets`.

## 2. Create an R2 API token

Create an API token restricted to the bucket with Object Read & Write permission. Keep the Access Key ID and Secret Access Key only in Railway environment variables.

## 3. Public delivery domain

Create a public/custom domain for the bucket, for example:

`https://cdn.example.com`

Set that value as `R2_PUBLIC_BASE_URL` without a trailing slash.

## 4. Bucket CORS

Apply `docs/r2-cors.json` to the bucket. Keep the production Vercel origin and localhost only while developing.

## 5. Railway environment variables

Set:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`
- `R2_PRESIGN_EXPIRES=900`

The backend will return HTTP 503 for the new storage endpoints until all values are configured.

## 6. Migrate existing local uploads

First run:

`npm run storage:migrate:dry`

Review the files it reports. Then run:

`npm run storage:migrate`

The script migrates existing banner, theme, and application-logo files from `uploads/` and updates MongoDB URLs. It does not delete the local files, so rollback is possible.

After verifying the new URLs in the Admin Panel and IPTV app, the old `uploads/` directory can be archived and removed from the runtime image.

## 7. New upload flow

1. Admin Panel requests `/api/storage/presign`.
2. Backend authenticates and authorizes the upload and returns a short-lived signed PUT URL.
3. Browser uploads directly to R2.
4. Admin Panel calls `/api/storage/complete`.
5. Backend HEAD-checks the object and returns the public CDN URL.
6. MongoDB stores only the URL.

Images use long-lived immutable cache headers because object keys are random and are never reused.
