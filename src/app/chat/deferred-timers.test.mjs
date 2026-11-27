import test from "node:test";
import assert from "node:assert/strict";
import { createDeferredTimers } from "./deferred-timers.ts";

test("卸载时 dispose 取消所有尚未触发的延迟发送", () => {
  const scheduled = [];
  const cancelled = [];
  const registry = createDeferredTimers(
    (callback, delay) => {
      const handle = scheduled.length + 1;
      scheduled.push({ handle, callback, delay });
      return handle;
    },
    handle => cancelled.push(handle),
  );
  let fired = 0;
  registry.schedule(() => { fired += 1; }, 80);
  registry.schedule(() => { fired += 1; }, 0);
  assert.equal(registry.size, 2);
  assert.deepEqual(scheduled.map(item => item.delay), [80, 0]);

  registry.dispose();
  assert.deepEqual(cancelled, [1, 2], "两条未触发的定时器都应被取消");
  assert.equal(registry.size, 0);
  // 真实定时器在 clearTimeout 后不会再调用回调；这里按取消结果模拟调度器。
  scheduled.filter(item => !cancelled.includes(item.handle)).forEach(item => item.callback());
  assert.equal(fired, 0, "被取消的回调不应再被调度，也不应触发业务");
});

test("调度器在同一任务里同步触发回调也不会报错或残留登记", () => {
  const registry = createDeferredTimers((callback) => { callback(); return -1; }, () => {});
  let fired = 0;
  assert.doesNotThrow(() => registry.schedule(() => { fired += 1; }, 80));
  assert.equal(fired, 1);
  assert.equal(registry.size, 0, "已触发的回调不应留在卸载清理列表里");
});

test("已触发的回调不再残留在待清理列表，dispose 不影响其他延迟发送", () => {
  const cancelled = [];
  let nextHandle = 0;
  const scheduled = [];
  const registry = createDeferredTimers(
    (callback, delay) => {
      const handle = ++nextHandle;
      scheduled.push({ handle, callback, delay });
      return handle;
    },
    handle => cancelled.push(handle),
  );
  let fired = 0;
  registry.schedule(() => { fired += 1; }, 80);
  registry.schedule(() => { fired += 1; }, 80);
  scheduled[0].callback();
  assert.equal(fired, 1);
  assert.equal(registry.size, 1);

  registry.dispose();
  assert.deepEqual(cancelled, [2], "只取消仍未触发的那条");
  if (!cancelled.includes(scheduled[1].handle)) scheduled[1].callback();
  assert.equal(fired, 1, "取消后的定时器不应再触发");
});
