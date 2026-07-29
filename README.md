# indie_star

收录中文独立开发者项目的静态站点。内容来自上游仓库 [`1c7/chinese-independent-developer`](https://github.com/1c7/chinese-independent-developer) 的 3 个 README,点赞 / 评论功能基于 [giscus](https://giscus.app)(挂在 GitHub Discussions 上)。

## 技术栈

- **Next.js 16**(`output: "export"` 静态导出)+ React 19 + TypeScript
- **giscus**(`@giscus/react`)—— 详情页的点赞 / 评论,后端是本仓库的 GitHub Discussions
- **Cloudflare Pages** —— 托管静态产物 `out/`,并跑 `functions/api/stats.js`(Pages Function,近实时点赞/评论数,见下)
- **Cloudflare Worker**(`worker/`)—— 每 5 分钟轮询上游 HEAD,有新提交就派发同步 workflow(见「近实时内容同步」)
- **GitHub Actions** —— 抓取上游内容,产物落在独立的 `data` 分支

## 架构与数据流

站点是纯静态的,但展示的数据(项目列表、点赞数、评论数)需要定期更新。为了**不把生成的数据污染 `main` 分支**,数据被单独放在一个 `data` 分支上:

```
Cloudflare Worker (worker/)   每 5 分钟比对上游 HEAD 与 data/upstream.json
        │ 有新提交 → workflow_dispatch
        ▼
上游 README (1c7/...)  ──┐
                         ├─► GitHub Actions ─────────► data 分支: site-data.json
GitHub Discussions ──────┘     (sync-content.mjs)                 + upstream.json
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
- **`data` 分支**:只有 `data/site-data.json` 和 `data/upstream.json`,由 Actions 自动维护,**不要手动改、也不要设为生产分支**。
- **构建时注入数据**:`npm run build` 的 `prebuild` 步骤(`scripts/fetch-data.mjs`)会从 `data` 分支的 raw 地址拉取最新 `site-data.json` 写进 `public/data/`,`next build` 再把它打进静态产物。所以每次构建拿到的都是当前最新数据,而 `main` 完全不用动。
- **数据更新如何触发部署**:Actions 更新 `data` 分支后,会 `curl` 一个 Cloudflare **Deploy Hook**,让 Pages 用 `main` 重新构建一次(构建时自动拉到新数据)。注意"提交"和"部署"是**两个独立判断**——见下方「什么时候才会真的重新部署」。

### 相关脚本

| 脚本 | 命令 | 作用 |
|---|---|---|
| `scripts/fetch-data.mjs` | 自动在 `build` 前跑(`prebuild`) | 从 `data` 分支拉 `site-data.json` 到 `public/data/`;`data` 分支不存在时回退本地 `data/site-data.json` |
| `scripts/sync-content.mjs` | `npm run sync:content` | 解析上游 3 个 README + 实时抓 giscus 计数,**全量重建** `data/site-data.json`,并写出 `data/upstream.json` |
| `worker/src/index.js` | `cd worker && npm run deploy` | 上游监听 Worker,详见「近实时内容同步」 |

> `sync-content.mjs` 会先解析出上游 `master` 的当前 commit SHA,再把 3 个 raw 请求**钉死在这个 SHA 上**。按分支名拉会跟 raw.githubusercontent 的 CDN 缓存赛跑:可能拿到比记录下来的 SHA 更旧的内容,而 Worker 只比对 SHA,那次更新就会被永久跳过。

### 项目身份与 slug

`/project/{slug}` 的 slug = `sha1(作者 + 项目名 + 版面)` 取前 12 位十六进制,三个分量都先做归一化(NFC、去首尾空白、折叠连续空白、转小写),所以上游改个大小写或多打个空格不会换 slug。

**收录日期刻意不在其中。** 上游会给已有条目改日期——PR 合并时项目常被搬到合并当天的日期块下,一个 7-18 收录的项目可能重新出现在 7-28(如上游 PR #1209)。日期若参与计算,slug 就会跟着变:详情页换地址(旧链接 404),而 giscus 用 `mapping="pathname"` 把讨论串挂在 pathname 上,讨论会一并失联、点赞和评论归零。其余三个分量只在上游真的改了项目时才变,那种情况下换身份本来就是对的。

**版面则必须包含**:上游有意把同一个项目交叉登记在两个版面(如主版面 + 程序员版面),按「版面互相独立」的设计它们是两条独立记录,不能撞成一个。

由此带来两条 `sync-content.mjs` 里的规则:

- **同版面内重复登记 → 合并**。上游有时不是移动旧行,而是在新日期下重新登记一遍,去掉日期后这些重复共享同一个身份。站点是镜像,取**日期最新**的那次(同日期取靠前的一行),其余丢弃,日志里会打出 `Merging repeat listing`。
- **同 slug 但归一化 key 不同 → 直接中止同步**。这个规模下 12 位十六进制的真实碰撞概率约 7×10⁻⁹,真触发基本说明身份逻辑写错了。宁可站点少更新一次,也不能让两个项目静默共用同一个页面和讨论区。

> 改动 slug 规则会让**全部** slug 变化:旧的 `/project/{slug}` 静态页消失,giscus 上已有的讨论串(标题为 `project/{旧 slug}`)全部失联。要保住已有点赞和评论,得把对应 discussion 的标题手工或用 GraphQL `updateDiscussion` 改成新的 slug。

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

`data` 分支由 Actions 首次运行 `sync-content` 时自动创建。可以在 GitHub **Actions → Sync content → Run workflow** 手动触发一次,生成 `data` 分支并首次填充数据。

之后 **Sync content**(`.github/workflows/sync-content.yml`)有两个触发源:主要靠下面的 Worker 派发(上游一有提交,5 分钟内),外加每天 21:00 UTC 的兜底定时。它在更新 `data` 分支后会触发 Deploy Hook 重新部署。

### 5. 部署上游监听 Worker

见下面「近实时内容同步」一节。

## 近实时内容同步

上游仓库不是我们的,拿不到它的 push webhook,所以"监听"只能是轮询——问题只是**由谁轮询**。这里由一个独立的 Cloudflare Worker(`worker/`)每 5 分钟做一次:

```
1. GET github.com/1c7/…/commits/master.atom       取上游 HEAD 的 SHA(免认证、无限流)
2. GET api.github.com/…/contents/data/upstream.json?ref=data   取上次同步的 SHA
3. 两者不同 → POST …/actions/workflows/sync-content.yml/dispatches
```

从上游提交到站点更新,典型 **5~8 分钟**(轮询 ≤5 分钟 + workflow 1~2 分钟 + Pages 构建)。

### 什么时候才会真的重新部署

上游提交很频繁(2026-07 实测 **约 10 次/天**),而其中 **约 19% 根本没碰我们解析的那 3 个 README**(改的是上游自己的 CI、图片等)。如果每次提交都重建 2015 个页面,一个月约 330 次构建,而 Cloudflare Pages 免费版是 500 次/月——余量太薄。所以 publish 步骤把两件事拆开了:

| 判断 | 条件 | 为什么 |
|---|---|---|
| **提交到 `data` 分支** | 任何字节有变化 | `upstream.json` 的 `sha` **必须**推进,哪怕内容没变。否则 Worker 会认为这个 commit 还没同步,每 5 分钟无限重派发。 |
| **触发 Deploy Hook** | `contentHash` 变了 | `site-data.json` 每次运行都会变(`meta` 里的时间戳是重新生成的),所以"有提交"根本不能证明页面会渲染得不一样。 |

`contentHash` 由 `sync-content.mjs` 算出、写在 `upstream.json` 里,是对**站点实际渲染的所有字段**做 SHA-256(name / intro / introMarkdown / status / date / url / author / authorLinks / slug),**排除 `likes`/`comments`** —— 那两个字段一直在变,而它们的实时性已经由 `/api/stats` 在运行时负责,不值得为它们重建整站。

这个哈希的出错方向是安全的:内容变了但哈希没变需要 SHA-256 碰撞(不会发生),**不存在漏部署**;反过来最多多部署一次,只是浪费一次构建。旧的 `contentHash` 缺失时(比如 `data` 分支是在这个机制之前建的)一律按"有变化"处理。

**为什么是独立 Worker,而不是 Pages Function 或 Actions 定时任务:**

- Pages Functions **不支持 Cron Triggers**,只能被 HTTP 请求触发。
- GitHub 会在**公开仓库连续 60 天没有活动**后自动停用 scheduled workflow —— 而"不再需要改代码、让它自己跑"恰好是这个项目的目标状态。触发源放在 GitHub 之外就不受这条规则约束。

这个 Worker 没有 `fetch` handler、`workers_dev = false`,所以没有任何公网地址,只会被 cron 唤醒。

**部署步骤:**

```bash
cd worker
npm install
npx wrangler login          # 与 Pages 项目同一个 Cloudflare 账号
npm run secret              # 粘贴下面的 PAT
npm run deploy
```

| Secret(Worker) | 说明 |
|---|---|
| `GITHUB_PAT` | fine-grained PAT,仓库范围**只选 `pluone/indie_star`**,权限只需两项:`Contents: Read`(读 `data/upstream.json`)+ `Actions: Read and write`(派发 workflow)。**不需要任何上游仓库的权限** —— 上游 SHA 走公开 Atom feed。 |

> ⚠️ **PAT 会过期**(fine-grained 上限 1 年)。过期后这条链路会**静默失效**:站点不会报错,只是数据停在某天不动了,唯一的兜底是每天那次定时同步(而它自己也可能被 60 天规则停掉)。建议在日历上记一下到期日。

调试:`cd worker && npm run dev`(`wrangler dev --test-scheduled`,可手动触发一次 cron),线上日志用 `npm run tail`。

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
