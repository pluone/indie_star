# indie_star

收录中文独立开发者项目的静态站点。内容来自上游仓库 [`1c7/chinese-independent-developer`](https://github.com/1c7/chinese-independent-developer) 的 3 个 README,点赞 / 评论功能基于 [giscus](https://giscus.app)(挂在 GitHub Discussions 上)。

## 技术栈

- **Next.js 16**(`output: "export"` 静态导出)+ React 19 + TypeScript
- **giscus**(`@giscus/react`)—— 详情页的点赞 / 评论,后端是本仓库的 GitHub Discussions
- **Cloudflare Pages** —— 托管静态产物 `out/`
- **GitHub Actions** —— 定时抓取上游内容 / giscus 数据,产物落在独立的 `data` 分支

## 架构与数据流

站点是纯静态的,但展示的数据(项目列表、点赞数、评论数)需要定期更新。为了**不把生成的数据污染 `main` 分支**,数据被单独放在一个 `data` 分支上:

```
上游 README (1c7/...)  ──┐
                         ├─► GitHub Actions 定时任务 ──► data 分支: data/site-data.json
GitHub Discussions ──────┘         (sync-content.mjs)              │
(giscus 点赞/评论)                                                  │ 触发 Deploy Hook
                                                                   ▼
                              Cloudflare Pages 从 main 构建 ◄───────┘
                                     │
                                     ├─ prebuild: fetch-data.mjs 从 data 分支拉取
                                     │            site-data.json → public/data/
                                     └─ next build → 静态导出到 out/
```

关键点:

- **`main` 分支**:只有源码,不含生成的数据。**Cloudflare Pages 的生产分支就是它。**
- **`data` 分支**:只有 `data/site-data.json`,由 Actions 自动维护,**不要手动改、也不要设为生产分支**。
- **构建时注入数据**:`npm run build` 的 `prebuild` 步骤(`scripts/fetch-data.mjs`)会从 `data` 分支的 raw 地址拉取最新 `site-data.json` 写进 `public/data/`,`next build` 再把它打进静态产物。所以每次构建拿到的都是当前最新数据,而 `main` 完全不用动。
- **数据更新如何触发部署**:Actions 更新 `data` 分支后,会 `curl` 一个 Cloudflare **Deploy Hook**,让 Pages 用 `main` 重新构建一次(构建时自动拉到新数据)。

### 相关脚本

| 脚本 | 命令 | 作用 |
|---|---|---|
| `scripts/fetch-data.mjs` | 自动在 `build` 前跑(`prebuild`) | 从 `data` 分支拉 `site-data.json` 到 `public/data/`;`data` 分支不存在时回退本地 `data/site-data.json` |
| `scripts/sync-content.mjs` | `npm run sync:content` | 解析上游 3 个 README + 实时抓 giscus 计数,**全量重建** `data/site-data.json` |
| `scripts/sync-giscus-stats.mjs` | `npm run sync:stats` | 只刷新点赞 / 评论数(已计划弃用,见下) |

## 本地开发

```bash
npm install

# 首次运行:先生成一份本地 data/site-data.json(data 分支不存在时的回退数据)
npm run sync:content

npm run dev        # http://localhost:3000
```

`sync:content` 会抓取 giscus 计数;不带 token 也能跑(计数会是 0),需要真实计数时设置环境变量:

```bash
GITHUB_TOKEN=<你的 PAT> npm run sync:content
```

生产构建验证:

```bash
npm run build      # 先跑 prebuild 拉数据,再静态导出到 out/
```

## 部署到 Cloudflare Pages

### 1. 创建 Pages 项目

在 Cloudflare 控制台 **Workers & Pages → Create → Pages → Connect to Git**,选择本仓库,并按下表配置构建:

| 设置项 | 值 |
|---|---|
| Production branch(生产分支) | `main` |
| Framework preset | `Next.js (Static HTML Export)` 或 `None` |
| Build command | `npm run build` |
| Build output directory | `out` |
| 环境变量 `NODE_VERSION` | `24`(当前最新 LTS;Next 16 需 Node ≥ 18.18) |

> 构建本身**不需要任何 secret** —— `fetch-data.mjs` 只是匿名拉取 `data` 分支的 raw 文件。

### 2. 创建 Deploy Hook

在该 Pages 项目 **Settings → Builds & deployments → Deploy hooks** 新建一个 hook(绑定 `main` 分支),复制生成的 URL。这是让"数据更新"能触发"站点重建"的关键。

### 3. 配置 GitHub Actions secret

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加:

| Secret | 说明 |
|---|---|
| `CLOUDFLARE_DEPLOY_HOOK_URL` | 上一步复制的 Deploy Hook URL |

> `GITHUB_TOKEN` 由 Actions 自动提供,无需手动添加;sync 脚本用它查询本仓库 Discussions 的 giscus 计数。

### 4. 首次数据初始化

`data` 分支由 Actions 首次运行 `sync-content` 时自动创建。可以在 GitHub **Actions → Sync content → Run workflow** 手动触发一次,生成 `data` 分支并首次填充数据。之后:

- **Sync content**(`.github/workflows/sync-content.yml`):每天 03:00 UTC 全量重建。
- **Sync giscus stats**(`.github/workflows/sync-giscus-stats.yml`):每 30 分钟刷新计数(**计划弃用**,见下)。

两个 workflow 都会在更新 `data` 分支后触发 Deploy Hook 重新部署。

## 前置依赖:giscus

点赞 / 评论依赖本仓库(`pluone/indie_star`)开启 **GitHub Discussions**,并安装 [giscus app](https://github.com/apps/giscus)。当前配置(见 `src/components/GiscusComments.tsx`):`mapping="pathname"`、category `Announcements`、`theme="preferred_color_scheme"`、`lang="zh-CN"`。

## 后续计划

首页点赞 / 评论数目前依赖 `data` 分支里的静态快照(最多滞后 30 分钟)。已规划一套**近实时方案**(Cloudflare Pages Function `/api/stats` + 边缘缓存 + giscus `emitMetadata`),届时 `sync-giscus-stats` 定时任务将弃用。**尚未实现。**
