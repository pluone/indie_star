import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import GiscusComments from "@/components/GiscusComments";
import { avatarColors, BOARD_LABEL, formatDateCN } from "@/lib/format";
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

const devBadgeStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  background: "oklch(95% 0.06 80)",
  color: "oklch(40% 0.13 80)",
  border: "1px dashed oklch(68% 0.12 80)",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = findProjectBySlug(slug);
  if (!project) notFound();

  const { bg, fg } = avatarColors(project.name);
  const isLive = project.status === "live";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 100px" }}>
      <Link href="/" style={{ cursor: "pointer", fontSize: 14, color: "oklch(45% 0.01 90)", textDecoration: "none" }}>
        ← 返回列表
      </Link>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 28 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 22,
            flexShrink: 0,
            background: bg,
            color: fg,
          }}
        >
          {project.name.slice(0, 1)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, margin: 0, fontWeight: 700 }}>{project.name}</h1>
            {!isLive && <span style={devBadgeStyle}>开发中</span>}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "oklch(50% 0.01 90)" }}>
            收录于 {formatDateCN(project.date)} · {BOARD_LABEL[project.board]}
          </div>
          {project.author && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 13,
                color: "oklch(48% 0.01 90)",
              }}
            >
              <span>
                作者 <span style={{ fontWeight: 600, color: "oklch(28% 0.01 90)" }}>{project.author}</span>
              </span>
              {project.authorLinks.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {project.authorLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "oklch(58% 0.15 45)", textDecoration: "none" }}
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

      <p style={{ fontSize: 16, lineHeight: 1.8, marginTop: 28, color: "oklch(25% 0.01 90)" }}>{project.intro}</p>
      <a
        href={project.url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          padding: "10px 20px",
          borderRadius: 8,
          background: "oklch(58% 0.15 45)",
          color: "oklch(99% 0.005 90)",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        访问项目 →
      </a>

      <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid oklch(92% 0.01 90)" }}>
        <div style={{ fontSize: 13, color: "oklch(55% 0.01 90)", lineHeight: 1.7, maxWidth: 560 }}>
          需要登录后才能点赞与评论，每个用户对同一项目最多计入一次点赞（👍）。首页"点赞最多"排序只统计 👍
          这一种反应，其余反应不计入排名。
        </div>
        <div style={{ marginTop: 24 }}>
          <GiscusComments />
        </div>
      </div>
    </div>
  );
}
