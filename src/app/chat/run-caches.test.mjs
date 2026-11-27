import test from "node:test";
import assert from "node:assert/strict";
import { clearConversationCaches } from "./run-caches.ts";

const makeCaches = () => ({
  pendingAutomation: new Map([["1:10", { title: "卡片A" }], ["1:11", { title: "卡片B" }], ["2:10", { title: "别人的" }]]),
  launchAutomation: new Map([["1:10", { prompt: "x" }], ["2:10", { prompt: "y" }]]),
  confirmedByRound: new Map([["1:0", 1], ["1:1", 2], ["2:0", 1]]),
  realToolMode: new Map([[1, true], [2, true]]),
});

test("删除会话时清掉该会话的全部运行期缓存，别的不动", () => {
  const caches = makeCaches();
  const removed = clearConversationCaches(1, caches);

  assert.deepEqual([...caches.pendingAutomation.keys()], ["2:10"]);
  assert.deepEqual([...caches.launchAutomation.keys()], ["2:10"]);
  assert.deepEqual([...caches.confirmedByRound.keys()], ["2:0"]);
  assert.deepEqual([...caches.realToolMode.keys()], [2]);
  // 2 + 1 + 2 个字符串键 + 1 个数字键
  assert.equal(removed, 6);
});

test("会话 id 前缀按「id:」精确匹配，不会误删 10 这类前缀相同的会话", () => {
  const caches = {
    pendingAutomation: new Map([["1:1", {}], ["10:1", {}], ["11:1", {}]]),
    launchAutomation: new Map(),
    confirmedByRound: new Map(),
    realToolMode: new Map(),
  };
  clearConversationCaches(1, caches);
  assert.deepEqual([...caches.pendingAutomation.keys()], ["10:1", "11:1"]);
});

test("没有该会话的缓存时是空操作", () => {
  const caches = makeCaches();
  const before = JSON.stringify([...caches.pendingAutomation.keys()]);
  assert.equal(clearConversationCaches(99, caches), 0);
  assert.equal(JSON.stringify([...caches.pendingAutomation.keys()]), before);
});
