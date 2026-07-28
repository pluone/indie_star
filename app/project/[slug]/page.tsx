import { notFound } from "next/navigation";
import BackToListLink from "@/components/BackToListLink";
import GiscusComments from "@/components/GiscusComments";
import { avatarColors, BOARD_LABEL, formatDateCN, isImageUrl } from "@/lib/format";
import { renderInlineMarkdown } from "@/lib/inline-markdown";
import { findProjectBySlug, getSiteData } from "@/lib/site-data";

export function generateStaticParams() {
  const data = getSiteData();
  return [...data.main, ...data.game, ...data.programmer].map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = findProjectBySlug(slug);
  return { title: project ? `${project.name} · 独立星选 IndieStar` : "独立星选 IndieStar" };
}

const devBadgeClass =
  "rounded-md border border-dashed border-flag-line bg-flag-soft px-2.5 py-1 text-xs font-semibold text-flag-ink";

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = findProjectBySlug(slug);
  if (!project) notFound();

  const { bg, fg } = avatarColors(project.name);
  const isLive = project.status === "live";

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-24 pt-8">
      <BackToListLink />

      {/* 项目本体是一张纸面卡片，讨论区留在 canvas 上 —— 主体内容与附属讨论分成两层。 */}
      <div className="mt-5 rounded-card border border-line bg-surface p-9 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-bold"
              style={{ background: bg, color: fg }}
            >
              {project.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="m-0 text-[26px] font-bold text-ink-1">{project.name}</h1>
                {!isLive && <span className={devBadgeClass}>开发中</span>}
              </div>
              <div className="mt-2 text-[13px] text-ink-3">
                收录于 {formatDateCN(project.date)} · {BOARD_LABEL[project.board]}
              </div>
              {project.author && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
                  <span>
                    作者 <span className="font-semibold text-ink-1">{project.author}</span>
                  </span>
                  {project.authorLinks.length > 0 && (
                    <span className="flex items-center gap-2.5">
                      {project.authorLinks.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent no-underline hover:underline"
                        >
                          {link.label}
                        </a>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {isImageUrl(project.url) ? (
            // Mostly WeChat mini-programs with no browsable URL — the "link" is a QR code image.
            // Whether opening it directly shows the image or force-downloads depends on the image
            // host's response headers, which we don't control, so it's rendered inline instead.
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external host, not eligible for next/image optimization */}
              <img
                src={project.url}
                alt={`${project.name} 访问二维码`}
                className="h-[140px] w-[140px] rounded-lg border border-line bg-surface object-contain"
              />
              <div className="mt-1.5 text-xs text-ink-3">扫码访问</div>
            </div>
          ) : (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              // 刻意不用实心强调色：那样的按钮太像“离站出口”，权重压过页面本身的内容。
              // 改成淡底 + 描边的次级按钮，仍是本页最显眼的操作，但不再抢戏。
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-line bg-accent-soft px-5 py-2.5 text-sm font-semibold text-accent-ink no-underline transition-colors hover:border-accent hover:text-accent"
            >
              访问项目 →
            </a>
          )}
        </div>

        <p className="mt-7 text-base leading-[1.8] text-ink-1">
          {renderInlineMarkdown(project.introMarkdown || project.intro)}
        </p>
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-[15px] font-semibold text-ink-1">点赞与讨论</h2>
        <div className="max-w-[560px] text-[13px] leading-[1.7] text-ink-2">需要登录后才能点赞与评论。</div>
        <div className="mt-2.5 max-w-[560px] rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[13px] leading-[1.6] text-accent-ink">
          👍 首页"点赞最多"排序只统计 👍 这一种反应，其余反应不计入排名。
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface px-5 py-4 shadow-card">
          <GiscusComments />
        </div>
      </div>
    </div>
  );
}
