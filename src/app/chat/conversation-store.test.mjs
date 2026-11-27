import test from "node:test";
import assert from "node:assert/strict";
import { adoptConversationSnapshot, initialConversationState } from "./conversation-state.ts";
import { createConversationStore } from "./conversation-store.ts";

function createStore() {
  const published = [];
  const store = createConversationStore(initialConversationState, next => published.push(next));
  return { store, published };
}

function addConversation(id, title = "任务") {
  return {
    type: "updateConversations",
    updater: current => [{ id, title, createdAt: 0, messages: [] }, ...current],
  };
}

test("每个 action 的 updater 只执行一次，React 采纳同一份快照", () => {
  const { store, published } = createStore();
  let runs = 0;
  let tick = 0;
  store.dispatch({
    type: "updateConversations",
    updater: current => {
      runs += 1;
      // 模拟原来的不纯 updater（Date.now / 外部计数）：只允许跑一次。
      tick += 1;
      return [{ id: 1, title: "任务", createdAt: tick, messages: [] }, ...current];
    },
  });
  assert.equal(runs, 1, "updater 不能同时被 store 和 React reducer 各跑一次");
  assert.equal(published.length, 1);
  assert.equal(published[0], store.getState(), "React 收到的必须是 store 的同一份对象");
  assert.equal(store.getState().conversations[0].createdAt, 1);

  // React 侧只收到 replace，reducer 不会再执行原来的 updater；
  // StrictMode 重复调用 reducer 也必须返回同一份快照。
  const replacedOnce = adoptConversationSnapshot(initialConversationState, { type: "replace", state: published[0] });
  const replacedTwice = adoptConversationSnapshot(initialConversationState, { type: "replace", state: published[0] });
  assert.equal(replacedOnce, published[0]);
  assert.equal(replacedTwice, published[0]);
  assert.equal(runs, 1, "replace 不应再次执行 updater");
});

// 一批内连发多次（SSE 一个事件里写消息 + 改会话 + 置未读）时，React 拿到的是按序的多份快照。
// 这里按 React 的实际行为重放：依次采纳、StrictMode 再打扰一次，最终必须与 store 完全一致。
test("批处理 / StrictMode 重放：采纳完所有快照后与 store 一致", () => {
  const { store, published } = createStore();
  store.dispatch(addConversation(1));
  store.dispatch({ type: "select", id: 1 });
  store.dispatch({ type: "updateMessages", id: 1, updater: () => [{ role: "user", text: "问" }, { role: "ai", text: "答" }] });
  store.dispatch({ type: "updateMessages", id: 1, updater: list => list.map(m => (m.role === "ai" ? { ...m, text: "答完" } : m)) });
  assert.ok(published.length >= 4, "每次真实变化都要通知");

  const replay = strict => {
    let reactState = initialConversationState;
    for (const snapshot of published) {
      const action = { type: "replace", state: snapshot };
      // StrictMode 下 React 会把同一次 dispatch 的 reducer 调两遍
      reactState = adoptConversationSnapshot(adoptConversationSnapshot(reactState, action), action);
    }
    if (strict) {
      // 中途被低优先级打断后重放同一批：结果不能因此不同
      for (const snapshot of published) {
        reactState = adoptConversationSnapshot(reactState, { type: "replace", state: snapshot });
      }
    }
    return reactState;
  };

  assert.equal(replay(false), store.getState());
  assert.equal(replay(true), store.getState());
  assert.deepEqual(replay(true).conversations[0].messages.map(message => message.text), ["问", "答完"]);
});

test("无变化的 action 不产生新快照，也不通知渲染", () => {
  const { store, published } = createStore();
  store.dispatch({ type: "select", id: null });
  store.dispatch({ type: "updateMessages", id: null, updater: current => current });
  assert.equal(published.length, 0);
  assert.equal(store.getState(), initialConversationState);
});

test("新建、更新、删除交错：读取立即可见，已删除会话的迟到写入被丢弃", () => {
  const { store, published } = createStore();
  store.dispatch(addConversation(7, "原定会话"));
  // 还没 React 提交，同步读取就必须能看到新会话
  assert.equal(store.getState().conversations.some(item => item.id === 7), true);

  store.dispatch({
    type: "updateMessages",
    id: 7,
    updater: () => [{ role: "user", text: "任务内容" }],
  });
  assert.equal(store.getState().conversations[0].messages[0].text, "任务内容");

  store.dispatch({ type: "updateConversations", updater: current => current.filter(item => item.id !== 7) });
  assert.equal(store.getState().conversations.some(item => item.id === 7), false);

  // 删除后迟到的流式事件：不能复活会话，也不能改动草稿。
  const beforeLate = store.getState();
  store.dispatch({
    type: "updateMessages",
    id: 7,
    updater: () => [{ role: "ai", text: "迟到内容" }],
  });
  assert.equal(store.getState(), beforeLate, "已删除会话的迟到写入必须是 no-op");
  assert.deepEqual(store.getState().draft, []);

  assert.equal(published.length, 3, "只有三次真实变化通知了 React");
  assert.equal(published.at(-1), store.getState());
});

