import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginBody,
  classifyStreamEnd,
  endGeneration,
  finalizeBodyOnlyMessages,
  finalizeInterruptedMessages,
  isGenerating,
  startGeneration,
} from "./generation-state.ts";

const msg = (role, extra = {}) => ({ role, text: "", ...extra });

test("startGeneration 请求发出即进入生成中", () => {
  const state = startGeneration(7);
  assert.equal(state.runId, 7);
  assert.equal(state.phase, "thinking");
  assert.equal(state.generating, true);
  assert.equal(isGenerating(state), true);
});

test("beginBody 正文流式输出阶段仍然可以停止", () => {
  const state = beginBody(startGeneration(7));
  assert.equal(state.phase, "body");
  assert.equal(state.generating, true);
  assert.equal(isGenerating(state), true);
});

test("endGeneration 正文结束后恢复发送按钮", () => {
  const state = endGeneration(beginBody(startGeneration(7)));
  assert.equal(state.phase, "idle");
  assert.equal(state.generating, false);
  assert.equal(isGenerating(state), false);
  assert.equal(isGenerating(undefined), false);
});

test("classifyStreamEnd 分清主动取消、正常收齐、正文完成追问缺失与正文未完成", () => {
  // 用户主动停止：请求被中断，不是故障。
  assert.equal(classifyStreamEnd({ aborted: true, sawAnswerEnd: false, sawRunEnd: false }), "cancelled");
  assert.equal(classifyStreamEnd({ aborted: true, sawAnswerEnd: true, sawRunEnd: false }), "cancelled");
  // 整轮收齐。
  assert.equal(classifyStreamEnd({ aborted: false, sawAnswerEnd: true, sawRunEnd: true }), "completed");
  // 正文发完了，追问没来：正文是真的，收尾但不报失败。
  assert.equal(classifyStreamEnd({ aborted: false, sawAnswerEnd: true, sawRunEnd: false }), "body-only");
  // 正文都没写完：异常结束，不能当成功。
  assert.equal(classifyStreamEnd({ aborted: false, sawAnswerEnd: false, sawRunEnd: false }), "failed");
});

test("finalizeInterruptedMessages 保留正文与执行记录并标记已停止", () => {
  const messages = [
    msg("user", { text: "问题" }),
    msg("process", { thinking: true, runId: 7, text: "正在读取邮件", rounds: [{ summary: "正在读取邮件", actions: [], progress: { shown: 0, batchStart: 0 } }] }),
    msg("ai", { text: "第一段正文", streaming: true, runId: 7 }),
  ];
  const next = finalizeInterruptedMessages(messages, { runId: 7, interrupted: true });

  assert.equal(next[0], messages[0], "用户消息不受影响");
  assert.equal(next[1].thinking, false, "思考块不再转圈");
  assert.equal(next[1].stopped, true, "未完成的执行过程标记为已停止");
  assert.equal(next[1].rounds, messages[1].rounds, "已记下的执行记录原样保留");
  assert.equal(next[2].text, "第一段正文", "已收到的正文保留");
  assert.equal(next[2].streaming, false, "正文不再处于流式状态");
  assert.equal(next[2].bodyDone, true, "正文收尾，操作项可以出现");
  assert.equal(messages[1].thinking, true, "原数组不被修改");
  assert.equal(messages[2].streaming, true, "原数组不被修改");
});

test("finalizeInterruptedMessages 当前轮的执行过程不再显示任务已完成", () => {
  // 工具已经跑完、正文还在流的时候被用户停掉：这一轮算「已停止生成」，
  // 不能让用户看到「任务已完成」。
  const messages = [
    msg("process", { thinking: false, runId: 7 }),
    msg("ai", { text: "半截正文", streaming: true, runId: 7 }),
  ];
  const next = finalizeInterruptedMessages(messages, { runId: 7, interrupted: true });
  assert.equal(next[0].stopped, true);
  assert.equal(next[0].thinking, false);
  assert.equal(next[1].text, "半截正文");
});

