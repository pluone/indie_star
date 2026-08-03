"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board, Project } from "@/lib/types";
import { BOARD_LABEL, inTimeRange, type TimeRange } from "@/lib/format";
import { readGiscusStats, type GiscusStatsMap } from "@/lib/giscus-stats";
import ProjectCard from "@/components/ProjectCard";
import ProjectRow from "@/components/ProjectRow";

const PAGE_SIZE = 8;
const BOARD_KEYS: Board[] = ["main", "programmer", "game"];
// Next.js App Router remounts the homepage from scratch on any navigation back to "/" — client
// component state (loaded item count, filters, scroll position) isn't kept alive the way a
// browser's native back-forward cache would. Stashing it here right before navigating to a project,
// then restoring + consuming it on the next mount, is what actually makes "go back" land you where
// you left off instead of a fresh page.
const NAV_STATE_KEY = "indiestar:home-nav-state";

interface SavedNavState {
  board: Board;
  search: string;
  sortBy: SortBy;
  timeRange: TimeRange;
  visibleCount: number;
  scrollY: number;
  slug: string;
}

const HIGHLIGHT_HOLD_MS = 1200;
const HIGHLIGHT_FADE_MS = 900;
// Shared by the header, tabs, filter row, and list, so all four stay aligned to the same centered
// column on very wide viewports (e.g. a 4K display fullscreen) — each row still spans full width
// for its background/border, but its actual content is centered within this width, same as the
// list below it.
const CONTENT = "mx-auto w-full max-w-[1080px] px-3 md:px-10";
type SortBy = "recent" | "likes" | "comments";

interface HomeClientProps {
  main: Project[];
  game: Project[];
  programmer: Project[];
}

function isBoard(value: string | null): value is Board {
  return value === "main" || value === "programmer" || value === "game";
}

function isNearBottom(): boolean {
  return window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 500;
}

function pillClass(active: boolean): string {
  const base = "cursor-pointer rounded-full border px-3 py-[5px] text-[13px] transition-colors";
  return active
    ? `${base} border-accent bg-accent-soft font-semibold text-accent-ink`
    : `${base} border-line bg-sunken text-ink-2 hover:border-line-strong hover:text-ink-1`;
}

