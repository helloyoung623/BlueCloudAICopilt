import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampSidebarWidth,
  readStoredSidebarWidth,
  resolveDraggedSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
  storeSidebarWidth,
} from "./sidebar-width.ts";

// 装一个假的 localStorage：源码用的是 window.localStorage，Node 里没有 window
function withFakeStorage(run) {
  const original = globalThis.window;
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
    },
  };
  try {
    run({ data });
  } finally {
    globalThis.window = original;
  }
}

test("clampSidebarWidth 把宽度夹在 200 ~ 480 之间", () => {
  assert.equal(clampSidebarWidth(240), 240);
  assert.equal(clampSidebarWidth(320), 320);
  assert.equal(clampSidebarWidth(150), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(0), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(600), SIDEBAR_WIDTH_MAX);
  assert.equal(clampSidebarWidth(9999), SIDEBAR_WIDTH_MAX);
});

test("clampSidebarWidth 宽度不是数字时回落到默认宽度", () => {
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH_DEFAULT);
  assert.equal(clampSidebarWidth(Number.POSITIVE_INFINITY), SIDEBAR_WIDTH_DEFAULT);
  assert.equal(clampSidebarWidth(Number.NEGATIVE_INFINITY), SIDEBAR_WIDTH_DEFAULT);
});

test("clampSidebarWidth 取整到整数像素", () => {
  assert.equal(clampSidebarWidth(300.4), 300);
  assert.equal(clampSidebarWidth(299.6), 300);
});

test("resolveDraggedSidebarWidth 按拖动位移改宽", () => {
  // 往右拖 60 → 240 + 60 = 300
  assert.equal(resolveDraggedSidebarWidth(240, 100, 160), 300);
  // 往左拖 60 → 240 - 60 = 180，但最窄只能到 200
  assert.equal(resolveDraggedSidebarWidth(240, 100, 40), SIDEBAR_WIDTH_MIN);
  // 往右拖很多 → 最宽到 480
  assert.equal(resolveDraggedSidebarWidth(240, 100, 900), SIDEBAR_WIDTH_MAX);
});

test("readStoredSidebarWidth 没有记录时用默认宽度", () => {
  withFakeStorage(() => {
    assert.equal(readStoredSidebarWidth(), SIDEBAR_WIDTH_DEFAULT);
  });
});

test("readStoredSidebarWidth 读回上次记住的宽度", () => {
  withFakeStorage(({ data }) => {
    data.set(SIDEBAR_WIDTH_STORAGE_KEY, "320");
    assert.equal(readStoredSidebarWidth(), 320);
  });
});

test("readStoredSidebarWidth 记录损坏或超范围时按默认 / 边界处理", () => {
  withFakeStorage(({ data }) => {
    data.set(SIDEBAR_WIDTH_STORAGE_KEY, "abc");
    assert.equal(readStoredSidebarWidth(), SIDEBAR_WIDTH_DEFAULT);
    data.set(SIDEBAR_WIDTH_STORAGE_KEY, "9999");
    assert.equal(readStoredSidebarWidth(), SIDEBAR_WIDTH_MAX);
    data.set(SIDEBAR_WIDTH_STORAGE_KEY, "10");
    assert.equal(readStoredSidebarWidth(), SIDEBAR_WIDTH_MIN);
  });
});

test("storeSidebarWidth 记住宽度并按边界夹紧", () => {
  withFakeStorage(({ data }) => {
    storeSidebarWidth(300);
    assert.equal(data.get(SIDEBAR_WIDTH_STORAGE_KEY), "300");
    assert.equal(readStoredSidebarWidth(), 300);
    storeSidebarWidth(50);
    assert.equal(data.get(SIDEBAR_WIDTH_STORAGE_KEY), String(SIDEBAR_WIDTH_MIN));
    storeSidebarWidth(9999);
    assert.equal(data.get(SIDEBAR_WIDTH_STORAGE_KEY), String(SIDEBAR_WIDTH_MAX));
  });
});

test("localStorage 不可用时不报错，按默认宽度走", () => {
  const original = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() { throw new Error("不可用"); },
      setItem() { throw new Error("不可用"); },
    },
  };
  try {
    assert.equal(readStoredSidebarWidth(), SIDEBAR_WIDTH_DEFAULT);
    storeSidebarWidth(300);
  } finally {
    globalThis.window = original;
  }
});
