import type { HistoryItem, Message } from "./types.ts";

// ES2020 lib 没有 Array.prototype.findLastIndex；本地实现避免改 target/lib 引起运行时兼容变化。
export function findLastIndex<T>(items: readonly T[], predicate: (item: T, index: number, array: readonly T[]) => unknown): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i], i, items)) return i;
  }
  return -1;
}

// 本轮「操作项出现」即算完成：key 用会话 id + 稳定的 runId，
// 避免正文变长或推荐问题后到导致 key 抖动；没有 runId 的演示消息退回旧 key。
export function getAnswerDoneKey(conversationId: number | null, messages: readonly Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "ai") continue;
    if (msg.runId === undefined) return `${conversationId ?? "draft"}|${msg.text ?? ""}|${(msg.followUps ?? []).join("|")}`;
    return `${conversationId ?? "draft"}|run-${msg.runId}`;
  }
  return null;
}

// 新一轮消息进来前，把旧消息标成历史态；仍在执行的 process 保持原样。
export function freezePreviousMessages(messages: readonly Message[]): Message[] {
  return messages.map(m => (
    m.instant || (m.role === "process" && m.thinking) ? m : { ...m, instant: true }
  ));
}

// 从历史会话切回来时直接完整显示，不重播打字机。
export function toInstantMessages(messages: readonly Message[]): Message[] {
  return messages.map(m => ({ ...m, instant: true, needsTypewriter: false }));
}

// 把一次更新写回指定会话；当前会话由调用方直接 setMessages，后台会话写进 history。
export function updateConversationInHistory(
  history: readonly HistoryItem[],
  conversationId: number,
  updater: (messages: Message[]) => Message[],
): HistoryItem[] {
  return history.map(item => (item.id === conversationId ? { ...item, messages: updater(item.messages) } : item));
}

// 侧栏 loading / 未读派生：执行中的任务清未读；从「执行中→完成且不在看」的任务标未读。
// previousThinking 由调用方用 ref 保存，保持跨 effect 的记忆。
export function deriveUnreadState(
  history: readonly HistoryItem[],
  previousThinking: ReadonlyMap<number, boolean>,
  activeId: number | null,
  currentUnread: ReadonlySet<number>,
): { thinking: Map<number, boolean>; unread: Set<number> } {
  const thinkingIds = new Set<number>();
  const finishedIds: number[] = [];
  const nextThinking = new Map<number, boolean>();

  history.forEach(item => {
    const thinking = item.messages.some(message => message.role === "process" && Boolean(message.thinking));
    nextThinking.set(item.id, thinking);
    if (thinking) thinkingIds.add(item.id);
    const wasThinking = previousThinking.get(item.id) ?? false;
    const hasAnswer = item.messages.some(message => message.role === "ai" || message.role === "result");
    if (wasThinking && !thinking && hasAnswer) finishedIds.push(item.id);
  });

  let unread: Set<number> | null = null;
  const ensureNext = () => { if (unread === null) unread = new Set(currentUnread); };
  thinkingIds.forEach(id => {
    if (unread?.has(id) || currentUnread.has(id)) { ensureNext(); (unread as Set<number>).delete(id); }
  });
  finishedIds.forEach(id => {
    if (id !== activeId && !currentUnread.has(id)) { ensureNext(); (unread as Set<number>).add(id); }
  });

  return { thinking: nextThinking, unread: unread ?? new Set(currentUnread) };
}

// 打开任务即视为已查看。
export function markConversationRead(unread: ReadonlySet<number>, activeId: number): Set<number> {
  if (!unread.has(activeId)) return new Set(unread);
  const next = new Set(unread);
  next.delete(activeId);
  return next;
}
