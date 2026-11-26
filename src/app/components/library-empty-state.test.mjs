import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLibraryEmptyState } from "./library-empty-state.ts";

test("an empty library keeps 暂无资料 and offers no recovery action", () => {
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 0, query: "", filtersActive: false }), {
    title: "暂无资料",
    recovery: null,
  });
  // 资料库本来就没有文件时，搜索和筛选都不该推出恢复按钮
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 0, query: "周报", filtersActive: true }), {
    title: "暂无资料",
    recovery: null,
  });
});

test("a search on its own offers clearing the search", () => {
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 30, query: "月报", filtersActive: false }), {
    title: "未找到相关资料",
    recovery: { action: "clear-search", label: "清空搜索" },
  });
});

test("a search of only whitespace counts as no search", () => {
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 30, query: "   ", filtersActive: false }), {
    title: "暂无资料",
    recovery: null,
  });
});

test("filters on their own offer resetting the filters", () => {
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 30, query: "", filtersActive: true }), {
    title: "没有符合筛选条件的资料",
    recovery: { action: "reset-filters", label: "重置筛选" },
  });
});

test("search and filters together offer clearing both at once", () => {
  assert.deepEqual(resolveLibraryEmptyState({ totalCount: 30, query: "月报", filtersActive: true }), {
    title: "没有符合搜索和筛选条件的资料",
    recovery: { action: "clear-search-and-filters", label: "清除搜索和筛选" },
  });
});
