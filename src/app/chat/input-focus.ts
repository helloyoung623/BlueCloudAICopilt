// 新建任务后自动聚焦输入框：跨首页 / 会话页 / 项目页三处 ChatInput 统一生效。
// 用模块级「请求令牌 + 订阅」而不是层层传 props：
//   - handleNewChat 只发一次请求，不关心当前渲染的是哪一页、哪个 ChatInput；
//   - 各 ChatInput 订阅令牌，令牌变化就 focus 自己的 textarea。
// 请求方延后一个宏任务再发（见 App.handleNewChat），确保 React 已完成
// 「旧对话 → 新首页」的重渲染，新挂载的 ChatInput 已经订阅上。
let generation = 0;
const listeners = new Set<() => void>();

export const subscribeInputFocus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getInputFocusGeneration = () => generation;

export function requestInputFocus() {
  generation += 1;
  listeners.forEach(listener => listener());
}
