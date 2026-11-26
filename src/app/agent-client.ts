import { parseSseBuffer } from "./chat/agent-events.ts";

export type ChatTurn = { role: "user" | "assistant"; content: string };

// 一条回答引用的真实来源（工具返回）。目前只用 title 做展示，保留其余字段便于将来扩展来源详情。
export type AgentSource = { title?: string; url?: string; kind?: string; [key: string]: unknown };

// 一条执行意图：type 只用来选图标（绝不显示文字），text 是用户直接看到的自带动词短句。
export type AgentIntent = { type: string; text: string; status?: "done" | "running" };

export type AgentEvent =
  | { type: "run.start"; data: { runId?: number | null } }
  | { type: "tool.phase"; data: { stage: "start" | "end"; steps?: { label: string; icon: string }[] } }
  | { type: "plan.summary"; data: { text: string; title?: string; round?: number; intents?: AgentIntent[]; slots?: number[]; actions?: { label: string; icon: string; running?: string }[] } }
  | { type: "step.end"; data: { index: number; label?: string } }
  | { type: "tool.call"; data: { callId: string; name: string; label: string; icon: string; running: string; round?: number; args: Record<string, unknown> } }
  | { type: "tool.result"; data: { callId: string; name: string; label: string; ok: boolean; round?: number; output: unknown } }
  // 结果自检：正文发出前服务端先跟本轮工具记录对账，不通过就重写一次
  | { type: "verify.start"; data: { attempt: number; label: string } }
  | { type: "verify.retry"; data: { attempt: number; label: string; note?: string } }
  | { type: "verify.result"; data: { ok: boolean; retried?: boolean; note?: string } }
  | { type: "answer.start"; data: Record<string, never> }
  | { type: "message.delta"; data: { text: string } }
  | { type: "answer.end"; data: Record<string, never> }
  | { type: "run.end"; data: { text?: string; plainText?: string; usage?: unknown; sources?: AgentSource[]; followUps?: string[] } }
  | { type: "run.error"; data: { code?: string | number; message?: string } }
  | { type: string; data: Record<string, unknown> };

export type StreamChatOptions = {
  messages: ChatTurn[];
  runId: number;
  signal: AbortSignal;
  // 本轮是「已有自动化任务的立即执行」：服务端据此禁止再创建自动化任务。
  automationRun?: boolean;
  // 本轮来自「新建自动化任务」弹窗：条件已填齐，服务端据此补齐 create_automation 的参数。
  automationSeed?: { title?: string; goal: string; cycle?: string; time: string; weekdays: string[]; monthDays: string[] };
  onEvent: (event: AgentEvent) => void;
};

export async function streamChat({ messages, runId, signal, automationRun, automationSeed, onEvent }: StreamChatOptions): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      runId,
      ...(automationRun ? { automationRun: true } : {}),
      ...(automationSeed ? { automationSeed } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? `服务返回 ${response.status}`);
  }
  if (!response.body) throw new Error("浏览器不支持流式响应");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      onEvent(event as AgentEvent);
    }
  }
}
