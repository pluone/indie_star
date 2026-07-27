// Shared by GiscusComments.tsx (writer, via giscus's emitMetadata postMessage on the detail page)
// and HomeClient.tsx (reader, to override a project's displayed counts with the exact value the
// acting user just produced — instant and more accurate than the /api/stats edge cache).

const STORAGE_KEY = "giscus-stats:v1";

export interface GiscusStatEntry {
  likes: number;
  comments: number;
}

export type GiscusStatsMap = Record<string, GiscusStatEntry>;

export function readGiscusStats(): GiscusStatsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GiscusStatsMap) : {};
  } catch {
    return {};
  }
}

export function writeGiscusStat(slug: string, entry: GiscusStatEntry): void {
  if (typeof window === "undefined") return;
  try {
    const all = readGiscusStats();
    all[slug] = entry;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Private browsing / quota exceeded — silently skip, static + edge-cached values still work.
  }
}

// Browser pathname is /project/{12-hex slug} (leading slash, per window.location.pathname). Note
// this differs from SLUG_TITLE_RE in fetch-giscus-counts.mjs, which matches the GitHub discussion
// *title* giscus derives from this same pathname by dropping the leading slash — two different
// strings, each regex correct for its own input.
export function slugFromPathname(pathname: string): string | null {
  const match = /^\/project\/([0-9a-f]{12})\/?$/.exec(pathname);
  return match ? match[1] : null;
}
