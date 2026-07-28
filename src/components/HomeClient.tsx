"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board, Project } from "@/lib/types";
import { avatarColors, BOARD_LABEL, formatDateCN, inTimeRange, isImageUrl, type TimeRange } from "@/lib/format";
import { readGiscusStats, type GiscusStatsMap } from "@/lib/giscus-stats";

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
const CONTENT = "mx-auto w-full max-w-[1080px] px-10";
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
  const router = useRouter();

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

  return (
    <div>
      {/* 吸顶区分成两条带：上层 surface（品牌 + 搜索）、下层 canvas（版面 + 筛选）。
          两条带之间刻意不画线 —— 底色差本身就是分界，再加一条通栏线会让头部看起来像两个头部；
          整个头部对外只保留最下沿的一条线 + 一点落影。两层都做半透明 + 背景模糊，滚动时卡片
          能隐约透过去，头部才真的“浮”在内容之上。 */}
      <div className="sticky top-0 z-20">
        <div className="bg-surface/90 backdrop-blur-xl backdrop-saturate-150">
          <div className={`${CONTENT} flex flex-wrap items-center gap-6 py-[18px]`}>
            <div className="flex min-w-0 flex-1 justify-start">
              <Link href="/" className="text-[19px] font-bold tracking-tight whitespace-nowrap text-ink-1 no-underline">
                独立星选 <span className="text-accent">IndieStar</span>
              </Link>
            </div>
            {/* Fixed-ish width slot flanked by two flex:1 siblings of equal grow — that's what
                actually centers it in the row, since the logo and "关于" link differ in width. */}
            <div className="relative w-full min-w-[220px] max-w-[460px] shrink-0">
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
              <Link href="/about" className="cursor-pointer text-sm text-ink-2 no-underline transition-colors hover:text-accent">
                关于
              </Link>
            </div>
          </div>
        </div>

        <div className="border-b border-line bg-canvas/90 shadow-chrome backdrop-blur-xl backdrop-saturate-150">
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
      </div>

      <div className={`${CONTENT} pb-16 pt-6`}>
        {filtered.length === 0 ? (
          <div className="rounded-card border border-line bg-surface py-[100px] text-center shadow-card">
            <div className="mx-auto h-14 w-14 rounded-full border-2 border-dashed border-line-strong"></div>
            <div className="mt-[18px] text-[15px] text-ink-2">{emptyMessage}</div>
          </div>
        ) : (
          <div>
            {/* 每个项目单独成卡：卡片之间留 canvas 底色的空隙，hover 时轻微抬升。 */}
            <div className="flex flex-col gap-2.5">
              {visibleList.map((item) => {
                const { bg, fg } = avatarColors(item.name);
                const isHighlightTarget = item.slug === highlightSlug;
                return (
                  <div
                    key={item.slug}
                    onClick={() => {
                      saveNavState(item.slug);
                      router.push(`/project/${item.slug}`);
                    }}
                    className="group flex cursor-pointer items-center gap-4 rounded-card border border-line bg-surface px-6 py-5 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-accent-line hover:shadow-lift"
                    style={
                      // Inline, and only present for the one row being flashed — this always wins
                      // over the utility classes (including their hover variant), which is exactly
                      // what we want for the highlight, but must be gone entirely once it clears so
                      // normal hover behavior resumes for that row.
                      isHighlightTarget
                        ? {
                            // 只是“你刚才在这儿”的提示，不是选中态 —— 比 accent-soft 再淡一档，
                            // 在白色卡片上刚好能看出是一层暖色，不至于像被高亮选中。
                            backgroundColor: highlightVisible ? "oklch(97.4% 0.018 45)" : "transparent",
                            transition: "background-color 900ms ease-out",
                          }
                        : undefined
                    }
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
                      style={{ background: bg, color: fg }}
                    >
                      {item.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16.5px] font-semibold text-ink-1 transition-colors group-hover:text-accent">
                          {item.name}
                        </span>
                        {item.status === "developing" && (
                          <span className="inline-block whitespace-nowrap rounded border border-dashed border-flag-line bg-flag-soft px-2 py-0.5 text-[11px] font-semibold text-flag-ink">
                            开发中
                          </span>
                        )}
                        {item.author && <span className="whitespace-nowrap text-xs text-ink-3">by {item.author}</span>}
                        {/* Image-linked projects (mostly WeChat mini-programs whose "link" is a QR code)
                            route to the detail page instead of the raw image — same icon, same spot,
                            on every row, so nothing about its presence looks inconsistent; only where
                            it goes differs, and the detail page already renders the image properly. */}
                        <Link
                          href={isImageUrl(item.url) ? `/project/${item.slug}` : item.url}
                          {...(isImageUrl(item.url) ? {} : { target: "_blank", rel: "noreferrer" })}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isImageUrl(item.url)) saveNavState(item.slug);
                          }}
                          className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-ink-2 no-underline opacity-0 transition hover:bg-accent-soft hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1={10} y1={14} x2={21} y2={3}></line>
                          </svg>
                        </Link>
                      </div>
                      <div className="mt-1 break-words text-sm text-ink-2">{item.intro}</div>
                    </div>
                    <div className="min-w-[96px] shrink-0 whitespace-nowrap text-[13px] text-ink-3">
                      {formatDateCN(item.date)}
                    </div>
                    <div className="flex min-w-[52px] shrink-0 items-center gap-1.5 text-sm text-ink-2">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"></path>
                      </svg>
                      <span className="font-mono">{item.likes}</span>
                    </div>
                    <div className="flex min-w-[44px] shrink-0 items-center gap-1.5 text-sm text-ink-2">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4A8.5 8.5 0 1 1 21 11.5z"></path>
                      </svg>
                      <span className="font-mono">{item.comments}</span>
                    </div>
                  </div>
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
          className="fixed bottom-6 right-6 z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-float transition-colors hover:border-accent-line hover:text-accent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1={12} y1={19} x2={12} y2={5}></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
}
