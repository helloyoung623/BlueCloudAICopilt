import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { SidebarTask } from "./conversation-state";

// 会话域的「读侧」：侧栏只要任务投影、活动 id、两个状态集合和一组语义化操作。
// 不把 messages 放进来：流式正文每来一个 token 都变，侧栏不该跟着重渲染。
export type ConversationDomain = {
  tasks: SidebarTask[];
  activeId: number | null;
  runningTaskIds: ReadonlySet<number>;
  unreadTaskIds: ReadonlySet<number>;
  actions: ConversationActions;
};

// 侧栏对会话的写操作（置顶/重命名/移动/归档/项目级批量），与 reducer 的 dispatch 解耦。
export type ConversationActions = {
  togglePinned: (id: number, pinned: boolean) => void;
  renameTask: (id: number, title: string) => void;
  moveTask: (id: number, projectId: number | undefined) => void;
  archiveTask: (id: number, archived: boolean) => void;
  archiveProjectTasks: (projectId: number, archived: boolean) => void;
  removeProjectTasks: (projectId: number) => void;
};

const ConversationDomainContext = createContext<ConversationDomain | null>(null);

export function ConversationDomainProvider({ value, children }: { value: ConversationDomain; children: ReactNode }) {
  return <ConversationDomainContext.Provider value={value}>{children}</ConversationDomainContext.Provider>;
}

export function useConversationDomain(): ConversationDomain {
  const value = useContext(ConversationDomainContext);
  if (value === null) throw new Error("useConversationDomain 必须在 ConversationDomainProvider 内使用");
  return value;
}

// 内容等价时保留上一份引用：Context value 引用不变，消费方就不会被父级的高频渲染带着重渲染。
export function useStableValue<T>(value: T, isSame: (a: T, b: T) => boolean): T {
  const ref = useRef(value);
  if (!isSame(ref.current, value)) ref.current = value;
  return ref.current;
}

// 把一组回调包成引用恒定、但始终调用最新实现的函数。
// App 里的处理函数都是每次渲染重建的闭包，直接传给 memo 组件会让 memo 永远失效；
// 包一层之后，引用稳定且语义不变（调用时读到的仍是已提交那一版的最新闭包）。
// latest 只在布局阶段更新：渲染阶段（含被并发渲染丢弃的那一版）不写 ref，
// 免得一次作废的渲染把 latest 换成基于旧状态的闭包。
export function useLatestHandlers<T extends object>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  const stable = useRef<Record<string, (...args: unknown[]) => unknown> | null>(null);
  if (stable.current === null) {
    const wrapped: Record<string, (...args: unknown[]) => unknown> = {};
    Object.keys(handlers).forEach(key => {
      wrapped[key] = (...args: unknown[]) => {
        const handler = (latest.current as Record<string, unknown>)[key];
        if (typeof handler === "function") (handler as (...inner: unknown[]) => unknown)(...args);
      };
    });
    stable.current = wrapped;
  }
  return stable.current as unknown as T;
}
