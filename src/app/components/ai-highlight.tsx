/**
 * AI 划重点渐变胶囊（Figma EL-6162db28：7291:71599 文件卡片与 7287:69977 邮件卡片共用同一实例）。
 * 图标是渐变色斜体 AI 字样，不是矢量箭头。
 * 文件卡片与邮件卡片共用本组件与同一套样式（以文件卡片为准）：
 * inline-flex + align-items:center + 固定 24px 高，icon 与文字垂直居中，不会偏下；
 * 父容器禁止用后代选择器覆盖字号与对齐。
 */
export function AiHighlight({ text }: { text: string }) {
  return (
    <span className="ac-hl">
      <span className="ac-hl-icon" aria-hidden>AI</span>
      <span className="ac-hl-text">{text}</span>
    </span>
  );
}

export const AI_HIGHLIGHT_CSS = `
.ac-hl{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;max-width:100%;height:24px;padding:0 4px;border-radius:4px;background:linear-gradient(90deg,#F2F6FF 0%,#EDFFFF 17%,#FFF 100%)}
.ac-hl-icon{flex-shrink:0;font-style:italic;font-weight:700;font-size:14px;line-height:1;letter-spacing:-.02em;background:linear-gradient(127deg,#1D62F1 0%,#00D6B9 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.ac-hl-text{font-size:14px;line-height:22px;font-weight:400;color:rgba(0,0,0,.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
