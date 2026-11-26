import assert from "node:assert/strict";
import { test } from "node:test";
import { ANCHOR_TOLERANCE, FOLLOW_THRESHOLD, findLastUserIndex, resolveFollowMode } from "./follow-mode.ts";

test("findLastUserIndex 找到最近一条用户提问", () => {
  assert.equal(findLastUserIndex([{ role: "user" }, { role: "ai" }, { role: "user" }]), 2);
  assert.equal(findLastUserIndex([{ role: "ai" }, { role: "process" }]), -1);
  assert.equal(findLastUserIndex([]), -1);
});

test("resolveFollowMode 停在锚点附近就钉住当前这一轮", () => {
  assert.equal(resolveFollowMode({ anchorDelta: 0, distanceToBottom: 900 }), "anchor");
  assert.equal(resolveFollowMode({ anchorDelta: ANCHOR_TOLERANCE, distanceToBottom: 900 }), "anchor");
  assert.equal(resolveFollowMode({ anchorDelta: -ANCHOR_TOLERANCE, distanceToBottom: 900 }), "anchor");
});

test("resolveFollowMode 用户往下滚看最新一段就改为跟底", () => {
  assert.equal(resolveFollowMode({ anchorDelta: 400, distanceToBottom: 0 }), "tail");
  assert.equal(resolveFollowMode({ anchorDelta: 400, distanceToBottom: FOLLOW_THRESHOLD }), "tail");
});

test("resolveFollowMode 用户自己翻历史时不抢滚动条", () => {
  assert.equal(resolveFollowMode({ anchorDelta: -400, distanceToBottom: 900 }), "free");
  assert.equal(resolveFollowMode({ anchorDelta: 400, distanceToBottom: 900 }), "free");
});

test("resolveFollowMode 没有锚点时只按贴底判断", () => {
  assert.equal(resolveFollowMode({ anchorDelta: null, distanceToBottom: 0 }), "tail");
  assert.equal(resolveFollowMode({ anchorDelta: null, distanceToBottom: 900 }), "free");
});
