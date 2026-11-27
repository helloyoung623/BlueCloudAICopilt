import { useCallback, useReducer, useRef } from "react";
import { adoptConversationSnapshot, initialConversationState } from "./conversation-state.ts";
import type { ConversationAction, ConversationState } from "./conversation-state.ts";
import { createConversationStore } from "./conversation-store.ts";
import type { ConversationStore } from "./conversation-store.ts";

// store 与 React 之间唯一的桥接实现（App 与浏览器挂载测试共用同一份代码）：
// - 写：dispatch 只进 store，store 同步算完一次后把整份快照推给 React（replace 动作）；
// - 读：React 只采纳快照，不重跑 updater，所以 StrictMode 双调用 / 批处理 / 低优先级渲染
//   都不会产生第二份状态，也不存在「渲染期读到比已提交状态更新的 store」这种撕裂
//   （渲染读的一直是本组件 state 里那一份完整快照）。
export type ConversationBinding = {
  state: ConversationState;
  store: ConversationStore;
  dispatch: (action: ConversationAction) => void;
};

export function useConversationStore(): ConversationBinding {
  const [state, adopt] = useReducer(adoptConversationSnapshot, initialConversationState);

  // 懒初始化：store 只创建一次，publish 直接走 React 的 dispatch。
  // StrictMode 首渲染会调用两次渲染函数，可能创建一个随后被丢弃的实例；
  // 它拿不到任何 dispatch（effect / 事件都在提交之后），因此不会分叉出第二份状态。
  const storeRef = useRef<ConversationStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createConversationStore(initialConversationState, next => {
      adopt({ type: "replace", state: next });
    });
  }
  const store = storeRef.current;

  const dispatch = useCallback((action: ConversationAction) => {
    store.dispatch(action);
  }, [store]);

  return { state, store, dispatch };
}
