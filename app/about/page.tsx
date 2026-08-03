import Link from "next/link";
import { formatSyncTime, getSiteData } from "@/lib/site-data";

export const metadata = {
  title: "关于",
  description: "独立星选 IndieStar 的网站目的、数据来源、同步机制与收录规则说明。",
  alternates: { canonical: "/about" },
};

const sectionTitleClass =
  "mb-2 flex items-center gap-2 text-base font-semibold text-ink-1 before:block before:h-[15px] before:w-[3px] before:rounded-full before:bg-accent before:content-['']";
const sectionBodyClass = "text-[15px] leading-[1.8] text-ink-2";
const linkClass = "text-accent no-underline hover:underline";

export default function AboutPage() {
  const { meta } = getSiteData();
  return (
    <div className="mx-auto px-4 pb-28 pt-10 md:max-w-[680px] md:px-6">
      <Link
        href="/"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-2 no-underline transition-colors hover:border-accent-line hover:text-accent"
      >
        ← 返回首页
      </Link>

      <div className="mt-5 rounded-card border border-line bg-surface p-5 shadow-card md:p-9">
        <h1 className="m-0 text-2xl font-bold text-ink-1">关于 IndieStar</h1>

        <section className="mt-5 md:mt-7">
          <h2 className={sectionTitleClass}>网站目的</h2>
          <p className={sectionBodyClass}>
            IndieStar 是一份持续更新的独立开发者项目精选。原始清单体量庞大，很难从头翻到尾找到感兴趣的内容，
            本站希望通过真实的点赞与评论，让优质项目自然浮现出来，减少无效浏览成本。所有排名均来自用户真实行为，
            不做人工编辑推荐。
          </p>
        </section>

        <section className="mt-5 md:mt-7">
          <h2 className={sectionTitleClass}>数据来源</h2>
          <p className={sectionBodyClass}>
            本站项目数据同步自开源仓库{" "}
            <a
              href="https://github.com/1c7/chinese-independent-developer"
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              chinese-independent-developer
            </a>
            ，在此感谢原维护者与所有贡献者长期的整理与维护。项目列表每隔 10 分钟自动同步一次，可能有短暂延迟。
          </p>
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-3 py-1.5 text-[13px] text-accent-ink">
            项目列表最近同步于 {formatSyncTime(meta.contentSyncedAt)}
          </div>
        </section>

        <section className="mt-5 md:mt-7">
          <h2 className={sectionTitleClass}>点赞与评论的更新机制</h2>
          <p className={sectionBodyClass}>
            点赞和评论功能基于 giscus（一款将评论区挂载在 GitHub Discussions
            上的开源组件）实现，用户在详情页的操作会实时写入 GitHub
            Discussions。首页列表里的点赞数、评论数同样接近实时——页面会从一个边缘缓存的接口读取最新计数（通常几秒到一分钟内更新），你自己刚完成的点赞与评论也会先在本地立即显示，不必等待任何批量同步。
          </p>
        </section>

        <section className="mt-5 md:mt-7">
          <h2 className={sectionTitleClass}>开源</h2>
          <p className={sectionBodyClass}>
            本站(IndieStar)本身也是开源项目，代码见{" "}
            <a href="https://github.com/pluone/indie_star" target="_blank" rel="noreferrer" className={linkClass}>
              github.com/pluone/indie_star
            </a>
            。
          </p>
        </section>
      </div>
    </div>
  );
}
