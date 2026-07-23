#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────
const BASE_DIR = path.resolve(__dirname, "chinese-independent-developer-master");
const FILES = [
  { file: "README.md",                            board: "主版面",   key: "main_board" },
  { file: "pages/README-Game.md",                  board: "游戏版面", key: "game_board" },
  { file: "pages/README-Programmer-Edition.md",    board: "程序员版面", key: "programmer_board" },
];

const OUTPUT = path.resolve(__dirname, "output.json");

// ID prefixes for each board
const ID_PREFIX = {
  main_board: "main",
  game_board: "game",
  programmer_board: "prog",
};

// ── Helpers ─────────────────────────────────────────────────────────

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
 *
 * Returns { name, city, links: [{label, url}] }
 */
function parseAuthor(line) {
  // Strip leading #### and whitespace
  let rest = line.replace(/^####\s+/, "").trim();
  if (!rest) return null;

  const result = { name: "", city: "", links: [] };

  // Extract trailing links: all [label](url) patterns at the end (after " - ")
  // Links can be separated by commas (English or Chinese) or just spaces
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  const allLinks = [];
  const linkPositions = [];

  // Find all links and their positions
  while ((linkMatch = linkPattern.exec(rest)) !== null) {
    allLinks.push({ label: linkMatch[1], url: linkMatch[2] });
    linkPositions.push({ start: linkMatch.index, end: linkMatch.index + linkMatch[0].length });
  }

  // Remove all link patterns from rest to get name+city part
  let namePart = rest;
  if (allLinks.length > 0) {
    // Remove the " - " separator before links if present
    // Find the earliest link position
    const firstLinkStart = Math.min(...linkPositions.map(p => p.start));
    // Look for " - " just before the first link
    const before = rest.substring(0, firstLinkStart);
    const sepMatch = before.match(/\s*[-–—]\s*$/);
    if (sepMatch) {
      namePart = before.substring(0, before.length - sepMatch[0].length).trim();
    } else {
      // No separator, just take the name part
      namePart = before.trim();
    }
  }

  result.links = allLinks;

  // Strip trailing colon (： or :) and whitespace from namePart before parsing
  namePart = namePart.replace(/[：:]\s*$/, "").trim();

  // Parse city from namePart: "name(city)", "name（city）", or "name | city"
  // Handle "name | city" first (pipe with optional spaces)
  let pipeMatch = namePart.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipeMatch) {
    result.name = pipeMatch[1].trim();
    result.city = pipeMatch[2].trim();
  } else {
    // Handle "name(city)" — both half-width () and full-width （）
    let parenMatch = namePart.match(/^(.+?)[(（](.+)[)）]$/);
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
 *
 * Returns { status, name, url, description, rawText } or null
 */
function parseProduct(line) {
  // Match bullet (* or -), status icon, product name+url, and the rest
  const regex = /^[\*\-]\s*(:white_check_mark:|:clock8:|:x:)\s*\[([^\]]+)\]\(([^)]+)\)[：:]\s*(.*)$/;
  const m = line.match(regex);
  if (!m) return null;

  const statusIcon = m[1];
  const name = m[2].trim();
  const url = m[3].trim();
  const rawText = m[4].trim();

  // Map status
  const statusMap = {
    ":white_check_mark:": "已上线",
    ":clock8:": "开发中",
    ":x:": "已关闭",
  };
  const status = statusMap[statusIcon] || statusIcon;

  // Extract description: text before the first " - [" pattern
  const descMatch = rawText.match(/^(.+?)\s*[-–—]\s*\[.+\]\(.+\)/);
  const description = descMatch ? descMatch[1].trim() : rawText;

  return { status, name, url, description, rawText };
}

/** Check if a line is a date header */
function isDateHeader(line) {
  return /^###\s+\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*号/.test(line);
}

/** Check if a line is an author line */
function isAuthorLine(line) {
  return /^####\s+/.test(line);
}

/** Check if a line is a product line */
function isProductLine(line) {
  return /^[\*\-]\s*:/.test(line);
}

/** Check if a line is a section header (higher level) */
function isSectionHeader(line) {
  return /^#{1,2}\s+/.test(line) || /^<a\s/.test(line);
}

// ── Main parser ─────────────────────────────────────────────────────

