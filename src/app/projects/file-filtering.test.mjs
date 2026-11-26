import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeUploaders,
  formatByExtension,
  hasActiveFileFilters,
  matchFileFilters,
} from "./file-filtering.ts";

const file = (overrides = {}) => ({
  name: "周报.xlsx",
  format: "表格",
  modified: new Date("2026-11-20T10:00:00"),
  owner: "我",
  status: "enabled",
  ...overrides,
});
const options = (overrides = {}) => ({ formats: [], timeFilter: null, ...overrides });

test("formatByExtension classifies the formats used by the library", () => {
  assert.equal(formatByExtension("report.docx"), "文档");
  assert.equal(formatByExtension("data.csv"), "表格");
  assert.equal(formatByExtension("notes.md"), "其他");
});

test("format filters are multi-select and exclusive on other fields", () => {
  assert.equal(matchFileFilters(file(), options({ formats: ["文档", "表格"] })), true);
  assert.equal(matchFileFilters(file(), options({ formats: ["文档"] })), false);
  assert.equal(matchFileFilters(file(), options({ query: " 周报 " })), true);
  assert.equal(matchFileFilters(file(), options({ query: "月报" })), false);
});

test("status and uploader filters combine instead of overwriting each other", () => {
  assert.equal(matchFileFilters(file(), options({ statuses: ["enabled"] })), true);
  assert.equal(matchFileFilters(file(), options({ statuses: ["disabled"] })), false);
  assert.equal(matchFileFilters(file({ owner: "张三" }), options({ uploader: { mine: true, members: [] } })), false);
  assert.equal(matchFileFilters(file({ owner: "张三" }), options({ uploader: { mine: false, members: ["张三"] } })), true);
});

test("custom time range applies after both endpoints are chosen", () => {
  const range = { kind: "custom", from: new Date("2026-11-19"), to: new Date("2026-11-21") };
  assert.equal(matchFileFilters(file(), options({ timeFilter: range })), true);
  assert.equal(matchFileFilters(file({ modified: new Date("2026-11-01") }), options({ timeFilter: range })), false);
  assert.equal(hasActiveFileFilters([], range), true);
  assert.equal(hasActiveFileFilters([], null), false);
});

test("uploader summary keeps the existing wording", () => {
  assert.equal(describeUploaders([]), "");
  assert.equal(describeUploaders(["张三"]), "张三");
  assert.equal(describeUploaders(["张三", "李四"]), "张三、李四");
  assert.equal(describeUploaders(["张三", "李四", "王五"]), "张三、李四等 3人");
});
