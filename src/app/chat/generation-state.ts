import type { Message } from "./types.ts";

// 一轮生成的状态机。
//
//   thinking —— 请求已发出，正在思考 / 执行工具
//   body     —— 正文正在流式输出
//   idle     —— 正文已结束（answer.end）或这一轮已被中断
//
// 「生成中」= 请求开始 → 正文结束（answer.end）之间：这段时间里发送按钮是「暂停生成」，
// 思考、工具执行、正文流式输出三个阶段都能停。
// 状态按会话保存：切到别的会话不会中断后台生成，也不会把后台会话的暂停按钮带到当前会话。
export type GenerationPhase = "thinking" | "body" | "idle";

export type GenerationState = {
  runId: number;
  phase: GenerationPhase;
  generating: boolean;
};

// 一轮开始：请求发出即进入生成中。
export const startGeneration = (runId: number): GenerationState => ({
  runId,
  phase: "thinking",
  generating: true,
});

// 正文开始流式输出：仍在生成中，只是换了个阶段。
export const beginBody = (state: GenerationState): GenerationState => ({
  ...state,
  phase: "body",
});

// 正文结束（answer.end）或这一轮被中断：恢复发送按钮。
export const endGeneration = (state: GenerationState): GenerationState => ({
  ...state,
  phase: "idle",
  generating: false,
});

export const isGenerating = (state: GenerationState | undefined): boolean => Boolean(state?.generating);

// 一轮被中断（用户点「暂停生成」，或同一会话里又发起了新一轮）时的消息收尾：
//   - 执行过程：保留已经记下的步骤，标记 stopped，界面显示「已停止生成」而不是「任务已完成」
//   - 正文：保留已经收到的内容并结束打字机；一个字都没收到时不留下空回答
//
// stopRunId：被中断的是哪一轮。执行过程消息带 runId，靠它精确认出「当前这一轮」的执行过程，
// 不会误伤更早、已经正常完成（显示「任务已完成」）的轮次。
export function finalizeInterruptedMessages(
  messages: readonly Message[],
  options?: { stopRunId?: number },
): Message[] {
  const stopRunId = options?.stopRunId;
  let changed = false;
  const result: Message[] = [];
  for (const message of messages) {
    // 还在思考的执行过程：任何一轮被打断都要收尾，不能一直转圈。
    if (message.role === "process" && message.thinking) {
      changed = true;
      result.push({ ...message, thinking: false, stopped: true });
      continue;
    }
    // 当前这一轮的执行过程：哪怕工具已经跑完、正文还在流，也算「已停止生成」，
    // 不能让用户看到「任务已完成」。
    if (message.role === "process" && stopRunId !== undefined && message.runId === stopRunId) {
      changed = true;
      result.push({ ...message, stopped: true });
      continue;
    }
    // 正在流式输出的正文：保留已收到的内容并结束打字机；一个字都没有就不留下空回答。
    if (message.role === "ai" && message.streaming) {
      changed = true;
      if (!(message.text ?? "").trim()) continue;
      result.push({ ...message, streaming: false, bodyDone: true });
      continue;
    }
    result.push(message);
  }
  // 没有任何残留就原样返回，调用方不必因为一次空操作多渲染一轮。
  return changed ? result : (messages as Message[]);
}
