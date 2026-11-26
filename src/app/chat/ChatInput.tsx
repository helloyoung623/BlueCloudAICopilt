import { useEffect, useRef, useState } from "react";
import { AddContentMenu } from "../components/add-content-menu";
import { AttachmentPicker } from "../components/attachment-picker";
import type { AttachmentSource } from "../components/attachment-picker";
import { AttachmentTray } from "../components/attachment-tray";
import type { ChatAttachment } from "../components/attachment-tray";
import { Popover, PopoverAnchor } from "../components/ui/popover";
import type { ProjectFiles } from "../components/project-files";
import { PptGenerationToggle } from "../ppt/panels";
import type { PptMode, PptPageCount } from "../ppt/types";

function SendButton({ canSend, agentRunning = false, onSend, onStop }: {
  canSend: boolean;
  agentRunning?: boolean;
  onSend: () => void;
  onStop?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agentRunning) setLoading(false);
  }, [agentRunning]);

  const handleClick = () => {
    if (agentRunning) {
      onStop?.();
      return;
    }
    if (!canSend || loading) return;
    setLoading(true);
    onSend();
    window.setTimeout(() => setLoading(false), 560);
  };

  return (
    <button
      type="button"
      aria-label={agentRunning ? "暂停生成" : "发送消息"}
      aria-disabled={!agentRunning && !canSend}
      disabled={!agentRunning && !canSend}
      onClick={handleClick}
      className={`group ml-auto shrink-0 rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[#1e63f5] focus-visible:ring-offset-2 ${agentRunning || canSend ? "cursor-pointer" : "cursor-default"}`}
    >
      {agentRunning ? (
        <div className="flex size-[30px] items-center justify-center rounded-full bg-[#ebf4ff] group-active:bg-[#99c3ff]">
          <span className="block size-[12px] rounded-[2px] bg-[#1e63f5]" />
        </div>
      ) : loading ? (
        <div className="flex size-[30px] items-center justify-center rounded-full bg-[#1e63f5]">
          <span className="block size-[10px] animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      ) : (
        <div className={`flex size-[30px] items-center justify-center overflow-hidden rounded-full ${canSend ? "bg-[#1e63f5] group-hover:bg-[#4788ff] group-active:bg-[#0e45cf]" : "bg-[#f2f2f2]"}`}>
          <img src={canSend ? "/assets/051ee.svg" : "/assets/9b290.svg"} alt="" />
        </div>
      )}
    </button>
  );
}

