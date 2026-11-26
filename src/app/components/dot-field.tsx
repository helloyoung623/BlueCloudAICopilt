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
    // 点直径随宽度自适应：>800px 用 3.0，≤800px 用 2.0
    const dotRadius = () => (width > 800 ? 1.5 : 1.0);
    // 点云团块：每个团块有各自的游走轨迹（椭圆李萨如）与呼吸相位
    const BLOBS = [
      { rx: 0.28, ry: 0.30, r: 190, fx: 0.24655, fy: 0.1771, px: 0.0,  py: 2.1,  breathe: 9.0, bp: 0.0 },
      { rx: 0.72, ry: 0.24, r: 150, fx: 0.15976, fy: 0.28123, px: 1.7,  py: 0.6,  breathe: 11.0, bp: 2.4 },
      { rx: 0.20, ry: 0.70, r: 170, fx: 0.21186, fy: 0.14242, px: 4.1,  py: 1.2,  breathe: 8.0, bp: 4.0 },
      { rx: 0.78, ry: 0.74, r: 210, fx: 0.125, fy: 0.22921, px: 2.9,  py: 3.3,  breathe: 12.0, bp: 1.2 },
      { rx: 0.50, ry: 0.48, r: 130, fx: 0.33333, fy: 0.19444, px: 5.2,  py: 4.4,  breathe: 10.0, bp: 5.1 },
      { rx: 0.40, ry: 0.86, r: 120, fx: 0.19444, fy: 0.29865, px: 0.9,  py: 5.0,  breathe: 9.5, bp: 3.2 },
      { rx: 0.90, ry: 0.52, r: 110, fx: 0.26389, fy: 0.33333, px: 3.6,  py: 2.6,  breathe: 8.5, bp: 6.0 },
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;

    // 每个网格点各自独立「生灭」：target 0/1 表示要消失/出现，v 平滑趋近 target，
    // 到期后随机翻转 —— 视觉上就是有的点逐渐消失、有的地方随机冒出新点。
    // ox/oy：鼠标交互造成的位移（推开/吸引）；flash：鼠标经过时的短暂高亮。
    type DotLife = { v: number; target: number; next: number; ox: number; oy: number };
    const lives = new Map<number, DotLife>();
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    let lastDrawTime = 0;

    // 鼠标交互状态（canvas 是 pointer-events-none，事件挂在 window 上换算相对坐标）
    const mouse = { x: 0, y: 0, active: false };
    const HOVER_R = 200;   // 影响半径（CSS px）：范围内的点被向外推开
    const PUSH = 24;       // 中心最大推开距离（CSS px）


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
      // 距上一帧的时间（ms），用于点的淡入/淡出缓动；时间常数 0.45s ≈ 1.5s 完成一次生灭
      const dt = Math.max(0, Math.min(time - lastDrawTime, 100));
      lastDrawTime = time;
      const blend = 1 - Math.exp(-dt / 450);
      // 鼠标位移缓动：0.25s 时间常数（跟手但不生硬）
      const mouseBlend = 1 - Math.exp(-dt / 250);
      // 预计算每个团块的中心/半径/呼吸强度
      const centers = BLOBS.map(b => {
        const cx = (b.rx + 0.06 * Math.cos(t * b.fx * Math.PI * 2 + b.px)) * width;
        const cy = (b.ry + 0.06 * Math.sin(t * b.fy * Math.PI * 2 + b.py)) * height;
        const r2 = b.r * b.r;
        const amp = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((t / b.breathe) * Math.PI * 2 + b.bp));
        return { cx, cy, r2, amp };
      });
      let row = 0;
      for (let y = SPACING / 2; y < height; y += SPACING, row++) {
        let col = 0;
        for (let x = SPACING / 2; x < width; x += SPACING, col++) {
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
          // 该点独立的生灭状态：到期随机翻转出现/消失，v 平滑过渡
          const key = row * 10000 + col;
          let life = lives.get(key);
          if (!life) {
            const initial = Math.random() < 0.55 ? 1 : 0;
            life = { v: initial, target: initial, next: rand(500, 5000), ox: 0, oy: 0 };
            lives.set(key, life);
          }
          if (time >= life.next) {
            life.target = Math.random() < 0.55 ? 1 : 0;
            life.next = time + rand(1500, 6000);
          }
          life.v += (life.target - life.v) * blend;

          // 鼠标交互：范围内的点沿远离光标方向被推开（中心最强，到 HOVER_R 归零）
          let tx = 0, ty = 0;
          if (mouse.active) {
            const dx = x - mouse.x, dy = y - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < HOVER_R && dist > 0.001) {
              const push = (1 - dist / HOVER_R) * PUSH;
              tx = (dx / dist) * push; ty = (dy / dist) * push;
            }
          }
          life.ox += (tx - life.ox) * mouseBlend;
          life.oy += (ty - life.oy) * mouseBlend;

          const a = smooth(v) * alphaMax * life.v;
          if (a <= 0.004) continue;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x + life.ox, y + life.oy, dotRadius(), 0, Math.PI * 2);
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

    // 鼠标经过：只给光标附近 ~30px 内的点触发闪光，随后自然衰减
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      mouse.x = mx; mouse.y = my;
      mouse.active = mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height;
    };
    const onLeave = () => { mouse.active = false; };
    const onMouseOut = (e: MouseEvent) => { if (!e.relatedTarget) onLeave(); };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onMouseOut);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onMouseOut);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none absolute inset-0 block h-full w-full ${className}`} />;
}
