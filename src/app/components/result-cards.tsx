import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SmallTip } from "./task-artifacts";
import { AiHighlight, AI_HIGHLIGHT_CSS } from "./ai-highlight";

/**
 * AI 回答内的搜索结果卡片（Figma AI-Chat-Component）：
 * - OneDrive 文件卡片：7297:71832（窄版基础）、7291:71599（AI划重点）
 * - Outlook 邮件卡片：7287:69977（720px）、7287:71083（400px 窄版）
 * - 响应式规则：7577:20185（断点 560 / 720、卡片 max 560px 内部滚动、hover 按钮宽屏图标+文案 / 窄屏仅图标+Tooltip）
 */

export type OneDriveFile = {
  name: string;
  meta: string;
  kind: "pdf" | "pptx" | "site" | "docx" | "xlsx";
  highlight?: string;
};

export type OutlookMail = {
  sender: string;
  title: string;
  body: string;
  time?: string;
  flagged?: boolean;
  highlight?: string;
  /** 头像配色索引 0..7，固定不变（规则：首字 + 8 色随机分配一旦确定不可更改） */
  avatarColor?: number;
};

/** 卡片「引用」回填输入框的数据结构：与加号上传的附件同款字段，避免用长引用文案冒充文件名。 */
export type QuotePayload = {
  /** 去重标识：来源 + 条目 id */
  key: string;
  /** 附件标题：真实文件名 / 邮件标题 */
  name: string;
  /** 附件副标题：与上传附件同款「类型 · 大小」/「发件人 · 时间」 */
  subtitle: string;
  /** 32px 文件类型图标，不传则按扩展名取 */
  icon?: string;
  /** 右下角来源角标 */
  badge: string;
  /** 引用原文（备用，供后续发送给模型） */
  quoteText: string;
};

// 8 色头像配色（Figma 7577:20185 发件人头像规则）
const AVATAR_COLORS: Array<[string, string]> = [
  ["#EBF5FF", "#1F63F5"], // 蓝
  ["#E5FFFA", "#12C2C2"], // 青
  ["#F0FCF5", "#21C45E"], // 绿
  ["#FFF0F0", "#F5212E"], // 红
  ["#FFFCE0", "#FADB14"], // 黄
  ["#F5F2FF", "#8C5CF5"], // 紫
  ["#FFF7ED", "#FA7317"], // 橙
  ["#F2F2F2", "#5E5E5E"], // 灰
];

// 文件类型图标全部取自 Figma 9848:12480：folder 为黄色位图，table 为绿色表格，
// slide 为橙色演示文稿，pdf 为红色文档。与参考稿的首行/次行/末行顺序一致。
const FILE_ICONS: Record<OneDriveFile["kind"], string> = {
  pdf: "/assets/card-file-pdf.svg",
  pptx: "/assets/card-file-pptx.svg",
  site: "/assets/card-file-folder.png",
  docx: "/assets/card-file-pdf.svg",
  xlsx: "/assets/card-file-table.svg",
};

// 用 ResizeObserver 测卡片容器宽度，决定按钮「图标+文案」还是「仅图标+Tooltip」。
// Tooltip 走 Portal，CSS 容器查询管不到，必须由 JS 驱动。
function useCardWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** 卡片操作按钮：图标/文案始终固定（引用就是引用，不切勾不变文案）；去重提示由外层 toast 负责。 */
function CardActionButton({ icon, label, payload, wide, onQuote }: {
  icon: string;
  label: string;
  payload: QuotePayload;
  wide: boolean;
  onQuote?: (payload: QuotePayload) => void;
}) {
  const onClick = () => onQuote?.(payload);
  const body = (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={`aci-btn${wide ? " aci-btn--wide" : ""}`}>
      <img src={icon} alt="" className="aci-icon" />
      {wide && <span className="aci-text">{label}</span>}
    </button>
  );
  // 窄屏用 Tooltip 提示名称；宽屏直接显示文案，无需 Tooltip
  return wide ? body : <SmallTip label={label} side="top">{body}</SmallTip>;
}

// AI划重点已抽为独立组件 ./ai-highlight.tsx：文件卡片与邮件卡片共用同一套样式（以文件卡片为准）

