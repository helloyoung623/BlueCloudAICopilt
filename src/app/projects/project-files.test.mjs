import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSourcesToProject,
  buildImportTasks,
  createCloudSourceFiles,
  parseFileSize,
} from "./project-files.ts";

const fallbackFiles = { sources: [], artifacts: [] };

test("parseFileSize uses the documented units and 2MB fallback", () => {
  assert.equal(parseFileSize("2.9MB"), Math.round(2.9 * 1024 * 1024));
  assert.equal(parseFileSize("860KB"), 860 * 1024);
  assert.equal(parseFileSize("unknown"), 2 * 1024 * 1024);
});

test("cloud files are added as enabled sources owned by me", () => {
  const files = createCloudSourceFiles([{ name: "a.pdf", size: 100 }]);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "a.pdf");
  assert.equal(files[0].owner, "我");
  assert.equal(files[0].status, "enabled");
  assert.equal(files[0].url, "/assets/attachment-example.jpeg");
});

test("addSourcesToProject only touches the target project and appends", () => {
  const original = { sources: [], artifacts: [] };
  const projects = [
    { id: 1, name: "A", instruction: "", files: original },
    { id: 2, name: "B", instruction: "" },
  ];
  const next = addSourcesToProject(projects, [{ name: "a.pdf", size: 10 }], 2, fallbackFiles);
  assert.equal(next[0], projects[0]);
  assert.equal(next[1].files.sources.length, 1);
  assert.equal(next[1].files.sources[0].name, "a.pdf");
  assert.deepEqual(original.sources, [], "原项目文件对象不被修改");
  assert.equal(projects[1].files, undefined, "原项目对象不被修改");
});

test("buildImportTasks reproduces the demo failure positions with deterministic ids", () => {
  const tasks = buildImportTasks(
    [{ name: "a", size: 1 }, { name: "b", size: 2 }, { name: "c", size: 3 }, { name: "d", size: 4 }],
    "OneDrive",
    7,
    { now: () => 1000, random: () => 0.5 },
  );
  assert.deepEqual(tasks.map(t => t.status), ["uploading", "failed", "uploading", "failed"]);
  assert.equal(tasks[1].failKind, "parse");
  assert.equal(tasks[3].failKind, "upload");
  assert.equal(tasks[0].badge, "/assets/badge-onedrive.svg");
  assert.equal(tasks[0].projectId, 7);
  assert.match(tasks[0].id, /^import-1000-0-/);
  assert.equal(new Set(tasks.map(t => t.id)).size, 4);
});

test("non-cloud imports have no badge", () => {
  const [task] = buildImportTasks([{ name: "x", size: 1 }], "产物", 3, { now: () => 1, random: () => 0.1 });
  assert.equal(task.badge, undefined);
  assert.equal(task.status, "uploading");
});
