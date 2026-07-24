#!/usr/bin/env node
// Daily sync: parses the 3 upstream README files directly into data/site-data.json.
// One step, no intermediate output.json — see the "Data layer" section of the project plan.
// Also live-fetches current giscus like/comment counts, so this file is always fully fresh:
// nothing is merged or carried forward from the previous run.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGiscusCounts } from "./lib/fetch-giscus-counts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.resolve(ROOT, "data", "site-data.json");

const UPSTREAM_OWNER = "1c7";
const UPSTREAM_REPO = "chinese-independent-developer";
const UPSTREAM_BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}`;

// board key -> upstream file path (mirrors the 3 upstream README files 1:1)
const FILES = [
  { file: "README.md", board: "main" },
  { file: "pages/README-Game.md", board: "game" },
  { file: "pages/README-Programmer-Edition.md", board: "programmer" },
];

const STATUS_MAP = {
  ":white_check_mark:": "live",
  ":clock8:": "developing",
  ":x:": "closed", // filtered out below — closed/unmaintained projects never appear on the site
};

// ── Markdown parsing (adapted from the old parse.js — same line-classification approach) ──

/** Parse Chinese date header like "2026 年 7 月 23 号添加" → "2026-07-23" */
function parseDate(text) {
  const m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*号/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

/**
 * Parse an author line like:
 *   #### yipeng-git - [Github](url)
 *   #### Mil0R(北京) - [Github](url), [博客](url)
 *   #### 小小电子xxdz | 北京 - [Github](url),[哔哩哔哩](url)
 *   #### chuo0817
 */
function parseAuthor(line) {
  let rest = line.replace(/^####\s+/, "").trim();
  if (!rest) return null;

  const result = { name: "", city: "", links: [] };

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  const allLinks = [];
  const linkPositions = [];

  while ((linkMatch = linkPattern.exec(rest)) !== null) {
    allLinks.push({ label: linkMatch[1], url: linkMatch[2] });
    linkPositions.push({ start: linkMatch.index, end: linkMatch.index + linkMatch[0].length });
  }

  let namePart = rest;
  if (allLinks.length > 0) {
    const firstLinkStart = Math.min(...linkPositions.map((p) => p.start));
    const before = rest.substring(0, firstLinkStart);
    const sepMatch = before.match(/\s*[-–—]\s*$/);
    namePart = sepMatch ? before.substring(0, before.length - sepMatch[0].length).trim() : before.trim();
  }

  result.links = allLinks;
  namePart = namePart.replace(/[：:]\s*$/, "").trim();

  const pipeMatch = namePart.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipeMatch) {
    result.name = pipeMatch[1].trim();
    result.city = pipeMatch[2].trim();
  } else {
    const parenMatch = namePart.match(/^(.+?)[(（](.+)[)）]$/);
    if (parenMatch) {
      result.name = parenMatch[1].trim();
      result.city = parenMatch[2].trim();
    } else {
      result.name = namePart.trim();
    }
  }

  return result;
}

/**
 * Parse a product line like:
 *   * :white_check_mark: [Paste It](url)：description - [extra](url)
 *   - :clock8: [Inalpha](url)：description
 */
function parseProduct(line) {
  const regex = /^[\*\-]\s*(:white_check_mark:|:clock8:|:x:)\s*\[([^\]]+)\]\(([^)]+)\)[：:]\s*(.*)$/;
  const m = line.match(regex);
  if (!m) return null;

  const statusIcon = m[1];
  const name = m[2].trim();
  const url = m[3].trim();
  const rawText = m[4].trim();
  const status = STATUS_MAP[statusIcon] || statusIcon;

  const descMatch = rawText.match(/^(.+?)\s*[-–—]\s*\[.+\]\(.+\)/);
  const description = descMatch ? descMatch[1].trim() : rawText;

  return { status, name, url, description };
}

function isDateHeader(line) {
  return /^###\s+\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*号/.test(line);
}
function isAuthorLine(line) {
  return /^####\s+/.test(line);
}
function isProductLine(line) {
  return /^[\*\-]\s*:/.test(line);
}
function isSectionHeader(line) {
  return /^#{1,2}\s+/.test(line) || /^<a\s/.test(line);
}

function parseMarkdown(content, board) {
  const lines = content.split("\n");
  const entries = [];
  let currentDate = null;
  let currentAuthor = null;
  let inProjectList = false;

  for (const line of lines) {
    if (/^##\s+.*项目列表/.test(line)) {
      inProjectList = true;
      continue;
    }
    if (/^##\s+游戏版面/.test(line)) {
      inProjectList = true;
      continue;
    }
    if (board === "programmer" && isDateHeader(line)) {
      inProjectList = true;
    }

    if (!inProjectList) continue;

    if (isDateHeader(line)) {
      currentDate = parseDate(line);
      currentAuthor = null;
      continue;
    }

    if (isAuthorLine(line)) {
      currentAuthor = parseAuthor(line);
      continue;
    }

    if (isProductLine(line)) {
      const product = parseProduct(line);
      if (!product) continue;

      entries.push({
        board,
        date: currentDate,
        author: currentAuthor ? currentAuthor.name : "",
        authorLinks: currentAuthor ? currentAuthor.links : [],
        name: product.name,
        url: product.url,
        status: product.status,
        intro: product.description,
      });
      continue;
    }

    if (isSectionHeader(line) && !isDateHeader(line) && !isAuthorLine(line) && !isProductLine(line)) {
      if (/^#\s+/.test(line)) break;
      if (/^##\s+/.test(line) && !/项目列表|游戏版面|中国独立/.test(line)) break;
    }
  }

  return entries;
}

function slugFor(entry, extra = "") {
  // `board` is included: upstream sometimes intentionally cross-lists the same project (same
  // date/author/name) in two boards (e.g. both README.md and the programmer edition) — those are
  // meant to be two independent site entries, matching the design's "boards are strictly
  // independent" rule, so they must not collide.
  const key = `${entry.date}\x1f${entry.author}\x1f${entry.name}\x1f${entry.board}${extra}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

