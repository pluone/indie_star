"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Board, Project } from "@/lib/types";
import { avatarColors, BOARD_LABEL, formatDateCN, inTimeRange, type TimeRange } from "@/lib/format";

const PAGE_SIZE = 8;
const BOARD_KEYS: Board[] = ["main", "programmer", "game"];
// Shared by the header, tabs, filter row, and list, so all four stay aligned to the same centered
// column on very wide viewports (e.g. a 4K display fullscreen) — each row still spans full width
// for its background/border, but its actual content is centered within this width, same as the
// list below it.
const CONTENT_MAX_WIDTH = 1080;
type SortBy = "recent" | "likes" | "comments";

interface HomeClientProps {
  main: Project[];
  game: Project[];
  programmer: Project[];
  contentSyncedAt: string;
  statsSyncedAt: string;
}

function isBoard(value: string | null): value is Board {
  return value === "main" || value === "programmer" || value === "game";
}

function isNearBottom(): boolean {
  return window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 500;
}

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 13,
    cursor: "pointer",
    border: "1px solid " + (active ? "oklch(58% 0.15 45)" : "oklch(88% 0.01 90)"),
    background: active ? "oklch(94% 0.05 45)" : "oklch(99% 0.004 90)",
    color: active ? "oklch(40% 0.13 45)" : "oklch(45% 0.01 90)",
    fontWeight: active ? 600 : 400,
  };
}

