import { beginBody, endGeneration, startGeneration, type GenerationState } from "./generation-state.ts";

// 按会话隔离的生成轮次登记。
// 纯状态部分（phase 状态机）复用 generation-state.ts；这里只负责「哪个 runId 还有效」、
// SSE 对应的 AbortController、演示流程的计时器，以及给 UI 的状态快照。
// 所有更新都按会话 + runId 校验：切会话不会作废后台轮次，同会话新一轮会作废旧轮次。
export type GenerationStates = ReadonlyMap<number, GenerationState>;

export class GenerationRunController {
  private nextId = 0;
  private currentRuns = new Map<number, number>();
  // 一个会话可能同时留着多条连接：正文结束后（answer.end）连接没关又发起新一轮时，
  // 旧轮次还在等服务端把推荐追问发完。按 runId 分别登记，避免新轮次覆盖旧请求后
  // 停止/删除/卸载再也找不到旧连接。
  private controllers = new Map<number, Map<number, AbortController>>();
  private timers = new Map<number, Set<ReturnType<typeof setTimeout>>>();
  private states = new Map<number, GenerationState>();
  private readonly onChange: (states: GenerationStates) => void;

  constructor(onChange: (states: GenerationStates) => void = () => {}) {
    this.onChange = onChange;
  }

  private emit = () => { this.onChange(new Map(this.states)); };

  // 全局运行号：PPT / 演示流程没有 SSE 会话轮次，沿用原来的全局作废语义。
  nextRunId = (): number => { this.nextId += 1; return this.nextId; };
  invalidateGlobal = (): void => { this.nextId += 1; };
  isLatestGlobal = (runId: number): boolean => this.nextId === runId;

  runIdOf = (conversationId: number): number | undefined => this.currentRuns.get(conversationId);
  isCurrent = (conversationId: number, runId: number): boolean => this.currentRuns.get(conversationId) === runId;
  claimRun = (conversationId: number, runId: number): void => { this.currentRuns.set(conversationId, runId); };
  invalidateRun = (conversationId: number): void => { this.currentRuns.delete(conversationId); };
  stateOf = (conversationId: number): GenerationState | undefined => this.states.get(conversationId);

  begin = (conversationId: number, runId: number): void => {
    this.currentRuns.set(conversationId, runId);
    this.states.set(conversationId, startGeneration(runId));
    this.emit();
  };

  // phase 更新只看「这条消息属于哪一轮」；事件本身是否迟到由调用方用 isCurrent 守卫。
  private transition = (conversationId: number, runId: number, update: (state: GenerationState) => GenerationState): void => {
    // 状态更新本身也要核对 runId：即使调用方的事件守卫漏了，旧轮次也推不动当前状态。
    if (!this.isCurrent(conversationId, runId)) return;
    const previous = this.states.get(conversationId);
    if (!previous || previous.runId !== runId) return;
    const next = update(previous);
    if (next === previous) return;
    this.states.set(conversationId, next);
    this.emit();
  };

  phaseBody = (conversationId: number, runId: number): void => {
    this.transition(conversationId, runId, beginBody);
  };

  phaseEnd = (conversationId: number, runId: number): void => {
    this.transition(conversationId, runId, endGeneration);
  };

  clearState = (conversationId: number, runId?: number): void => {
    const state = this.states.get(conversationId);
    if (!state || (runId !== undefined && state.runId !== runId)) return;
    this.states.delete(conversationId);
    this.emit();
  };

  controllerFor = (conversationId: number, runId?: number): AbortController | undefined => {
    const runs = this.controllers.get(conversationId);
    if (!runs) return undefined;
    return runId === undefined ? [...runs.values()].at(-1) : runs.get(runId);
  };
  registerController = (conversationId: number, runId: number, controller: AbortController): void => {
    let runs = this.controllers.get(conversationId);
    if (!runs) {
      runs = new Map();
      this.controllers.set(conversationId, runs);
    }
    runs.set(runId, controller);
  };
  // 带 runId 只动这一轮（迟到收尾不能碰新一轮的连接）；不带则处理该会话的全部连接。
  abort = (conversationId: number, runId?: number): void => {
    const runs = this.controllers.get(conversationId);
    if (!runs) return;
    if (runId !== undefined) {
      const controller = runs.get(runId);
      runs.delete(runId);
      if (!runs.size) this.controllers.delete(conversationId);
      if (controller && !controller.signal.aborted) controller.abort();
      return;
    }
    this.controllers.delete(conversationId);
    runs.forEach(controller => { if (!controller.signal.aborted) controller.abort(); });
  };
  dropController = (conversationId: number, runId?: number): void => {
    const runs = this.controllers.get(conversationId);
    if (!runs) return;
    if (runId === undefined) {
      this.controllers.delete(conversationId);
      return;
    }
    runs.delete(runId);
    if (!runs.size) this.controllers.delete(conversationId);
  };

  // 停止：作废这一会话的当前轮次（全局号也前进），中断请求，但把 phase 留在 idle，
  // 保留已经收到的正文；迟到的 SSE 事件因为 runId 不再匹配会被丢弃。
  stop = (conversationId: number): number | undefined => {
    const runId = this.currentRuns.get(conversationId);
    this.invalidateGlobal();
    this.invalidateRun(conversationId);
    this.abort(conversationId);
    const state = this.states.get(conversationId);
    if (state) {
      this.states.set(conversationId, endGeneration(state));
      this.emit();
    }
    return runId;
  };

  // 删除会话：不再保留任何轮次、请求和计时器。
  forget = (conversationId: number): void => {
    this.abort(conversationId);
    this.clearTimers(conversationId);
    this.invalidateRun(conversationId);
    this.clearState(conversationId);
  };

  private trackTimer = (conversationId: number, timer: ReturnType<typeof setTimeout>): void => {
    const set = this.timers.get(conversationId) ?? new Set<ReturnType<typeof setTimeout>>();
    set.add(timer);
    this.timers.set(conversationId, set);
  };

  private untrackTimer = (conversationId: number, timer: ReturnType<typeof setTimeout>): void => {
    const set = this.timers.get(conversationId);
    if (!set) return;
    set.delete(timer);
    if (!set.size) this.timers.delete(conversationId);
  };

  // 计时器回调必须重新检查 runId：切到别的会话或删掉这一轮后，旧定时器什么也不做。
  schedule = (conversationId: number, runId: number, callback: () => void, delay: number): void => {
    const timer = setTimeout(() => {
      this.untrackTimer(conversationId, timer);
      if (!this.isCurrent(conversationId, runId)) return;
      callback();
    }, delay);
    this.trackTimer(conversationId, timer);
  };

  scheduleGlobal = (runId: number, callback: () => void, delay: number): void => {
    const timer = setTimeout(() => {
      this.untrackTimer(-1, timer);
      if (!this.isLatestGlobal(runId)) return;
      callback();
    }, delay);
    this.trackTimer(-1, timer);
  };

  clearTimers = (conversationId: number): void => {
    const set = this.timers.get(conversationId);
    if (!set) return;
    set.forEach(timer => clearTimeout(timer));
    this.timers.delete(conversationId);
  };

  // 页面卸载：不再有回调能安全地写消息，直接中断所有请求和计时器。
  dispose = (): void => {
    [...this.controllers.keys()].forEach(conversationId => this.abort(conversationId));
    [...this.timers.keys()].forEach(conversationId => this.clearTimers(conversationId));
  };
}
