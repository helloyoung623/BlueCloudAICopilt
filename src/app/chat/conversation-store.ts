import { conversationReducer } from "./conversation-state.ts";
import type { ConversationAction, ConversationState } from "./conversation-state.ts";

// 会话状态的唯一可信来源：dispatch 时同步跑一次 reducer，得到唯一一份新状态；
// React 侧只通过 publish 拿到同一份快照（replace），不会再次执行 updater。
// 这样 Date.now / ref 修改等不纯逻辑在一次 dispatch 里只发生一次，
// 也不会被 React 的 StrictMode、批处理或低优先级渲染重放成第二份结果。
export type ConversationStore = {
  getState: () => ConversationState;
  dispatch: (action: ConversationAction) => void;
};

export function createConversationStore(
  initial: ConversationState,
  publish: (next: ConversationState) => void,
): ConversationStore {
  let current = initial;
  // 重入保护：updater / publish 里再次 dispatch（原来是 React 队列会排队）。
  // 同步 store 如果直接递归执行，外层 reducer 返回后会用自己的结果覆盖内层更新，
  // 内层那次就被静默丢掉了。这里按调用顺序排队，外层算完再依次应用。
  const queue: ConversationAction[] = [];
  let draining = false;

  const drain = () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        const action = queue.shift() as ConversationAction;
        const next = conversationReducer(current, action);
        // reducer 返回同一对象 = 没有变化：既不替换快照，也不通知渲染。
        if (next === current) continue;
        current = next;
        publish(next);
      }
    } catch (error) {
      // updater 抛错：这一批剩下的动作是依赖失败那次更新的嵌套写入，一起丢掉，
      // 状态停在最后一次成功应用的位置，不留半套结果。
      queue.length = 0;
      throw error;
    } finally {
      draining = false;
    }
  };

  return {
    getState: () => current,
    dispatch(action) {
      queue.push(action);
      drain();
    },
  };
}
