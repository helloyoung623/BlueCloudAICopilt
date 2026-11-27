import assert from "node:assert/strict";
import { test } from "node:test";
import { startAgentStream } from "./agent-stream.ts";
import { GenerationRunController } from "./generation-runs.ts";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// 可控的假 SSE：把服务交给 stream 的 onEvent 拿出来，由用例显式决定何时下发。
function setup({ runId = 7, conversationId = 1 } = {}) {
  const controller = new GenerationRunController();
  controller.begin(conversationId, runId);
  const events = [];
  const calls = { onBodyOnly: 0, onFailed: 0, errors: [] };
  let emit;
  const stream = async options => { emit = options.onEvent; };
  startAgentStream({
    controller,
    conversationId,
    runId,
    messages: [{ role: "user", content: "hi" }],
    stream,
    callbacks: {
      onEvent: event => events.push(event),
      onBodyOnly: () => { calls.onBodyOnly += 1; },
      onFailed: () => { calls.onFailed += 1; },
      onError: message => { calls.errors.push(message); },
    },
  });
  return { controller, events, calls, emit: event => emit(event), conversationId, runId };
}

test("answer.end 只恢复按钮，run.end 到来前不清理轮次，后续内容照常转发", async () => {
  const s = setup();
  s.emit({ type: "answer.start", data: {} });
  s.emit({ type: "answer.end", data: {} });
  assert.equal(s.controller.stateOf(1).generating, false);
  assert.equal(s.controller.stateOf(1).phase, "idle");
  assert.ok(s.controller.stateOf(1), "正文结束后连接未关，轮次还在");

  // 推荐追问还在服务端生成，随后才到达的 run.end 仍属本轮有效事件。
  s.emit({ type: "run.end", data: { text: "正文", followUps: ["继续问"] } });
  await tick();
  assert.equal(s.events.length, 3);
  assert.deepEqual(s.events[2].data.followUps, ["继续问"]);
  assert.equal(s.controller.stateOf(1), undefined, "run.end 才清掉这一轮");
  assert.equal(s.calls.onFailed, 0);
  assert.equal(s.calls.onBodyOnly, 0);
});

test("正文写完但追问没来：按 body-only 收尾，不当失败", async () => {
  const s = setup();
  s.emit({ type: "answer.start", data: {} });
  s.emit({ type: "answer.end", data: {} });
  await tick();
  assert.equal(s.calls.onBodyOnly, 1);
  assert.equal(s.calls.onFailed, 0);
  assert.deepEqual(s.calls.errors, []);
  assert.equal(s.controller.stateOf(1).generating, false);
});

test("正文没写完就断流：清轮次、按失败处理并提示", async () => {
  const s = setup();
  s.emit({ type: "answer.start", data: {} });
  await tick();
  assert.equal(s.calls.onFailed, 1);
  assert.deepEqual(s.calls.errors, ["模型调用失败"]);
  assert.equal(s.controller.stateOf(1), undefined);
});

test("同会话新一轮开始后，旧请求的迟到事件和服务收尾都不生效", async () => {
  const s = setup();
  s.controller.begin(1, 8);
  s.emit({ type: "run.end", data: { text: "迟到的正文" } });
  await tick();
  assert.equal(s.events.length, 0, "旧轮次事件不应再映射成消息");
  assert.equal(s.calls.onFailed, 0);
  assert.equal(s.calls.onBodyOnly, 0);
  assert.equal(s.controller.stateOf(1).runId, 8, "新一轮状态没有被旧轮次清掉");
});

test("切到别的会话不打断后台请求，事件仍写回原会话", async () => {
  const s = setup({ runId: 3 });
  s.controller.begin(2, 4);
  s.emit({ type: "run.end", data: { text: "后台正文" } });
  await tick();
  assert.equal(s.events.length, 1);
  assert.equal(s.controller.stateOf(1), undefined, "原会话照常收尾");
  assert.equal(s.controller.stateOf(2).runId, 4, "新看的会话状态不动");
});