test("草稿与活动会话交错更新：各自落到自己的消息列表", () => {
  const { store } = createStore();
  store.dispatch({ type: "updateMessages", id: null, updater: () => [{ role: "user", text: "草稿" }] });
  store.dispatch(addConversation(9));
  store.dispatch({ type: "updateMessages", id: 9, updater: () => [{ role: "user", text: "会话消息" }] });
  assert.deepEqual(store.getState().draft.map(message => message.text), ["草稿"]);
  assert.deepEqual(store.getState().conversations[0].messages.map(message => message.text), ["会话消息"]);
});

// store 取代 useReducer 之后，dispatch 变成同步递归执行：updater 里再 dispatch 一次，
// 外层 reducer 返回时会用自己的结果覆盖内层那次更新。必须排队，不能静默丢。
test("updater 里再次 dispatch：内层更新不会被外层覆盖", () => {
  const { store, published } = createStore();
  store.dispatch(addConversation(1));
  const baseCount = published.length;

  store.dispatch({
    type: "updateMessages",
    id: 1,
    updater: prev => {
      // updater 内部的嵌套写入（相当于 React 队列会排队处理的情形）
      store.dispatch({ type: "updateMessages", id: 1, updater: list => [...list, { role: "user", text: "内层" }] });
      return [...prev, { role: "assistant", text: "外层" }];
    },
  });

  assert.deepEqual(
    store.getState().conversations[0].messages.map(message => message.text),
    ["外层", "内层"],
    "两次写入都要生效，且顺序与调用顺序一致",
  );
  assert.equal(published.length, baseCount + 2, "两次变化各自通知一次，不合并也不丢");
  assert.equal(published.at(-1), store.getState());
});

test("updater 抛错：状态停在最后一次成功的快照，嵌套写入不残留", () => {
  const { store } = createStore();
  store.dispatch(addConversation(1));
  const before = store.getState();

  assert.throws(() => {
    store.dispatch({
      type: "updateMessages",
      id: 1,
      updater: () => {
        store.dispatch({ type: "updateMessages", id: 1, updater: () => [{ role: "user", text: "嵌套" }] });
        throw new Error("updater 失败");
      },
    });
  }, /updater 失败/);

  assert.equal(store.getState(), before, "失败的那一批不留下半套状态");
  assert.deepEqual(store.getState().conversations[0].messages, []);

  // 抛错之后仍然可继续使用：残留的队列不会在下次 dispatch 时突然被应用
  store.dispatch({ type: "updateMessages", id: 1, updater: () => [{ role: "user", text: "正常" }] });
  assert.deepEqual(store.getState().conversations[0].messages.map(message => message.text), ["正常"]);
});

// 删除会话走 store 的 deleteConversations：一次 dispatch 只发布一次快照，
// 会话连同它的未读 / 推荐 key 一起消失，且迟到写入不能把它复活。
test("deleteConversations：发布一次快照，会话域状态一起回收，迟到写入不复活", () => {
  const { store, published } = createStore();
  store.dispatch(addConversation(5, "后台完成的会话"));
  store.dispatch({ type: "select", id: 5 });
  store.dispatch({
    type: "updateMessages",
    id: 5,
    updater: () => [{ role: "process", thinking: true }, { role: "ai", text: "完成" }],
  });
  // 切走之后才收尾：算完成但没在看 → 未读
  store.dispatch({ type: "select", id: null });
  store.dispatch({
    type: "updateMessages",
    id: 5,
    updater: list => list.map(message => (message.role === "process" ? { ...message, thinking: false } : message)),
  });
  store.dispatch({ type: "recommendationsShown", key: "5|run-1" });
  assert.deepEqual([...store.getState().unread], [5], "后台完成且不在看 → 未读");
  assert.equal(store.getState().shownRecommendations.has("5|run-1"), true);

  const before = published.length;
  store.dispatch({ type: "deleteConversations", ids: [5] });
  assert.equal(published.length, before + 1, "删除只发布一次快照");
  assert.equal(published.at(-1), store.getState());
  assert.equal(store.getState().conversations.length, 0);
  assert.equal(store.getState().unread.size, 0, "未读随会话一起回收");
  assert.equal(store.getState().shownRecommendations.size, 0, "推荐 key 随会话一起回收");

  const afterDelete = store.getState();
  store.dispatch({ type: "updateMessages", id: 5, updater: () => [{ role: "ai", text: "迟到" }] });
  assert.equal(store.getState(), afterDelete, "已删除会话的迟到写入是 no-op");
  assert.equal(store.getState().unread.size, 0, "迟到写入不会重新标未读");
});
