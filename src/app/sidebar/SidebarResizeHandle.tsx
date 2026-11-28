import { useEffect, useRef, useState } from "react";
import {
  clampSidebarWidth,
  resolveDraggedSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STEP,
  SIDEBAR_WIDTH_STEP_LARGE,
} from "./sidebar-width";

// 侧边栏右边缘的拖拽手柄：按住左右拖动改宽，双击回到默认宽度，方向键微调。
// 交互与右侧详情栏的手柄（use-detail-panel-width）保持一致。
export function SidebarResizeHandle({ width, onWidthChange, onDraggingChange, onHoverChange }: {
  width: number;
  onWidthChange: (width: number) => void;
  // 拖动状态回报给外层：拖动时把侧栏右边缘那条分隔线换成品牌蓝，作为拖动反馈
  onDraggingChange?: (dragging: boolean) => void;
  // 悬停状态回报给外层：鼠标移到右边缘那条线（热区）上就把分隔线换成品牌蓝
  onHoverChange?: (hovering: boolean) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; latestWidth: number } | null>(null);
  // hover 或拖动时显示那条渐变指示线（与详情栏拖动线统一样式，Figma 10209:42379）
  const [lineActive, setLineActive] = useState(false);
  // 双击复位：pointerdown 里自己记时间戳判断，不依赖 dblclick
  // （手柄上有 preventDefault + 指针捕获，部分路径下 dblclick 不会触发）
  const lastDown = useRef<{ time: number; x: number; y: number } | null>(null);
  // 拖动过程要读最新的宽度与回调，避免闭包拿到旧值
  const live = useRef({ width, onWidthChange, onDraggingChange, onHoverChange });
  live.current = { width, onWidthChange, onDraggingChange, onHoverChange };

  useEffect(() => () => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const current = drag.current;
    drag.current = null;
    // 松手时若鼠标已离开热区则收起指示线（事件序列里 pointerleave 可能被吞）
    if (!event.currentTarget.matches(":hover")) setLineActive(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    // 松手落在 241~271 的过渡带：按拖动方向吸附到稳定态
    // 往宽拖 → 272（左 logo 右操作项）；往窄拖 → 240（操作项在 logo 上方）
    const target = current.latestWidth;
    if (target > 240 && target < 272) {
      const movingWider = target >= current.startWidth;
      live.current.onWidthChange(movingWider ? 272 : 240);
    }
    live.current.onDraggingChange?.(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": "调整侧边栏宽度",
    "aria-valuemin": SIDEBAR_WIDTH_MIN,
    "aria-valuemax": SIDEBAR_WIDTH_MAX,
    "aria-valuenow": width,
    tabIndex: 0,
    // 悬停到右边缘热区就显示渐变指示线（不需要真的按住拖动）
    onPointerEnter: () => { setLineActive(true); live.current.onHoverChange?.(true); },
    onPointerLeave: () => { if (!drag.current) setLineActive(false); live.current.onHoverChange?.(false); },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // 第二下（320ms 内、位置基本没动）视为双击 → 复位到默认宽度
      const previous = lastDown.current;
      if (previous && Date.now() - previous.time < 320
        && Math.abs(previous.x - event.clientX) < 6 && Math.abs(previous.y - event.clientY) < 6) {
        lastDown.current = null;
        live.current.onWidthChange(SIDEBAR_WIDTH_DEFAULT);
        return;
      }
      lastDown.current = { time: Date.now(), x: event.clientX, y: event.clientY };
      // 不在这里手动 focus：浏览器把程序化聚焦也当成 focus-visible，
      // 会在右边缘画出一圈 2px 蓝色描边，拖动时看着像多出来的一条线。
      // 焦点环留给键盘（Tab 过来时显示），鼠标拖动只留 col-resize 光标。
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: live.current.width, latestWidth: live.current.width };
      setLineActive(true);
      live.current.onDraggingChange?.(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current) return;
      // 侧边栏在左边：往右拖 = 变宽
      const nextWidth = resolveDraggedSidebarWidth(current.startWidth, current.startX, event.clientX);
      current.latestWidth = nextWidth;
      live.current.onWidthChange(nextWidth);
    },
    onPointerUp: endDrag,
    // 手指被系统手势打断 / pointercancel 时也要收尾，别把 body 的 cursor 留在 col-resize
    onPointerCancel: endDrag,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Home") {
        event.preventDefault();
        live.current.onWidthChange(SIDEBAR_WIDTH_DEFAULT);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.shiftKey ? SIDEBAR_WIDTH_STEP_LARGE : SIDEBAR_WIDTH_STEP;
      // 侧边栏在左边：ArrowLeft = 变窄
      const next = live.current.width + (event.key === "ArrowLeft" ? -step : step);
      live.current.onWidthChange(clampSidebarWidth(next));
    },
  };

  return (
    <div
      {...handleProps}
      className="absolute right-0 top-0 z-30 h-full w-[8px] cursor-col-resize focus-visible:outline-2 focus-visible:outline-[#1e63f5]"
    >
      {/* 渐变指示线：与详情栏左边缘那条完全同款（Figma 10209:42379）。
          right-[-1px] 把它压到侧栏那 1px 分隔边框上——蓝线 2px 直接替代原边框；
          若与边框并排会变成「2px 蓝 + 1px 灰 = 3px」，看着比设计稿粗。 */}
      <span
        aria-hidden
        className="resize-indicator right-[-1px]"
        style={{ opacity: lineActive ? 1 : 0 }}
      />
    </div>
  );
}
