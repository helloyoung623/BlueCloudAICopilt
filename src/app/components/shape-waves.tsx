import { useEffect, useRef } from "react";
import "./shape-waves.css";

/**
 * ShapeWaves —— solid-bits `shape-waves` 效果的本地实现（Canvas 2D 版本）。
 *
 * 原组件基于 WebGPU + WGSL，需要 GPU 适配器；这里按相同的参数模型重写：
 * 网格点阵 + 三档尺寸的图形，密度与尺寸由 fbm 噪声切出的三条明暗带给到，
 * 文字以「挖空」的方式从点阵中剔除，鼠标经过时溅出涟漪把图形点亮成 hoverColor。
 *
 * 参数语义与 solid-bits 文档一致，默认值也对齐原组件。
 */

export type ShapeWavesShapes = "mixed" | "squares" | "circles" | "triangles";

export type ShapeWavesProps = {
  /** 从点阵中挖空的文字（单元格落在字形上则留白） */
  text?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  /** 文字高度相对容器高度的比例 */
  textSize?: number;
  shapes?: ShapeWavesShapes;
  /** 单个网格的边长（CSS px） */
  cellSize?: number;
  /** 图形尺寸占单元格的比例 */
  dotSize?: number;
  color?: string;
  hoverColor?: string;
  backgroundColor?: string;
  speed?: number;
  scale?: number;
  contrast?: number;
  brightness?: number;
  flow?: number;
  direction?: number;
  fade?: number;
  interactive?: boolean;
  splashRadius?: number;
  splashStrength?: number;
  glow?: number;
  intro?: boolean;
  introDuration?: number;
  paused?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const MAX_DPR = 1.5;
const TIME_RATE = 0.1;
const SIMULATION_STEP = 1 / 60;
const WAVE_SPEED = 0.42;
const WAVE_DECAY = 0.972;
const SETTLED_THRESHOLD = 0.01;
const NOISE_CELLS = 32;
const INTRO_BAND = 0.2;
const INTRO_WARP = 0.3;
const INTRO_JITTER = 0.16;
const INTRO_END = 1 + INTRO_WARP + INTRO_JITTER + INTRO_BAND;
/** 归一化到 INTRO_END 之外一点，保证角上的格子也能出现 */
const INTRO_TOTAL = 1.8;
const LATTICE_STEP = 2;
const SHAPE_SIZE_STEPS = [0.45, 0.725, 1];

// ── 噪声（Perlin 3D + 两倍频 fbm，对齐原组件 cnoise/fbm 的用法） ──────────────

const PERM = new Uint8Array(512);
(() => {
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) source[i] = i;
  let seed = 1337;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = source[i];
    source[i] = source[j];
    source[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) PERM[i] = source[i & 255];
})();

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function grad(hash: number, x: number, y: number, z: number) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const zi = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const u = smooth(xf);
  const v = smooth(yf);
  const w = smooth(zf);

  const a = PERM[xi] + yi;
  const aa = PERM[a] + zi;
  const ab = PERM[a + 1] + zi;
  const b = PERM[xi + 1] + yi;
  const ba = PERM[b] + zi;
  const bb = PERM[b + 1] + zi;

  const x1 = mix(grad(PERM[aa], xf, yf, zf), grad(PERM[ba], xf - 1, yf, zf), u);
  const x2 = mix(grad(PERM[ab], xf, yf - 1, zf), grad(PERM[bb], xf - 1, yf - 1, zf), u);
  const y1 = mix(x1, x2, v);

  const x3 = mix(grad(PERM[aa + 1], xf, yf, zf - 1), grad(PERM[ba + 1], xf - 1, yf, zf - 1), u);
  const x4 = mix(grad(PERM[ab + 1], xf, yf - 1, zf - 1), grad(PERM[bb + 1], xf - 1, yf - 1, zf - 1), u);
  const y2 = mix(x3, x4, v);

  return mix(y1, y2, w) * 1.35;
}

function fbm(x: number, y: number, z: number) {
  return (noise3(x, y, z) + 0.5 * noise3(x * 2, y * 2, z * 2)) / 1.5;
}

