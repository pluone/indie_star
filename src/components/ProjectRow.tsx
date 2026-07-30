"use client";

import Link from "next/link";
import LinkHint from "@/components/LinkHint";
import type { Project } from "@/lib/types";
import { avatarColors, formatDateCN, isImageUrl } from "@/lib/format";

// 桌面端列表行 —— 把 HomeClient 里那一整块行的 JSX 逐字搬出,只接受 presentational
// props,无任何状态/逻辑。`hidden md:flex` 的显隐由父层负责,本组件只产出行的 div。
interface ProjectRowProps {
  item: Project;
  /** 从详情页返回时高亮"你刚才在这儿"的那一行;不命中时为 false。 */
  highlighted?: boolean;
  /** 高亮行当前是否处于显色阶段(否即淡出/已清除)。 */
  highlightVisible?: boolean;
  onOpen: (slug: string) => void;
}

export default function ProjectRow({
  item,
  highlighted = false,
  highlightVisible = false,
  onOpen,
}: ProjectRowProps) {
  const { bg, fg } = avatarColors(item.name);

  return (
    <div
      onClick={() => onOpen(item.slug)}
      className="group hidden cursor-pointer items-center gap-4 rounded-card border border-line bg-surface px-6 py-5 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-accent-line hover:shadow-lift md:flex"
      style={
        // 内联,且只出现在被闪一下的那一行 —— 它始终压过工具类(含其 hover 变体),
        // 这正是高亮想要的;高亮一清除样式就要彻底消失,该行恢复正常 hover。
        highlighted
          ? {
              // 只是"你刚才在这儿"的提示,不是选中态 —— 比 accent-soft 再淡一档,
              // 在白色卡片上刚好能看出是一层暖色,不至于像被高亮选中。
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
          <LinkHint
            url={isImageUrl(item.url) ? `/project/${item.slug}` : item.url}
            internalLabel={isImageUrl(item.url) ? "本站页面 · 查看访问二维码" : undefined}
            placement="inline-end"
          >
            <Link
              href={isImageUrl(item.url) ? `/project/${item.slug}` : item.url}
              {...(isImageUrl(item.url) ? {} : { target: "_blank", rel: "noreferrer" })}
              onClick={(e) => {
                e.stopPropagation();
                if (isImageUrl(item.url)) onOpen(item.slug);
              }}
              // 悬停态刻意做满:淡底 + 描边 + 强调色描线 —— 这个图标是整行里唯一
              // 会把人带出站的入口,它被点中的那一刻必须和"点行进详情页"区分得开。
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-ink-2 no-underline opacity-0 transition hover:border-accent-line hover:bg-accent-soft hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                {/* 方框本身撑满 3–21 的画布,斜箭头指向方框自己的右上角、收在轮廓
                    之内 —— 之前那版箭头戳出方框外,在 28px 的小方块里显得歪。 */}
                <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1={11} y1={13} x2={21} y2={3}></line>
              </svg>
            </Link>
          </LinkHint>
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
}