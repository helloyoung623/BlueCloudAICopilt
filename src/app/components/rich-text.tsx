import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Copy, Download } from "lucide-react";

/** 表格/代码块头部的复制按钮：点击写剪贴板并切勾（与回复区复制同一张 success 图），1.5s 后复位；失败立即收回。 */
function RichCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = () => {
    navigator.clipboard?.writeText(text)?.then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    })?.catch(() => setCopied(false));
  };
  return (
    <button type="button" className="acrt-icon-btn" aria-label={copied ? "已复制" : label}
      title={copied ? "已复制" : label} onClick={onClick}>
      {copied
        ? <img src="/assets/msg-copy-success.svg" alt="" className="acrt-copy-check size-[16px]" />
        : <Copy size={16} />}
    </button>
  );
}

/**
 * AI 回答富文本（Figma 2759:15863「HTML」标签样式字典）。
 *
 * 安全边界：HTML 来自不可信文本，一律经 DOMParser + 白名单递归映射为 React 元素，
 * 绝不使用 dangerouslySetInnerHTML；文本节点由 React 自行转义。
 */

type TokenType = "comment" | "keyword" | "fn" | "var" | "string" | "number";

const ALLOWED_INLINE = new Set(["strong", "b", "del", "s", "code", "a", "br"]);

// 非内容标签：连同文本子节点一并丢弃。既不执行，也不把源码暴露成可见文本
// （否则示例里的 <script>探针会变成图片下方一行 "window.__ACRT_XSS__ = 1"）。
const DROP_ENTIRELY = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "svg", "canvas", "form", "input", "textarea", "select", "button", "video", "audio",
]);

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "class", "new", "import", "from", "export", "def", "async", "await",
  "null", "true", "false", "this",
]);

const LANG_LABEL: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python", java: "Java", go: "Go", css: "CSS", html: "HTML",
  json: "JSON", bash: "Bash", shell: "Bash", sql: "SQL",
};

function safeHref(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (value.startsWith("#")) return value;
  try {
    const url = new URL(value, typeof window === "undefined" ? "http://localhost/" : window.location.href);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
  } catch {
    /* invalid URL */
  }
  return undefined;
}

function safeImageSrc(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return value;
  return undefined;
}

function positiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function childrenOf(node: Element, prefix: string): ReactNode[] {
  return parseNodes(Array.from(node.childNodes), prefix);
}