test("finalizeInterruptedMessages 不误伤更早已经完成的轮次", () => {
  const messages = [
    msg("process", { thinking: false, runId: 3 }),
    msg("ai", { text: "上一轮的回答", streaming: false, runId: 3 }),
  ];
  const next = finalizeInterruptedMessages(messages, { runId: 7, interrupted: true });
  assert.equal(next[0].stopped, undefined, "别的轮次不该被标成已停止");
  assert.equal(next[0], messages[0]);
});

test("finalizeInterruptedMessages 一个字都没有时不留下空回答", () => {
  const next = finalizeInterruptedMessages([
    msg("user", { text: "问题" }),
    msg("ai", { text: "", streaming: true }),
    msg("ai", { text: "   ", streaming: true }),
  ]);
  assert.equal(next.length, 1);
  assert.equal(next[0].role, "user");
});

test("finalizeInterruptedMessages 已经结束的轮次原样保留", () => {
  const messages = [
    msg("process", { thinking: false, text: "已完成" }),
    msg("ai", { text: "回答", streaming: false }),
  ];
  const next = finalizeInterruptedMessages(messages);
  assert.equal(next[0], messages[0]);
  assert.equal(next[1], messages[1]);
  assert.equal(next[0].stopped, undefined, "正常完成不标已停止");
});

test("finalizeInterruptedMessages 清掉不会兑现的自动化卡片等待", () => {
  // 从弹窗发起创建时，正文先到、卡片要等 run.end 兜底。
  // 这一轮被停掉后卡片不会再来了：等待标记必须清掉，回答不能永远停在「等卡片」。
  const messages = [
    msg("ai", { text: "正在创建", streaming: true, runId: 7, automationPending: true }),
  ];
  const next = finalizeInterruptedMessages(messages, { runId: 7, interrupted: true });
  assert.equal(next[0].automationPending, false, "不再等卡片，操作项可以出现");
  assert.equal(next[0].automation, undefined, "没建出来的任务不伪造卡片");
  assert.equal(next[0].text, "正在创建", "已收到的正文保留");
});

test("finalizeInterruptedMessages 把真的建出来的卡片挂回这一轮的回答", () => {
  const card = { taskId: "automation-1", title: "每天早上汇总未读邮件" };
  const messages = [
    msg("ai", { text: "已创建", streaming: true, runId: 7, automationPending: true }),
    msg("ai", { text: "别的轮次", streaming: true, runId: 3 }),
  ];
  const next = finalizeInterruptedMessages(messages, { runId: 7, interrupted: true, automation: card });
  assert.equal(next[0].automation, card, "真的建出来的卡片挂回这一轮");
  assert.equal(next[0].automationPending, false);
  assert.equal(next[1].automation, undefined, "卡片不挂到别的轮次上");
});

test("finalizeBodyOnlyMessages 正文完成但追问缺失：正文保留、不标已停止", () => {
  // 连接先断了，推荐追问没来：正文是真的，收尾即可，不当失败也不当「已停止生成」。
  const messages = [
    msg("process", { thinking: false, runId: 7 }),
    msg("ai", { text: "写完的正文", streaming: true, runId: 7, automationPending: true }),
  ];
  const next = finalizeBodyOnlyMessages(messages, { runId: 7 });
  assert.equal(next[0].stopped, undefined, "执行过程跑完了，不标已停止");
  assert.equal(next[1].text, "写完的正文", "正文保留");
  assert.equal(next[1].streaming, false, "正文收尾");
  assert.equal(next[1].bodyDone, true);
  assert.equal(next[1].automationPending, false, "不会再有卡片，清掉等待");
});

test("finalizeBodyOnlyMessages 已经收尾的回答原样保留", () => {
  const messages = [msg("ai", { text: "回答", streaming: false })];
  const next = finalizeBodyOnlyMessages(messages);
  assert.equal(next[0], messages[0]);
});
