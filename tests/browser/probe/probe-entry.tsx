// App 用的同一份桥接（src/app/chat/use-conversation-store.ts）挂到真实 StrictMode 下。
// 断言只看「已提交到 DOM 的结果」和「store 的同步状态」是否一致，
// 不依赖 reducer 重放测试，也不为换 API 而换 API。
import { StrictMode, startTransition, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useConversationStore } from "../../../src/app/chat/use-conversation-store.ts";
import type { ConversationState } from "../../../src/app/chat/conversation-state.ts";
import type { ConversationAction } from "../../../src/app/chat/conversation-state.ts";
import type { ConversationStore } from "../../../src/app/chat/conversation-store.ts";

const stats = { renders: 0, commits: 0, mountEffectRuns: 0 };

function serialize(state: ConversationState) {
  return {
    activeId: state.activeId,
    unread: [...state.unread].sort((a, b) => a - b),
    conversations: state.conversations.map(item => ({
      id: item.id,
      title: item.title,
      messages: item.messages.map(message => message.text ?? message.role),
    })),
    draft: state.draft.map(message => message.text ?? message.role),
  };
}

type Serialized = ReturnType<typeof serialize>;

type ProbeApi = {
  ready: boolean;
  snapshot: () => { stored: Serialized; rendered: Serialized; renders: number; commits: number; mountEffectRuns: number };
  addConversation: (id: number, title?: string) => void;
  select: (id: number | null) => void;
  appendMessage: (id: number | null, text: string) => void;
  deleteConversation: (id: number) => void;
  // 同一个调用里连发多次：React 18 会合成一次提交，用来验证批处理不丢更新。
  batchAdd: (count: number) => void;
  // 低优先级更新后紧跟一次同步更新：最终必须停在最后一次快照，不能被旧快照盖回去。
  transitionThenSync: (transitionId: number, syncId: number) => void;
  // 等两帧，确保测试读到的是提交后的 DOM。
  settle: () => Promise<void>;
};

declare global {
  interface Window {
    __probe: ProbeApi;
  }
}

let currentStore: ConversationStore | null = null;
let currentDispatch: ((action: ConversationAction) => void) | null = null;

const dispatchOrThrow = (action: ConversationAction) => {
  if (!currentDispatch) throw new Error("probe 还没挂载完");
  currentDispatch(action);
};

const api: ProbeApi = {
  ready: false,
  snapshot: () => {
    const node = document.getElementById("view");
    const rendered = JSON.parse(node?.dataset.json ?? "null") as Serialized;
    return {
      stored: serialize(currentStore!.getState()),
      rendered,
      renders: Number(node?.dataset.renders ?? 0),
      commits: Number(node?.dataset.commits ?? 0),
      mountEffectRuns: Number(node?.dataset.mountEffects ?? 0),
    };
  },
  addConversation: (id, title = `会话${id}`) => {
    dispatchOrThrow({ type: "updateConversations", updater: prev => [
      ...prev.filter(item => item.id !== id),
      { id, title, createdAt: id, messages: [] },
    ] });
  },
  select: id => dispatchOrThrow({ type: "select", id }),
  appendMessage: (id, text) => dispatchOrThrow({
    type: "updateMessages",
    id,
    updater: prev => [...prev, { role: "user", text }],
  }),
  deleteConversation: id => dispatchOrThrow({ type: "updateConversations", updater: prev => prev.filter(item => item.id !== id) }),
  batchAdd: count => {
    for (let i = 0; i < count; i += 1) {
      const id = 200 + i;
      dispatchOrThrow({ type: "updateConversations", updater: prev => [...prev, { id, title: `批量${id}`, createdAt: id, messages: [] }] });
    }
  },
  transitionThenSync: (transitionId, syncId) => {
    startTransition(() => {
      dispatchOrThrow({ type: "updateConversations", updater: prev => [...prev, { id: transitionId, title: `过渡${transitionId}`, createdAt: transitionId, messages: [] }] });
    });
    dispatchOrThrow({ type: "updateConversations", updater: prev => [...prev, { id: syncId, title: `同步${syncId}`, createdAt: syncId, messages: [] }] });
  },
  settle: () => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }),
};

function Probe() {
  const { state, store, dispatch } = useConversationStore();
  stats.renders += 1;
  const json = JSON.stringify(serialize(state));

  // 只在提交后暴露给测试；渲染阶段不写外部状态。
  useEffect(() => {
    currentStore = store;
    currentDispatch = dispatch;
    api.ready = true;
  }, [store, dispatch]);

  // 没有依赖的 effect：每次提交后跑一次，用来数「提交次数」（StrictMode 下渲染会双调用，提交不会）。
  useEffect(() => {
    stats.commits += 1;
  });

  // 挂载期写一次（effect 阶段），覆盖「提交之后才 dispatch」这条时序。
  // 用幂等写法：StrictMode 会把 effect 跑两遍，这里必须仍然只有一条。
  useEffect(() => {
    stats.mountEffectRuns += 1;
    dispatch({ type: "updateConversations", updater: prev => (
      prev.some(item => item.id === 100) ? prev : [...prev, { id: 100, title: "挂载期会话", createdAt: 0, messages: [] }]
    ) });
  }, [dispatch]);

  return (
    <div
      id="view"
      data-json={json}
      data-renders={String(stats.renders)}
      data-commits={String(stats.commits)}
      data-mount-effects={String(stats.mountEffectRuns)}
    />
  );
}

window.__probe = api;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
