# ImageKit setup

The backend keeps the dashboard API compatible while moving new image uploads from Railway local disk to ImageKit. Existing `/uploads/*` files remain readable during migration.

Railway variables:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

Then run `npm run storage:check`. For legacy local assets: `npm run storage:migrate:dry`, then `npm run storage:migrate`.

The generic endpoint is `POST /api/storage/upload` with multipart `file` and `kind` (`banner`, `application-logo`, `notification`, `theme`). The existing dashboard endpoints for banner uploads, application logos, and theme previews continue to work and now write to ImageKit.
