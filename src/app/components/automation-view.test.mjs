import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// automation-view.tsx 拆成 ./automation/* 之后只剩一个转出入口。
// 这里用源码文本守住两件事，避免以后搬文件时又把对外导出弄丢：
//   1) 拆分前对外可见的名字必须一个不少；
//   2) 每条 re-export 指向的名字，在目标文件里真的有导出（防止指向不存在的符号）。
const here = dirname(fileURLToPath(import.meta.url));
const facadePath = join(here, "automation-view.tsx");
const facade = readFileSync(facadePath, "utf8");

// 拆分前（HEAD 版 automation-view.tsx）的完整导出面，按字母序排列，只增不减。
const EXPECTED_EXPORTS = [
  "AUTOMATION_ICONS",
  "AutomationCardStatus",
  "AutomationDetailPanel",
  "AutomationIcon",
  "AutomationTask",
  "AutomationView",
  "CalendarDate",
  "DeleteTaskDialog",
  "INITIAL_TASKS",
  "RunRecord",
  "RunRecordStatus",
  "ScheduleState",
  "TASK_OPERATIONS",
  "automationIconSrc",
  "buildDefaultSchedule",
  "buildRunRecords",
  "cardSubtitle",
  "cardTimeLabel",
  "describeSchedule",
  "makeRunRecord",
  "resolveAutomationIcon",
  "summarizeSchedule",
  "taskIconSrc",
  "useDismissOnOutside",
];

// 解析 export 语句：既认 `export const/function/type X`，也认 `export { A, B as C }`。
function exportedNames(code) {
  const names = new Set();
  for (const match of code.matchAll(/^\s*export\s+(?:async\s+)?(?:function|const|let|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(match[1]);
  }
  for (const match of code.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) {
      const segment = part.trim();
      if (!segment) continue;
      const aliased = segment.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      names.add(aliased ? aliased[1] : segment.split(/\s+/).pop());
    }
  }
  return names;
}

// `export { A, B } from "./automation/x"` → [{ target: "./automation/x", names: ["A","B"] }]
function reExports(code) {
  const result = [];
  for (const match of code.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((segment) => {
        // `A as B` 时，目标模块里导出的是 A
        const aliased = segment.match(/^([A-Za-z_$][\w$]*)\s+as\s+/);
        return aliased ? aliased[1] : segment.split(/\s+/).pop();
      });
    result.push({ target: match[2], names });
  }
  return result;
}

function resolveSource(specifier) {
  const base = resolve(here, specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

test("拆分后对外导出面与拆分前完全一致（一个不少）", () => {
  const actual = exportedNames(facade);
  const missing = EXPECTED_EXPORTS.filter((name) => !actual.has(name));
  assert.deepEqual(missing, [], `门面缺少导出：${missing.join(", ")}`);
});

test("门面的每条 re-export 都能在目标模块里找到同名导出", () => {
  const groups = reExports(facade);
  assert.ok(groups.length > 0, "门面应当只有转出语句");

  const problems = [];
  for (const group of groups) {
    const sourcePath = resolveSource(group.target);
    if (!sourcePath) {
      problems.push(`${group.target}：目标文件不存在`);
      continue;
    }
    const available = exportedNames(readFileSync(sourcePath, "utf8"));
    for (const name of group.names) {
      if (!available.has(name)) problems.push(`${group.target} 没有导出 ${name}`);
    }
  }
  assert.deepEqual(problems, []);
});
