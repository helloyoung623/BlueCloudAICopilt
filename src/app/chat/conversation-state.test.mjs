import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adoptConversationSnapshot,
  conversationReducer,
  deriveRunningTaskIds,
  deriveUnreadState,
  findLastIndex,
  freezePreviousMessages,
  getAnswerDoneKey,
  initialConversationState,
  markConversationRead,
  sameIdSet,
  sameSidebarTasks,
  toInstantMessages,
  toSidebarTasks,
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

const withConversations = (conversations, activeId = null) => {
  const seeded = conversationReducer(initialConversationState, {
    type: "updateConversations",
    updater: () => conversations,
  });
  return conversationReducer(seeded, { type: "select", id: activeId });
};

test("活动会话消息只有一份：写入直接落在会话上，切走再回来内容不变", () => {
  const base = withConversations([
    { id: 1, title: "A", messages: [msg("user", { text: "问题一" })] },
    { id: 2, title: "B", messages: [msg("user", { text: "问题二" })] },
  ], 1);
  const updated = conversationReducer(base, {
    type: "updateMessages",
    id: 1,
    updater: list => [...list, msg("ai", { text: "回答一" })],
  });
  assert.equal(updated.conversations[0].messages.length, 2);
  assert.equal(updated.conversations[1], base.conversations[1]);
  assert.deepEqual(updated.draft, [], "活动消息不会复制进草稿");

  const away = conversationReducer(updated, { type: "select", id: null });
  assert.equal(away.conversations[0].messages, updated.conversations[0].messages, "切走不改历史消息");
  const back = conversationReducer(away, { type: "select", id: 1 });
  assert.equal(back.conversations[0].messages.length, 2, "切回来仍只有那一份消息");
  assert.equal(base.conversations[0].messages.length, 1, "reducer 不修改原状态");
});

test("未建会话时的消息留在草稿，建会话后写入目标会话不串到草稿", () => {
  let state = conversationReducer(initialConversationState, {
    type: "updateMessages",
    id: null,
    updater: list => [...list, msg("user", { text: "草稿问题" })],
  });
  assert.equal(state.draft.length, 1);
  state = conversationReducer(state, {
    type: "updateConversations",
    updater: () => [{ id: 7, title: "草稿问题", messages: [] }],
  });
  state = conversationReducer(state, { type: "select", id: 7 });
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 7,
    updater: list => [...list, msg("ai", { text: "回答" })],
  });
  assert.equal(state.draft.length, 1, "草稿独立保留");
  assert.equal(state.conversations[0].messages.length, 1);
  assert.equal(state.conversations[0].messages[0].text, "回答");
});

test("后台会话完成后未读由 reducer 派生，打开即清除", () => {
  let state = withConversations([
    { id: 1, title: "当前", messages: [] },
    { id: 2, title: "后台", messages: [] },
  ], 1);
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 2,
    updater: () => [msg("process", { thinking: true })],
  });
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 2,
    updater: () => [msg("process", { thinking: false }), msg("ai", { text: "后台回答" })],
  });
  assert.deepEqual([...state.unread], [2], "不在看的会话完成才标未读");
  assert.equal(state.conversations[1].messages[1].text, "后台回答", "后台消息没有丢");

  state = conversationReducer(state, { type: "select", id: 2 });
  assert.equal(state.unread.size, 0, "打开会话立即已读");
});

test("删除会话后迟到的消息回调不会重建会话或污染别的会话", () => {
  let state = withConversations([
    { id: 1, title: "保留", messages: [msg("user", { text: "a" })] },
    { id: 2, title: "删除", messages: [] },
  ], 1);
  state = conversationReducer(state, { type: "updateConversations", updater: list => list.filter(item => item.id !== 2) });
  const afterDelete = state;
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 2,
    updater: list => [...list, msg("ai", { text: "迟到" })],
  });
  assert.equal(state, afterDelete, "不存在的会话更新被忽略");
  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversations[0].title, "保留");
});