export default function HomeClient(props: HomeClientProps) {
  // Near-real-time like/comment overlay on top of the static build-time numbers. Populated on
  // mount and on tab refocus only — deliberately no persistent setInterval, which would jump items
  // around mid-scroll under the likes/comments sort. Base layer is /api/stats (edge-cached, shared)
  // over the static props passed in from the server; localStorage (this browser's own giscus
  // readings) is layered on top only where it is genuinely the newer observation — see applyLocal.
  const [liveStats, setLiveStats] = useState<GiscusStatsMap>({});
  // When the data in our latest /api/stats payload was read from GitHub, expressed on *this*
  // browser's clock (derived from the age the endpoint stamps at serve time, so a browser clock
  // that disagrees with the server's doesn't skew the comparison). 0 = never got a usable payload.
  const serverObservedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // A locally captured count may only override the shared one while it is the newer of the two
    // readings. Letting it win unconditionally is what used to freeze a project's numbers on
    // whatever this browser last saw: open a detail page at 1 like, and the homepage would keep
    // rendering 1 long after everyone else moved to 10. The slug-missing case still defers to
    // localStorage — no discussion yet, or a degraded empty payload, means there's nothing newer to
    // defer to.
    function applyLocal(base: GiscusStatsMap): GiscusStatsMap {
      const merged: GiscusStatsMap = { ...base };
      for (const [slug, entry] of Object.entries(readGiscusStats())) {
        if (!(slug in base) || entry.at > serverObservedAt.current) {
          merged[slug] = { likes: entry.likes, comments: entry.comments };
        }
      }
      return merged;
    }

    async function refresh() {
      // Apply localStorage immediately — instant and free, no need to wait on the network.
      if (!cancelled) setLiveStats((prev) => applyLocal(prev));
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const ageHeader = res.headers.get("x-data-age-ms");
        const ageMs = ageHeader === null ? NaN : Number(ageHeader);
        // No header (a dev server, or a proxy that dropped it) means we can't place the payload on
        // our own timeline — leave the mark at 0 so localStorage keeps winning until its TTL runs
        // out, rather than silently trusting numbers of unknown age.
        serverObservedAt.current = Number.isFinite(ageMs) ? Date.now() - ageMs : 0;
        const json = (await res.json()) as { data?: GiscusStatsMap };
        setLiveStats(applyLocal(json.data ?? {}));
      } catch {
        // /api/stats unreachable — static + localStorage values still stand.
      }
    }

    refresh();
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const boards: Record<Board, Project[]> = useMemo(() => {
    const applyLiveStats = (list: Project[]): Project[] => {
      if (Object.keys(liveStats).length === 0) return list;
      return list.map((p) => {
        const live = liveStats[p.slug];
        return live ? { ...p, likes: live.likes, comments: live.comments } : p;
      });
    };
    return {
      main: applyLiveStats(props.main),
      game: applyLiveStats(props.game),
      programmer: applyLiveStats(props.programmer),
    };
  }, [props.main, props.game, props.programmer, liveStats]);

  // Deliberately NOT next/navigation's useSearchParams(): on a fully static export there's no
  // request-time query string, so a component that reads it must bail out to a Suspense fallback
  // at build time — which would leave the entire home page blank until client hydration. Reading
  // window.location.search once after mount instead lets the default view (board=main) render
  // fully server-side, and only adjusts for a shared deep link once JS runs.
  const [board, setBoardState] = useState<Board>("main");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [search, setSearch] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Record<Board, number>>({
    main: PAGE_SIZE,
    game: PAGE_SIZE,
    programmer: PAGE_SIZE,
  });
  const [pendingScrollY, setPendingScrollY] = useState<number | null>(null);
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null);
  const [highlightVisible, setHighlightVisible] = useState(false);
  // 移动端抽屉:版面/排序/收录时间全部收进来,默认隐藏;桌面端这些仍在吸顶第二带里常驻。
  // 为什么要它:移动端的阅读空间比"一眼看清在哪个版面"更值钱,把它们藏进抽屉,主区就只剩卡片。
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 抽屉打开时锁住背景滚动,避免抽屉里短列表与背后列表同时滚(DOM 滚动会被穿透)。
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    // Consume-once: a saved state means we're returning from a project detail page — restore it
    // and clear it immediately, so a later plain reload of "/" doesn't keep reapplying stale state.
    let saved: SavedNavState | null = null;
    try {
      const raw = sessionStorage.getItem(NAV_STATE_KEY);
      if (raw) saved = JSON.parse(raw) as SavedNavState;
    } catch {
      // Corrupt/unavailable sessionStorage — fall through to the plain URL-based restore below.
    }
    if (saved) sessionStorage.removeItem(NAV_STATE_KEY);

    if (saved && isBoard(saved.board)) {
      setBoardState(saved.board);
      setSearch(saved.search);
      setSortBy(saved.sortBy);
      setTimeRange(saved.timeRange);
      setVisibleCounts((prev) => ({ ...prev, [saved.board]: Math.max(saved.visibleCount, PAGE_SIZE) }));
      setPendingScrollY(saved.scrollY);
      setHighlightSlug(saved.slug);
      setHighlightVisible(true);
      return;
    }

    const fromUrl = new URLSearchParams(window.location.search).get("board");
    if (isBoard(fromUrl) && fromUrl !== "main") setBoardState(fromUrl);
  }, []);

  // Briefly flashes the row the user came back from, then fades it out and clears the target
  // entirely — held long enough to register as "here's where you were", not so long it feels stuck.
  useEffect(() => {
    if (!highlightSlug) return;
    const hideTimer = setTimeout(() => setHighlightVisible(false), HIGHLIGHT_HOLD_MS);
    const clearTimer = setTimeout(() => setHighlightSlug(null), HIGHLIGHT_HOLD_MS + HIGHLIGHT_FADE_MS);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightSlug]);

  // Frozen at mount rather than recomputed every render — avoids items quietly shifting between
  // time-range buckets mid-session, and this is only used for the "近一个月/近三个月/近一年" filter.
  const now = useMemo(() => new Date(), []);

  function setBoard(next: Board) {
    setBoardState(next);
    setSearch("");
    window.history.replaceState(null, "", next === "main" ? "/" : `/?board=${next}`);
  }

  function saveNavState(slug: string) {
    try {
      const state: SavedNavState = {
        board,
        search,
        sortBy,
        timeRange,
        visibleCount: visibleCounts[board],
        scrollY: window.scrollY,
        slug,
      };
      sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — next visit just won't restore.
    }
  }

  // 卡片/行点击时的副作用:只存导航态。跳转本身交给卡片里的 <Link> —— 列表项以前是
  // <div onClick> + router.push,页面里一个指向详情页的 <a href> 都没有,爬虫沿着首页
  // 走不进任何一个详情页(它不会去点 onClick),中键/Ctrl 点击也开不了新标签页。
  // 两套展示层共用这一个,逻辑不 fork。
  const handleOpen = useCallback(
    (slug: string) => {
      saveNavState(slug);
    },
    // saveNavState 闭包了 board/search/sortBy/timeRange/visibleCounts,列依赖使其随这些更新。
    // eslint 的 exhaustive-deps 对一个定义在同作用域的普通 function 仍会提示缺失,
    // 这里 saveNavState 未被 useCallback 包裹故不列入,有意省略。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, search, sortBy, timeRange, visibleCounts]
  );

  // 抽屉里切版面:切完成立刻收抽屉,回主区看新列表(版面是抽屉里最"选完就走"的动作)。
  const pickBoard = useCallback(
    (key: Board) => {
      setBoard(key);
      setDrawerOpen(false);
    },
    // setBoard 闭包同上。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const currentList = boards[board];

  const filtered = useMemo(() => {
    let list = currentList.filter((p) => inTimeRange(p.date, timeRange, now));
    const q = search.trim();
    if (q) list = list.filter((p) => p.name.includes(q) || p.intro.includes(q));
    if (sortBy === "likes") {
      list = [...list].sort((a, b) => b.likes - a.likes);
    } else if (sortBy === "comments") {
      list = [...list].sort((a, b) => b.comments - a.comments);
    }
    // sortBy === "recent": no sort at all — the underlying array is already in exact upstream
    // order (newest date-block first, fixed order within a day), so using it as-is *is* "most
    // recent". A stable sort by likes/comments above also preserves that same relative order for
    // ties, matching the design's tie-break rule for free.
    return list;
  }, [currentList, timeRange, search, sortBy, now]);

  const visibleCount = visibleCounts[board];
  const visibleList = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;
  const isFullyLoaded = !hasMore && filtered.length > 0;

  // Waits a frame so the restored (taller) list has actually painted before jumping the scroll
  // position — otherwise scrollTo would clamp to a document that's still its default short height.
  useEffect(() => {
    if (pendingScrollY === null) return;
    const id = requestAnimationFrame(() => {
      window.scrollTo(0, pendingScrollY);
      setPendingScrollY(null);
    });
    return () => cancelAnimationFrame(id);
  }, [pendingScrollY, visibleList.length]);

  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingRef = useRef(false);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setVisibleCounts((prev) => ({ ...prev, [board]: prev[board] + PAGE_SIZE }));
  }, [board]);

  // Scroll-driven loading — the normal case: a long list, user scrolls toward the bottom.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    function handleScroll() {
      if (isNearBottom()) loadMore();
      setShowBackToTop(window.scrollY > 800);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore]);

  // Drives "keep auto-filling until the viewport overflows or the list is exhausted" entirely
  // through React's own render cycle rather than a self-recursing timer. That matters: an earlier
  // version had loadMore re-trigger itself via a setTimeout closure bound to whichever board was
  // active when it was created — if the board changed while that timer was still pending (e.g.
  // switching tabs, or a deep link like /?board=game re-pointing the board shortly after mount),
  // the stale closure kept recursing for the OLD board and permanently held the shared "loading"
  // flag true, blocking the new board's loads forever (stuck on "加载中" with no way to scroll).
  // Resetting the flag here, keyed on `board` itself, means a board change always clears it in the
  // context of the board that's actually current — nothing can go stale across a switch.
  useEffect(() => {
    loadingRef.current = false;
    if (isNearBottom()) loadMore();
  }, [board, visibleCount, filtered.length, loadMore]);

  let emptyMessage = "";
  if (filtered.length === 0) {
    const q = search.trim();
    emptyMessage = q ? `没有找到匹配"${q}"的项目，换个关键词试试。` : "当前版面与时间范围下暂无符合条件的项目。";
  }

  // 站点介绍里的收录总数 —— 跟数据一起走准实时同步,不写死。
  const totalCount = props.main.length + props.game.length + props.programmer.length;

  return (
    <div>
      {/* 顶栏:brand 行 + 右上角的移动端筛选入口。桌面端整块吸顶;移动端 brand 行随内容滚走
          (不吸顶),把版面/排序/时间全藏进抽屉,主区只留阅读空间。两条带之间的留白刻意不画线 —
          底色差本身是分界,再加一条通栏线会让头部看起来像两个头部。两层都做半透明 + 背景模糊,
          桌面端滚动时卡片能隐约透过去,头部才真的"浮"在内容之上。 */}
      <header className="md:sticky md:top-0 md:z-20">
        <div className="bg-surface/90 backdrop-blur-xl backdrop-saturate-150">
          <div className={`${CONTENT} flex items-center gap-4 py-[14px] md:gap-6 md:py-[18px]`}>
            <div className="flex min-w-0 flex-1 justify-start">
              <Link href="/" className="text-[18px] font-bold tracking-tight whitespace-nowrap text-ink-1 no-underline md:text-[19px]">
                独立星选 <span className="text-accent">IndieStar</span>
              </Link>
            </div>
            {/* 桌面端搜索框:居中槽,两侧各一个 flex:1 兄弟等分把真正兜住它居中(logo 与"关于"
                宽度不等,靠两侧等分 grow 对齐)。移动端整个隐藏,换成右上角的筛选按钮。 */}
            <div className="relative hidden w-full min-w-[220px] max-w-[460px] shrink-0 md:block">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx={11} cy={11} r={7}></circle>
                <line x1={21} y1={21} x2={16.65} y2={16.65}></line>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目名称或简介关键词"
                className="w-full rounded-lg border border-line bg-sunken py-2.5 pl-9 pr-3.5 text-sm text-ink-1 outline-none transition-colors focus:border-accent-line focus:bg-surface"
              />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3.5">
              {/* 移动端筛选入口:漏斗图标。抽屉式 chrome 的唯一可见入口,点开抽屉选版面/排序/时间。 */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="筛选版面、排序与收录时间"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-sunken text-ink-2 transition-colors active:scale-95 hover:text-ink-1 md:hidden"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h18M6 12h12M10 20h4"></path>
                </svg>
              </button>
              <Link href="/about" className="cursor-pointer text-sm text-ink-2 no-underline transition-colors hover:text-accent">
                关于
              </Link>
            </div>
          </div>
        </div>

        {/* 桌面端第二带:版面 tabs + 排序 + 收录时间。移动端整带不渲染(这些全进了抽屉)。 */}
        <div className="hidden border-b border-line bg-canvas/90 shadow-chrome backdrop-blur-xl backdrop-saturate-150 md:block">
          <div className={`${CONTENT} flex items-center gap-1.5 pt-3`}>
            {BOARD_KEYS.map((key) => {
              const active = board === key;
              return (
                <div
                  key={key}
                  onClick={() => setBoard(key)}
                  className={`mr-2 cursor-pointer border-b-2 px-1 py-2 transition-colors ${
                    active ? "border-accent" : "border-transparent"
                  }`}
                >
                  <span className={active ? "text-[15px] font-bold text-ink-1" : "text-[15px] font-medium text-ink-2"}>
                    {BOARD_LABEL[key]}
                  </span>
                </div>
              );
            })}
            <div className="ml-auto text-[13px] whitespace-nowrap text-ink-3">
              共 <span className="font-semibold text-ink-1">{filtered.length}</span> 个
              {hasMore && (
                <>
                  ，已加载 <span className="font-semibold text-ink-1">{visibleList.length}</span> 个
                </>
              )}
            </div>
          </div>

          <div className={`${CONTENT} flex flex-wrap items-center justify-between gap-7 py-3.5`}>
            <div className="flex items-center gap-2">
              <span className="text-xs tracking-wide text-ink-3">排序</span>
              {(
                [
                  ["recent", "时间最近"],
                  ["likes", "点赞最多"],
                  ["comments", "评论最多"],
                ] as [SortBy, string][]
              ).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)} className={pillClass(sortBy === key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tracking-wide text-ink-3">收录时间</span>
              {(
                [
                  ["month", "近一个月"],
                  ["quarter", "近三个月"],
                  ["year", "近一年"],
                  ["all", "全部"],
                ] as [TimeRange, string][]
              ).map(([key, label]) => (
                <button key={key} onClick={() => setTimeRange(key)} className={pillClass(timeRange === key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 移动端抽屉:版面/排序/收录时间全收进来。fixed 遮罩 + 右侧滑出面板,桌面端不渲染。 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* 遮罩:点一下就关抽屉(等同"放弃当前选择"——但选择是点即生效的,所以这里只是收起)。 */}
          <button
            type="button"
            aria-label="关闭筛选"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[2px]"
          />
          {/* 面板:从顶部滑下。点遮罩关闭,点面板内本身不关(让用户安心调排序/时间)。 */}
          <div className="no-scrollbar absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto rounded-b-card border-b border-line bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-ink-1">筛选</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors active:scale-95 hover:text-ink-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1={18} y1={6} x2={6} y2={18}></line>
                  <line x1={6} y1={6} x2={18} y2={18}></line>
                </svg>
              </button>
            </div>

            {/* 版面:大号 tab,点即换并自动收抽屉(版面是"选完就走"的动作)。 */}
            <div className="grid grid-cols-3 gap-2">
              {BOARD_KEYS.map((key) => {
                const active = board === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickBoard(key)}
                    className={`rounded-lg border px-2 py-2.5 text-[13px] transition-colors ${
                      active
                        ? "border-accent bg-accent-soft font-semibold text-accent-ink"
                        : "border-line bg-sunken text-ink-2"
                    }`}
                  >
                    {BOARD_LABEL[key]}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-[12px] text-ink-3">
              共 <span className="font-semibold text-ink-1">{filtered.length}</span> 个
              {hasMore && (
                <>
                  ，已加载 <span className="font-semibold text-ink-1">{visibleList.length}</span> 个
                </>
              )}
            </div>

            <div className="mt-5">
              <span className="text-xs tracking-wide text-ink-3">排序</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["recent", "时间最近"],
                    ["likes", "点赞最多"],
                    ["comments", "评论最多"],
                  ] as [SortBy, string][]
                ).map(([key, label]) => (
                  <button key={key} onClick={() => setSortBy(key)} className={pillClass(sortBy === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <span className="text-xs tracking-wide text-ink-3">收录时间</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["month", "近一个月"],
                    ["quarter", "近三个月"],
                    ["year", "近一年"],
                    ["all", "全部"],
                  ] as [TimeRange, string][]
                ).map(([key, label]) => (
                  <button key={key} onClick={() => setTimeRange(key)} className={pillClass(timeRange === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 站点介绍 —— 页面上唯一一段描述本站是什么的正文。此前首页从导航直接进卡片流,没有任何
          描述性文字,Google 只能抓第一个项目的简介当摘要;措辞与 metadata 的 description 保持一致,
          两者互相印证时它采用我们自己那句的概率才高。刻意压成小字号单段,不打断"打开即是卡片流"
          的观感;整块删掉不影响任何功能(列表的 pt 记得从 pt-4 改回 pt-6)。 */}
      <section className={`${CONTENT} pt-5 md:pt-6`}>
        <h1 className="text-[15px] font-semibold text-ink-1 md:text-base">中国独立开发者项目精选</h1>
        <p className="mt-1.5 text-[12.5px] leading-[1.7] text-ink-3 md:max-w-[760px] md:text-[13px]">
          收录 {totalCount} 个中国独立开发者项目，涵盖 AI 工具、效率工具、浏览器插件、App 与独立游戏，
          跟随上游仓库准实时同步更新。
        </p>
      </section>

      <div className={`${CONTENT} pb-16 pt-4`}>
        {filtered.length === 0 ? (
          <div className="rounded-card border border-line bg-surface py-[100px] text-center shadow-card">
            <div className="mx-auto h-14 w-14 rounded-full border-2 border-dashed border-line-strong"></div>
            <div className="mt-[18px] text-[15px] text-ink-2">{emptyMessage}</div>
          </div>
        ) : (
          <div>
            {/* 列表同时渲染移动端卡片与桌面端行,共用同一段 props(逻辑不 fork)。卡片与行各自由
                md:hidden / hidden md:flex 控制显隐,断点处分叉展示层,flex 表达不了的差异(简介单独
                成块、meta 改两行底栏)落到各自的组件里。 */}
            <div className="flex flex-col gap-2.5">
              {visibleList.map((item) => {
                const isHighlightTarget = item.slug === highlightSlug;
                return (
                  <Fragment key={item.slug}>
                    <ProjectCard
                      item={item}
                      highlighted={isHighlightTarget}
                      highlightVisible={highlightVisible}
                      onOpen={handleOpen}
                    />
                    <ProjectRow
                      item={item}
                      highlighted={isHighlightTarget}
                      highlightVisible={highlightVisible}
                      onOpen={handleOpen}
                    />
                  </Fragment>
                );
              })}
            </div>
            {hasMore && <div className="py-8 text-center text-[13px] text-ink-3">加载中…</div>}
            {isFullyLoaded && (
              <div className="mt-6 pb-4 text-center text-[13px] text-ink-3">
                已展示{BOARD_LABEL[board]}当前筛选下的全部项目
              </div>
            )}
          </div>
        )}
      </div>

      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="回到顶部"
          // 移动端单独放大:44px 在窄屏视觉偏小且贴边,移动端给到 48px、内移到 right-4(16px),
          // 图标 22px;桌面端仍维持 h-11/w-11(44px) 的原样。
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-float transition-colors hover:border-accent-line hover:text-accent active:scale-95 md:right-6 md:h-11 md:w-11"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-[22px] md:size-[18px]">
            <line x1={12} y1={19} x2={12} y2={5}></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
}
