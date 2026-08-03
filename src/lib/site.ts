// 站点身份常量。canonical、JSON-LD、title 模板三处都要用到同一份，集中在这里避免各写各的。

export const SITE_URL = "https://indiestar.site";
export const SITE_NAME = "独立星选 IndieStar";

// 站点级兜底描述:没有自己 description 的页面继承它。首页改用 homeDescription() 带上实时条目数。
// 刻意不提"点赞/评论筛选"—— 那既不是任何人会搜的词,当前的互动量也撑不起这个说法。
export const SITE_DESC =
  "收录 2000+ 个中国独立开发者项目，涵盖 AI 工具、效率工具、浏览器插件、App 与独立游戏，跟随上游仓库准实时同步更新，可按版面、收录时间与热度筛选。";

export function homeDescription(total: number): string {
  return `收录 ${total} 个中国独立开发者项目，涵盖 AI 工具、效率工具、浏览器插件、App 与独立游戏，跟随上游仓库准实时同步更新，可按版面、收录时间与热度筛选。`;
}
