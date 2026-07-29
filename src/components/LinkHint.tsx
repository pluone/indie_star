"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 站外跳转前先告诉用户"要去哪儿"：悬停（或键盘聚焦）触发器时，在其下方浮出目标网址。
// 只做提示，不接管点击 —— 触发器本身仍是原来的 <a>/<Link>。
const SHOW_DELAY_MS = 120;

interface LinkHintProps {
  /** 目标地址；站内跳转传路径即可（配合 internalLabel）。 */
  url: string;
  /** 站内跳转时展示这句话，而不是解析出的域名 —— 用户关心的是"不会离开本站"。 */
  internalLabel?: string;
  /**
   * inline-end：网址直接排在触发器右侧的空白里（首页列表行 —— 标题行右半边本来就是空的，
   * 提示框浮在下方反而遮住简介）。below：浮在触发器下方，给右侧没有空档的场合（详情页按钮）。
   */
  placement?: "inline-end" | "below";
  /** placement="below" 时，触发器贴着右边缘就改右对齐，避免提示框超出容器。 */
  align?: "left" | "right";
  children: ReactNode;
}

/**
 * 百分号编码只在展示层解开：上游不少链接的路径带中文或空格，一串 %E4%B8%AD 对读的人毫无信息。
 * 触发器的 href 始终是原始 URL —— 解码后的字符串重新当地址用不一定还等价，这里只负责好看。
 */
function decodeForDisplay(part: string): string {
  try {
    const decoded = decodeURIComponent(part);
    // 解出控制字符（%0A 这类）会把单行提示撑断行、或伪装成另一个地址，这种就老老实实显示原文。
    return /[\u0000-\u001f\u007f]/.test(decoded) ? part : decoded;
  } catch {
    // 半截的转义序列（%E4%A）会让 decodeURIComponent 直接抛 URIError。
    return part;
  }
}

/** 拆成"域名 + 其余部分"，域名加重显示 —— 判断要不要点进去，看的就是域名。 */
function splitUrl(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    // 域名不解码：这里 hostname 已是 URL 规范化后的形式，把 xn-- punycode 还原成 Unicode 反而
    // 会放大同形字域名的伪装空间，而域名恰恰是用户判断"要不要去"最该看清的那一段。
    const host = u.hostname.replace(/^www\./, "");
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    return { host, rest: decodeForDisplay(rest) };
  } catch {
    // 上游数据里偶尔有不是绝对 URL 的条目，原样展示总比什么都不显示强。
    return { host: decodeForDisplay(url), rest: "" };
  }
}

export default function LinkHint({
  url,
  internalLabel,
  placement = "below",
  align = "left",
  children,
}: LinkHintProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 移入即弹会让鼠标划过一排卡片时闪个不停，加一档很短的延迟只保留"停住看"的意图。
  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const { host, rest } = splitUrl(url);

  // 两种形态刻意不同：排在行内（inline-end）时它就是这一行的元信息，画个框反而像另一张卡片；
  // 浮在下方（below）时它盖在正文之上，必须有纸面底色和描边才读得清。
  const positionClass =
    placement === "inline-end"
      ? "left-[calc(100%+10px)] top-1/2 -translate-y-1/2 text-ink-3"
      : `top-[calc(100%+6px)] ${align === "right" ? "right-0" : "left-0"} rounded-md border border-line bg-surface px-3 py-2 shadow-float`;

  return (
    <span
      // shrink-0：这层包装会顶替原触发器成为 flex 子项，得把触发器自己的不收缩特性带上来。
      className="relative inline-flex shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      // 触发器被点走（或整行被点进详情页）后提示不该留在屏幕上。
      onClick={hide}
    >
      {children}
      {open && (
        <span
          // pointer-events-none：提示绝不能挡住它自己的触发器，也不能吃掉整行卡片的点击。
          // absolute：无论哪种形态都不参与布局，否则悬停时整行会被撑开、抖一下。
          // 14px 等宽 ≈ 正文 sans 的观感大小：等宽字面本身偏小，跟行内其他 13px 元信息用同一
          // 字号会显得更细弱一档，所以刻意比它们再大一点。
          // leading 不能用 none：truncate 的 overflow:hidden 会沿行框裁切，行高等于字号时
          // g/y/p 的下伸部分正好被切掉一线。1.45 给下伸笔画留出余量。
          className={`pointer-events-none absolute z-30 flex max-w-[min(420px,50vw)] items-center gap-1.5 whitespace-nowrap text-[14px] leading-[1.45] ${positionClass}`}
        >
          {/* 刻意不放外链图标：触发器本身就是同一个图标，紧挨着重复一遍只是噪音。 */}
          {internalLabel ? (
            <span className="text-ink-2">{internalLabel}</span>
          ) : (
            <span className="min-w-0 truncate font-mono">
              {/* 行内形态里标题就在旁边，域名再用 ink-1 加粗会去抢标题的重量。 */}
              <span className={placement === "inline-end" ? "font-medium text-ink-2" : "font-semibold text-ink-1"}>
                {host}
              </span>
              {rest && <span className="text-ink-3">{rest}</span>}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
