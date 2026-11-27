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
// 未读内容没变时必须原样返回 currentUnread：这份集合直接进了 ConversationDomain，
// 每帧新建一个内容相同的 Set 会让 Context value 换引用，侧栏就跟着流式 token 重渲染。
export function deriveUnreadState(
  history: readonly HistoryItem[],
  previousThinking: ReadonlyMap<number, boolean>,
  activeId: number | null,
  currentUnread: ReadonlySet<number>,
): { thinking: Map<number, boolean>; unread: ReadonlySet<number> } {
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

  return { thinking: nextThinking, unread: unread ?? currentUnread };
}

// 打开任务即视为已查看。不在未读里就原样返回同一份引用（内容没变不换新 Set）。
export function markConversationRead(unread: ReadonlySet<number>, activeId: number): ReadonlySet<number> {
  if (!unread.has(activeId)) return unread;
  const next = new Set(unread);
  next.delete(activeId);
  return next;
}

// ── 侧栏投影 ────────────────────────────────────────────────────────────────
//
// 侧栏只需要标题/归属/置顶/归档这些轻量字段，不需要消息正文。
// 单独投影一份，流式输出每来一个 token 都不会改变它，侧栏也就不会被带着重渲染。
export type SidebarTask = Omit<HistoryItem, "messages">;

export function toSidebarTasks(conversations: readonly HistoryItem[]): SidebarTask[] {
  return conversations.map(({ messages: _messages, ...rest }) => rest);
}

// 投影内容没变时保持同一份引用，让消费方（Context / memo）可以跳过更新。
export function sameSidebarTasks(a: readonly SidebarTask[], b: readonly SidebarTask[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.title !== right.title
      || left.projectId !== right.projectId
      || left.archived !== right.archived
      || left.pinned !== right.pinned
      || left.createdAt !== right.createdAt
    ) return false;
  }
  return true;
}

// 侧栏「AI 执行中」标记：仍有 thinking 的会话，加上当前会话里「正文已完但操作项/推荐问题还没落地」的那一帧。
// 当前会话的消息可能比 history 回写早一帧，由调用方把活动会话的判定单独传进来。
export function deriveRunningTaskIds(
  conversations: readonly HistoryItem[],
  activeId: number | null,
  activeIsRunning: boolean,
): Set<number> {
  const running = new Set<number>();
  conversations.forEach(item => {
    if (item.messages.some(message => message.role === "process" && message.thinking)) running.add(item.id);
  });
  if (activeId !== null && activeIsRunning) running.add(activeId);
  return running;
}

export function sameIdSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// ── 会话域状态 ──────────────────────────────────────────────────────────────
//
// 会话消息只有一份：每个会话的消息都存放在 conversations 里，活动会话的消息
// 直接从活动 id 查出来。未建会话时的输入区消息放在 draft，而不是另起一份
// 「当前消息」再靠 effect 和历史互相追赶。
export type ConversationState = {
  conversations: HistoryItem[];
  activeId: number | null;
  draft: Message[];
  unread: ReadonlySet<number>;
  // deriveUnreadState 需要的跨更新记忆，原来放在 App 的 ref 里。
  thinking: ReadonlyMap<number, boolean>;
  // 侧栏 loading 判定：推荐问题真正渲染过的轮次 key。
  shownRecommendations: ReadonlySet<string>;
};

export const initialConversationState: ConversationState = {
  conversations: [],
  activeId: null,
  draft: [],
  unread: new Set<number>(),
  thinking: new Map<number, boolean>(),
  shownRecommendations: new Set<string>(),
};

export type ConversationAction =
  | { type: "select"; id: number | null }
  | { type: "updateConversations"; updater: HistoryItem[] | ((current: HistoryItem[]) => HistoryItem[]) }
  | { type: "updateMessages"; id: number | null; updater: Message[] | ((current: Message[]) => Message[]) }
  | { type: "recommendationsShown"; key: string }
  // 删除会话（单个任务 / 整个项目）：会话本身从列表移除，挂在它上面的会话域状态一并回收。
  | { type: "deleteConversations"; ids: readonly number[] }
  // 同步存储已经算好的下一份状态：React 只采纳，不再执行 updater。
  // 这样带 Date.now / ref 修改等副作用的 updater 在一次 dispatch 里只跑一次。
  | { type: "replace"; state: ConversationState };

