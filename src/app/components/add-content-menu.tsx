import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import type { AttachmentSource } from "./attachment-picker";

// ============================================================================
// 「添加内容」面板（Figma 9622:48317 / 9709:63275）
// 输入框左下角的 + 与自动化任务弹窗「就」里的 + 共用这一份实现：
// 同一个 192px 菜单、同一组选项、同样的点击/关闭行为，避免两处各写一遍走偏。
// 选项：上传本地文件 → 分隔线 → OneDrive / Outlook / SharePoint / 产物 /（有项目时）项目资料
//        → 分隔线 → 来源（占位）
// ============================================================================

type SourceItem = { label: string; icon: string; source: AttachmentSource };
type NoticeItem = { label: string; icon: string; message: string };
type AddContentItem = SourceItem | NoticeItem;

const SOURCE_ITEMS: AddContentItem[] = [
  { label: "从 OneDrive 中添加", icon: "d70fd", source: "OneDrive" },
  { label: "从 Outlook 中添加", icon: "cc7e9", source: "Outlook" },
  { label: "从 SharePoint 中添加", icon: "9c4f2", source: "SharePoint" },
  { label: "从产物中添加", icon: "ec778", source: "产物" },
  { label: "从项目资料中添加", icon: "1d8f2", source: "项目资料" },
  { label: "来源", icon: "29219", message: "来源功能暂未接入" },
];

const ACCEPT = ".png,.jpg,.jpeg,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.html,.eml,.msg";

export function AddContentMenu({
  hasProject,
  onAddFiles,
  onSelectSource,
  iconSrc = "/assets/afee9.svg",
  iconClassName,
  className,
  onOpenChange,
}: {
  // 无项目时隐藏「从项目资料中添加」，与输入框保持一致
  hasProject: boolean;
  onAddFiles: (files: File[]) => void;
  onSelectSource: (source: AttachmentSource) => void;
  // 触发按钮里的 + 图标（输入框与自动化弹窗各用各的切图）
  iconSrc?: string;
  iconClassName?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const setMenuOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  // Esc 只收起菜单，不连带关闭外层弹窗（自动化任务弹窗里 + 的菜单需要这一层）。
  // 挂在 window 的捕获阶段：比 Radix Dialog 挂在 document 上的 Esc 监听更早执行。
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="添加内容"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setMenuOpen(!open)}
        className={`flex size-[30px] cursor-pointer items-center justify-center rounded-full border-0 ${open ? "bg-[#f2f2f2]" : "hover:bg-[#f7f7f7]"}`}
        title="添加内容"
      >
        <img src={iconSrc} alt="" className={iconClassName} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        multiple
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length) onAddFiles(files);
          event.currentTarget.value = "";
          setMenuOpen(false);
        }}
      />
      {open && (
        <OperationMenu
          anchor={buttonRef.current}
          gap={8}
          role="menu"
          aria-label="添加内容"
          className="w-[192px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                fileInputRef.current?.click();
                setMenuOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left font-normal hover:bg-[#f2f2f2] focus-visible:bg-[#f2f2f2]"
            >
              <img src="/assets/f811e.svg" alt="" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">上传本地文件</span>
            </button>
            {SOURCE_ITEMS
              .filter(item => !("source" in item) || item.source !== "项目资料" || hasProject)
              .map(item => (
                <Fragment key={item.label}>
                  {item.label === "来源" && (
                    <div role="separator" className="relative h-0 w-full">
                      <img src="/assets/11020.svg" alt="" className="absolute -top-[0.5px] left-0 max-w-none" />
                    </div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if ("source" in item) onSelectSource(item.source);
                      else toast.info(item.message);
                    }}
                    className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left font-normal hover:bg-[#f2f2f2] focus-visible:bg-[#f2f2f2]"
                  >
                    <img src={`/assets/${item.icon}.svg`} alt="" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{item.label}</span>
                    {item.label === "来源" && <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />}
                  </button>
                </Fragment>
              ))}
          </div>
        </OperationMenu>
      )}
    </div>
  );
}