function parseNodes(nodes: Node[], prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const key = `${prefix}-${i}`;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) out.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_ENTIRELY.has(tag)) return;
    const kids = childrenOf(el, key);
    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        out.push(createElement(tag, { key }, kids));
        break;
      case "p":
        out.push(<p key={key}>{kids}</p>);
        break;
      case "strong": case "b":
        out.push(<strong key={key}>{kids}</strong>);
        break;
      case "del": case "s":
        out.push(<del key={key}>{kids}</del>);
        break;
      case "br":
        out.push(<br key={key} />);
        break;
      case "ol": case "ul":
        out.push(createElement(tag, { key, className: tag === "ol" ? "acrt-ol" : "acrt-ul" }, kids));
        break;
      case "li":
        out.push(<li key={key}>{kids}</li>);
        break;
      case "hr":
        out.push(<hr key={key} />);
        break;
      case "blockquote":
        out.push(<blockquote key={key}>{kids}</blockquote>);
        break;
      case "table": {
        const sections = Array.from(el.children).filter(c => ["thead", "tbody", "tfoot"].includes(c.tagName.toLowerCase()));
        const rowsOf = (section: Element): HTMLTableCellElement[][] =>
          Array.from(section.children)
            .filter(row => row.tagName.toLowerCase() === "tr")
            .map(row => Array.from(row.children).filter(c => ["th", "td"].includes(c.tagName.toLowerCase())) as HTMLTableCellElement[]);
        const bodyRows = sections.filter(s => s.tagName.toLowerCase() !== "thead").flatMap(rowsOf);
        const maxCols = Math.max(0, ...sections.flatMap(rowsOf).map(r => r.length));
        // 数字列自动右对齐；也支持在 th/td 上用 data-align="right" 显式指定
        const numericCols = new Set<number>();
        for (let c = 0; c < maxCols; c++) {
          const values = bodyRows.map(r => r[c]?.textContent?.trim() ?? "").filter(Boolean);
          if (values.length && values.every(v => /^[-+]?[\d,]+(\.\d+)?%?$/.test(v))) numericCols.add(c);
        }
        const decorate = (cell: HTMLTableCellElement, cellKey: string, ci: number) => (
          <CellTag key={cellKey} tag={cell.tagName.toLowerCase() === "th" ? "th" : "td"}
            align={cell.getAttribute("data-align") === "right" || numericCols.has(ci) ? "right" : undefined}
            colSpan={positiveInt(cell.getAttribute("colspan"))}
            rowSpan={positiveInt(cell.getAttribute("rowspan"))}>
            {childrenOf(cell, cellKey)}
          </CellTag>
        );
        const built = sections.map((section, si) => {
          const sTag = section.tagName.toLowerCase() === "thead" ? "thead" : "tbody";
          const rows = Array.from(section.children).filter(c => c.tagName.toLowerCase() === "tr");
          return createElement(sTag, { key: `${key}-s${si}` },
            rows.map((row, ri) => (
              <tr key={`${key}-s${si}-r${ri}`}>
                {Array.from(row.children)
                  .filter(c => ["th", "td"].includes(c.tagName.toLowerCase()))
                  .map((cell, ci) => decorate(cell as HTMLTableCellElement, `${key}-s${si}-r${ri}-c${ci}`, ci))}
              </tr>
            ))
          );
        });
        // 表格复制用「行 \t 列」纯文本，表头也带上；与视觉表格内容一致、无 HTML 标签
        const tablePlain = sections.flatMap(section =>
          Array.from(section.children).filter(row => row.tagName.toLowerCase() === "tr").map(row =>
            Array.from(row.children).filter(c => ["th", "td"].includes(c.tagName.toLowerCase()))
              .map(c => c.textContent?.trim() ?? "").join("\t")
          )
        ).join("\n");
        out.push(
          <div className="acrt-table-block" key={key}>
            <div className="acrt-table-head">
              <span>表格</span>
              <div className="acrt-table-tools">
                <RichCopyButton text={tablePlain} label="复制表格" />
                <button type="button" className="acrt-icon-btn" aria-label="下载表格（示例样式）" title="下载表格（示例样式）"><Download size={16} /></button>
              </div>
            </div>
            <div className="acrt-table-wrap"><table className="acrt-table">{built}</table></div>
          </div>
        );
        break;
      }
      case "pre": {
        const codeEl = el.querySelector("code");
        const raw = codeEl?.textContent ?? el.textContent ?? "";
        const langRaw = codeEl?.getAttribute("class")?.match(/language-([\w+#-]+)/)?.[1] ?? "";
        out.push(<CodeBlock key={key} code={raw} lang={langRaw} />);
        break;
      }
      case "code": {
        // pre 里的 code 已由上面的分支处理
        out.push(<code key={key} className="acrt-inline-code">{kids}</code>);
        break;
      }
      case "a": {
        const href = safeHref(el.getAttribute("href"));
        out.push(href
          ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{kids}</a>
          : <span key={key}>{kids}</span>);
        break;
      }
      case "img": {
        const src = safeImageSrc(el.getAttribute("src"));
        if (!src) break;
        out.push(<img key={key} src={src} alt={el.getAttribute("alt") ?? ""}
          width={positiveInt(el.getAttribute("width"))} height={positiveInt(el.getAttribute("height"))} />);
        break;
      }
      default:
        // 不在白名单内的标签（含 script/style/iframe）一律不渲染标签本身，仅保留文本子节点
        out.push(...kids);
    }
  });
  return out;
}

function CellTag({ tag, align, colSpan, rowSpan, children }: {
  tag: "th" | "td"; align?: "right"; colSpan?: number; rowSpan?: number; children?: ReactNode;
}) {
  const cls = [align === "right" ? "acrt-td--num" : "", tag === "th" ? "" : "acrt-td"].filter(Boolean).join(" ");
  if (tag === "th") return <th className={cls} colSpan={colSpan} rowSpan={rowSpan}>{children}</th>;
  return <td className={cls} colSpan={colSpan} rowSpan={rowSpan}>{children}</td>;
}

