# Deploy on Deplexo with ImageKit

## Build and run

- Framework: Node.js
- Install: `npm ci`
- Start: `npm start`
- Port: `5000`

Deplexo injects environment variables at runtime. Do not commit secrets.

## Required environment variables

```text
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
MONGODB_URI=...
JWT_SECRET=...
JWT_EXPIRES_IN=30m
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_DISPLAY_NAME=...
CLIENT_ORIGIN=https://YOUR-ADMIN-PANEL.vercel.app
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/YOUR_IMAGEKIT_ID
```

For the free Deplexo tier, keep the MongoDB pool conservative:

```text
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=1
MONGODB_MAX_IDLE_TIME_MS=120000
MONGODB_WAIT_QUEUE_TIMEOUT_MS=10000
```

## Health checks

- `GET /api/health`
- `GET /api/health/ready`

After deployment, check `/api/health` first. Then log in to the Admin Panel and upload one application logo to verify ImageKit end-to-end.
