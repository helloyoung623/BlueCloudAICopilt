// 只构建「store↔React 挂载探针」这一页，产物落在主构建目录的 probe/ 下。
// 与产品构建完全分离：探针不参与 pnpm build，也不会被打进 dist。
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  plugins: [react()],
  logLevel: "warn",
  // 关键：走 React 开发版。StrictMode 的双调用（渲染 + effect 重放）只在开发版生效，
  // 用生产版跑这个探针等于没测 StrictMode。
  mode: "development",
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  build: {
    outDir: join(here, "dist"),
    emptyOutDir: true,
    minify: false,
    // 产物要能被静态服务当作 /probe/ 目录直接访问
    assetsDir: "assets",
  },
});
