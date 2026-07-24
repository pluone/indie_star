#!/usr/bin/env node
// 30-min sync: refreshes only likes/comments (+ meta.statsSyncedAt) on the existing
// data/site-data.json. Doesn't reparse content, so it's the one script that reads the previous
// file — see the "Data layer" section of the project plan.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGiscusCounts } from "./lib/fetch-giscus-counts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(__dirname, "..", "data", "site-data.json");

async function main() {
  const raw = await readFile(DATA_PATH, "utf-8");
  const data = JSON.parse(raw);

  console.log("[sync-giscus-stats] Fetching live giscus counts...");
  const counts = await fetchGiscusCounts();
  console.log(`[sync-giscus-stats] Got counts for ${counts.size} discussions.`);

  let updated = 0;
  for (const board of ["main", "game", "programmer"]) {
    for (const entry of data[board]) {
      const live = counts.get(entry.slug);
      if (!live) continue; // no discussion yet — leave existing 0/0 (or whatever it already was)
      if (entry.likes !== live.likes || entry.comments !== live.comments) updated += 1;
      entry.likes = live.likes;
      entry.comments = live.comments;
    }
  }

  data.meta.statsSyncedAt = new Date().toISOString();
  // meta.contentSyncedAt and meta.counts are left exactly as found — this job never touches them.

  await writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[sync-giscus-stats] Updated ${updated} entries. Wrote ${DATA_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