export default function HomeClient(props: HomeClientProps) {
  const router = useRouter();

  const boards: Record<Board, Project[]> = {
    main: props.main,
    game: props.game,
    programmer: props.programmer,
  };

  // Deliberately NOT next/navigation's useSearchParams(): on a fully static export there's no
  // request-time query string, so a component that reads it must bail out to a Suspense fallback
  // at build time — which would leave the entire home page blank until client hydration. Reading
  // window.location.search once after mount instead lets the default view (board=main) render
  // fully server-side, and only adjusts for a shared deep link once JS runs.
  const [board, setBoardState] = useState<Board>("main");
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("board");
    if (isBoard(fromUrl) && fromUrl !== "main") setBoardState(fromUrl);
  }, []);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [search, setSearch] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Record<Board, number>>({
    main: PAGE_SIZE,
    game: PAGE_SIZE,
    programmer: PAGE_SIZE,
  });

  // Frozen at mount rather than recomputed every render — avoids items quietly shifting between
  // time-range buckets mid-session, and this is only used for the "近一个月/近三个月/近一年" filter.
  const now = useMemo(() => new Date(), []);

  function setBoard(next: Board) {
    setBoardState(next);
    setSearch("");
    window.history.replaceState(null, "", next === "main" ? "/" : `/?board=${next}`);
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

  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingRef = useRef(false);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setVisibleCounts((prev) => ({ ...prev, [board]: prev[board] + PAGE_SIZE }));
  }, [board]);

  // Scroll-driven loading — the normal case: a long list, user scrolls toward the bottom.
  useEffect(() => {
    function handleScroll() {
      if (isNearBottom()) loadMore();
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
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "oklch(98% 0.006 90)" }}>
        <div style={{ borderBottom: "1px solid oklch(90% 0.01 90)" }}>
          <div
            style={{
              maxWidth: CONTENT_MAX_WIDTH,
              margin: "0 auto",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "20px 40px",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/"
              style={{ fontSize: 19, fontWeight: 700, whiteSpace: "nowrap", color: "inherit", textDecoration: "none" }}
            >
              独立星选 <span style={{ color: "oklch(58% 0.15 45)" }}>IndieStar</span>
            </Link>
            <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 460 }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                fill="none"
                stroke="oklch(60% 0.01 90)"
                strokeWidth={2}
              >
                <circle cx={11} cy={11} r={7}></circle>
                <line x1={21} y1={21} x2={16.65} y2={16.65}></line>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目名称或简介关键词"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 14px 10px 36px",
                  borderRadius: 8,
                  border: "1px solid oklch(88% 0.01 90)",
                  background: "oklch(99% 0.004 90)",
                  fontSize: 14,
                  color: "oklch(20% 0.01 90)",
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
              <Link href="/about" style={{ cursor: "pointer", fontSize: 14, color: "oklch(45% 0.01 90)" }}>
                关于
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div
            style={{ maxWidth: CONTENT_MAX_WIDTH, margin: "0 auto", display: "flex", gap: 6, padding: "18px 40px 0" }}
          >
            {BOARD_KEYS.map((key) => {
              const active = board === key;
              return (
                <div
                  key={key}
                  onClick={() => setBoard(key)}
                  style={{
                    padding: "8px 4px",
                    marginRight: 8,
                    cursor: "pointer",
                    borderBottom: active ? "2px solid oklch(58% 0.15 45)" : "2px solid transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: active ? 700 : 500,
                      color: active ? "oklch(20% 0.01 90)" : "oklch(52% 0.01 90)",
                    }}
                  >
                    {BOARD_LABEL[key]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ borderBottom: "1px solid oklch(92% 0.01 90)" }}>
          <div
            style={{
              maxWidth: CONTENT_MAX_WIDTH,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 28,
              padding: "16px 40px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "oklch(52% 0.01 90)" }}>排序</span>
              {(
                [
                  ["recent", "时间最近"],
                  ["likes", "点赞最多"],
                  ["comments", "评论最多"],
                ] as [SortBy, string][]
              ).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)} style={pillStyle(sortBy === key)}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "oklch(52% 0.01 90)" }}>收录时间</span>
              {(
                [
                  ["month", "近一个月"],
                  ["quarter", "近三个月"],
                  ["year", "近一年"],
                  ["all", "全部"],
                ] as [TimeRange, string][]
              ).map(([key, label]) => (
                <button key={key} onClick={() => setTimeRange(key)} style={pillStyle(timeRange === key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: CONTENT_MAX_WIDTH, margin: "0 auto", padding: "0 40px" }}>
        <div style={{ padding: "14px 0 4px", fontSize: 12, color: "oklch(58% 0.01 90)" }}>
          项目列表同步于 {props.contentSyncedAt}，点赞与评论同步于 {props.statsSyncedAt}，可能有短暂延迟，
          <Link href="/about" style={{ textDecoration: "underline", color: "inherit" }}>
            详见说明
          </Link>
          。
        </div>
        <div style={{ padding: "6px 0 12px", fontSize: 13, color: "oklch(48% 0.01 90)" }}>
          共 <span style={{ fontWeight: 600, color: "oklch(28% 0.01 90)" }}>{filtered.length}</span> 个项目
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "100px 0", textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                border: "2px dashed oklch(80% 0.02 90)",
                margin: "0 auto",
              }}
            ></div>
            <div style={{ marginTop: 18, fontSize: 15, color: "oklch(50% 0.01 90)" }}>{emptyMessage}</div>
          </div>
        ) : (
          <div>
            {visibleList.map((item) => {
              const { bg, fg } = avatarColors(item.name);
              return (
                <div
                  key={item.slug}
                  onClick={() => router.push(`/project/${item.slug}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "18px 0",
                    borderBottom: "1px solid oklch(93% 0.01 90)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 16,
                      flexShrink: 0,
                      background: bg,
                      color: fg,
                    }}
                  >
                    {item.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
                      {item.status === "developing" && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "oklch(42% 0.13 80)",
                            background: "oklch(95% 0.06 80)",
                            border: "1px dashed oklch(70% 0.12 80)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          开发中
                        </span>
                      )}
                      {item.author && (
                        <span style={{ fontSize: 12, color: "oklch(58% 0.01 90)", whiteSpace: "nowrap" }}>
                          by {item.author}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "oklch(52% 0.01 90)",
                        marginTop: 4,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.intro}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "oklch(58% 0.01 90)",
                      minWidth: 96,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDateCN(item.date)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      color: "oklch(45% 0.01 90)",
                      minWidth: 52,
                      flexShrink: 0,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"></path>
                    </svg>
                    <span style={{ fontFamily: "ui-monospace,'SFMono-Regular',monospace" }}>{item.likes}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      color: "oklch(45% 0.01 90)",
                      minWidth: 44,
                      flexShrink: 0,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4A8.5 8.5 0 1 1 21 11.5z"></path>
                    </svg>
                    <span style={{ fontFamily: "ui-monospace,'SFMono-Regular',monospace" }}>{item.comments}</span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      color: "oklch(45% 0.01 90)",
                      textDecoration: "none",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1={10} y1={14} x2={21} y2={3}></line>
                    </svg>
                  </a>
                </div>
              );
            })}
            {hasMore && (
              <div style={{ padding: "28px 0 40px", textAlign: "center", fontSize: 13, color: "oklch(58% 0.01 90)" }}>
                加载中…
              </div>
            )}
            {isFullyLoaded && (
              <div
                style={{
                  marginTop: 8,
                  padding: "20px 0 56px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "oklch(58% 0.01 90)",
                  borderTop: "1px dashed oklch(90% 0.01 90)",
                }}
              >
                已展示{BOARD_LABEL[board]}当前筛选下的全部项目
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
