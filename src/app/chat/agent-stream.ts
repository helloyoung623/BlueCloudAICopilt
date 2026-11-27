import { streamChat, type AgentEvent, type StreamChatOptions } from "../agent-client.ts";
import { classifyStreamEnd } from "./generation-state.ts";
import type { GenerationRunController } from "./generation-runs.ts";

// SSE 请求的生命周期：创建/登记 AbortController、按会话+轮次转发事件、
// 连接结束时按 classifyStreamEnd 分清四种结局并清理这一轮。
// 事件「怎么变成消息」由调用方决定；这里不碰会话 reducer，也不碰 UI。
export type AgentStreamCallbacks = {
  onEvent: (event: AgentEvent) => void;
  // 正文已结束、推荐追问没来：由调用方把已收到的正文收尾。
  onBodyOnly: () => void;
  // 正文没写完的异常结束：由调用方清掉流中的消息并标记发送失败。
  onFailed: () => void;
  onError: (message: string) => void;
};

type StreamRunner = (options: StreamChatOptions) => Promise<void>;

export type StartAgentStreamOptions = {
  controller: GenerationRunController;
  conversationId: number;
  runId: number;
  messages: StreamChatOptions["messages"];
  automationRun?: boolean;
  automationSeed?: StreamChatOptions["automationSeed"];
  callbacks: AgentStreamCallbacks;
  // 测试注入；生产默认走真实 /api/chat 的 SSE 客户端。
  stream?: StreamRunner;
};

export function startAgentStream({
  controller,
  conversationId,
  runId,
  messages,
  automationRun,
  automationSeed,
  callbacks,
  stream = streamChat,
}: StartAgentStreamOptions): void {
  const abortController = new AbortController();
  // 按 runId 登记：answer.end 后连接未关又开新一轮时，两条连接都要留着可中止。
  controller.registerController(conversationId, runId, abortController);
  let sawAnswerEnd = false;
  let sawRunEnd = false;
  const isCurrent = () => controller.isCurrent(conversationId, runId) && !abortController.signal.aborted;

  const handleEvent = (event: AgentEvent) => {
    // 每个事件都重新核对会话 + runId：切会话不打断后台流，但同会话新一轮/停止后旧事件不再落地。
    if (!isCurrent()) return;
    if (event.type === "answer.start") controller.phaseBody(conversationId, runId);
    if (event.type === "answer.end") {
      sawAnswerEnd = true;
      controller.phaseEnd(conversationId, runId);
    }
    if (event.type === "run.end") sawRunEnd = true;
    callbacks.onEvent(event);
    // 整轮收齐或明确报错时立刻清理本轮；正文结束（answer.end）不在这里清理，
    // 因为推荐追问还在路上，连接可能仍然开着。
    if (event.type === "run.end" || event.type === "run.error") {
      controller.dropController(conversationId, runId);
      controller.clearState(conversationId, runId);
    }
  };

  stream({
    messages,
    runId,
    signal: abortController.signal,
    automationRun,
    automationSeed,
    onEvent: handleEvent,
  }).then(() => {
    // 连接已经结束，无论事件齐不齐都先摘掉「本轮」的连接登记；带 runId 保证
    // 迟到的收尾只会清自己，不会把同一会话里新一轮的连接一起清掉。
    controller.dropController(conversationId, runId);
    // 连接结束但事件可能没齐：正文写完（answer.end）和整轮收齐（run.end）是两件不同的事。
    const kind = classifyStreamEnd({
      aborted: abortController.signal.aborted,
      sawAnswerEnd,
      sawRunEnd,
    });
    if (kind === "cancelled" || kind === "completed") return;
    // 已被同一会话的新一轮取代：迟到的收尾不许改当前轮次。
    if (!isCurrent()) return;
    if (kind === "body-only") {
      // 正文是真的，只是推荐追问没到：恢复发送按钮并收尾正文，不按失败处理。
      controller.phaseEnd(conversationId, runId);
      callbacks.onBodyOnly();
      return;
    }
    controller.clearState(conversationId, runId);
    callbacks.onFailed();
    callbacks.onError("模型调用失败");
  }).catch(error => {
    controller.dropController(conversationId, runId);
    // 用户主动停止时请求被中断：这不是故障，停止流程已经收尾，这里不弹失败提示。
    if (!isCurrent()) return;
    if (abortController.signal.aborted) return;
    controller.clearState(conversationId, runId);
    callbacks.onFailed();
    callbacks.onError(error?.message ?? "模型调用失败");
  });
}
