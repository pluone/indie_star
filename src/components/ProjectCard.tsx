"use client";

import type { Project } from "@/lib/types";
import { avatarColors, formatDateCN } from "@/lib/format";

// 移动端卡片 —— 另一种更简单的设计,而非缩水版的桌面行。无外链图标/无 LinkHint/
// 无 hover 上浮(外链走详情页"访问项目"按钮)。整卡是单个点击目标。简介完整展示(无
// line-clamp,设计明确要求),底部 meta 行只留日期+👍💬(作者信息移除,避免窄屏重复)。
// `md:hidden` 显隐由父层负责。
interface ProjectCardProps {
  item: Project;
  highlighted?: boolean;
  highlightVisible?: boolean;
  onOpen: (slug: string) => void;
}

export default function ProjectCard({ item, highlighted = false, highlightVisible = false, onOpen }: ProjectCardProps) {
  const { bg, fg } = avatarColors(item.name);

  return (
    <div
      onClick={() => onOpen(item.slug)}
      // active: 按压态是移动端"顺滑"单条收益最大的项 —— 桌面端所有反馈都挂在 hover:,
      // 触屏点击本没有任何视觉响应;这里以轻微背景下沉 + 微缩替代。md:hidden 让桌面端只走行。
      className="flex cursor-pointer flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card transition-[background-color,transform,border-color] active:scale-[0.99] active:border-accent-line active:bg-accent-soft/40 md:hidden"
      style={
        highlighted
          ? {
              backgroundColor: highlightVisible ? "oklch(97.4% 0.018 45)" : undefined,
              transition: "background-color 900ms ease-out",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: bg, color: fg }}
        >
          {item.name.slice(0, 1).toUpperCase()}
        </div>
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink-1">{item.name}</span>
        {item.status === "developing" && (
          <span className="inline-flex shrink-0 whitespace-nowrap rounded border border-dashed border-flag-line bg-flag-soft px-1.5 py-0.5 text-[10px] font-semibold text-flag-ink">
            开发中
          </span>
        )}
      </div>
      {/* 简介完整展示,不截断 —— 用户明确要求 */}
      <div className="break-words text-[13px] leading-[1.6] text-ink-2">{item.intro}</div>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
        {/* 移动端卡片的 meta 行只留日期(作者信息已移除,避免在窄屏重复桌面行已有信息) */}
        <span className="min-w-0 truncate">{formatDateCN(item.date)}</span>
        <span className="flex shrink-0 items-center gap-3 text-ink-2">
          <span className="flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"></path>
            </svg>
            <span className="font-mono">{item.likes}</span>
          </span>
          <span className="flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4A8.5 8.5 0 1 1 21 11.5z"></path>
            </svg>
            <span className="font-mono">{item.comments}</span>
          </span>
        </span>
      </div>
    </div>
  );
}