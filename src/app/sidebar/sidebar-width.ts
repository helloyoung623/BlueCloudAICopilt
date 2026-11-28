// 侧边栏宽度：可以拖右边缘调整，默认 240，允许范围 200 ~ 480。
// 算法单独放一个文件，单测直接覆盖，不依赖 React。

/** 默认宽度：与设计稿一致 */
export const SIDEBAR_WIDTH_DEFAULT = 240;
/** 宽版布局宽度：拖动吸附点（241~271 往宽拖到此处），也是浮层抽屉固定宽度（Figma 9254:45576 Sidebar=272） */
export const SIDEBAR_WIDTH_WIDE = 272;
/** 最窄宽度：再窄就放不下「项目 / 自动化任务 / 资料库」这些导航项 */
export const SIDEBAR_WIDTH_MIN = 200;
/** 最宽宽度：再宽会把主内容区挤得太窄 */
export const SIDEBAR_WIDTH_MAX = 480;
/** 键盘微调步长；按住 Shift 走大步长 */
export const SIDEBAR_WIDTH_STEP = 16;
export const SIDEBAR_WIDTH_STEP_LARGE = 64;
/** localStorage 键：记住用户上次拖到的宽度 */
export const SIDEBAR_WIDTH_STORAGE_KEY = "sidebar-width";

/** 把宽度夹到合法区间；不是数字（NaN / 记录损坏）就回落到默认宽度 */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

/**
 * 拖动过程中的目标宽度：按下时的宽度 + 横向位移，再夹到合法区间。
 * 侧边栏在左边，往右拖就是变宽。
 */
export function resolveDraggedSidebarWidth(startWidth: number, startX: number, currentX: number): number {
  return clampSidebarWidth(startWidth + (currentX - startX));
}

/** 读回上次记住的宽度；没有记录 / 记录损坏 / 超范围都按默认宽度处理 */
export function readStoredSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw === null) return SIDEBAR_WIDTH_DEFAULT;
    return clampSidebarWidth(Number(raw));
  } catch {
    // localStorage 不可用（隐私模式等）：按默认宽度走
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

/** 记住宽度；localStorage 不可用时静默跳过，本次会话内仍然生效 */
export function storeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    /* 存不下就算了 */
  }
}