test("切换会话期间后台流继续更新原会话，切回来内容不丢也不串台", () => {
  let state = withConversations([
    { id: 1, title: "A", messages: [msg("user", { text: "问题" }), msg("process", { thinking: true, runId: 9 })] },
    { id: 2, title: "B", messages: [msg("user", { text: "另一个问题" })] },
  ], 1);
  const beforeSwitch = state.conversations[0].messages;

  state = conversationReducer(state, { type: "select", id: null });
  assert.equal(state.conversations[0].messages, beforeSwitch, "切走本身不改写消息");

  // 切走后这条会话的流式回调按 id 继续落库：先出正文，再把 streaming 收尾。
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 1,
    updater: list => [
      ...list.slice(0, -1),
      msg("process", { thinking: false, runId: 9 }),
      msg("ai", { text: "后台正文", runId: 9, streaming: true }),
    ],
  });
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 1,
    updater: list => list.map(m => (m.streaming ? { ...m, text: "后台正文完整", streaming: false } : m)),
  });

  assert.equal(state.conversations[0].messages[2].text, "后台正文完整");
  assert.equal(state.conversations[1].messages.length, 1, "另一个会话没有被牵连");
  assert.deepEqual(state.draft, [], "后台更新不会复制进草稿");

  state = conversationReducer(state, { type: "select", id: 2 });
  assert.equal(state.conversations[0].messages[2].text, "后台正文完整", "看别的会话时原会话内容仍在");
  state = conversationReducer(state, { type: "select", id: 1 });
  assert.equal(state.conversations[0].messages[2].text, "后台正文完整", "切回来看到的是后台更新的内容");
  assert.equal(beforeSwitch.length, 2, "reducer 不修改旧快照");
});

test("切回会话时的 instant 标记基于 reducer 当前消息，旧快照不会覆盖后台更新", () => {
  let state = withConversations([
    { id: 1, title: "A", messages: [msg("user", { text: "问题" })] },
  ], 1);
  const staleSnapshot = state.conversations[0].messages;
  state = conversationReducer(state, { type: "select", id: null });
  state = conversationReducer(state, {
    type: "updateMessages",
    id: 1,
    updater: list => [...list, msg("ai", { text: "刚到的后台回答" })],
  });
  state = conversationReducer(state, { type: "select", id: 1 });

  // App 的切回路径：用 updater 在 reducer 内标记 instant，而不是写切换前取到的数组。
  state = conversationReducer(state, { type: "updateMessages", id: 1, updater: toInstantMessages });
  const messages = state.conversations[0].messages;
  assert.equal(messages.length, 2, "刚到的后台回答没有被旧快照盖掉");
  assert.equal(messages[1].text, "刚到的后台回答");
  assert.ok(messages.every(m => m.instant && m.needsTypewriter === false), "历史消息不重播打字机");
  assert.equal(staleSnapshot.length, 1, "旧快照保持不可变");
});

// ── 侧栏投影：只保留轻量字段，流式正文变化不影响它 ─────────────────────────────
const conversation = (id, extra = {}) => ({ id, title: `任务 ${id}`, messages: [msg("user", { text: "hi" })], ...extra });

test("toSidebarTasks 丢掉消息正文，其余字段原样保留", () => {
  const tasks = toSidebarTasks([conversation(1, { projectId: 9, pinned: true, createdAt: 1700 })]);
  assert.deepEqual(tasks, [{ id: 1, title: "任务 1", projectId: 9, pinned: true, createdAt: 1700 }]);
  assert.equal("messages" in tasks[0], false, "侧栏投影不应带 messages");
});

test("sameSidebarTasks 只比较轻量字段：正文追加不算变化，标题/归属/置顶/归档改动算变化", () => {
  const before = toSidebarTasks([conversation(1), conversation(2, { projectId: 3 })]);
  const afterStreaming = toSidebarTasks([
    { ...conversation(1), messages: [msg("user", { text: "hi" }), msg("ai", { text: "流式正文" })] },
    conversation(2, { projectId: 3 }),
  ]);
  assert.equal(sameSidebarTasks(before, afterStreaming), true, "流式正文增长不应让侧栏认为任务变了");

  assert.equal(sameSidebarTasks(before, toSidebarTasks([{ ...conversation(1), title: "改名" }, conversation(2, { projectId: 3 })])), false);
  assert.equal(sameSidebarTasks(before, toSidebarTasks([conversation(1), conversation(2, { projectId: 4 })])), false);
  assert.equal(sameSidebarTasks(before, toSidebarTasks([conversation(1, { pinned: true }), conversation(2, { projectId: 3 })])), false);
  assert.equal(sameSidebarTasks(before, toSidebarTasks([conversation(1, { archived: true }), conversation(2, { projectId: 3 })])), false);
  assert.equal(sameSidebarTasks(before, toSidebarTasks([conversation(2, { projectId: 3 })])), false, "数量变化算变化");
});