function highlight(code: string): ReactNode[] {
  const patterns: { type: TokenType; re: RegExp }[] = [
    { type: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g },
    { type: "string", re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g },
    { type: "number", re: /\b\d+(?:\.\d+)?\b/g },
    { type: "keyword", re: /\b[A-Za-z_$][\w$]*\b/g },
    { type: "fn", re: /\b[A-Za-z_$][\w$]*(?=\s*\()/g },
    { type: "var", re: /\.[A-Za-z_$][\w$]*/g },
  ];
  const hits: { start: number; end: number; type: TokenType; text: string }[] = [];
  for (const { type, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const text = m[0];
      if (type === "keyword" && !KEYWORDS.has(text)) continue;
      const start = m.index;
      const end = start + text.length;
      if (hits.some(h => start < h.end && end > h.start)) continue;
      hits.push({ start, end, type, text });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    if (hit.start > cursor) nodes.push(code.slice(cursor, hit.start));
    nodes.push(<span className={`acrt-tok acrt-tok--${hit.type}`} key={i}>{hit.text}</span>);
    cursor = hit.end;
  });
  if (cursor < code.length) nodes.push(code.slice(cursor));
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="acrt-code">
      <div className="acrt-code-head">
        <span>{lang ? (LANG_LABEL[lang.toLowerCase()] ?? lang) : "代码"}</span>
        <RichCopyButton text={code} label="复制代码" />
      </div>
      <pre className="acrt-code-body"><code>{highlight(code)}</code></pre>
    </div>
  );
}

export function RichText({ html, animate }: { html: string; animate?: boolean }) {
  const nodes = useMemo(() => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return parseNodes(Array.from(doc.body.childNodes), "acrt");
  }, [html]);
  return <div className={`acrt${animate ? " acrt--animate" : ""}`}>{nodes}</div>;
}

