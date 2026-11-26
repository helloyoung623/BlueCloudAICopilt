import { useEffect, useRef } from "react";
import lottieData from "../assets/radar-arc.light.json";

// 工具执行中的 loading 指示器：直接复刻 radar-arc.light.json（Lottie）的点阵弧动画。
// 原文件只有「圆形 + 纯色填充 + 透明度关键帧 + 固定位置」，所以不需要引入 lottie 运行时，
// 用 SVG 画点 + requestAnimationFrame 按帧插值透明度即可，零依赖、体积可控。

type Keyframe = { t: number; v: number; hold: boolean };
type Dot = { cx: number; cy: number; r: number; color: string; kf: Keyframe[] };

const CANVAS_W = lottieData.w;
const CANVAS_H = lottieData.h;
const FPS = lottieData.fr;
const IN_FRAME = lottieData.ip;
const OUT_FRAME = lottieData.op;

type LottieShape = { ty?: string; s?: { k: number[] }; c?: { k: number[] } };
type LottieKeyframe = { t: number; s: number[]; h?: number };
type LottieLayer = {
  ks: { o: { a: number; k: number | LottieKeyframe[] }; p: { k: number[] } };
  shapes: LottieShape[];
};

const DOTS: Dot[] = (lottieData.layers as LottieLayer[]).map(layer => {
  const [cx, cy] = layer.ks.p.k;
  const animated = layer.ks.o.a === 1;
  const rawKeyframes: LottieKeyframe[] = animated
    ? (layer.ks.o.k as LottieKeyframe[])
    : [{ t: 0, s: [layer.ks.o.k as number] }];
  const kf: Keyframe[] = rawKeyframes.map(k => ({ t: k.t, v: k.s?.[0] ?? 100, hold: k.h === 1 }));
  const ellipse = layer.shapes.find(s => s.ty === "el");
  const fill = layer.shapes.find(s => s.ty === "fl");
  const size = ellipse?.s?.k?.[0] ?? 0;
  const [r, g, b] = (fill?.c?.k ?? [0, 0, 0, 1]).map(n => Math.round(n * 255));
  return { cx, cy, r: size / 2, color: `rgb(${r},${g},${b})`, kf };
});

// Lottie 的关键帧 h:1 表示保持上一帧的值直到下一个关键帧（阶梯变化）
function opacityAt(kf: Keyframe[], frame: number): number {
  if (kf.length === 1) return kf[0].v;
  let prev = kf[0];
  for (let i = 1; i < kf.length; i += 1) {
    const cur = kf[i];
    if (frame < cur.t) {
      if (prev.hold || cur.hold) return prev.v;
      const span = cur.t - prev.t || 1;
      return prev.v + (cur.v - prev.v) * ((frame - prev.t) / span);
    }
    prev = cur;
  }
  return prev.v;
}

export function RadarArcLoader({ size = 16, opacityScale = 1, className }: { size?: number; opacityScale?: number; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const circles = Array.from(svg.querySelectorAll("circle")) as SVGCircleElement[];
    const durationFrames = OUT_FRAME - IN_FRAME;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const frame = IN_FRAME + ((((now - start) / 1000) * FPS) % durationFrames);
      for (let i = 0; i < circles.length; i += 1) {
        const value = opacityAt(DOTS[i].kf, frame) / 100;
        circles[i].style.opacity = String(Math.min(1, value * opacityScale));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [opacityScale]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={size}
      height={size}
      aria-hidden
      className={className ?? "shrink-0"}
      style={{ display: "block" }}
    >
      {DOTS.map((dot, index) => (
        <circle
          key={index}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill={dot.color}
          style={{ opacity: dot.kf[0].v / 100 }}
        />
      ))}
    </svg>
  );
}

export default RadarArcLoader;
