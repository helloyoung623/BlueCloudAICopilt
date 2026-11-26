// 生产构建检查：与 vite.figma.config.ts 完全一致，只是输出到唯一临时目录。
// 这样不会清空本地 dist，也不受“批量删除”沙箱策略影响；退出码与真实构建一致。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outDir = mkdtempSync(join(tmpdir(), "bluecloud-check-"));
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "build", "--config", "vite.figma.config.ts", "--outDir", outDir, "--emptyOutDir"],
  { stdio: "inherit" },
);
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
