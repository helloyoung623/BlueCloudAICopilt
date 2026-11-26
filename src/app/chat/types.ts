import type { OneDriveFile, OutlookMail } from "../components/result-cards";
import type { ChatAttachment } from "../components/attachment-tray";
import type { TaskArtifact } from "../components/task-artifacts";
import type { AgentSource } from "../agent-client";
import type { AutomationIcon, AutomationCardStatus, ScheduleState } from "../components/automation-view";

// 执行过程里一种步骤图标的语义键；界面只用它选图标，不显示 type 文字。
export type ToolKind = "search" | "read" | "extract" | "analyze" | "generate" | "check" | "summarize" | "execute" | "fail" | "chevron"
  | "memory" | "clarify" | "terminal" | "think" | "skill" | "react-read" | "react-analyze" | "react-generate" | "react-check" | "react-summarize" | "react-execute" | "react-fail";

export type ProcessVariant = "requirement" | "outline" | "ppt";

// 演示链路与真 agent 共用的行动说明规范：
//   summary = 「正在…」一句；title = 静态折叠短语；actions = 自带动词的动作行。
export type ProcessPreset = { goal?: string; running: string; summary?: string; title?: string; actions: { label: string; icon: ToolKind }[] };

// 真 agent 的一轮「行动说明 + 执行意图」：每轮工具调用产生一组。
export type AgentRound = { summary: string; title?: string; actions: ProcessPreset["actions"]; progress: { shown: number; batchStart: number }; slots?: number[] };

export type Message = {
  role: "user" | "ai" | "process" | "result";
  text: string;
  html?: string;
  plainText?: string;
  animateRich?: boolean;
  oneDriveFiles?: OneDriveFile[];
  outlookMails?: OutlookMail[];
  attachments?: ChatAttachment[];
  thinking?: boolean;
  // 这一轮被中断（用户点「暂停生成」）：执行过程显示「已停止生成」，不显示「任务已完成」
  stopped?: boolean;
  variant?: ProcessVariant;
  preset?: ProcessPreset;
  artifacts?: TaskArtifact[];
  automation?: { taskId: string; title: string; cycle: string; description: string; icon: AutomationIcon; iconUrl?: string; status?: AutomationCardStatus; schedule?: ScheduleState; prompt?: string };
  automationPending?: boolean;
  followUps?: string[];
  verify?: { ok: boolean; retried?: boolean; note?: string };
  followUpsReady?: boolean;
  sendState?: "failed" | "info";
  instant?: boolean;
  streaming?: boolean;
  bodyDone?: boolean;
  runId?: number;
  streamError?: string;
  progress?: { shown: number; batchStart: number };
  controlledProcess?: boolean;
  summary?: string;
  rounds?: AgentRound[];
  sources?: AgentSource[];
  needsTypewriter?: boolean;
};

// 一条历史会话。消息只在内存里，没有服务端持久化。
export type HistoryItem = {
  id: number;
  title: string;
  pinned?: boolean;
  messages: Message[];
  projectId?: number;
  createdAt?: number;
  archived?: boolean;
};