async function fetchUpstreamFile(file) {
  const url = `${RAW_BASE}/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function main() {
  console.log(`[sync-content] Fetching live giscus counts...`);
  const counts = await fetchGiscusCounts();
  console.log(`[sync-content] Got counts for ${counts.size} discussions.`);

  const result = { main: [], game: [], programmer: [] };

  for (const { file, board } of FILES) {
    console.log(`[sync-content] Fetching ${file}...`);
    const content = await fetchUpstreamFile(file);
    const parsed = parseMarkdown(content, board);

    const seenInBoard = new Map(); // slug -> url, to detect true upstream duplicates within a board

    for (const entry of parsed) {
      if (entry.status === "closed") continue; // never imported

      let slug = slugFor(entry);

      if (seenInBoard.has(slug)) {
        if (seenInBoard.get(slug) === entry.url) {
          // Same date/author/name/board AND same URL — a genuine upstream duplicate submission
          // (seen in practice, e.g. the same product line accidentally added twice on one day).
          // Keep only the first occurrence; skip this repeat.
          console.warn(
            `[sync-content] Skipping duplicate entry in ${file}: "${entry.name}" by ${entry.author} on ${entry.date} (same slug, same URL as an earlier line).`,
          );
          continue;
        }
        // Same key but a different URL — a true (extremely unlikely) hash collision between two
        // distinct projects rather than a duplicate. Disambiguate deterministically rather than
        // silently dropping or overwriting one of them.
        let suffix = 2;
        let disambiguated = slugFor(entry, `\x1f${suffix}`);
        while (seenInBoard.has(disambiguated)) {
          suffix += 1;
          disambiguated = slugFor(entry, `\x1f${suffix}`);
        }
        console.warn(
          `[sync-content] Slug collision (different projects) in ${file}: "${entry.name}" by ${entry.author} on ${entry.date} — disambiguated to ${disambiguated}.`,
        );
        slug = disambiguated;
      }
      seenInBoard.set(slug, entry.url);

      const live = counts.get(slug);

      result[board].push({
        slug,
        board: entry.board,
        name: entry.name,
        intro: entry.intro,
        status: entry.status,
        date: entry.date,
        url: entry.url,
        author: entry.author,
        authorLinks: entry.authorLinks,
        likes: live?.likes ?? 0,
        comments: live?.comments ?? 0,
      });
    }

    console.log(`[sync-content] ${file} -> ${result[board].length} projects (after filtering closed).`);
  }

  const now = new Date().toISOString();
  const output = {
    meta: {
      contentSyncedAt: now,
      statsSyncedAt: now, // this run also live-fetched counts, so it's a genuine stats refresh too
      counts: {
        main: result.main.length,
        game: result.game.length,
        programmer: result.programmer.length,
        total: result.main.length + result.game.length + result.programmer.length,
      },
    },
    ...result,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`[sync-content] Wrote ${OUTPUT_PATH} (total ${output.meta.counts.total} projects).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
