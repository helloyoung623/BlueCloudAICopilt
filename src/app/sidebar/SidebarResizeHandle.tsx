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
export function SidebarResizeHandle({ width, onWidthChange }: {
  width: number;
  onWidthChange: (width: number) => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // 双击复位：pointerdown 里自己记时间戳判断，不依赖 dblclick
  // （手柄上有 preventDefault + 指针捕获，部分路径下 dblclick 不会触发）
  const lastDown = useRef<{ time: number; x: number; y: number } | null>(null);
  // 拖动过程要读最新的宽度与回调，避免闭包拿到旧值
  const live = useRef({ width, onWidthChange });
  live.current = { width, onWidthChange };

  useEffect(() => () => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

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
    "aria-label": "调整侧边栏宽度",
    "aria-valuemin": SIDEBAR_WIDTH_MIN,
    "aria-valuemax": SIDEBAR_WIDTH_MAX,
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
        live.current.onWidthChange(SIDEBAR_WIDTH_DEFAULT);
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
      // 侧边栏在左边：往右拖 = 变宽
      live.current.onWidthChange(resolveDraggedSidebarWidth(current.startWidth, current.startX, event.clientX));
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
      className="group absolute right-0 top-0 z-30 flex h-full w-[8px] cursor-col-resize items-stretch justify-end focus-visible:outline-2 focus-visible:outline-[#1e63f5]"
    >
      {/* 悬停 / 拖动时在侧栏右边缘亮一条 2px 蓝线，提示这里可以拖 */}
      <span className={`w-[2px] transition-colors ${
        dragging
          ? "bg-[#1e63f5]"
          : "bg-transparent group-hover:bg-[#1e63f5] group-focus-visible:bg-[#1e63f5]"
      }`} />
    </div>
  );
}
