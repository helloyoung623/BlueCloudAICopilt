// SSE 帧解析：从 agent-client 中抽出的纯函数，便于用假数据流测试而不访问真实模型服务。
// 协议与 server/index.mjs 的 sse() 保持一致：event: <name>\ndata: <json>\n\n。

export type ParsedAgentEvent = { type: string; data: Record<string, unknown> };

export function parseSseFrame(frame: string): ParsedAgentEvent | null {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { type: event, data: parsed as Record<string, unknown> };
  } catch {
    // 单条坏帧不影响后续流
    return null;
  }
}

// buffer 是上一轮未凑成完整帧的残片；返回已解析事件与新的残片。
export function parseSseBuffer(buffer: string): { events: ParsedAgentEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: ParsedAgentEvent[] = [];
  for (const frame of frames) {
    const parsed = parseSseFrame(frame);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}
