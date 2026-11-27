// 延迟发送（自动化立即执行、失败重试）的定时器登记。
// 只负责登记/取消，不含业务；注入调度函数便于用假定时器稳定测试卸载清理。
export type DeferredTimerRegistry = {
  schedule: (callback: () => void, delay: number) => number;
  dispose: () => void;
  readonly size: number;
};

export function createDeferredTimers(
  scheduleTimer: (callback: () => void, delay: number) => number,
  cancelTimer: (handle: number) => void,
): DeferredTimerRegistry {
  const pending = new Set<number>();
  return {
    schedule(callback, delay) {
      // 调度器可能在同一个 JS 任务里立刻执行回调（测试可稳定复现「React 未提交就到时」），
      // 所以不能在回调里直接引用尚未赋值的 handle。
      let handle: number | undefined;
      let fired = false;
      const id = scheduleTimer(() => {
        fired = true;
        if (handle !== undefined) pending.delete(handle);
        callback();
      }, delay);
      handle = id;
      if (!fired) pending.add(id);
      return id;
    },
    dispose() {
      pending.forEach(handle => cancelTimer(handle));
      pending.clear();
    },
    get size() { return pending.size; },
  };
}