// 删掉的会话不能在会话域里留下任何记录：
// - unread 只会为「还存在的会话」增删，历史 id 不主动剔除就会永久留着（每删一个多一个）；
// - thinking 由 withDerivedUnread 按现存会话重建，本来就会被丢弃，这里一并显式清掉；
// - shownRecommendations 的键是 `${会话 id}|run-N`，不按前缀清就会随删除一直堆着。
// 内容没变的集合保持原引用：侧栏的 Context 依赖它，换引用就等于白白重渲染。
function withoutConversationState(state: ConversationState, ids: ReadonlySet<number>): ConversationState {
  const hasUnread = [...ids].some(id => state.unread.has(id));
  const keptThinking = [...state.thinking].filter(([id]) => !ids.has(id));
  const prefixes = [...ids].map(id => `${id}|`);
  const staleKeys = [...state.shownRecommendations].filter(key => prefixes.some(prefix => key.startsWith(prefix)));

  if (!hasUnread && keptThinking.length === state.thinking.size && !staleKeys.length) return state;
  return {
    ...state,
    unread: hasUnread ? new Set([...state.unread].filter(id => !ids.has(id))) : state.unread,
    thinking: keptThinking.length === state.thinking.size ? state.thinking : new Map(keptThinking),
    shownRecommendations: staleKeys.length
      ? new Set([...state.shownRecommendations].filter(key => !staleKeys.includes(key)))
      : state.shownRecommendations,
  };
}

// 未读是会话更新后的派生结果，不靠额外 effect 再写一次 state。
function withDerivedUnread(state: ConversationState, conversations: HistoryItem[], activeId: number | null): ConversationState {
  const derived = deriveUnreadState(conversations, state.thinking, activeId, state.unread);
  const unread = activeId !== null ? markConversationRead(derived.unread, activeId) : derived.unread;
  return { ...state, conversations, activeId, unread, thinking: derived.thinking };
}

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "select": {
      if (state.activeId === action.id) return state;
      return withDerivedUnread(state, state.conversations, action.id);
    }
    case "updateConversations": {
      const conversations = typeof action.updater === "function" ? action.updater(state.conversations) : action.updater;
      if (conversations === state.conversations) return state;
      return withDerivedUnread(state, conversations, state.activeId);
    }
    case "updateMessages": {
      if (action.id === null) {
        const draft = typeof action.updater === "function" ? action.updater(state.draft) : action.updater;
        return draft === state.draft ? state : { ...state, draft };
      }
      // 已删除会话的迟到回调直接丢弃，不重建已经不存在的会话。
      if (!state.conversations.some(item => item.id === action.id)) return state;
      const updater: (current: Message[]) => Message[] = typeof action.updater === "function" ? action.updater : () => action.updater as Message[];
      const conversations = updateConversationInHistory(state.conversations, action.id, updater);
      return withDerivedUnread(state, conversations, state.activeId);
    }
    case "deleteConversations": {
      if (!action.ids.length) return state;
      const doomed = new Set(action.ids);
      const conversations = state.conversations.filter(item => !doomed.has(item.id));
      // 一个都没命中（重复删除 / 迟到删除）就当作没有变化，不发布新快照。
      if (conversations.length === state.conversations.length) return state;
      const cleaned = withoutConversationState(state, doomed);
      // 删掉的正好是当前打开的会话：退回空白会话，别留一个指向不存在会话的 activeId。
      const activeId = state.activeId !== null && doomed.has(state.activeId) ? null : state.activeId;
      return withDerivedUnread({ ...cleaned, activeId }, conversations, activeId);
    }
    case "recommendationsShown": {
      if (state.shownRecommendations.has(action.key)) return state;
      const shownRecommendations = new Set(state.shownRecommendations);
      shownRecommendations.add(action.key);
      return { ...state, shownRecommendations };
    }
    case "replace":
      // 快照由同步存储生成；React StrictMode 重复调用 reducer 也只会返回同一对象。
      return action.state;
    default:
      return state;
  }
}

// React 侧唯一的 reducer：只采纳同步存储算好的快照，别的 action 一律忽略。
// 会话变更（含 updater）只允许在 store 里执行一次；即使有人误把带 updater 的 action
// 交给 useReducer，这里也不会把副作用跑第二遍、更不会和 store 分叉成两份状态。
export function adoptConversationSnapshot(state: ConversationState, action: ConversationAction): ConversationState {
  return action.type === "replace" ? action.state : state;
}
