import type { CSSProperties, ReactElement } from "react";

import "./dotm-circular-2.css";

const MATRIX = 5;
/** 外圈 12 个点（5×5 去掉四个角），按顺时针排列；数字是这一圈上的顺序 */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 3],
  [4, 2],
  [4, 1],
  [3, 0],
  [2, 0],
  [1, 0]
];
const CORNERS = new Set(["0,0", "0,4", "4,0", "4,4"]);
/** 圆心点比其余内圈点略亮：0.18 在 0.08→0.34 区间上的插值位置 */
const CENTER_T = (0.18 - 0.08) / (0.34 - 0.08);

type DotmCircular2Props = {
  /** 点阵整体边长（px） */
  size?: number;
  /** 单个圆点直径（px） */
  dotSize?: number;
  speed?: number;
  opacityBase?: number;
  opacityMid?: number;
  opacityPeak?: number;
  className?: string;
};

/**
 * Dot Matrix「dotm-circular-2」环形点阵加载：5×5 点阵去掉四角，
 * 外圈 12 个点按 1/12 周期依次点亮绕圈，内圈保持低透明度。
 * 几何与关键帧对齐官方 registry（dotm-circular-2 / dotmatrix-core）。
 */
export function DotmCircular2({
  size = 19,
  dotSize = 3,
  speed = 1.8,
  opacityBase = 0.12,
  opacityMid = 0.42,
  opacityPeak = 1,
  className = ""
}: DotmCircular2Props) {
  // 允许小数间距，保证点阵外框边长精确等于 size（四舍五入会让视觉尺寸偏差 1px）
  const gap = Math.max(0.5, (size - dotSize * MATRIX) / (MATRIX - 1));
  const step = dotSize + gap;
  const span = dotSize * MATRIX + gap * (MATRIX - 1);
  const radius = dotSize / 2;

  // 用 SVG 圆点绘制，而不是 CSS grid + div 方块：
  // 16px 框里点径会落在小数像素上（2.4px），div 会被取整成 2px / 3px 的块，
  // 放大后时粗时细；SVG 圆走抗锯齿，和对话内 RadarArcLoader 的观感一致。
  const rootStyle = {
    width: span,
    height: span,
    "--dotm-speed": 1 / Math.max(speed, 0.01),
    "--dotm-base": opacityBase,
    "--dotm-mid": opacityMid,
    "--dotm-peak": opacityPeak
  } as CSSProperties;

  const dots: ReactElement[] = [];
  for (let row = 0; row < MATRIX; row++) {
    for (let col = 0; col < MATRIX; col++) {
      const ringIndex = RING.findIndex(([r, c]) => r === row && c === col);
      const style: CSSProperties = {};
      let dotClass = "";
      let opacity: number | undefined;

      if (CORNERS.has(`${row},${col}`)) continue;
      if (ringIndex >= 0) {
        dotClass = "dotm-c2-ring";
        (style as CSSProperties & Record<string, number>)["--dotm-order"] = ringIndex;
      } else {
        const isCenter = row === 2 && col === 2;
        opacity = isCenter ? opacityBase + (opacityMid - opacityBase) * CENTER_T : opacityBase;
      }

      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={radius + col * step}
          cy={radius + row * step}
          r={radius}
          fill="currentColor"
          className={dotClass}
          style={{ ...style, opacity }}
        />
      );
    }
  }

  return (
    <svg
      aria-hidden
      className={`dotm-c2 ${className}`.trim()}
      viewBox={`0 0 ${span} ${span}`}
      width={span}
      height={span}
      style={rootStyle}
    >
      {dots}
    </svg>
  );
}