export const RICH_TEXT_CSS = `
@keyframes acrtIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.acrt{
  --acrt-body-size:14px;--acrt-body-lh:24px;--acrt-code-size:12px;--acrt-code-lh:20px;
  color:rgba(0,0,0,.88);
  font-family:"PingFang SC:Regular","PingFang SC",-apple-system,"Microsoft YaHei",sans-serif;
  font-size:var(--acrt-body-size);line-height:var(--acrt-body-lh);
  overflow-wrap:anywhere;
}
.acrt--animate{animation:acrtIn 180ms ease-out both}
.acrt h1,.acrt h2,.acrt h3,.acrt h4,.acrt h5,.acrt h6{
  color:rgba(0,0,0,.88);font-family:"PingFang SC:Medium","PingFang SC",sans-serif;margin:0;
}
.acrt h1{font-size:24px;line-height:32px;font-weight:600;margin-top:24px}
.acrt h2{font-size:22px;line-height:30px;font-weight:600;margin-top:24px}
.acrt h3{font-size:20px;line-height:28px;font-weight:600;margin-top:24px}
.acrt h4{font-size:18px;line-height:26px;font-weight:500;margin-top:16px}
.acrt h5{font-size:16px;line-height:24px;font-weight:500;margin-top:16px}
.acrt h6{font-size:14px;line-height:22px;font-weight:500;margin-top:16px}
.acrt>:first-child,.acrt blockquote>:first-child{margin-top:0}
.acrt p{margin:16px 0 0}
.acrt strong,.acrt b{font-weight:600}
.acrt del,.acrt s{text-decoration:line-through;text-decoration-thickness:1px;color:inherit}
.acrt a{color:#1C61F1;text-decoration:underline;cursor:pointer}
.acrt a:hover{color:#0E52D6}
.acrt hr{height:1px;border:0;background:#E6E6E6;margin:24px 0 0}
.acrt blockquote{border-left:3px solid #E6E6E6;padding:4px 24px;margin:16px 0 0}
.acrt ul,.acrt ol{list-style:none;margin:16px 0 0;padding-inline-start:16px;letter-spacing:.01em}
.acrt ul ul,.acrt ol ol,.acrt ul ol,.acrt ol ul{margin-top:8px}
.acrt li{position:relative;margin-top:8px}
.acrt li:first-child{margin-top:0}
.acrt li::before{position:absolute;left:-16px;width:16px;text-align:left;color:inherit}
.acrt .acrt-ul>li::before{content:"•"}
.acrt .acrt-ol{counter-reset:acrt1}
.acrt .acrt-ol>li{counter-increment:acrt1}
.acrt .acrt-ol>li::before{content:counter(acrt1) "."}
.acrt .acrt-ol .acrt-ol{counter-reset:acrt2}
.acrt .acrt-ol .acrt-ol>li{counter-increment:acrt2}
.acrt .acrt-ol .acrt-ol>li::before{content:counter(acrt2,lower-alpha) "."}
.acrt .acrt-ol .acrt-ol .acrt-ol{counter-reset:acrt3}
.acrt .acrt-ol .acrt-ol .acrt-ol>li{counter-increment:acrt3}
.acrt .acrt-ol .acrt-ol .acrt-ol>li::before{content:counter(acrt3,lower-roman) "."}
.acrt .acrt-ol .acrt-ol .acrt-ol .acrt-ol{counter-reset:acrt4}
.acrt .acrt-ol .acrt-ol .acrt-ol .acrt-ol>li{counter-increment:acrt4}
.acrt .acrt-ol .acrt-ol .acrt-ol .acrt-ol>li::before{content:counter(acrt4) "."}
.acrt .acrt-inline-code{
  font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:var(--acrt-code-size);line-height:var(--acrt-code-lh);
  color:rgba(0,0,0,.6);background:#F2F2F2;border-radius:4px;margin-inline:4px;padding-inline:4px;
}
.acrt img{display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid #E6E6E6;margin-top:16px}
/* 复制按钮里的勾图标：覆盖正文图片样式，保证在 24px 按钮内垂直居中、无边框圆角 */
.acrt .acrt-icon-btn img.acrt-copy-check{margin:0;border:0;border-radius:0;width:16px;height:16px;max-width:none}
.acrt-code{border-radius:8px;margin:16px 0 0;overflow:hidden;border:1px solid #F2F2F2}
.acrt-code-head{display:flex;align-items:center;justify-content:space-between;background:#F7F7F7;padding:8px 12px;color:rgba(0,0,0,.88);font-size:14px;line-height:22px;font-weight:500;letter-spacing:.001em}
.acrt-code-body{display:block;margin:0;padding:12px 16px;background:#fff;overflow-x:auto;white-space:pre;word-break:normal;tab-size:2;font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:var(--acrt-code-size);line-height:var(--acrt-code-lh)}
.acrt-tok--comment{color:rgba(0,0,0,.38)}
.acrt-tok--keyword{color:#8B5CF6}
.acrt-tok--fn{color:#13C2C2}
.acrt-tok--var{color:#F5222D}
.acrt-tok--string{color:#22C55E}
.acrt-tok--number{color:#F97316}
.acrt-table-block{margin:16px 0 0;border-radius:8px;overflow:hidden;border:1px solid #F2F2F2}
.acrt-table-head{display:flex;align-items:center;justify-content:space-between;background:#F7F7F7;border-bottom:1px solid #F2F2F2;padding:8px 12px;font-size:14px;line-height:22px;font-weight:500}
.acrt-table-tools{display:flex;align-items:center;gap:8px}
.acrt-icon-btn{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;opacity:.6;cursor:pointer;transition:background .15s,opacity .15s}
.acrt-icon-btn:hover{background:var(--Background-Gray-Hover,#E6E6E6);opacity:1}
.acrt-table-wrap{overflow-x:auto}
.acrt-table{border-collapse:collapse;width:100%}
.acrt-table th{background:#fff;padding:8px 12px;font-size:14px;line-height:22px;font-weight:500;text-align:left}
.acrt-table td{padding:8px 12px;border-top:1px solid #F2F2F2;text-align:left}
.acrt-table .acrt-td--num{text-align:right}
@container chat-layout (width >= 560px){
  .acrt{--acrt-body-size:16px;--acrt-body-lh:26px;--acrt-code-size:14px}
  .acrt h1{font-size:32px;line-height:40px}
  .acrt h2{font-size:28px;line-height:36px}
  .acrt h3{font-size:24px;line-height:32px}
  .acrt h4{font-size:20px;line-height:28px}
  .acrt h5{font-size:18px;line-height:26px}
  .acrt h6{font-size:16px;line-height:24px}
  .acrt-table-head,.acrt-table th{font-size:16px;line-height:24px}
}
@media (prefers-reduced-motion:reduce){.acrt--animate{animation:none}}
`;
