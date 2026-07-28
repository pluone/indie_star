// Shared by GiscusComments.tsx (writer, via giscus's emitMetadata postMessage on the detail page)
// and HomeClient.tsx (reader, to override a project's displayed counts with the exact value the
// acting user just produced — instant and more accurate than the /api/stats edge cache).

// v2 = entries carry the timestamp they were captured at. v1 entries had no expiry, so a count
// observed once kept overriding /api/stats forever: open a detail page today at 1 like, come back
// next week when everyone else sees 10, and this browser would still render 1. The v1 key is
// dropped on sight rather than migrated — its entries have no known age, so none of them can be
// trusted to still be fresher than the server's.
const STORAGE_KEY = "giscus-stats:v2";
const LEGACY_STORAGE_KEY = "giscus-stats:v1";

// Outer bound on how long a locally captured count stays usable. The primary rule is a direct
// comparison against the age of /api/stats' data (HomeClient.tsx) — whichever observation is newer
// wins, which is exact. This TTL is only the backstop for when there is nothing to compare against:
// /api/stats unreachable, or the slug missing from its payload (no discussion yet / degraded empty
// response). Past it we'd rather fall back to the shared value than pin stale numbers to this
// device.
const OVERRIDE_TTL_MS = 5 * 60 * 1000;

export interface GiscusStatEntry {
  likes: number;
  comments: number;
}

export type GiscusStatsMap = Record<string, GiscusStatEntry>;

// `at` is the local-clock instant giscus reported these counts. It leaves this module (unlike the
// storage format around it) because deciding whether the entry still beats the server's snapshot is
// the reader's call, not something a TTL can answer on its own.
export interface StoredGiscusStat extends GiscusStatEntry {
  at: number;
}

type StoredEntry = StoredGiscusStat;

function readStored(): Record<string, StoredEntry> {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, StoredEntry> = {};
    for (const [slug, value] of Object.entries(parsed ?? {})) {
      const entry = value as Partial<StoredEntry> | null;
      if (
        typeof entry?.likes === "number" &&
        typeof entry.comments === "number" &&
        typeof entry.at === "number"
      ) {
        out[slug] = { likes: entry.likes, comments: entry.comments, at: entry.at };
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Fresh = written within the TTL and not in the future; the upper bound stops an entry written
// while the system clock was ahead from becoming permanently unexpirable after the clock is fixed.
function prune(stored: Record<string, StoredEntry>): Record<string, StoredEntry> {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(stored).filter(([, entry]) => entry.at > now - OVERRIDE_TTL_MS && entry.at <= now),
  );
}

function persist(stored: Record<string, StoredEntry>): void {
  try {
    if (Object.keys(stored).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private browsing / quota exceeded — silently skip, static + edge-cached values still work.
  }
}

export function readGiscusStats(): Record<string, StoredGiscusStat> {
  if (typeof window === "undefined") return {};
  const stored = readStored();
  const fresh = prune(stored);
  // Expired entries are evicted here too, not just on write: a browser that stops visiting detail
  // pages would otherwise carry them around indefinitely.
  if (Object.keys(fresh).length !== Object.keys(stored).length) persist(fresh);
  return fresh;
}

export function writeGiscusStat(slug: string, entry: GiscusStatEntry): void {
  if (typeof window === "undefined") return;
  const stored = prune(readStored());
  stored[slug] = { ...entry, at: Date.now() };
  persist(stored);
}

// Browser pathname is /project/{12-hex slug} (leading slash, per window.location.pathname). Note
// this differs from SLUG_TITLE_RE in fetch-giscus-counts.mjs, which matches the GitHub discussion
// *title* giscus derives from this same pathname by dropping the leading slash — two different
// strings, each regex correct for its own input.
export function slugFromPathname(pathname: string): string | null {
  const match = /^\/project\/([0-9a-f]{12})\/?$/.exec(pathname);
  return match ? match[1] : null;
}
