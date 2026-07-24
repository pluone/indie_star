#!/usr/bin/env node
// npm `prebuild` step: pulls the current data/site-data.json from the `data` branch (raw GitHub
// content, no git checkout needed) and writes it to public/data/site-data.json so pages can read
// it at build time. Falls back to a local data/site-data.json for dev before the `data` branch
// exists (run `npm run sync:content` once to generate one).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCAL_FALLBACK_PATH = path.resolve(ROOT, "data", "site-data.json");
const OUTPUT_PATH = path.resolve(ROOT, "public", "data", "site-data.json");

const REPO_OWNER = "pluone";
const REPO_NAME = "indie_star";
const DATA_BRANCH = "data";
const REMOTE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DATA_BRANCH}/data/site-data.json`;

async function fetchRemote() {
  try {
    const res = await fetch(REMOTE_URL);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readLocalFallback() {
  try {
    return await readFile(LOCAL_FALLBACK_PATH, "utf-8");
  } catch {
    return null;
  }
}

async function main() {
  let raw = await fetchRemote();
  let source = REMOTE_URL;

  if (raw) {
    console.log(`[fetch-data] Using data/site-data.json from the '${DATA_BRANCH}' branch.`);
  } else {
    console.warn(
      `[fetch-data] Could not fetch ${REMOTE_URL} (branch may not exist yet) — falling back to local ${LOCAL_FALLBACK_PATH}.`,
    );
    raw = await readLocalFallback();
    source = LOCAL_FALLBACK_PATH;
  }

  if (!raw) {
    throw new Error(
      `[fetch-data] No data available from '${DATA_BRANCH}' branch or local fallback. Run 'npm run sync:content' first to generate ${LOCAL_FALLBACK_PATH}.`,
    );
  }

  // Fail fast on malformed JSON rather than shipping a broken build.
  JSON.parse(raw);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, raw, "utf-8");
  console.log(`[fetch-data] Wrote ${OUTPUT_PATH} (source: ${source}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
