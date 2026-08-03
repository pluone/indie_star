// Next 16 移除了 `next lint`,改为直接用 ESLint CLI。eslint-config-next 16 的两个子路径
// 都原生导出 flat config 数组,所以不需要 @eslint/eslintrc 的 FlatCompat 兼容层。
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  {
    // 构建产物;以及 worker/ —— 它是独立的 Cloudflare Worker 工程,有自己的 node_modules
    // 和运行时环境,不该套用本项目的 React/Next 规则。
    ignores: [".next/**", "out/**", "worker/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default config;
