#!/usr/bin/env node
/**
 * Safe read-only HTTP load tester.
 *
 * Usage:
 *   BASE_URL=https://your-backend.example.com \
 *   ENDPOINT=/api/health \
 *   CONCURRENCY=20 \
 *   DURATION_SECONDS=30 \
 *   node scripts/load-test.js
 *
 * For protected endpoints:
 *   AUTH_TOKEN=ey... node scripts/load-test.js
 *   APPLICATION_ID=<mongo-object-id> node scripts/load-test.js
 *
 * This intentionally does NOT automate login attempts.
 */
const { performance } = require('node:perf_hooks');

const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const endpoint = String(process.env.ENDPOINT || '/api/health');
const concurrency = Math.max(1, Number.parseInt(process.env.CONCURRENCY || '10', 10));
const durationMs = Math.max(1000, Number.parseInt(process.env.DURATION_SECONDS || '30', 10) * 1000);
const token = String(process.env.AUTH_TOKEN || '');
const applicationId = String(process.env.APPLICATION_ID || '');

const samples = [];
let requests = 0;
let errors = 0;
let statusCounts = {};
let stopping = false;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function one() {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (applicationId) headers['x-application-id'] = applicationId;

  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    const elapsed = performance.now() - started;
    requests += 1;
    samples.push(elapsed);
    statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
    if (!response.ok) errors += 1;
  } catch {
    requests += 1;
    errors += 1;
    samples.push(performance.now() - started);
  }
}

async function worker() {
  while (!stopping) await one();
}

async function main() {
  console.log(JSON.stringify({
    baseUrl,
    endpoint,
    concurrency,
    durationSeconds: durationMs / 1000,
  }, null, 2));

  const started = performance.now();
  const workers = Array.from({ length: concurrency }, () => worker());

  await new Promise((resolve) => setTimeout(resolve, durationMs));
  stopping = true;
  await Promise.all(workers);

  const totalSeconds = (performance.now() - started) / 1000;
  const sorted = samples.slice().sort((a, b) => a - b);
  console.log(JSON.stringify({
    requests,
    errors,
    errorRatePercent: requests ? Number((errors / requests * 100).toFixed(2)) : 0,
    rps: Number((requests / totalSeconds).toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: Number((sorted.at(-1) || 0).toFixed(2)),
    statuses: statusCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
