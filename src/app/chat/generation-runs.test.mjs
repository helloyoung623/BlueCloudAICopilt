import assert from "node:assert/strict";
import { test } from "node:test";
import { GenerationRunController } from "./generation-runs.ts";

const makeController = () => {
  let snapshot = new Map();
  const controller = new GenerationRunController(next => { snapshot = next; });
  return { controller, getSnapshot: () => snapshot };
};

test("切到别的会话不会作废后台生成，后台轮次仍可推进", () => {
  const { controller, getSnapshot } = makeController();
  controller.begin(1, 10);
  controller.begin(2, 20);

  assert.equal(controller.isCurrent(1, 10), true, "后台轮次仍然有效");
  assert.equal(controller.isCurrent(2, 20), true);
  controller.phaseBody(1, 10);
  assert.equal(getSnapshot().get(1).phase, "body");
  assert.equal(getSnapshot().get(2).phase, "thinking", "另一会话不受影响");
});

test("同会话新一轮作废旧 runId：旧回调不能再改状态或清掉新一轮", () => {
  const { controller, getSnapshot } = makeController();
  controller.begin(1, 10);
  controller.begin(1, 11);

  assert.equal(controller.isCurrent(1, 10), false);
  assert.equal(controller.isCurrent(1, 11), true);
  controller.phaseBody(1, 10);
  controller.clearState(1, 10);
  assert.equal(getSnapshot().get(1).runId, 11, "旧轮次的迟到收尾不能碰到新一轮");
  assert.equal(getSnapshot().get(1).phase, "thinking");

  controller.phaseEnd(1, 11);
  assert.equal(getSnapshot().get(1).generating, false);
  controller.clearState(1, 11);
  assert.equal(getSnapshot().has(1), false, "只有当前轮次的 run.end 才清状态");
});

test("answer.end 只结束 phase，正文内容由消息承载；run.end 才清轮次", () => {
  const { controller, getSnapshot } = makeController();
  controller.begin(1, 7);
  controller.phaseBody(1, 7);
  controller.phaseEnd(1, 7);

  assert.equal(getSnapshot().has(1), true, "正文结束后连接未关，状态先留着");
  assert.equal(getSnapshot().get(1).generating, false, "发送按钮已经恢复");
  controller.clearState(1, 7);
  assert.equal(getSnapshot().has(1), false);
});

test("停止当前会话：中断请求、保留 idle 状态，迟到事件一律失效", () => {
  const { controller, getSnapshot } = makeController();
  const abort = new AbortController();
  controller.begin(1, 10);
  controller.registerController(1, 10, abort);
  controller.phaseBody(1, 10);

  assert.equal(controller.stop(1), 10);
  assert.equal(abort.signal.aborted, true);
  assert.equal(controller.isCurrent(1, 10), false);
  assert.equal(getSnapshot().get(1).phase, "idle", "发送按钮恢复，但正文内容保留在消息里");

  controller.phaseBody(1, 10);
  assert.equal(getSnapshot().get(1).phase, "idle", "停止后的迟到正文事件不生效");
});

test("删除会话：AbortController 与计时器一起清理，旧定时器不会写回", async () => {
  const { controller, getSnapshot } = makeController();
  const abort = new AbortController();
  let fired = 0;
  controller.begin(1, 10);
  controller.registerController(1, 10, abort);
  controller.schedule(1, 10, () => { fired += 1; }, 15);
  controller.forget(1);

  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(fired, 0, "删除会话后旧轮次定时器不应执行");
  assert.equal(abort.signal.aborted, true);
  assert.equal(controller.isCurrent(1, 10), false);
  assert.equal(getSnapshot().has(1), false);
});

test("answer.end 后同会话新一轮按 runId 分别登记连接，停止/删除/卸载都能一并中止", () => {
  const { controller, getSnapshot } = makeController();
  const oldAbort = new AbortController();
  const newAbort = new AbortController();
  controller.begin(1, 10);
  controller.phaseEnd(1, 10); // 正文已结束但连接未关
  controller.registerController(1, 10, oldAbort);

  controller.begin(1, 11); // 新一轮：旧请求仍在服务端发推荐追问
  controller.registerController(1, 11, newAbort);
  assert.equal(controller.controllerFor(1, 10), oldAbort, "旧连接仍可追踪");
  assert.equal(controller.controllerFor(1, 11), newAbort, "新连接不被覆盖");
  assert.equal(oldAbort.signal.aborted, false, "新一轮不应误停旧连接");

  controller.stop(1);
  assert.equal(oldAbort.signal.aborted, true, "停止时应一并中止旧连接");
  assert.equal(newAbort.signal.aborted, true, "停止时应中止当前连接");
  assert.equal(getSnapshot().get(1).phase, "idle");

  const anotherOld = new AbortController();
  const anotherNew = new AbortController();
  controller.begin(2, 20);
  controller.phaseEnd(2, 20);
  controller.registerController(2, 20, anotherOld);
  controller.begin(2, 21);
  controller.registerController(2, 21, anotherNew);
  controller.forget(2);
  assert.equal(anotherOld.signal.aborted, true, "删除会话应中止旧连接");
  assert.equal(anotherNew.signal.aborted, true, "删除会话应中止当前连接");

  const unmountOld = new AbortController();
  const unmountNew = new AbortController();
  controller.begin(3, 30);
  controller.phaseEnd(3, 30);
  controller.registerController(3, 30, unmountOld);
  controller.begin(3, 31);
  controller.registerController(3, 31, unmountNew);
  controller.dispose();
  assert.equal(unmountOld.signal.aborted, true, "组件卸载应中止旧连接");
  assert.equal(unmountNew.signal.aborted, true, "组件卸载应中止当前连接");
});

test("迟到的收尾按 runId 只摘自己的连接，不影响新一轮", () => {
  const { controller } = makeController();
  const oldAbort = new AbortController();
  const newAbort = new AbortController();
  controller.begin(1, 10);
  controller.registerController(1, 10, oldAbort);
  controller.begin(1, 11);
  controller.registerController(1, 11, newAbort);

  controller.dropController(1, 10);
  assert.equal(oldAbort.signal.aborted, false, "连接结束只需摘登记，不触发中止");
  assert.equal(controller.controllerFor(1, 11), newAbort, "新一轮连接不受影响");

  controller.abort(1, 11);
  assert.equal(newAbort.signal.aborted, true);
  assert.equal(controller.controllerFor(1), undefined, "全部收尾后不留登记");
});

test("当前轮次的定时器仍会执行，作废后的全局定时器不会", async () => {
  const { controller } = makeController();
  controller.begin(1, 10);
  let ran = 0;
  controller.schedule(1, 10, () => { ran += 1; }, 10);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(ran, 1);

  const oldGlobal = controller.nextRunId();
  controller.nextRunId();
  controller.scheduleGlobal(oldGlobal, () => { ran += 100; }, 10);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(ran, 1, "全局运行号前进后旧 PPT 定时器不应再改 UI");
});