// 可控的挂住型 SSE：连接由用例决定何时结束，用来模拟 answer.end 后仍开着的旧连接。
function setupHeld({ runId = 7, conversationId = 1 } = {}) {
  const controller = new GenerationRunController();
  controller.begin(conversationId, runId);
  const events = [];
  const calls = { onBodyOnly: 0, onFailed: 0, errors: [] };
  let emit;
  let finishStream;
  const stream = async options => {
    emit = options.onEvent;
    await new Promise(resolve => { finishStream = resolve; });
  };
  startAgentStream({
    controller,
    conversationId,
    runId,
    messages: [{ role: "user", content: "hi" }],
    stream,
    callbacks: {
      onEvent: event => events.push(event),
      onBodyOnly: () => { calls.onBodyOnly += 1; },
      onFailed: () => { calls.onFailed += 1; },
      onError: message => { calls.errors.push(message); },
    },
  });
  return { controller, events, calls, emit: event => emit(event), endStream: () => finishStream() };
}

test("answer.end 后新一轮不会覆盖旧连接：停止时两条连接一起中断", async () => {
  const s = setupHeld();
  s.emit({ type: "answer.start", data: {} });
  s.emit({ type: "answer.end", data: {} });
  const oldAbort = s.controller.controllerFor(1, 7);
  assert.ok(oldAbort, "正文结束后旧连接仍在追踪中");

  // 新一轮：真实链路里这里会由 startAgentStream 按 runId 登记新连接。
  s.controller.begin(1, 8);
  const newAbort = new AbortController();
  s.controller.registerController(1, 8, newAbort);
  assert.equal(oldAbort.signal.aborted, false, "新一轮不应掐断旧连接");
  assert.equal(s.controller.controllerFor(1, 8), newAbort);

  s.controller.stop(1);
  assert.equal(oldAbort.signal.aborted, true, "停止应能中止 answer.end 后的旧连接");
  assert.equal(newAbort.signal.aborted, true);

  // 旧连接之后才到的事件与服务收尾都不能影响这一轮留下的 idle 状态。
  s.emit({ type: "run.end", data: { text: "迟到的追问" } });
  s.endStream();
  await tick();
  assert.equal(s.events.length, 2, "旧轮次迟到事件不应映射成消息");
  assert.equal(s.calls.onBodyOnly, 0);
  assert.equal(s.calls.onFailed, 0);
  assert.deepEqual(s.calls.errors, []);
  assert.equal(s.controller.stateOf(1).phase, "idle");
});

test("旧请求迟到的 finally 只摘自己的连接，不碰新一轮的连接与回调", async () => {
  const s = setupHeld();
  s.emit({ type: "answer.end", data: {} });
  const oldAbort = s.controller.controllerFor(1, 7);

  s.controller.begin(1, 8);
  const newAbort = new AbortController();
  s.controller.registerController(1, 8, newAbort);

  s.endStream(); // 旧连接 EOF，没有 run.end
  await tick();
  assert.equal(s.controller.controllerFor(1, 7), undefined, "旧连接登记应被摘掉");
  assert.equal(s.controller.controllerFor(1, 8), newAbort, "新一轮连接不能被旧收尾摘掉");
  assert.equal(newAbort.signal.aborted, false);
  assert.equal(oldAbort.signal.aborted, false, "连接自然结束不是中止");
  assert.equal(s.calls.onBodyOnly, 0, "旧轮次的 body-only 收尾不应影响新一轮");
  assert.equal(s.calls.onFailed, 0);
  assert.deepEqual(s.calls.errors, []);
  assert.equal(s.controller.stateOf(1).runId, 8);
});

test("停止后迟到事件被丢弃，也不会弹失败提示", async () => {
  const s = setup();
  s.controller.stop(1);
  s.emit({ type: "answer.end", data: {} });
  await tick();
  assert.equal(s.events.length, 0);
  assert.deepEqual(s.calls.errors, []);
  assert.equal(s.controller.stateOf(1).phase, "idle");
});
