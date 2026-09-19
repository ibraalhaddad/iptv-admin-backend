# ImageKit setup

This backend stores all uploaded application logos, banners, theme previews, and notification images in ImageKit. No persistent image files are written to the application container.

## Required environment variables

- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

Optional tuning:

- `IMAGEKIT_UPLOAD_TIMEOUT_MS=60000`
- `IMAGEKIT_DELETE_TIMEOUT_MS=15000`
- `IMAGEKIT_MIGRATION_BATCH_SIZE=25`

Keep `IMAGEKIT_PRIVATE_KEY` server-side only. Do not commit `.env` or any secret keys to GitHub.

## Upload API

The authenticated generic endpoint is:

`POST /api/storage/upload`

Use a multipart field named `file` and `kind` set to one of:

- `banner`
- `application-logo`
- `notification`
- `theme`

Existing dashboard endpoints for applications, banners, and themes also upload directly to ImageKit.

## Deplexo

The project is configured for Deplexo with a read-only container filesystem. ImageKit is therefore the only persistent image storage layer. MongoDB remains external and persistent.