function ChatInput({ value, onChange, onSend, attachments, onAddFiles, onRemoveAttachment, hasProject = false, projectFiles, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, agentRunning = false, onStop, onOpenConnectors, placeholder = "有问题，尽管问；/调用技能" }: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  hasProject?: boolean;
  projectFiles?: ProjectFiles;
  pptGeneration: boolean;
  onPptGenerationChange: (selected: boolean) => void;
  pptMode: PptMode;
  onPptModeChange: (mode: PptMode) => void;
  pptPages: PptPageCount;
  onPptPagesChange: (pages: PptPageCount) => void;
  agentRunning?: boolean;
  onStop?: () => void;
  onOpenConnectors?: () => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource | null>(null);
  // 输入框最大高度跟随窗口高度收缩：矮窗口（如约 400px 高的预览面板）里，
  // 固定 328px 会把底部工具栏和发送按钮顶到窗口外
  const [cardMaxHeight, setCardMaxHeight] = useState(() => Math.min(328, Math.max(200, window.innerHeight - 220)));
  const hasText = value.trim().length > 0;
  // 必须输入文字才可发送；仅有附件（无文字）时禁用发送按钮
  const canSend = hasText && attachments.every(attachment => attachment.status === "ready");

  useEffect(() => {
    if (!hasProject && attachmentSource === "项目资料") setAttachmentSource(null);
  }, [hasProject, attachmentSource]);

  useEffect(() => {
    // 输入区始终贴在会话/首页底部，卡片下边界位置稳定：以它向上量出可用高度，
    // 卡片再高也不会把底部工具栏顶出窗口（矮至 400px 的预览面板同样成立）
    const syncCardMax = () => {
      const card = cardRef.current;
      const bottom = card ? card.getBoundingClientRect().bottom : window.innerHeight - 22;
      setCardMaxHeight(Math.max(200, Math.min(328, bottom - 96)));
    };
    syncCardMax();
    window.addEventListener("resize", syncCardMax);
    return () => window.removeEventListener("resize", syncCardMax);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const resize = () => {
      // 用实际布局量出输入框上方已占用的高度（上内边距 + 附件行），再减去下方
      // 「36 占位 + 12 内容下内边距 + 工具栏 + 2 边框」，避免固定数值在附件多/矮窗口时失准
      const card = cardRef.current;
      const topOffset = card ? el.getBoundingClientRect().top - card.getBoundingClientRect().top : 12;
      const reserved = 36 + 12 + (toolbarRef.current?.offsetHeight ?? 38) + 2;
      const maxHeight = Math.max(22, Math.min(228, cardMaxHeight - topOffset - reserved));
      el.style.height = "auto";
      el.style.maxHeight = maxHeight + "px";
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    };
    resize();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, attachments.length, cardMaxHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend(value, attachments);
    }
  };

  return (
    <Popover open={attachmentSource !== null} onOpenChange={open => {
      if (!open) setAttachmentSource(null);
    }}>
    <PopoverAnchor asChild>
    <div ref={cardRef} className="relative flex w-full flex-col overflow-hidden rounded-[20px] border border-[#e6e6e6] bg-white shadow-none" style={{ maxHeight: cardMaxHeight }}>
      <div className="flex min-h-0 flex-1 flex-col px-[12px] pt-[12px] pb-[12px]" onPointerDown={() => textareaRef.current?.focus()}>
        <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />
        <textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleKeyDown}
          onPaste={event => {
            const files = Array.from(event.clipboardData.items)
              .filter(item => item.kind === "file")
              .map(item => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (files.length) onAddFiles(files);
          }}
          placeholder={placeholder} rows={1} style={{ minHeight: 22, maxHeight: 228 }}
          className="relative z-10 block w-[calc(100%+12px)] min-h-[22px] shrink resize-none overflow-y-auto bg-transparent pr-[12px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px] placeholder:text-[rgba(0,0,0,0.26)] outline-none"
        />
        <div className="h-[36px] shrink-0" />
      </div>
      <div ref={toolbarRef} className="flex shrink-0 items-center gap-[32px] px-[8px] pb-[8px] pr-[46px]">
        <div className="relative flex min-w-0 items-center gap-[8px]">
        <AddContentMenu
          hasProject={hasProject}
          onAddFiles={onAddFiles}
          onSelectSource={setAttachmentSource}
          onOpenChange={open => { if (open) setAttachmentSource(null); }}
          onOpenConnectors={onOpenConnectors}
          menuClassName="w-[240px]"
        />
        <div className="shrink-0">
          <PptGenerationToggle selected={pptGeneration} onChange={onPptGenerationChange} borderless />
        </div>
        </div>
      </div>
      {/* 发送按钮绝对定位在输入框右下角内侧：工具栏再挤也不会把按钮挤到边框外 */}
      <div className="absolute bottom-[8px] right-[8px]">
        <SendButton
          canSend={canSend}
          agentRunning={agentRunning}
          onSend={() => onSend(value, attachments)}
          onStop={onStop}
        />
      </div>
    </div>
    </PopoverAnchor>
    {attachmentSource && (
      <AttachmentPicker
        source={attachmentSource}
        hasProject={hasProject}
        projectFiles={projectFiles}
        onSourceChange={setAttachmentSource}
        attachments={attachments}
        onAddFiles={onAddFiles}
        onRemove={onRemoveAttachment}
        onClose={() => textareaRef.current?.focus()}
      />
    )}
    </Popover>
  );
}

export { ChatInput };