function parseFile(filePath, boardType) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const projects = [];
  let currentDate = null;
  let currentAuthor = null;
  let inProjectList = false; // Only parse after "## 3. 项目列表" or similar

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of project list section
    // Main README has "## 3. 项目列表", game has "本版面放的都是游戏",
    // programmer edition starts directly with date headers
    if (/^##\s+.*项目列表/.test(line)) {
      inProjectList = true;
      continue;
    }
    // Game edition starts after the intro header
    if (/^##\s+游戏版面/.test(line)) {
      inProjectList = true;
      continue;
    }
    // Programmer edition: starts after the intro paragraphs (first date header)
    if (boardType === "程序员版面" && isDateHeader(line)) {
      inProjectList = true;
    }

    if (!inProjectList) continue;

    // ── Date header ──
    if (isDateHeader(line)) {
      currentDate = parseDate(line);
      currentAuthor = null; // Reset author on new date
      continue;
    }

    // ── Author line ──
    if (isAuthorLine(line)) {
      currentAuthor = parseAuthor(line);
      continue;
    }

    // ── Product line ──
    if (isProductLine(line)) {
      const product = parseProduct(line);
      if (!product) continue;

      const projectKey = [currentDate, currentAuthor ? currentAuthor.name : "", product.name]
        .map(s => (s || "").trim())
        .join("\x1F"); // Unit Separator (ASCII 31) — invisible delimiter

      projects.push({
        id: "", // filled in later
        project_key: projectKey,
        line_number: i + 1, // 1-indexed line number in source file
        source_file: path.basename(filePath),
        board_type: boardType,
        date_added: currentDate,
        author_name: currentAuthor ? currentAuthor.name : "",
        author_city: currentAuthor ? currentAuthor.city : "",
        author_links: currentAuthor ? currentAuthor.links : [],
        product_name: product.name,
        product_url: product.url,
        product_status: product.status,
        product_description: product.description,
        product_raw_text: product.rawText,
      });
      continue;
    }

    // ── Stop at next major section ──
    if (isSectionHeader(line) && !isDateHeader(line) && !isAuthorLine(line) && !isProductLine(line)) {
      // Check if this is just a subsection within the list (like ### 子版面)
      // Only stop if we've been parsing and hit a clear boundary
      if (/^#\s+/.test(line)) {
        // H1 - definitely a new section, stop
        break;
      }
      if (/^##\s+/.test(line) && !/项目列表|游戏版面|中国独立/.test(line)) {
        // H2 that's not about the list - stop
        // But "## 3. 项目列表" and "## 游戏版面" are handled above
        break;
      }
    }
  }

  return projects;
}

// ── Run ─────────────────────────────────────────────────────────────

const result = {};

for (const { file, board, key } of FILES) {
  const filePath = path.join(BASE_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const projects = parseFile(filePath, board);
  // Assign unique IDs
  const prefix = ID_PREFIX[key];
  projects.forEach((p, idx) => {
    p.id = `${prefix}-${String(idx + 1).padStart(4, "0")}`;
  });
  result[key] = projects;
  console.error(`Parsed ${file}: ${result[key].length} projects`);
}

// Build metadata
const counts = {
  main_board: result.main_board.length,
  game_board: result.game_board.length,
  programmer_board: result.programmer_board.length,
  total: result.main_board.length + result.game_board.length + result.programmer_board.length,
};

// Get commit hash from the parsed repo
let lastCommit = null;
try {
  const { execSync } = require("child_process");
  lastCommit = execSync("git rev-parse HEAD 2>/dev/null", { cwd: BASE_DIR, encoding: "utf-8" }).trim();
} catch {
  // If not a git repo, try GitHub API
  try {
    const { execSync } = require("child_process");
    const apiResp = execSync(
      'curl -s "https://api.github.com/repos/1c7/chinese-independent-developer/commits?per_page=1" -H "Accept: application/vnd.github+json"',
      { encoding: "utf-8" }
    );
    lastCommit = JSON.parse(apiResp)[0]?.sha || null;
  } catch {
    lastCommit = null;
  }
}

const meta = {
  repo: "https://github.com/1c7/chinese-independent-developer",
  last_commit: lastCommit,
  parsed_at: new Date().toISOString(),
  counts,
};

// Prepend meta as first key in output object
const output = { meta, ...result };

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
console.error(`\nOutput written to ${OUTPUT}`);
console.error(`Commit: ${lastCommit}`);
console.error(`Total: ${counts.total} projects`);
