// Cloudflare Pages Function — GET /api/stats
//
// Serves near-real-time like/comment counts for every active project, backed by GitHub Discussions
// (giscus). Edge-cached via the Cache API — not Workers KV, whose free-tier 1,000 writes/day cap
// would be blown by refreshing every ~10s — with a 10s freshness window and stale-while-revalidate
// so a request never blocks behind a live GitHub GraphQL call once an entry exists.
//
// Requires a dedicated GitHub PAT (read-only, Discussions access) set as the Pages secret
// GISCUS_STATS_TOKEN. Deliberately NOT the Actions GITHUB_TOKEN — that one is scoped to CI, this is
// a public-facing edge function.

import { fetchGiscusCounts } from "../../scripts/lib/fetch-giscus-counts.mjs";

const FRESH_MS = 10_000; // serve straight from cache below this age
const STALE_MS = 60_000; // above FRESH_MS but below this: serve the stale copy, refresh in background
const CACHE_KEY = "https://indie-star.internal/api/stats"; // fixed key, independent of request headers/query

// Per-isolate single-flight guard: concurrent requests hitting a warm isolate during a cache
// miss/expiry share one in-flight GitHub fetch instead of each firing their own — avoids a
// cache-stampede blowing through the GraphQL rate limit.
let inflight = null;

async function buildResponse(env) {
  let data = {};
  try {
    const counts = await fetchGiscusCounts(env.GISCUS_STATS_TOKEN);
    data = Object.fromEntries(counts);
  } catch (err) {
    // GitHub down/rate-limited/token missing: degrade to an empty payload rather than a 5xx — the
    // client already falls back to its static + localStorage values when a slug is absent here.
    console.error("[api/stats] fetchGiscusCounts failed:", err);
  }

  const body = JSON.stringify({ data, syncedAt: new Date().toISOString() });
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Kept cacheable for the full stale window so the Cache API doesn't evict the entry out from
      // under the stale-while-revalidate logic below; the finer 10s freshness check happens on
      // x-cached-at instead of relying on max-age expiry.
      "cache-control": `public, s-maxage=${STALE_MS / 1000}`,
      "x-cached-at": String(Date.now()),
    },
  });
}

function refresh(env) {
  if (!inflight) {
    inflight = buildResponse(env).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function onRequestGet(context) {
  const { env } = context;
  const cache = caches.default;
  const cacheKeyRequest = new Request(CACHE_KEY, { method: "GET" });

  const cached = await cache.match(cacheKeyRequest);
  if (cached) {
    const age = Date.now() - Number(cached.headers.get("x-cached-at") ?? 0);
    if (age < FRESH_MS) {
      return cached;
    }
    if (age < STALE_MS) {
      context.waitUntil(refresh(env).then((fresh) => cache.put(cacheKeyRequest, fresh.clone())));
      return cached;
    }
  }

  const fresh = await refresh(env);
  context.waitUntil(cache.put(cacheKeyRequest, fresh.clone()));
  return fresh;
}