export function OneDriveCard({ files, onQuote }: { files: OneDriveFile[]; onQuote?: (payload: QuotePayload) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useCardWidth(ref);
  const wide = width >= 560;
  return (
    <div className="ac-wrap" ref={ref}>
      <div className="ac-card">
        <div className="ac-head"><span>文件</span></div>
        <div className="ac-scroll">
          <div className="ac-list">
            {files.map((f, i) => {
              const quoteKey = `onedrive:${i}:${f.name}`;
              const dot = f.name.lastIndexOf(".");
              const extension = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : "";
              const size = (f.meta.split("·").pop()?.trim() || "1.2 MB").replace(/\s/g, "").replace("MB", "M").replace("KB", "K");
              const payload: QuotePayload = {
                key: quoteKey,
                name: f.name,
                // 与「加号」上传附件同款副标题：类型 · 大小（文件夹用「文件夹」占位）
                subtitle: `${extension ? extension.toUpperCase() : "文件夹"} · ${size}`,
                icon: FILE_ICONS[f.kind],
                badge: "/assets/badge-onedrive.svg",
                quoteText: `引用 OneDrive 文件：${f.name}${f.highlight ? `（${f.highlight}）` : ""}`,
              };
              return (
                <div className="ac-file-row" key={`${f.name}-${i}`}>
                  <img src={FILE_ICONS[f.kind]} alt="" className={`ac-file-icon${f.kind === "site" ? " ac-file-icon--folder" : ""}`} />
                  <div className="ac-file-meta">
                    <span className="ac-file-name">{f.name}</span>
                    {f.highlight && <AiHighlight text={f.highlight} />}
                    <span className="ac-file-sub">{f.meta}</span>
                  </div>
                  <div className="ac-card-actions">
                    <CardActionButton icon="/assets/card-quote.svg" label="引用" payload={payload} wide={wide} onQuote={onQuote} />
                    <CardActionButton icon="/assets/card-download.svg" label="下载" payload={payload} wide={wide} onQuote={onQuote} />
                    <CardActionButton icon="/assets/card-open.svg" label="在 OneDrive 中打开" payload={payload} wide={wide} onQuote={onQuote} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MailAvatar({ sender, colorIndex }: { sender: string; colorIndex: number }) {
  const [bg, fg] = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const initial = Array.from(sender.trim())[0] ?? "";
  return (
    <span className="ac-avatar" style={{ backgroundColor: bg, color: fg }} aria-hidden>{initial}</span>
  );
}

export function OutlookCard({ mails, onQuote }: { mails: OutlookMail[]; onQuote?: (payload: QuotePayload) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useCardWidth(ref);
  const wide = width >= 560;
  const wide720 = width >= 720;
  return (
    <div className={`ac-wrap ac-outlook${wide ? " ac-wide" : ""}${wide720 ? " ac-wide-720" : ""}`} ref={ref}>
      <div className="ac-card ac-outlook-card">
        <div className="ac-head ac-outlook-head">
          <img src="/assets/badge-outlook.svg" alt="" className="ac-outlook-icon" />
          <span>Outlook</span>
        </div>
        <div className="ac-scroll">
          <div className="ac-list ac-mail-list">
            {mails.map((m, i) => {
              const quoteKey = `outlook:${i}:${m.sender}:${m.title}`;
              const payload: QuotePayload = {
                key: quoteKey,
                name: m.title,
                subtitle: `${m.sender}${m.time ? ` · ${m.time}` : ""}`,
                icon: "/assets/attachment-email.svg",
                badge: "/assets/badge-outlook.svg",
                quoteText: `引用邮件：${m.sender} - ${m.title}${m.body ? `：${m.body}` : ""}`,
              };
              return (
                <div className="ac-mail-row" key={`${m.sender}-${i}`}>
                  <MailAvatar sender={m.sender} colorIndex={m.avatarColor ?? i} />
                  <div className="ac-mail-body">
                    <div className="ac-mail-topline">
                      <span className="ac-mail-sender">{m.sender}</span>
                      {m.time && <span className="ac-mail-time">{m.time}</span>}
                    </div>
                    <div className="ac-mail-secondline">
                      <span className="ac-mail-title">{m.title}</span>
                      {/* 邮件标记旗标暂不显示 */}
                      {/* ≥720px：正文摘要与标题同行；<720px：摘要单独一行 */}
                      {wide720 && <span className="ac-mail-text ac-mail-text--inline">{m.body}</span>}
                    </div>
                    {!wide720 && <span className="ac-mail-text">{m.body}</span>}
                    {m.highlight && <AiHighlight text={m.highlight} />}
                  </div>
                  <div className="ac-card-actions ac-mail-actions">
                    <CardActionButton icon="/assets/card-quote.svg" label="引用" payload={payload} wide={wide} onQuote={onQuote} />
                    <CardActionButton icon="/assets/card-open.svg" label="在 Outlook 中打开" payload={payload} wide={wide} onQuote={onQuote} />
                    <CardActionButton icon="/assets/card-more.svg" label="更多" payload={payload} wide={wide} onQuote={onQuote} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export const RESULT_CARD_CSS = `
/* 正文与卡片间距交给父容器 12px gap（Figma「内容」slot layout_969a30e6 gap:12px），此处不再加 margin */
.ac-wrap{width:100%;max-width:768px}
/* Figma 7291:71683 / 7287:69977：padding 16px 8px 8px（底部 8px） */
.ac-card{background:#fff;border:1px solid #F2F2F2;border-radius:20px;padding:16px 8px 8px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.ac-head{display:flex;align-items:center;gap:8px;padding:0 8px;color:rgba(0,0,0,.88);font-size:14px;line-height:22px;font-weight:500;letter-spacing:.001em;flex-shrink:0}
.ac-scroll{overflow-y:auto;max-height:560px}
.ac-list{display:flex;flex-direction:column;gap:8px}
.ac-file-row{position:relative;display:flex;align-items:center;gap:8px;padding:8px;background:transparent;border-radius:8px;transition:background .15s}
/* 仅 hover 显示灰底；点引用后按钮仍持有焦点，不能用 :focus-within，否则背景常显 */
.ac-file-row:hover{background:#F2F2F2}
.ac-file-icon{width:32px;height:32px;flex-shrink:0;display:block;margin:0;border:0;border-radius:0;max-width:none}
/* Figma 7291:71683 首行文件夹为 40px 位图，外扩 4px 后视觉占位仍为 32px */
.ac-file-icon--folder{width:40px;height:40px;margin:-4px}
.ac-file-meta{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.ac-file-name{font-size:14px;line-height:22px;font-weight:400;color:rgba(0,0,0,.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ac-file-sub{font-size:12px;line-height:20px;font-weight:400;color:rgba(0,0,0,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Figma #7297:71883：操作区距行右边缘 8px、gap 4px、左渐隐 48px */
.ac-card-actions{position:absolute;right:8px;top:0;bottom:0;display:flex;align-items:center;gap:4px;padding-left:48px;border-radius:0 8px 8px 0;background:linear-gradient(90deg,rgba(242,242,242,0) 0%,rgba(242,242,242,1) 18%);opacity:0;transition:opacity .15s;pointer-events:none}
.ac-file-row:hover .ac-card-actions,.ac-mail-row:hover .ac-card-actions{opacity:1;pointer-events:auto}
.aci-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:4px;background:transparent;border:1px solid transparent;border-radius:4px;color:#1E63F5;font-family:inherit;font-weight:400;cursor:pointer;flex-shrink:0;transition:background .15s,border-color .15s}
.aci-btn--wide{width:auto;padding:3px 4px;gap:8px}
.aci-btn:hover{background:#fff;border-color:#fff}
.aci-icon{display:block;width:16px;height:16px;margin:0;border:0;border-radius:0;max-width:none;flex-shrink:0;opacity:1}
.aci-text{font-size:14px;line-height:22px;font-weight:400;color:#1E63F5;white-space:nowrap}
/* AI划重点样式已收敛进 ./ai-highlight.tsx 的 AI_HIGHLIGHT_CSS（文件/邮件共用，见文件末尾拼接） */
.ac-outlook-card{gap:16px}
.ac-outlook-head{padding:0 8px}
.ac-outlook-icon{width:24px;height:24px;display:block;margin:0;border:0;border-radius:0;max-width:none}
.ac-mail-list{gap:8px}
.ac-mail-row{position:relative;display:flex;align-items:flex-start;gap:8px;padding:8px;background:transparent;border-radius:8px;transition:background .15s}
.ac-mail-row:hover{background:#F7F7F7}
.ac-avatar{width:48px;height:48px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:28px;font-weight:400;flex-shrink:0}
.ac-mail-body{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.ac-mail-topline,.ac-mail-secondline{display:flex;align-items:center;gap:4px;min-width:0}
.ac-mail-sender{font-size:14px;line-height:22px;font-weight:500;color:rgba(0,0,0,.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto;max-width:88px}
.ac-mail-title{font-size:14px;line-height:22px;font-weight:400;color:rgba(0,0,0,.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.ac-mail-time{font-size:12px;line-height:20px;font-weight:400;color:rgba(0,0,0,.38);white-space:nowrap;margin-left:auto;flex-shrink:0}
.ac-mail-flag{width:16px;height:16px;display:block;margin:0;border:0;border-radius:0;max-width:none;flex-shrink:0}
.ac-mail-text{font-size:14px;line-height:22px;font-weight:400;color:rgba(0,0,0,.38);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ac-mail-actions{background:linear-gradient(90deg,rgba(247,247,247,0) 0%,rgba(247,247,247,1) 18%);align-items:flex-start;top:8px;bottom:auto;padding-left:48px;border-radius:0 8px 8px 0;right:8px}
/* <560px（Outlook 窄版 7287:71083）：隐藏发件人头像 */
.ac-outlook:not(.ac-wide) .ac-avatar{display:none}
.ac-outlook:not(.ac-wide) .ac-mail-actions{padding-left:24px}
/* ≥720px（Outlook 7287:69977）：正文摘要与标题同行 */
.ac-mail-text--inline{display:inline;min-width:0;flex:1;margin-left:8px}
.ac-mail-secondline:has(.ac-mail-text--inline) .ac-mail-title{flex:0 1 auto;max-width:45%}
@media (prefers-reduced-motion: reduce){.ac-card-actions,.ac-file-row,.ac-mail-row{transition:none}}
` + AI_HIGHLIGHT_CSS;
