import Link from "next/link";
import { formatSyncTime, getSiteData } from "@/lib/site-data";

export const metadata = { title: "关于 · 独立星选 IndieStar" };

const sectionTitleStyle = { fontSize: 16, marginBottom: 8 } as const;
const sectionBodyStyle = { fontSize: 15, lineHeight: 1.8, color: "oklch(30% 0.01 90)" } as const;
const linkStyle = { color: "oklch(58% 0.15 45)" } as const;

export default function AboutPage() {
  const { meta } = getSiteData();
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px 110px" }}>
      <Link href="/" style={{ cursor: "pointer", fontSize: 14, color: "oklch(45% 0.01 90)", textDecoration: "none" }}>
        ← 返回首页
      </Link>
      <h1 style={{ fontSize: 24, marginTop: 24 }}>关于 IndieStar</h1>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>网站目的</h2>
        <p style={sectionBodyStyle}>
          IndieStar 是一份持续更新的独立开发者项目精选。原始清单体量庞大，很难从头翻到尾找到感兴趣的内容，
          本站希望通过真实的点赞与评论，让优质项目自然浮现出来，减少无效浏览成本。所有排名均来自用户真实行为，
          不做人工编辑推荐。
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>数据来源</h2>
        <p style={sectionBodyStyle}>
          本站项目数据同步自开源仓库{" "}
          <a href="https://github.com/1c7/chinese-independent-developer" target="_blank" rel="noreferrer" style={linkStyle}>
            chinese-independent-developer
          </a>
          ，在此感谢原维护者与所有贡献者长期的整理与维护。项目列表每天凌晨 5 点(UTC+8)自动同步一次，可能有短暂延迟。
        </p>
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 13,
            color: "oklch(50% 0.03 45)",
            background: "oklch(97% 0.015 45)",
            border: "1px solid oklch(90% 0.025 45)",
          }}
        >
          项目列表最近同步于 {formatSyncTime(meta.contentSyncedAt)}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>点赞与评论的更新机制</h2>
        <p style={sectionBodyStyle}>
          点赞和评论功能基于 giscus（一款将评论区挂载在 GitHub Discussions
          上的开源组件）实现，用户在详情页的操作会实时写入 GitHub Discussions。首页列表里的点赞数、评论数同样接近实时——页面会从一个边缘缓存的接口读取最新计数（通常几秒到一分钟内更新），你自己刚完成的点赞与评论也会先在本地立即显示，不必等待任何批量同步。
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>开源</h2>
        <p style={sectionBodyStyle}>
          本站(IndieStar)本身也是开源项目，代码见{" "}
          <a href="https://github.com/pluone/indie_star" target="_blank" rel="noreferrer" style={linkStyle}>
            github.com/pluone/indie_star
          </a>
          。
        </p>
      </section>
    </div>
  );
}
