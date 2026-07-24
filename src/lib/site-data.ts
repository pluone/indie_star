import { readFileSync } from "node:fs";
import path from "node:path";
import type { Project, SiteData } from "./types";

let cached: SiteData | null = null;

// Server-only: reads the file scripts/fetch-data.mjs (npm prebuild) wrote before `next build` ran.
export function getSiteData(): SiteData {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "public", "data", "site-data.json");
  const raw = readFileSync(filePath, "utf-8");
  cached = JSON.parse(raw) as SiteData;
  return cached;
}

export function findProjectBySlug(slug: string): Project | null {
  const data = getSiteData();
  for (const board of ["main", "game", "programmer"] as const) {
    const found = data[board].find((p) => p.slug === slug);
    if (found) return found;
  }
  return null;
}

// Fixed at build time (server-side) so there's no client-side date math or hydration mismatch
// from viewer-local timezones.
export function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
