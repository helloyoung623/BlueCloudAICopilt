import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Message } from "./types";

// 聊天域的「读侧」：当前会话的消息、生成中标记，以及消息级操作。
// ChatView 是流式正文的消费方，本来就该跟着 messages 更新，所以这里不额外做引用稳定。
export type ChatMessageActions = {
  editMessage: (index: number) => void;
  deleteMessage: (index: number) => void;
  retryMessage: (index: number) => void;
  regenerateMessage: (index: number) => void;
  processProgress: (index: number, progress: { shown: number; batchStart: number }) => void;
  recommendationsShown: (key: string) => void;
};

export type ChatDomain = {
  conversationId: number | null;
  messages: Message[];
  // 该会话这一轮是否还在生成（由生成域按 conversationId 判断，不再由 App 单独算）。
  running: boolean;
  actions: ChatMessageActions;
};

const ChatDomainContext = createContext<ChatDomain | null>(null);

export function ChatDomainProvider({ value, children }: { value: ChatDomain; children: ReactNode }) {
  return <ChatDomainContext.Provider value={value}>{children}</ChatDomainContext.Provider>;
}

export function useChatDomain(): ChatDomain {
  const value = useContext(ChatDomainContext);
  if (value === null) throw new Error("useChatDomain 必须在 ChatDomainProvider 内使用");
  return value;
}
