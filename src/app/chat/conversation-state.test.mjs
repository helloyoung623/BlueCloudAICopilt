import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveUnreadState,
  findLastIndex,
  freezePreviousMessages,
  getAnswerDoneKey,
  markConversationRead,
  toInstantMessages,
  updateConversationInHistory,
} from "./conversation-state.ts";

const msg = (role, extra = {}) => ({ role, text: "", ...extra });

test("getAnswerDoneKey uses the stable run id when present", () => {
  const messages = [
    msg("user", { text: "hi" }),
    msg("ai", { text: "draft", runId: 7, followUps: ["later"] }),
  ];
  assert.equal(getAnswerDoneKey(12, messages), "12|run-7");
  // 正文和追问变化都不应改变 key
  assert.equal(getAnswerDoneKey(12, [messages[0], { ...messages[1], text: "longer", followUps: ["a", "b"] }]), "12|run-7");
});

test("getAnswerDoneKey falls back for demo messages and returns null with no answer", () => {
  assert.equal(getAnswerDoneKey(null, [msg("ai", { text: "demo", followUps: ["a", "b"] })]), "draft|demo|a|b");
  assert.equal(getAnswerDoneKey(3, [msg("user")]), null);
});

test("freezePreviousMessages keeps running process untouched and marks old messages instant", () => {
  const messages = [
    msg("user", { text: "old" }),
    msg("ai", { text: "old answer" }),
    msg("process", { thinking: true, text: "running" }),
    msg("process", { thinking: false, text: "done" }),
  ];
  const next = freezePreviousMessages(messages);
  assert.equal(next[0].instant, true);
  assert.equal(next[1].instant, true);
  assert.equal(next[2].instant, undefined);
  assert.equal(next[2].thinking, true);
  assert.equal(next[3].instant, true);
  assert.equal(messages[0].instant, undefined, "原数组不被修改");
});

test("toInstantMessages clears the typewriter flag for history loads", () => {
  const [next] = toInstantMessages([msg("ai", { needsTypewriter: true })]);
  assert.equal(next.instant, true);
  assert.equal(next.needsTypewriter, false);
});

test("updateConversationInHistory only updates the target conversation", () => {
  const history = [
    { id: 1, title: "A", messages: [msg("user", { text: "a" })] },
    { id: 2, title: "B", messages: [msg("user", { text: "b" })] },
  ];
  const next = updateConversationInHistory(history, 2, list => [...list, msg("ai", { text: "reply" })]);
  assert.equal(next[0], history[0]);
  assert.equal(next[1].messages.length, 2);
  assert.equal(next[1].messages[1].text, "reply");
  assert.equal(history[1].messages.length, 1, "原历史不被修改");
});

test("deriveUnreadState completes tasks and clears unread for tasks still running", () => {
  const history = [
    { id: 1, title: "完成的任务", messages: [msg("process", { thinking: false }), msg("ai", { text: "done" })] },
    { id: 2, title: "仍在运行", messages: [msg("process", { thinking: true })] },
  ];
  const previousThinking = new Map([[1, true], [2, false]]);
  const derived = deriveUnreadState(history, previousThinking, null, new Set([2]));

  assert.deepEqual([...derived.unread], [1]);
  assert.equal(derived.thinking.get(1), false);
  assert.equal(derived.thinking.get(2), true);
});

test("deriveUnreadState does not mark the active conversation unread", () => {
  const history = [{ id: 9, title: "当前", messages: [msg("process", { thinking: false }), msg("ai")] }];
  const derived = deriveUnreadState(history, new Map([[9, true]]), 9, new Set());
  assert.equal(derived.unread.size, 0);
});

test("markConversationRead removes only the opened task", () => {
  const next = markConversationRead(new Set([1, 2]), 2);
  assert.deepEqual([...next], [1]);
  assert.equal(markConversationRead(new Set([1]), 9).size, 1);
});

test("findLastIndex matches native semantics without ES2023 lib", () => {
  const items = [{ v: 1 }, { v: 2 }, { v: 2 }];
  assert.equal(findLastIndex(items, item => item.v === 2), 2);
  assert.equal(findLastIndex(items, () => false), -1);
});
