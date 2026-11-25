import { useEffect, useRef } from "react";

/**
 * 首页背景点阵动效（对齐 Manus 登录页的「点云呼吸」效果）：
 * 白底上一批有机形状的点云团块在原地缓慢浮现/消散，团块本身缓慢游走。
 * 纯 canvas 绘制，~30fps；prefers-reduced-motion 时只画一帧静态图。
 * dotColor 可切换点的颜色：开场垫 shader 背景时用白色点，背景退场后用灰色点。
 */
export function DotField({ className = "", dotColor = "#000000" }: { className?: string; dotColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(dotColor);
  colorRef.current = dotColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPACING = 14;          // 点阵间距（CSS px）
    // 点直径随宽度自适应：>800px 用 2.2，≤800px 用 1.6
    const dotRadius = () => (width > 800 ? 1.1 : 0.8);
    // 点云团块：每个团块有各自的游走轨迹（椭圆李萨如）与呼吸相位
    const BLOBS = [
      { rx: 0.28, ry: 0.30, r: 190, fx: 0.021, fy: 0.017, px: 0.0,  py: 2.1,  breathe: 9.0, bp: 0.0 },
      { rx: 0.72, ry: 0.24, r: 150, fx: 0.016, fy: 0.023, px: 1.7,  py: 0.6,  breathe: 11.0, bp: 2.4 },
      { rx: 0.20, ry: 0.70, r: 170, fx: 0.019, fy: 0.015, px: 4.1,  py: 1.2,  breathe: 8.0, bp: 4.0 },
      { rx: 0.78, ry: 0.74, r: 210, fx: 0.014, fy: 0.020, px: 2.9,  py: 3.3,  breathe: 12.0, bp: 1.2 },
      { rx: 0.50, ry: 0.48, r: 130, fx: 0.026, fy: 0.018, px: 5.2,  py: 4.4,  breathe: 10.0, bp: 5.1 },
      { rx: 0.40, ry: 0.86, r: 120, fx: 0.018, fy: 0.024, px: 0.9,  py: 5.0,  breathe: 9.5, bp: 3.2 },
      { rx: 0.90, ry: 0.52, r: 110, fx: 0.022, fy: 0.026, px: 3.6,  py: 2.6,  breathe: 8.5, bp: 6.0 },
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const smooth = (v: number) => {
      // 软阈值：低于 0.18 全透明，0.55 到峰值，形成柔和的团块边缘
      if (v <= 0.18) return 0;
      if (v >= 0.55) return 1;
      const t = (v - 0.18) / (0.55 - 0.18);
      return t * t * (3 - 2 * t);
    };

    const draw = (time: number) => {
      const color = colorRef.current;
      // 灰点走低透明度（背景上的淡灰），白点（垫在 shader 背景上）用不透明度高的实色
      const alphaMax = color.toLowerCase() === "#ffffff" ? 0.9 : 0.16;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      const t = time / 1000;
      // 预计算每个团块的中心/半径/呼吸强度
      const centers = BLOBS.map(b => {
        const cx = (b.rx + 0.06 * Math.cos(t * b.fx * Math.PI * 2 + b.px)) * width;
        const cy = (b.ry + 0.06 * Math.sin(t * b.fy * Math.PI * 2 + b.py)) * height;
        const r2 = b.r * b.r;
        const amp = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((t / b.breathe) * Math.PI * 2 + b.bp));
        return { cx, cy, r2, amp };
      });
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          let v = 0;
          for (const c of centers) {
            const dx = x - c.cx;
            const dy = y - c.cy;
            const d2 = dx * dx + dy * dy;
            if (d2 > c.r2 * 4) continue;
            // 高斯衰减 + 一点噪声扰动让边缘呈有机形状
            const g = Math.exp(-d2 / (c.r2 * 0.9));
            v += g * c.amp;
          }
          const a = smooth(v) * alphaMax;
          if (a <= 0.004) continue;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius(), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    resize();
    draw(0);
    if (reduced) return;

    let raf = 0;
    let last = -1000;
    const loop = (now: number) => {
      if (now - last >= 33) { // ~30fps 足够，省电省 CPU
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const observer = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none absolute inset-0 block h-full w-full ${className}`} />;
}
