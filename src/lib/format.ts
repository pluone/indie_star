import type { Board } from "./types";

export const BOARD_LABEL: Record<Board, string> = {
  main: "主版面",
  programmer: "程序员版面",
  game: "游戏版面",
};

export function formatDateCN(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function daysSince(dateStr: string, now: Date): number {
  return (now.getTime() - new Date(`${dateStr}T00:00:00`).getTime()) / 86400000;
}

export type TimeRange = "month" | "quarter" | "year" | "all";

export function inTimeRange(dateStr: string, range: TimeRange, now: Date): boolean {
  if (range === "all") return true;
  const days = daysSince(dateStr, now);
  if (range === "month") return days <= 30;
  if (range === "quarter") return days <= 90;
  if (range === "year") return days <= 365;
  return true;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const AVATAR_PALETTE: [string, string][] = [
  ["oklch(92% 0.05 40)", "oklch(38% 0.11 40)"],
  ["oklch(92% 0.05 95)", "oklch(38% 0.11 95)"],
  ["oklch(92% 0.05 150)", "oklch(36% 0.1 150)"],
  ["oklch(92% 0.05 210)", "oklch(36% 0.1 210)"],
  ["oklch(92% 0.05 270)", "oklch(38% 0.1 270)"],
  ["oklch(92% 0.05 330)", "oklch(38% 0.1 330)"],
];

export function avatarColors(name: string): { bg: string; fg: string } {
  const [bg, fg] = AVATAR_PALETTE[hashCode(name) % AVATAR_PALETTE.length];
  return { bg, fg };
}

// Some upstream project entries (mostly WeChat mini-programs, which have no browsable URL) link
// straight to a QR code image instead of a webpage. Whether that opens inline or force-downloads
// depends on the image host's own response headers, which we don't control — so instead of
// navigating there, callers should render these as an <img> directly on the page.
export function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png)(\?.*)?(#.*)?$/i.test(url);
}
