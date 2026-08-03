import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 注意:Cloudflare 目前在线上注入一份托管 robots.txt(带 Content-Signal,且 Disallow 了
// GPTBot / ClaudeBot / Bytespider 等 9 个 AI 爬虫)。这份文件部署后哪一份生效需要实测
// https://indiestar.site/robots.txt —— 如果本文件胜出,那 9 条 AI 爬虫的屏蔽就一并消失了,
// 那是 Cloudflare 的默认策略而非本站的选择,要不要保留得单独决定。
// output: "export" 下 Next 要求路由处理器显式声明静态,否则构建直接报错。
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
