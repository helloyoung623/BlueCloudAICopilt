// 自动化任务图标：直接用 icons.kubai.design 的「动效版」图标，而不是静态 preview.svg。
//
// 站点上每个图标都是一段带 draw() 的模块（mail 是信封翻盖 + 信纸升起），
// 由 element.js 里的 <kubai-icon> 自定义元素按 name 动态 import 后跑；
// 默认 pointerenter 时播放，trigger="parent" 则交给最近的 [data-kubai-trigger] 容器
// （任务卡片整行 hover 就动一下，不用非要点到 32px 的图标上）。
//
// 运行时与图标模块都走本机 /kubai/ 代理（服务端落盘缓存），浏览器不直连 CDN：
// 断网 / CDN 不通时元素保持空白，底下垫的静态图标照常显示，不会空一块。
import { createElement, useEffect, useRef, useState } from "react";

const ACCENT = "#8B5CF6";

let runtime: Promise<boolean> | null = null;

function loadRuntime(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.customElements?.get("kubai-icon")) return Promise.resolve(true);
  if (runtime) return runtime;
  runtime = new Promise<boolean>(resolve => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/kubai/element.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return runtime;
}

/** 从 /api/icon?name=mail 里取出 kubai 的图标名。 */
export function kubaiNameFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = /[?&]name=([a-z0-9-]{2,44})/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

export function KubaiIcon({ name, src, fallbackSrc, size = 32, trigger = "parent", className = "" }: {
  name?: string | null;
  src?: string;
  fallbackSrc: string;
  size?: number;
  trigger?: "hover" | "parent" | "none";
  className?: string;
}) {
  const [ready, setReady] = useState(() => Boolean(typeof window !== "undefined" && window.customElements?.get("kubai-icon")));
  const [image, setImage] = useState(src || fallbackSrc);
  // 动效元素真的把 svg 画出来之后，底下那张静态图必须撤掉：
  // 两版形态不同（信封合上 vs 打开），叠着会出现重影。
  const [painted, setPainted] = useState(false);
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setImage(src || fallbackSrc); }, [src, fallbackSrc]);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    loadRuntime().then(ok => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, [name]);
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !name || !host) return;
    const sync = () => setPainted(Boolean(host.querySelector("svg")));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { childList: true });
    return () => observer.disconnect();
  }, [ready, name]);

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* 静态版垫在底下：动效资源没到位时它就是最终效果，到位后隐藏 */}
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 size-full transition-opacity duration-150 ${painted ? "opacity-0" : "opacity-100"}`}
        onError={() => { if (image !== fallbackSrc) setImage(fallbackSrc); }}
      />
      {name && ready
        ? createElement("kubai-icon", {
          ref: hostRef,
          name,
          size: String(size),
          color: ACCENT,
          trigger,
          style: { position: "absolute", inset: 0, display: "block" },
        })
        : null}
    </span>
  );
}
