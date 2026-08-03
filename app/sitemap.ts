import type { MetadataRoute } from "next";
import { getSiteData } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";

// lastmod 用项目自己的收录日期,不用构建时间。上游一有提交本站就重建,把 2000+ 条全填成
// "刚刚变更"是系统性造假 —— Google 会抽样验证,发现内容没变就永久不再信任本站的 lastmod,
// 比不写更糟。收录日期偶有偏差(上游合并 PR 时会把旧条目挪到当天的日期块下,内容没变而日期
// 变了),但那是零星的不精确,和系统性造假是两回事。
//
// changefreq / priority 一律不写:Google 明确说明它两个都忽略,填了只是噪音。

// output: "export" 下 Next 要求路由处理器显式声明静态,否则构建直接报错。
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const data = getSiteData();
  const projects = [...data.main, ...data.game, ...data.programmer];
  // 日期是零填充的 YYYY-MM-DD,字典序即时间序。
  const latest = projects.reduce((max, p) => (p.date > max ? p.date : max), "");

  return [
    { url: `${SITE_URL}/`, lastModified: latest },
    // about 页内容几乎不变,与其编一个日期不如不写 —— lastmod 本就是可选字段。
    { url: `${SITE_URL}/about` },
    ...projects.map((p) => ({ url: `${SITE_URL}/project/${p.slug}`, lastModified: p.date })),
  ];
}
