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
const UPSTREAM_PATH = path.resolve(ROOT, "data", "upstream.json");

const UPSTREAM_OWNER = "1c7";
const UPSTREAM_REPO = "chinese-independent-developer";
const UPSTREAM_BRANCH = "master";

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
 * Strips markdown inline syntax down to plain text (link labels, code/bold/italic contents) —
 * used for the homepage list, which should never show raw markdown syntax or invite navigation.
 */
function stripMarkdownToPlainText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
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

  // introMarkdown keeps rawText untouched (including any trailing "- [更多介绍]()" extra) for the
  // detail page. description drops that trailing extra and is then flattened to plain text for
  // the homepage list.
  const descMatch = rawText.match(/^(.+?)\s*[-–—]\s*\[.+\]\(.+\)/);
  const description = descMatch ? descMatch[1].trim() : rawText;

  return { status, name, url, description: stripMarkdownToPlainText(description), introMarkdown: rawText };
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
        introMarkdown: product.introMarkdown,
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

/**
 * Normalizes one slug component, so purely cosmetic upstream edits — a case change, a doubled
 * space, the same characters in a different Unicode composition — don't mint a new slug.
 */
function normalizeSlugPart(value) {
  return (value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * A project's identity: author + name + board.
 *
 * `date` is deliberately NOT part of it. It used to be, but upstream re-dates existing entries —
 * when a PR is merged, its projects are commonly moved under the merge date, so a project listed
 * on 7-18 can resurface under 7-28 (e.g. upstream PR #1209). With the date in the key that renamed
 * the slug, which meant: the /project/{slug} page moved (old links 404), and giscus — keyed off the
 * pathname — lost the discussion, zeroing the project's likes and comments. The other three parts
 * only change when upstream genuinely changes the project, where a new identity is the right answer.
 *
 * `board` IS included: upstream sometimes intentionally cross-lists the same project in two boards
 * (e.g. both README.md and the programmer edition), and those are meant to be two independent site
 * entries, matching the design's "boards are strictly independent" rule.
 */
function slugKey(entry) {
  return `${normalizeSlugPart(entry.author)}\x1f${normalizeSlugPart(entry.name)}\x1f${entry.board}`;
}

function slugFor(entry) {
  return createHash("sha1").update(slugKey(entry)).digest("hex").slice(0, 12);
}

/**
 * Resolve the upstream branch's current commit SHA, so every file below can be fetched pinned to
 * it. Fetching by branch name instead would race the raw.githubusercontent CDN: it can serve
 * content older than the SHA we then record as synced, and that update would never be picked up
 * again — the watcher Worker only compares SHAs, so it would see the two as equal from then on.
 */
async function resolveUpstreamSha() {
  const url = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/${UPSTREAM_BRANCH}`;
  const headers = { Accept: "application/vnd.github.sha" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to resolve upstream SHA from ${url}: ${res.status} ${res.statusText}`);
  }

  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Unexpected SHA response from ${url}: ${sha.slice(0, 80)}`);
  }
  return sha;
}

/**
 * Fingerprint of everything the site actually renders, so the workflow can tell an upstream commit
 * that changed a project from one that only touched, say, the upstream CI config — the latter is
 * ~19% of upstream commits, and at ~10 commits/day a needless Pages rebuild each time is real.
 *
 * Deliberately excludes `likes`/`comments`: those drift constantly, and their freshness is already
 * handled at runtime by the /api/stats Pages Function, so they never justify a rebuild on their own.
 * Everything else a project renders is covered, which is what matters — a missed change would be a
 * silently stale site, whereas a spurious hash change only costs one extra build.
 */
function contentHash(result) {
  const stable = Object.fromEntries(
    Object.entries(result).map(([board, projects]) => [
      board,
      projects.map(({ likes, comments, ...rendered }) => rendered),
    ]),
  );
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function fetchUpstreamFile(file, sha) {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${sha}/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function main() {
  const upstreamSha = await resolveUpstreamSha();
  console.log(`[sync-content] Upstream ${UPSTREAM_BRANCH} is at ${upstreamSha}.`);

  console.log(`[sync-content] Fetching live giscus counts...`);
  const counts = await fetchGiscusCounts();
  console.log(`[sync-content] Got counts for ${counts.size} discussions.`);

  const result = { main: [], game: [], programmer: [] };

  for (const { file, board } of FILES) {
    console.log(`[sync-content] Fetching ${file}...`);
    const content = await fetchUpstreamFile(file, upstreamSha);
    const parsed = parseMarkdown(content, board);

    // A project can be listed more than once within one board — upstream re-lists it under a newer
    // date instead of moving the old line, and since the date is no longer part of the slug those
    // repeats now share one identity. The site is a mirror, so the newest listing wins and the
    // older ones are dropped: one row, at the position upstream currently gives it.
    const keptInBoard = new Map(); // slug -> { key, entry, index }

    parsed.forEach((entry, index) => {
      if (entry.status === "closed") return; // never imported

      const key = slugKey(entry);
      const slug = slugFor(entry);
      const kept = keptInBoard.get(slug);

      if (!kept) {
        keptInBoard.set(slug, { key, entry, index });
        return;
      }

      if (kept.key !== key) {
        // Two different projects hashing to the same 12 hex digits: ~7e-9 at this catalogue size,
        // so in practice this fires because the identity logic above is wrong, not because SHA-1
        // collided. Fail the sync rather than let two projects silently share a page and a
        // discussion thread — a one-build-stale site is the cheaper failure.
        throw new Error(
          `[sync-content] Slug collision in ${file}: ${slug} is claimed by both ${JSON.stringify(kept.key)} and ${JSON.stringify(key)}.`,
        );
      }

      // Same project twice. Keep whichever upstream dates later; on a tie keep the earlier line.
      const winner = (entry.date ?? "") > (kept.entry.date ?? "") ? { key, entry, index } : kept;
      console.warn(
        `[sync-content] Merging repeat listing in ${file}: "${entry.name}" by ${entry.author} appears on both ${kept.entry.date} and ${entry.date} — keeping ${winner.entry.date}.`,
      );
      keptInBoard.set(slug, winner);
    });

    const ordered = [...keptInBoard.entries()].sort((a, b) => a[1].index - b[1].index);

    for (const [slug, { entry }] of ordered) {
      const live = counts.get(slug);

      result[board].push({
        slug,
        board: entry.board,
        name: entry.name,
        intro: entry.intro,
        introMarkdown: entry.introMarkdown,
        status: entry.status,
        date: entry.date,
        url: entry.url,
        author: entry.author,
        authorLinks: entry.authorLinks,
        likes: live?.likes ?? 0,
        comments: live?.comments ?? 0,
      });
    }

    console.log(
      `[sync-content] ${file} -> ${result[board].length} projects (after filtering closed and merging repeats).`,
    );
  }

  const now = new Date().toISOString();
  const output = {
    meta: {
      contentSyncedAt: now,
      statsSyncedAt: now, // this run also live-fetched counts, so it's a genuine stats refresh too
      upstreamSha, // the exact commit these projects were parsed from
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

  // Small companion file, published alongside site-data.json on the `data` branch. The watcher
  // Worker polls this one every 5 minutes, so it deliberately stays tiny — reading the full
  // site-data.json just to get two fields would be wasteful. `sha` drives the Worker's
  // dispatch decision; `contentHash` drives the workflow's deploy decision.
  const hash = contentHash(result);
  await writeFile(
    UPSTREAM_PATH,
    `${JSON.stringify({ sha: upstreamSha, contentHash: hash, syncedAt: now }, null, 2)}\n`,
    "utf-8",
  );
  console.log(`[sync-content] Wrote ${UPSTREAM_PATH} (sha ${upstreamSha}, contentHash ${hash.slice(0, 12)}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
