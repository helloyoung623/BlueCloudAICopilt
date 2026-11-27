import { useCallback, useEffect } from "react";

// Radix Dialog 打开时会用 react-remove-scroll 锁定页面滚动：它在 document 冒泡阶段
// 监听 wheel/touchmove，对不在「锁内」的 portal 面板会 preventDefault，导致下拉列表
// 即使设了 overflow-y:auto 也滚不动。这里在滚动容器自身上用「非 passive 的原生捕获监听」
// 完全接管 wheel：手动滚动 scrollTop + 截断传播，不依赖浏览器默认滚动，确保一定能滚。
function useUnlockScrollInDialog() {
  // 用 callback ref：下拉面板是条件渲染，元素出现时才绑定监听（useEffect([]) 时元素尚不存在）
  return useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    // 捕获阶段在事件到达 target 之前就接管，绝不会冒泡到 document 上的滚动锁监听器。
    const onWheel = (event: WheelEvent) => {
      // preventDefault 取消浏览器默认滚动（避免与手动滚动叠加成双倍速度），
      // stopPropagation 阻止事件冒泡到 document 上的 react-remove-scroll 滚动锁。
      event.preventDefault();
      event.stopPropagation();
      // deltaMode: 0=像素, 1=行, 2=页
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += event.deltaY * step;
    };
    // passive:false 必须： otherwise preventDefault 会被忽略
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
  }, []);
}

// 下拉面板展开后，点击面板与触发按钮以外的任何地方都自动收起。
// 用 capture 阶段监听 document 的 pointerdown，避开 OperationMenu 内部的 stopPropagation；
// 通过 data-operation-menu 属性识别面板内部点击（交给面板自身处理，不在这里收起）。
export function useDismissOnOutside(anchor: HTMLElement | null, setAnchor: (value: null) => void) {
  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchor.contains(target)) return; // 点击触发按钮：交给按钮的 toggle 逻辑
      if (target instanceof Element && target.closest("[data-operation-menu]")) return; // 点击面板内部
      setAnchor(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, setAnchor]);
}

export { useUnlockScrollInDialog };
