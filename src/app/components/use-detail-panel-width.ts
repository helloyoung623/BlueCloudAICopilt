import * as React from "react";
import { useIsMobile } from "./ui/use-mobile";

// ============================================================================
// 右侧详情栏统一尺寸规则（会话页的卡片详情 与 自动化任务页的卡片详情 共用一套）
//   1. 默认宽度 = 内容区可用宽度的 50%，结果夹在 320 ~ 720 之间；
//   2. 可拖左边缘手动改宽，同样夹在 320 ~ 720，且始终给内容区留够 320；
//   3. 窗口 < 880（与并排断点一致）转右侧浮层，固定 320，不参与拖拽。
// 两处入口共享同一个手动宽度：任意一边拖过，另一边打开时也是这个宽度。
// ============================================================================
export const DETAIL_PANEL_MIN = 320;
export const DETAIL_PANEL_MAX = 720;
export const DETAIL_PANEL_BREAKPOINT = 880;

export const clampPanelWidth = (value: number, max = DETAIL_PANEL_MAX) =>
  Math.min(Math.max(value, DETAIL_PANEL_MIN), Math.max(DETAIL_PANEL_MIN, max));

let manualWidth: number | null = null;
const widthListeners = new Set<() => void>();
const readManualWidth = () => manualWidth;
const subscribeManualWidth = (listener: () => void) => {
  widthListeners.add(listener);
  return () => { widthListeners.delete(listener); };
};
const writeManualWidth = (next: number | null) => {
  if (manualWidth === next) return;
  manualWidth = next;
  widthListeners.forEach(listener => listener());
};

export function useDetailPanelWidth(panelRef: React.RefObject<HTMLElement | null>) {
  // 浮层断点：与自动化任务页「列表 320 + 详情 320」的并排条件保持一致
  const overlay = useIsMobile(DETAIL_PANEL_BREAKPOINT);
  const manual = React.useSyncExternalStore(subscribeManualWidth, readManualWidth, readManualWidth);
  const [available, setAvailable] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ startX: number; startWidth: number } | null>(null);
  // 双击手柄回到默认宽度：pointerdown 里自己记时间戳判断，
  // 不依赖 dblclick（手柄上有 preventDefault + 指针捕获，dblclick 在部分路径下不会触发）
  const lastDown = React.useRef<{ time: number; x: number; y: number } | null>(null);

  // 内容区可用宽度 = 面板前一个兄弟的左边 → 父容器右边界。
  // 会话页的父容器是整窗（还含导航列），自动化页是内容区本身；用「前一个兄弟」当起点，
  // 两种布局算出来的基准才是同一个东西。
  // 用 layout effect：首帧就量好，避免先按 320 画一帧再跳到 50%
  React.useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;
    const measure = () => {
      const parentRect = parent.getBoundingClientRect();
      const sibling = panel.previousElementSibling as HTMLElement | null;
      const left = sibling ? sibling.getBoundingClientRect().left : parentRect.left;
      setAvailable(Math.max(DETAIL_PANEL_MIN * 2, Math.round(parentRect.right - left)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    const sibling = panel.previousElementSibling;
    if (sibling) observer.observe(sibling);
    return () => observer.disconnect();
  }, [panelRef]);

  // 手动宽度上限还要受内容区约束：详情栏再宽也不能把内容区挤到 320 以下
  const maxWidth = Math.max(DETAIL_PANEL_MIN, Math.min(DETAIL_PANEL_MAX, available - DETAIL_PANEL_MIN));
  const autoWidth = available ? available / 2 : DETAIL_PANEL_MIN;
  const width = Math.round(clampPanelWidth(manual ?? autoWidth, maxWidth));

  // 拖拽过程里要读最新的宽度与上限，避免闭包拿到旧值
  const live = React.useRef({ width, maxWidth });
  live.current = { width, maxWidth };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": "调整详情栏宽度",
    "aria-valuemin": DETAIL_PANEL_MIN,
    "aria-valuemax": maxWidth,
    "aria-valuenow": width,
    tabIndex: 0,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // 第二下（320ms 内、位置基本没动）视为双击 → 复位到默认宽度
      const previous = lastDown.current;
      if (previous && Date.now() - previous.time < 320
        && Math.abs(previous.x - event.clientX) < 6 && Math.abs(previous.y - event.clientY) < 6) {
        lastDown.current = null;
        writeManualWidth(null);
        return;
      }
      lastDown.current = { time: Date.now(), x: event.clientX, y: event.clientY };
      // preventDefault 会拦掉默认聚焦，键盘微调（方向键）需要手动补一下焦点
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: live.current.width };
      setDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current) return;
      // 详情栏贴右边：鼠标往左拖 = 变宽
      writeManualWidth(Math.round(clampPanelWidth(
        current.startWidth + (current.startX - event.clientX),
        live.current.maxWidth,
      )));
    },
    onPointerUp: endDrag,
    // 手指被系统手势打断 / pointercancel 时也要收尾，别把 body 的 cursor 留在 col-resize
    onPointerCancel: endDrag,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.shiftKey ? 64 : 16;
      const next = live.current.width + (event.key === "ArrowLeft" ? step : -step);
      writeManualWidth(Math.round(clampPanelWidth(next, live.current.maxWidth)));
    },
  };

  React.useEffect(() => () => {
    if (!drag.current) return;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  return {
    overlay,
    width,
    maxWidth,
    dragging,
    // 浮层态宽度由样式表固定 320，这里不再覆盖
    style: overlay ? undefined : { width, flex: "0 0 auto" as React.CSSProperties["flex"] },
    handleProps,
  };
}
