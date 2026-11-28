import { useState } from "react";
import svgPpt from "@/imports/Ppt/svg-51inp52nxe";

export const PPT_FILE_NAME = "文件名称.PPT";
// PPT 预览面板已拆到 ppt-panel.tsx（按需加载），这里保留页数常量供其复用。
export const SLIDE_COUNT = 17;

// ── file card shown inside the completed AI message ───────────────────────────

function FileIcon() {
  return (
    <div className="overflow-clip relative shrink-0 size-[32px]">
      <div className="absolute inset-[6.52%_14.17%_6.52%_6.52%]">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 25.3786 27.8261">
          <path d={svgPpt.p2e94d500} fill="url(#pptFileGrad)" />
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="pptFileGrad" x1="12.6893" x2="12.6893" y1="0" y2="27.8261">
              <stop stopColor="#FF9C72" />
              <stop offset="1" stopColor="#FF7A42" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="absolute inset-[28.16%_6.52%_6.52%_79.39%]">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4.50896 20.9016"><path d={svgPpt.p39ca1c00} fill="#DA6437" /></svg>
      </div>
      <div className="absolute inset-[28.8%_37.15%_32.26%_23.91%]">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 12.4594 12.4594"><path d={svgPpt.p2c6e1680} fill="white" fillOpacity="0.8" /></svg>
      </div>
      <div className="absolute inset-[28.8%_36.96%_52.62%_44.47%]">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5.94368 5.94368"><path d={svgPpt.p7238b80} fill="white" /></svg>
      </div>
    </div>
  );
}

function PptFileCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[12px] w-full">
      <button onClick={onOpen} className="col-start-1 h-[50px] bg-[#f7f7f7] hover:bg-[#f2f2f2] transition-colors rounded-[8px] flex items-center gap-[8px] px-[8px] text-left cursor-pointer">
        <FileIcon />
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] truncate font-normal">{PPT_FILE_NAME}</p>
          <p className="text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)] truncate font-normal">PPT · 36M</p>
        </div>
      </button>
    </div>
  );
}

function IconButton({ path, viewBox, inset, onClick, label }: {
  path: string; viewBox: string; inset: string; onClick?: () => void; label: string;
}) {
  return (
    <button aria-label={label} onClick={onClick} className="relative size-[24px] rounded-[4px] hover:bg-[#f7f7f7] transition-colors cursor-pointer">
      <span className="absolute overflow-clip" style={{ inset: "4px" }}>
        <span className="absolute" style={{ inset }}>
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox={viewBox}><path d={path} fill="black" fillOpacity="0.6" /></svg>
        </span>
      </span>
    </button>
  );
}

export function PptResultMessage({ onOpen, onRegenerate }: { onOpen: () => void; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  const summary = `信息的分析报告 PPT 已经为您制作完成。\n这份 PPT 共 ${SLIDE_COUNT} 页，采用了专业、现代的商务风格，通过时间轴、图表和数据卡片等形式，清晰地梳理了历史、缴费趋势和核心权益`;
  return (
    <div className="w-full flex flex-col gap-[12px]">
      <div className="w-full flex flex-col gap-[12px]">
        <div className="text-[16px] leading-[26px] tracking-[0.16px] text-[rgba(0,0,0,0.88)]">
          <p className="mb-0">信息的分析报告 PPT 已经为您制作完成。</p>
          <p>这份 PPT 共 {SLIDE_COUNT} 页，采用了专业、现代的商务风格，通过时间轴、图表和数据卡片等形式，清晰地梳理了历史、缴费趋势和核心权益</p>
        </div>
        <PptFileCard onOpen={onOpen} />
      </div>
      <div className="flex items-center gap-[8px]">
        <IconButton label="重新生成" onClick={onRegenerate} path={svgPpt.p31ce5e00} viewBox="0 0 13.3333 13.3333" inset="8.33%" />
        <IconButton label={copied ? "已复制" : "复制"} onClick={() => { navigator.clipboard?.writeText(summary); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} path={svgPpt.p2431f370} viewBox="0 0 13.3333 13.3333" inset="8.33%" />
        {copied && <span className="text-[12px] leading-[20px] text-[rgba(0,0,0,0.38)]">已复制</span>}
      </div>
    </div>
  );
}