const hash21 = (a: number, b: number) => {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// ── 颜色工具 ────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

function parseColor(value: string, fallback: Rgb): Rgb {
  const source = (value || "").trim();
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(source);
  if (!match) return fallback;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

const css = (rgb: Rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

export default function ShapeWaves(props: ShapeWavesProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  // 颜色等「不需要整体重建」的参数变化时，重做精灵图即可
  const rebuildRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const read = () => {
      const p = propsRef.current;
      return {
        text: p.text ?? "",
        fontFamily: p.fontFamily ?? 'Geist, "Geist Sans", system-ui, sans-serif',
        fontWeight: p.fontWeight ?? 500,
        textSize: p.textSize ?? 0.6,
        shapes: p.shapes ?? "mixed",
        cellSize: Math.max(4, p.cellSize ?? 10),
        dotSize: Math.min(1, Math.max(0.1, p.dotSize ?? 0.75)),
        color: p.color ?? "#929292",
        hoverColor: p.hoverColor ?? "#ffffff",
        backgroundColor: p.backgroundColor ?? "#000000",
        speed: p.speed ?? 1,
        scale: p.scale ?? 1,
        contrast: p.contrast ?? 1,
        brightness: p.brightness ?? 0.4,
        flow: p.flow ?? 0,
        direction: p.direction ?? 0,
        fade: p.fade ?? 0.25,
        interactive: p.interactive ?? true,
        splashRadius: p.splashRadius ?? 40,
        splashStrength: p.splashStrength ?? 0.4,
        glow: p.glow ?? 0.35,
        intro: p.intro ?? true,
        introDuration: Math.max(0.2, p.introDuration ?? 1.6),
        paused: p.paused ?? false,
      };
    };

    let settings = read();
    let gray = parseColor(settings.color, [146, 146, 146]);
    let blue = parseColor(settings.hoverColor, [255, 255, 255]);
    const background = parseColor(settings.backgroundColor, [0, 0, 0]);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let cellPx = 0;
    let originY = 0;

    let heights = new Float32Array(0);
    let previous = new Float32Array(0);
    let scratch = new Float32Array(0);
    let charges = new Float32Array(0);
    let chargesActive = false;
    let backlog = 0;

    let masked: Uint8Array | null = null;
    // sprites[0] = 常态色，sprites[1] = hover 色
    let sprites: HTMLCanvasElement[][] = [[], []];
    let lattice: Float32Array | null = null;

    let swDrawAvg = 0;
    let lastPaint = 0;
    let frameInterval = 0;
    let time = 0;
    let lastFrame = 0;
    let frameId = 0;
    let introStartedAt = performance.now();
    let introProgress = settings.intro ? 0 : INTRO_END;
    let driftX = 0;
    let driftY = 0;
    let disposed = false;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // ── 纹理 ────────────────────────────────────────────────────────────────

    const triPath = (g: CanvasRenderingContext2D, size: number, tint: string) => {
      // size 为半宽（local 单位里的 c），这里换算成像素
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size, size);
      g.lineTo(-size, size);
      g.closePath();
      g.fillStyle = tint;
      g.fill();
    };

    const squarePath = (g: CanvasRenderingContext2D, size: number, tint: string) => {
      g.fillStyle = tint;
      g.fillRect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
    };

    const circlePath = (g: CanvasRenderingContext2D, size: number, tint: string) => {
      g.beginPath();
      g.arc(0, 0, size * 0.82, 0, Math.PI * 2);
      g.closePath();
      g.fillStyle = tint;
      g.fill();
    };

    const buildSprites = () => {
      const mode = settings.shapes;
      const steps = SHAPE_SIZE_STEPS;
      const pixel = Math.max(2, Math.round(cellPx * dpr));
      const make = (tint: Rgb, stepped: number) => {
        const el = document.createElement("canvas");
        el.width = pixel;
        el.height = pixel;
        const g = el.getContext("2d");
        if (!g) return el;
        g.scale(dpr, dpr);
        g.translate(cellPx / 2, cellPx / 2);
        const size = (settings.dotSize * steps[stepped] * cellPx) / 2;
        if (mode === "triangles") triPath(g, size, css(tint));
        else if (mode === "squares") squarePath(g, size, css(tint));
        else if (mode === "circles") circlePath(g, size, css(tint));
        else {
          // mixed：三档分别对应三角/圆/方
          if (stepped === 0) triPath(g, size, css(tint));
          else if (stepped === 1) circlePath(g, size, css(tint));
          else squarePath(g, size, css(tint));
        }
        return el;
      };
      sprites = [
        [0, 1, 2].map((s) => make(gray, s)),
        [0, 1, 2].map((s) => make(blue, s)),
      ];
    };

    const buildMask = () => {
      const content = settings.text.trim();
      if (!content || cols < 2 || rows < 2) {
        masked = null;
        return;
      }
      const scale = 4;
      const el = document.createElement("canvas");
      el.width = cols * scale;
      el.height = rows * scale;
      const g = el.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      g.fillStyle = "#000";
      g.fillRect(0, 0, el.width, el.height);

      let fontPx = Math.max(1, settings.textSize * rows * scale);
      const family = settings.fontFamily;
      g.font = `${settings.fontWeight} ${fontPx}px ${family}`;
      const measured = g.measureText(content).width;
      const maxWidth = cols * scale * 0.9;
      if (measured > maxWidth) {
        fontPx = Math.max(1, (fontPx * maxWidth) / measured);
        g.font = `${settings.fontWeight} ${fontPx}px ${family}`;
      }
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      const metrics = g.measureText(content);
      const left = metrics.actualBoundingBoxLeft ?? measured / 2;
      const right = metrics.actualBoundingBoxRight ?? measured / 2;
      const ascent = metrics.actualBoundingBoxAscent ?? fontPx * 0.8;
      const descent = metrics.actualBoundingBoxDescent ?? fontPx * 0.2;
      g.fillStyle = "#fff";
      g.fillText(
        content,
        (el.width + left - right) / 2,
        (el.height + ascent - descent) / 2,
      );

      const data = g.getImageData(0, 0, el.width, el.height).data;
      const next = new Uint8Array(cols * rows);
      const half = scale / 2;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          // 取格子中心处的覆盖度（4x 采样窗口均值）
          let sum = 0;
          const sx = Math.min(el.width - 1, Math.max(0, Math.round((col + 0.5) * scale - half)));
          const sy = Math.min(el.height - 1, Math.max(0, Math.round((row + 0.5) * scale - half)));
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              const px = Math.min(el.width - 1, sx + dx);
              const py = Math.min(el.height - 1, sy + dy);
              sum += data[(py * el.width + px) * 4];
            }
          }
          next[row * cols + col] = sum / (scale * scale) > 127 ? 1 : 0;
        }
      }
      masked = next;
    };

    // ── 尺寸 ────────────────────────────────────────────────────────────────

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (nextWidth === width && nextHeight === height && heights.length) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      cols = Math.max(1, Math.round(width / settings.cellSize));
      cellPx = width / cols;
      rows = Math.max(1, Math.floor(height / cellPx));
      originY = (height - rows * cellPx) / 2;

      heights = new Float32Array(cols * rows);
      previous = new Float32Array(cols * rows);
      scratch = new Float32Array(cols * rows);
      charges = new Float32Array(cols * rows);
      chargesActive = false;
      backlog = 0;

      buildSprites();
      buildMask();
    };

    // ── 涟漪模拟 ────────────────────────────────────────────────────────────

    const stepRipples = () => {
      const lastCol = cols - 1;
      const lastRow = rows - 1;
      let peak = 0;
      for (let row = 0; row <= lastRow; row += 1) {
        const up = (row === 0 ? 0 : row - 1) * cols;
        const down = (row === lastRow ? lastRow : row + 1) * cols;
        const base = row * cols;
        for (let col = 0; col <= lastCol; col += 1) {
          const index = base + col;
          const left = base + (col === 0 ? 0 : col - 1);
          const right = base + (col === lastCol ? lastCol : col + 1);
          const current = heights[index];
          const laplacian =
            heights[left] + heights[right] + heights[up + col] + heights[down + col] - 4 * current;
          const next = (2 * current - previous[index] + WAVE_SPEED * laplacian) * WAVE_DECAY;
          scratch[index] = next;
          const charge = next > 1 ? 1 : next < 0 ? 0 : next;
          charges[index] = charge;
          if (charge > peak) peak = charge;
        }
      }
      const recycle = previous;
      previous = heights;
      heights = scratch;
      scratch = recycle;
      return peak;
    };

    const updateRipples = (delta: number) => {
      if (!chargesActive) return false;
      backlog = Math.min(backlog + delta, SIMULATION_STEP * 4);
      let peak = 1;
      while (backlog >= SIMULATION_STEP) {
        backlog -= SIMULATION_STEP;
        peak = stepRipples();
      }
      if (peak < SETTLED_THRESHOLD) {
        heights.fill(0);
        previous.fill(0);
        charges.fill(0);
        chargesActive = false;
      }
      return chargesActive;
    };

    const splash = (x: number, y: number, strength: number) => {
      const sigma = Math.max(0.5, (settings.splashRadius / cellPx) * 0.5);
      const reach = Math.ceil(sigma * 2.5);
      const centerCol = x / cellPx - 0.5;
      const centerRow = (y - originY) / cellPx - 0.5;
      const minRow = Math.max(0, Math.floor(centerRow - reach));
      const maxRow = Math.min(rows - 1, Math.ceil(centerRow + reach));
      const minCol = Math.max(0, Math.floor(centerCol - reach));
      const maxCol = Math.min(cols - 1, Math.ceil(centerCol + reach));
      const falloff = 2 * sigma * sigma;
      for (let row = minRow; row <= maxRow; row += 1) {
        const dy = row - centerRow;
        for (let col = minCol; col <= maxCol; col += 1) {
          const dx = col - centerCol;
          const bump = strength * Math.exp(-(dx * dx + dy * dy) / falloff);
          const index = row * cols + col;
          heights[index] = Math.min(1.2, heights[index] + bump);
        }
      }
      chargesActive = true;
    };

    // ── 指针 ────────────────────────────────────────────────────────────────

    let pointerInside = false;
    let pointerX = 0;
    let pointerY = 0;
    let pointerAt = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (!settings.interactive || disposed) return;
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (!inside) {
        pointerInside = false;
        return;
      }
      const now = performance.now();
      const elapsed = pointerInside ? Math.max(8, now - pointerAt) : 16;
      const travelled = pointerInside ? Math.hypot(x - pointerX, y - pointerY) : 0;
      const speed = (travelled / elapsed) * 1000;
      splash(x, y, Math.min(1, 0.22 + speed * 0.0006) * settings.splashStrength);
      pointerX = x;
      pointerY = y;
      pointerAt = now;
      pointerInside = true;
      wake();
    };

    // ── 绘制 ────────────────────────────────────────────────────────────────

    let gradientKey = "";
    let fadeGradient: CanvasGradient | null = null;

    const getFadeGradient = () => {
      const key = `${width}x${height}:${settings.fade}`;
      if (fadeGradient && gradientKey === key) return fadeGradient;
      gradientKey = key;
      const cx = width / 2;
      const cy = height / 2;
      const outer = Math.hypot(width, height) / 2;
      const inner = outer * Math.max(0, 1 - Math.max(0, settings.fade) * 2.2);
      const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      gradient.addColorStop(0, `rgba(${background[0]}, ${background[1]}, ${background[2]}, 0)`);
      gradient.addColorStop(0.55, `rgba(${background[0]}, ${background[1]}, ${background[2]}, 0.35)`);
      gradient.addColorStop(1, `rgba(${background[0]}, ${background[1]}, ${background[2]}, 1)`);
      fadeGradient = gradient;
      return gradient;
    };

    const draw = (intro: number) => {
      const startedAt = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = css(background);
      ctx.fillRect(0, 0, width, height);

      const fieldX = NOISE_CELLS * cellPx * settings.scale;
      const base = 0.5 - (settings.brightness - 0.5) * 0.4;
      const sharp = 2.8 * settings.contrast;

      // 低分辨率采样 + 双线性插值，保证波形平滑而成本固定
      const latticeCols = Math.ceil(cols / LATTICE_STEP) + 1;
      const latticeRows = Math.ceil(rows / LATTICE_STEP) + 1;
      if (!lattice || lattice.length !== latticeCols * latticeRows) {
        lattice = new Float32Array(latticeCols * latticeRows);
      }
      for (let lr = 0; lr < latticeRows; lr += 1) {
        const cy = originY + (lr * LATTICE_STEP + 0.5) * cellPx;
        for (let lc = 0; lc < latticeCols; lc += 1) {
          const cx = (lc * LATTICE_STEP + 0.5) * cellPx;
          const noise = fbm(
            (cx + driftX) / fieldX + 12.9898,
            (cy + driftY) / fieldX + 78.233,
            time,
          );
          const tone = Math.min(1, Math.max(0, (noise * 0.5 + 0.5 - base) * sharp + 0.5));
          lattice[lr * latticeCols + lc] = tone;
        }
      }

      const half = cellPx / 2;
      const glow = Math.max(0, settings.glow);
      const animateIntro = intro < INTRO_END;
      const endProgress = intro;

      for (let row = 0; row < rows; row += 1) {
        const ly = row / LATTICE_STEP;
        const lr = Math.min(latticeRows - 2, Math.floor(ly));
        const fy = ly - lr;
        const centerY = originY + (row + 0.5) * cellPx;
        const top = centerY - half;
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          if (masked && masked[index]) continue;

          const lx = col / LATTICE_STEP;
          const lc = Math.min(latticeCols - 2, Math.floor(lx));
          const fx = lx - lc;
          const a = lattice[lr * latticeCols + lc];
          const b = lattice[lr * latticeCols + lc + 1];
          const c = lattice[(lr + 1) * latticeCols + lc];
          const d = lattice[(lr + 1) * latticeCols + lc + 1];
          const tone = mix(mix(a, b, fx), mix(c, d, fx), fy);
          const band = Math.min(2, Math.floor(tone * 3));

          const charge = charges[index];
          const stepped = (band + Math.floor(Math.min(0.999, Math.max(0, charge)) * 3)) % 3;
          const centerX = (col + 0.5) * cellPx;
          const left = centerX - half;

          let scale = 1;
          let flash = 0;
          if (animateIntro) {
            const ux = (col + 0.5) / cols;
            const uy = (row + 0.5) / rows;
            const radial =
              Math.hypot(
                (centerX - width / 2) / (width / 2),
                (centerY - height / 2) / (height / 2),
              ) * 0.70710678;
            const warp = noise3(ux * 3.2 + 12.9898, uy * 2.4 + 78.233, 4.7) * INTRO_WARP;
            const jitter = hash21(col, row) * INTRO_JITTER;
            const spread = radial + warp + jitter + INTRO_WARP;
            const bandWidth = INTRO_BAND * (0.6 + 0.8 * hash21(col + 17, row + 9));
            const t = Math.min(1, Math.max(0, (endProgress - spread) / bandWidth));
            if (t <= 0) continue;
            const back = t - 1;
            scale = Math.max(0.08, 1 + 2.70158 * back * back * back + 1.70158 * back * back);
            flash = 1 - Math.min(1, Math.abs(endProgress - spread) / bandWidth);
            flash *= 0.35;
          }

          const blended = Math.max(smoothstep(0.04, 0.5, charge), Math.min(1, flash));

          const baseSprite = sprites[0][stepped];
          if (scale === 1) {
            ctx.drawImage(baseSprite, left, top, cellPx, cellPx);
          } else {
            const size = cellPx * scale;
            const offset = (size - cellPx) / 2;
            ctx.drawImage(baseSprite, left - offset, top - offset, size, size);
          }

          if (blended <= 0.01) continue;
          // 涟漪：图形沿 charge 由常态色渐变为 hover 色，并带一点辉光
          const hoverSprite = sprites[1][stepped];
          ctx.globalAlpha = blended;
          if (scale === 1) {
            ctx.drawImage(hoverSprite, left, top, cellPx, cellPx);
          } else {
            const size = cellPx * scale;
            const offset = (size - cellPx) / 2;
            ctx.drawImage(hoverSprite, left - offset, top - offset, size, size);
          }
          if (glow > 0 && blended > 0.45) {
            ctx.globalAlpha = Math.min(1, blended * glow * 0.5);
            const bloom = cellPx * 3.2;
            ctx.drawImage(hoverSprite, centerX - bloom / 2, centerY - bloom / 2, bloom, bloom);
          }
          ctx.globalAlpha = 1;
        }
      }


      if (settings.fade > 0) {
        ctx.fillStyle = getFadeGradient();
        ctx.fillRect(0, 0, width, height);
      }
      swDrawAvg = swDrawAvg * 0.9 + (performance.now() - startedAt) * 0.1;
    };

    // ── 主循环 ──────────────────────────────────────────────────────────────

    const render = (now: number) => {
      frameId = 0;
      if (disposed) return;
      if (frameInterval > 0 && now - lastPaint < frameInterval) {
        frameId = requestAnimationFrame(render);
        return;
      }
      lastPaint = now;

      const delta = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;

      const animating = !settings.paused && settings.speed > 0 && !reducedMotion.matches;
      if (animating) {
        time += delta * TIME_RATE * settings.speed;
        if (settings.flow > 0) {
          const angle = (settings.direction * Math.PI) / 180;
          const distance = settings.flow * cellPx * delta;
          driftX += Math.cos(angle) * distance;
          driftY += Math.sin(angle) * distance;
        }
      }

      updateRipples(delta);

      if (settings.intro && introProgress < INTRO_END) {
        const elapsed = (now - introStartedAt) / 1000 / settings.introDuration;
        introProgress = Math.min(INTRO_END, elapsed * INTRO_TOTAL);
      }

      draw(introProgress);
      frameInterval = swDrawAvg > 9 ? 1000 / 30 : 0;

      if (animating || chargesActive || introProgress < INTRO_END) {
        frameId = requestAnimationFrame(render);
      } else {
        lastFrame = 0;
      }
    };

    const wake = () => {
      if (disposed || frameId) return;
      frameId = requestAnimationFrame(render);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
      } else {
        lastFrame = 0;
        wake();
      }
    };

    // 颜色变化：只重建纹理，不重放入场动画
    rebuildRef.current = () => {
      settings = read();
      gray = parseColor(settings.color, [146, 146, 146]);
      blue = parseColor(settings.hoverColor, [255, 255, 255]);
      buildSprites();
      buildMask();
      wake();
    };

    resize();
    introStartedAt = performance.now();
    if (reducedMotion.matches) introProgress = INTRO_END;
    wake();

    const observer = new ResizeObserver(() => {
      resize();
      wake();
    });
    observer.observe(host);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener?.("change", wake);

    return () => {
      disposed = true;
      rebuildRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener?.("change", wake);
    };
  }, []);

  // 品牌色随断点变化时（宽屏 / 窄屏两套灰度），只重建纹理
  const colorKey = `${props.color ?? ""}|${props.hoverColor ?? ""}`;
  const lastColorKey = useRef(colorKey);
  useEffect(() => {
    if (lastColorKey.current === colorKey) return;
    lastColorKey.current = colorKey;
    rebuildRef.current?.();
  }, [colorKey]);

  const { className, style, backgroundColor } = props;

  return (
    <div
      ref={hostRef}
      className={["shape-waves", className].filter(Boolean).join(" ")}
      style={{ backgroundColor: backgroundColor ?? "#ffffff", ...style }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="shape-waves__canvas" />
    </div>
  );
}
