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

// 连接层面结束时这一轮属于哪种结局。
//
// 服务端可能只发一半就把连接关掉（EOF），既没有 answer.end 也没有 run.end。
// 这时候必须分清四种情况，既不能让生成状态永久停在「生成中」，也不能把没写完的回答当成功：
//   cancelled —— 用户主动停止：请求被中断，不是故障，已收到的内容保留。
//   completed —— 整轮收齐（正文 + 推荐追问）。
//   body-only —— 正文已发完，只是推荐追问没来：正文是真的，收尾但不报失败。
//   failed    —— 正文都没写完：异常结束，按失败处理。
export type StreamEndKind = "cancelled" | "completed" | "body-only" | "failed";

export type StreamEndInput = {
  // 请求是不是被中断（用户点「暂停生成」）。
  aborted: boolean;
  // 有没有收到 answer.end（正文结束）。
  sawAnswerEnd: boolean;
  // 有没有收到 run.end（整轮结束）。
  sawRunEnd: boolean;
};

export function classifyStreamEnd({ aborted, sawAnswerEnd, sawRunEnd }: StreamEndInput): StreamEndKind {
  if (aborted) return "cancelled";
  if (sawRunEnd) return "completed";
  if (sawAnswerEnd) return "body-only";
  return "failed";
}

// 一轮被中断（用户点「暂停生成」，或同一会话里又发起了新一轮）时的收尾参数。
export type FinalizeRoundOptions = {
  // 这一轮的运行号：靠它精确认出「当前这一轮」的执行过程与正文，不误伤更早的轮次。
  runId?: number;
  // 这一轮是不是被打断的：是就把它的执行过程标成「已停止生成」。
  interrupted?: boolean;
  // 真的建出来的自动化任务卡片：挂回这一轮的回答；没有就不挂，绝不伪造成功。
  automation?: Message["automation"];
};

// 收尾一轮被中断的消息：
//   - 执行过程：保留已经记下的步骤，标记 stopped，界面显示「已停止生成」而不是「任务已完成」
//   - 正文：保留已经收到的内容并结束打字机；一个字都没收到时不留下空回答
//   - 还在等自动化卡片的回答：卡片不会再来了，清掉等待标记，操作项照常出现
export function finalizeInterruptedMessages(
  messages: readonly Message[],
  options?: FinalizeRoundOptions,
): Message[] {
  const runId = options?.runId;
  const card = options?.automation;
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
    if (message.role === "process" && options?.interrupted && runId !== undefined && message.runId === runId) {
      changed = true;
      result.push({ ...message, stopped: true });
      continue;
    }
    // 正在流式输出的正文：保留已收到的内容并结束打字机；一个字都没有就不留下空回答。
    if (message.role === "ai" && message.streaming) {
      changed = true;
      if (!(message.text ?? "").trim()) continue;
      result.push(finalizeBodyMessage(message, runId, card));
      continue;
    }
    // 还在等自动化卡片的回答：卡片不会再来了，不能让回答永远停在「等卡片」状态。
    if (message.role === "ai" && message.automationPending) {
      changed = true;
      result.push({ ...message, automationPending: false });
      continue;
    }
    result.push(message);
  }
  // 没有任何残留就原样返回，调用方不必因为一次空操作多渲染一轮。
  return changed ? result : (messages as Message[]);
}

// 收尾「正文已写完、只是后续内容没来」的一轮（例如连接先断了，推荐追问没到）。
// 正文是真的：保留内容、结束打字机、恢复操作项；执行过程已经跑完，不标「已停止生成」。
export function finalizeBodyOnlyMessages(
  messages: readonly Message[],
  options?: FinalizeRoundOptions,
): Message[] {
  const runId = options?.runId;
  const card = options?.automation;
  let changed = false;
  const result: Message[] = [];
  for (const message of messages) {
    if (message.role === "ai" && message.streaming) {
      changed = true;
      if (!(message.text ?? "").trim()) continue;
      result.push(finalizeBodyMessage(message, runId, card));
      continue;
    }
    // 还在等自动化卡片的回答：这一轮不会再有卡片了，不能让回答永远停在「等卡片」状态。
    if (message.role === "ai" && message.automationPending) {
      changed = true;
      result.push({ ...message, automationPending: false });
      continue;
    }
    result.push(message);
  }
  return changed ? result : (messages as Message[]);
}

// 正文消息的统一收尾：结束打字机、清掉「还在等卡片」的标记，必要时挂回真的建出来的卡片。
function finalizeBodyMessage(
  message: Message,
  runId: number | undefined,
  card: Message["automation"] | undefined,
): Message {
  const next: Message = {
    ...message,
    streaming: false,
    bodyDone: true,
    ...(message.automationPending ? { automationPending: false } : {}),
  };
  // 卡片只挂回它自己那一轮的回答；别的轮次不碰，也不凭空造一张。
  if (card && message.runId === runId) next.automation = card;
  return next;
}