test("deriveRunningTaskIds 带上后台在执行中的会话，活动会话按传入标记补", () => {
  const conversations = [
    { ...conversation(1), messages: [msg("process", { thinking: true })] },
    { ...conversation(2), messages: [msg("ai", { text: "done" })] },
  ];
  assert.deepEqual([...deriveRunningTaskIds(conversations, null, false)], [1]);
  assert.deepEqual([...deriveRunningTaskIds(conversations, 2, true)], [1, 2], "当前会话正文完但推荐问题未落地时也算执行中");
  assert.deepEqual([...deriveRunningTaskIds(conversations, 2, false)], [1], "当前会话已完成时不补");
  assert.deepEqual([...deriveRunningTaskIds(conversations, null, true)], [1], "没有活动会话时不补任何 id");
});

test("sameIdSet 按内容比较，避免每帧新建 Set 让 memo 失效", () => {
  assert.equal(sameIdSet(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(sameIdSet(new Set([1]), new Set([1, 2])), false);
  assert.equal(sameIdSet(new Set(), new Set()), true);
});

// 未读集合直接进 ConversationDomain，被 Sidebar 的 Context 当依赖读。
// 内容没变却换了新 Set，侧栏就会跟着每一个流式 token 重渲染（memo 也拦不住）。
test("未读内容没变时保持同一份引用：流式更新不会让侧栏每帧换依赖", () => {
  const conversations = [{ id: 1, title: "任务", createdAt: 0, messages: [msg("process", { thinking: true })] }];
  const thinking = new Map([[1, true]]);
  // 1 号还在执行（清未读）、2 号早就是未读：这一帧未读内容不变
  const unread = new Set([2]);

  const running = deriveUnreadState(conversations, thinking, 1, unread);
  assert.equal(running.unread, unread, "没有未读变化时必须返回原集合");

  assert.equal(markConversationRead(unread, 1), unread, "已读集合里没有这个 id 时不换新 Set");

  // 真正清掉未读时才换新集合
  const cleared = markConversationRead(new Set([1, 2]), 1);
  assert.notEqual(cleared, undefined);
  assert.deepEqual([...cleared], [2]);
  assert.notEqual(cleared, unread);
});

test("reducer 连续更新消息时 unread 引用不变（未读没有变化）", () => {
  let state = conversationReducer(initialConversationState, {
    type: "updateConversations",
    updater: () => [{ id: 1, title: "任务", createdAt: 0, messages: [] }],
  });
  state = conversationReducer(state, { type: "select", id: 1 });
  const unread = state.unread;

  // 模拟一串流式更新：每个 token 一次 updateMessages
  for (let i = 0; i < 3; i += 1) {
    const next = conversationReducer(state, {
      type: "updateMessages",
      id: 1,
      updater: prev => [...prev, msg("ai", { text: `片段${i}` })],
    });
    assert.notEqual(next, state, "消息变了，状态要换新对象");
    assert.equal(next.unread, unread, "未读没变，集合引用必须保持");
    state = next;
  }
});

test("React 侧只采纳快照：误传带 updater 的 action 也不会执行副作用", () => {
  const state = conversationReducer(initialConversationState, {
    type: "updateConversations",
    updater: () => [{ id: 1, title: "任务", createdAt: 0, messages: [] }],
  });
  let runs = 0;
  const ignored = adoptConversationSnapshot(state, {
    type: "updateMessages",
    id: 1,
    updater: () => {
      runs += 1;
      return [];
    },
  });
  assert.equal(ignored, state, "非 replace 的 action 不改变 React 侧状态");
  assert.equal(runs, 0, "updater 只允许在 store 里执行一次");

  const snapshot = { ...state, activeId: 1 };
  assert.equal(adoptConversationSnapshot(state, { type: "replace", state: snapshot }), snapshot);
  assert.equal(adoptConversationSnapshot(state, { type: "replace", state: snapshot }), snapshot, "StrictMode 重复调用仍是同一份快照");
});

// ── 删除会话：会话域状态必须一起回收 ─────────────────────────────────────────
// 未读/推荐 key 都按会话 id 记账，会话删了不剔除就会永久留在内存里（每删一个多一条）。
const deletableState = (extra = {}) => ({
  ...initialConversationState,
  conversations: [conversation(1), conversation(2)],
  unread: new Set([1, 2]),
  thinking: new Map([[1, true], [2, false]]),
  shownRecommendations: new Set(["1|run-1", "1|run-2", "2|run-7", "10|run-1"]),
  ...extra,
});

test("删除会话：连带清掉它的未读、执行中记忆和已展示推荐 key", () => {
  const next = conversationReducer(deletableState({ activeId: null }), { type: "deleteConversations", ids: [1] });

  assert.deepEqual(next.conversations.map(item => item.id), [2], "只移除被删除的会话");
  assert.deepEqual([...next.unread], [2], "被删会话的未读要回收");
  assert.equal(next.thinking.has(1), false, "被删会话的执行中记忆要回收");
  assert.deepEqual([...next.shownRecommendations], ["2|run-7", "10|run-1"], "按 `${id}|` 前缀精确清键");
});

test("删除会话：其他会话的数据原样保留，前缀不误伤（id=1 不动 id=10）", () => {
  // 没有打开任何会话时删列表里的任务：2 号的未读、执行中记忆、推荐 key 都必须留下。
  const next = conversationReducer(deletableState({ activeId: null }), { type: "deleteConversations", ids: [1] });

  assert.deepEqual([...next.unread], [2], "2 号的未读保留");
  assert.equal(next.thinking.get(2), false, "2 号的执行中记忆保留");
  assert.equal(next.shownRecommendations.has("2|run-7"), true);
  assert.equal(next.shownRecommendations.has("10|run-1"), true, "10| 的键不能被 1| 的前缀清掉");
  assert.equal(next.conversations[0].messages.length, 1, "留下的会话消息不变");

  // 删的不是当前打开的会话：activeId 不跟着动。
  const whileOpen = conversationReducer(deletableState({ activeId: 2 }), { type: "deleteConversations", ids: [1] });
  assert.equal(whileOpen.activeId, 2, "删的不是当前会话，activeId 不动");
});

test("删除会话：删的是当前打开的会话时退回空白会话，草稿不受影响", () => {
  const draft = [msg("user", { text: "草稿" })];
  const next = conversationReducer(deletableState({ activeId: 1, draft }), { type: "deleteConversations", ids: [1] });

  assert.equal(next.activeId, null, "activeId 不能继续指向已删除的会话");
  assert.equal(next.draft, draft, "草稿不是会话状态，删除会话不能动它");
  assert.deepEqual([...next.unread], [2]);
});

test("删除会话：没有相关记录时保持原引用，删除不存在的 id 不发布新状态", () => {
  const unread = new Set([3]);
  const shownRecommendations = new Set(["3|run-1"]);
  const before = {
    ...initialConversationState,
    conversations: [conversation(1), conversation(3)],
    unread,
    shownRecommendations,
  };

  const next = conversationReducer(before, { type: "deleteConversations", ids: [1] });
  assert.deepEqual(next.conversations.map(item => item.id), [3]);
  assert.equal(next.unread, unread, "未读内容没变就不换引用（侧栏依赖它）");
  assert.equal(next.shownRecommendations, shownRecommendations, "推荐 key 没变也不换引用");

  const missing = conversationReducer(next, { type: "deleteConversations", ids: [99] });
  assert.equal(missing, next, "删不存在的会话是 no-op");
  assert.equal(conversationReducer(next, { type: "deleteConversations", ids: [] }), next, "空 ids 是 no-op");
});

test("批量删除（删项目）：多个会话的会话域状态一起回收", () => {
  const next = conversationReducer(deletableState({ activeId: 2 }), { type: "deleteConversations", ids: [1, 2] });

  assert.deepEqual(next.conversations, []);
  assert.equal(next.unread.size, 0);
  assert.equal(next.thinking.size, 0);
  assert.deepEqual([...next.shownRecommendations], ["10|run-1"], "不属于被删会话的键要留着");
  assert.equal(next.activeId, null);
});
