import Link from "next/link";

export const metadata = { title: "关于 · 独立星选 IndieStar" };

const sectionTitleStyle = { fontSize: 16, marginBottom: 8 } as const;
const sectionBodyStyle = { fontSize: 15, lineHeight: 1.8, color: "oklch(30% 0.01 90)" } as const;

export default function AboutPage() {
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
          <a
            href="https://github.com/1c7/chinese-independent-developer"
            target="_blank"
            rel="noreferrer"
            style={{ color: "oklch(58% 0.15 45)" }}
          >
            chinese-independent-developer
          </a>
          ，在此感谢原维护者与所有贡献者长期的整理与维护。
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>点赞与评论的数据同步说明</h2>
        <p style={sectionBodyStyle}>
          项目详情页的点赞和评论功能基于 giscus（一款将评论区挂载在 GitHub Discussions
          上的开源组件）实现，用户在详情页的操作会实时写入 GitHub
          Discussions，详情页展示的也是实时数据。首页列表里的点赞数、评论数则是从 giscus
          数据每 30 分钟批量同步一次生成的统计快照，用于支持“点赞最多”“评论最多”排序，
          因此可能比详情页里的实时数字滞后最多 30 分钟，属于正常现象。
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={sectionTitleStyle}>排名机制说明</h2>
        <p style={sectionBodyStyle}>
          “时间最近”“点赞最多”“评论最多”三种排序均来自用户真实行为统计，不接受任何形式的付费置顶，
          也不做人工编辑推荐。
        </p>
      </section>
    </div>
  );
}
