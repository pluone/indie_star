// 删除 `next build`（output: "export"）为每个路由额外产出的分段预取文件。
//
// 背景:Next 16 的 App Router 会给每个预渲染路由再写 7 个 `__next*.txt`
// (__next._tree.txt / __next._full.txt / __next._head.txt / __next._index.txt /
//  __next.<segment>.txt …),供客户端 segment cache 做「按段预取」。
// 本站 2,200+ 个项目详情页 × 9 个文件 ≈ 20,007 个,正好顶到 Cloudflare Pages
// 每个部署 20,000 个文件的上限,构建在「Validating asset output directory」阶段失败。
//
// 这些文件不是导航的必要条件:客户端在 segment cache 里读不到 `__next._tree.txt`
// 时会回退到 navigateToUnknownRoute,直接请求整页 RSC 载荷 `<slug>.txt`
// (即本项目里同目录那个同名 .txt),依旧是 SPA 软导航,只是少了按段预取。
// 实测(本地静态服务 + 无头 Chrome)裁剪前后点击站内链接都是软导航,仅少 8 个预取请求。
//
// 裁剪后每个路由只剩 `<slug>.html` + `<slug>.txt` 两个文件,免费版 20,000 的上限
// 可支撑约 9,900 个项目页。
//
// 何时可以删掉这个脚本:升级到 Pages 付费版并在项目环境变量里设置
// PAGES_WRANGLER_MAJOR_VERSION=4(上限提到 100,000),或迁移到 Workers 静态资源。

import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "out");
const PAGES_FILE_LIMIT = 20_000;

if (!statSync(OUT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[prune-segment-cache] 找不到 ${OUT_DIR},先跑 next build。`);
  process.exit(1);
}

let removedSegments = 0;
let removedJunk = 0;
const emptyDirs = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      // 只删因裁剪而变空的目录(分段文件是目录里的唯一内容),不碰 out 根目录。
      if (full !== OUT_DIR && readdirSync(full).length === 0) emptyDirs.push(full);
    } else if (entry.name === ".DS_Store") {
      // macOS 的目录索引文件,不该出现在部署产物里。
      rmSync(full);
      removedJunk++;
    } else if (entry.name.startsWith("__next") && entry.name.endsWith(".txt")) {
      rmSync(full);
      removedSegments++;
    }
  }
}

walk(OUT_DIR);
for (const dir of emptyDirs) {
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

// 统计剩余文件数,和 Pages 的硬上限对齐 —— 超了就早点在构建日志里喊,而不是等
// Cloudflare 在最后一步抛「Pages only supports up to 20,000 files」。
let remaining = 0;
(function count(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count(join(dir, entry.name));
    else remaining++;
  }
})(OUT_DIR);

console.log(
  `[prune-segment-cache] 已删除 ${removedSegments} 个分段预取文件、${removedJunk} 个 .DS_Store;` +
    `剩余 ${remaining} 个文件(Cloudflare Pages 上限 ${PAGES_FILE_LIMIT})。`,
);

if (remaining > PAGES_FILE_LIMIT) {
  console.error(
    `[prune-segment-cache] 仍然超过 ${PAGES_FILE_LIMIT} 个文件,部署会失败。` +
      `详情页数量已接近免费版极限,需要改用 Pages 付费版(设置 PAGES_WRANGLER_MAJOR_VERSION=4 可提到 100,000)。`,
  );
  process.exit(1);
}
