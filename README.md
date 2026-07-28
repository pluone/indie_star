# indie_star

收录中文独立开发者项目的静态站点。内容来自上游仓库 [`1c7/chinese-independent-developer`](https://github.com/1c7/chinese-independent-developer) 的 3 个 README,点赞 / 评论功能基于 [giscus](https://giscus.app)(挂在 GitHub Discussions 上)。

## 技术栈

- **Next.js 16**(`output: "export"` 静态导出)+ React 19 + TypeScript
- **giscus**(`@giscus/react`)—— 详情页的点赞 / 评论,后端是本仓库的 GitHub Discussions
- **Cloudflare Pages** —— 托管静态产物 `out/`,并跑 `functions/api/stats.js`(Pages Function,近实时点赞/评论数,见下)
- **GitHub Actions** —— 定时抓取上游内容,产物落在独立的 `data` 分支

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
| `scripts/sync-giscus-stats.mjs` | `npm run sync:stats` | 只刷新点赞 / 评论数。**已弃用,不会在生产环境启用**——点赞/评论的实时性现在由 `/api/stats` 这条链路负责,见下方「近实时点赞/评论数」 |

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

> 构建本身**不需要任何 secret** —— `fetch-data.mjs` 只是匿名拉取 `data` 分支的 raw 文件。但要让 `/api/stats` 这个 Pages Function 正常工作,需要在该项目 **Settings → Environment variables** 里加一个 secret:

| Secret(Pages 项目环境变量) | 说明 |
|---|---|
| `GISCUS_STATS_TOKEN` | 一个只读的 GitHub PAT(建议 fine-grained,只授权本仓库 `Discussions: Read-only`)。**专用于这个 Function,不要复用 Actions 的 `GITHUB_TOKEN`** —— 那个是 CI 专用,这个是面向公网的边缘函数。缺了它 `/api/stats` 不会报错,只会一直返回空数据,首页照样能正常显示(退回静态快照)。 |

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
- **Sync giscus stats**(`.github/workflows/sync-giscus-stats.yml`):每 30 分钟刷新计数。**已弃用**,不建议启用——点赞/评论的实时性已经交给下面「近实时点赞/评论数」这条链路负责,这个 workflow 文件目前还留着但不应该再手动触发。

两个 workflow 都会在更新 `data` 分支后触发 Deploy Hook 重新部署。

## 前置依赖:giscus

点赞 / 评论依赖本仓库(`pluone/indie_star`)开启 **GitHub Discussions**,并安装 [giscus app](https://github.com/apps/giscus)。当前配置(见 `src/components/GiscusComments.tsx`):`mapping="pathname"`、category `Announcements`、`theme="light"`(giscus 内置浅色主题;评论区外层已由站点的白色卡片包裹)、`lang="zh-CN"`、`emitMetadata="1"`。

## 近实时点赞 / 评论数

首页的点赞 / 评论数不是单纯依赖每日一次的静态构建,而是三层叠加、逐层兜底,任何一层失效都不影响页面正常显示:

```
1. 静态兜底(SSR)          data/site-data.json 构建时的快照,首屏直接可见,永不 404/报错
2. 服务端轮询 + 边缘缓存    浏览器打开页面 / 切回标签页时立即请求 /api/stats
   (functions/api/stats.js)  → Cloudflare Cache API 缓存(10s 内直接命中;10~60s 内先返回旧值,
                                后台异步刷新;>60s 才会同步阻塞查一次 GitHub GraphQL)
3. localStorage(本机精确值) 详情页 giscus emitMetadata="1" 回传的实时点赞/评论数,
   (src/components/           写入 localStorage;首页读取后按项目覆盖显示,只覆盖当前浏览器
    GiscusComments.tsx)       交互过的项目,0 延迟、0 额外请求
```

合并优先级:`localStorage`(如果有)> `/api/stats` 结果 > 静态快照。三者中任意一层失败,都自动回退到优先级更低的那一层,页面不会因此出错或卡住。

- `/api/stats` 用的是 Cache API(`caches.default`),不是 Workers KV——KV 免费额度每天只有 1,000 次写入,按这个刷新频率会很快超额。
- 没有持续轮询(`setInterval`):只在页面加载、和标签页重新可见(`visibilitychange`)时请求一次,避免"点赞最多"排序下的项目列表在用户浏览时无声地跳动。
- 本地测试这个 Function(`next dev` 不会跑 `functions/` 目录,必须用 wrangler):

  ```bash
  npm run build
  npx wrangler pages dev out
  ```

  想连通真实 GitHub 数据,在项目根目录建一个 `.dev.vars`(已 gitignore,不会被提交):

  ```
  GISCUS_STATS_TOKEN=<你的 PAT>
  ```

  wrangler 会自动读取并注入为 `env.GISCUS_STATS_TOKEN`。
