import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import type { AttachmentSource } from "./attachment-picker";
import {
  CONNECTORS, connectConnector as storeConnect, disconnectConnector as storeDisconnect,
  isConnected, isEnabled, orderedConnected, orderedAvailable, toggleConnectorEnabled,
  useConnectorState,
} from "./connectors-store";

// ============================================================================
// 「添加内容」面板（Figma 9622:48317 / 9709:63275）
// 输入框左下角的 + 与自动化任务弹窗「就」里的 + 共用这一份实现：
// 同一个菜单、同一组选项、同样的点击/关闭行为，避免两处各写一遍走偏。
// 选项：上传本地文件 → OneDrive / Outlook / SharePoint / 产物 /（有项目时）项目资料
//        → 分隔线 → 连接器（hover 出子面板，仅输入框传入回调时显示）→ 来源（占位）
// 连接器子面板（Figma 10117:78156）：4 条连接器（开关 / 连接）+「管理连接器」跳管理页
// ============================================================================

type SourceItem = { label: string; icon: string; source: AttachmentSource };
type NoticeItem = { label: string; icon: string; message: string; arrow?: boolean };
type ActionItem = { label: string; icon: string; action: "connectors"; arrow: boolean };
type AddContentItem = SourceItem | NoticeItem | ActionItem;

const SOURCE_ITEMS: AddContentItem[] = [
  { label: "从 OneDrive 中添加", icon: "d70fd", source: "OneDrive" },
  { label: "从 Outlook 中添加", icon: "cc7e9", source: "Outlook" },
  { label: "从 SharePoint 中添加", icon: "9c4f2", source: "SharePoint" },
  { label: "从产物中添加", icon: "ec778", source: "产物" },
  { label: "从项目资料中添加", icon: "1d8f2", source: "项目资料" },
  { label: "连接器", icon: "connector-plug", action: "connectors", arrow: true },
  { label: "来源", icon: "29219", message: "来源功能暂未接入", arrow: true },
];

const ACCEPT = ".png,.jpg,.jpeg,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.html,.eml,.msg";

export function AddContentMenu({
  hasProject,
  onAddFiles,
  onSelectSource,
  iconSrc = "/assets/afee9.svg",
  iconClassName,
  className,
  menuClassName,
  onOpenChange,
  onOpenConnectors,
}: {
  // 无项目时隐藏「从项目资料中添加」，与输入框保持一致
  hasProject: boolean;
  onAddFiles: (files: File[]) => void;
  onSelectSource: (source: AttachmentSource) => void;
  // 触发按钮里的 + 图标（输入框与自动化弹窗各用各的切图）
  iconSrc?: string;
  iconClassName?: string;
  className?: string;
  // 输入框菜单按设计稿宽 240px；自动化弹窗里的同一个菜单保持原 192px
  menuClassName?: string;
  onOpenChange?: (open: boolean) => void;
  // 传入后才显示「连接器」入口（Figma 10117:83601）
  onOpenConnectors?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const connectorRowRef = useRef<HTMLButtonElement>(null);
  const closeSubmenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const connectTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const connectorState = useConnectorState();
  const connectorRows = [...orderedConnected(connectorState), ...orderedAvailable(connectorState)];

  const setMenuOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setConnectorsOpen(false);
    onOpenChange?.(next);
  };

  const openConnectors = () => {
    if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
    setConnectorsOpen(true);
  };
  const deferCloseConnectors = () => {
    if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
    closeSubmenuTimer.current = setTimeout(() => setConnectorsOpen(false), 140);
  };
  useEffect(() => () => {
    if (closeSubmenuTimer.current) clearTimeout(closeSubmenuTimer.current);
    connectTimers.current.forEach(clearTimeout);
  }, []);

  // 连接是模拟交互：loading 1.5s → toast → 该行变开关（默认打开）并排到前面
  const connectConnector = (id: string, name: string) => {
    if (loadingId) return;
    setLoadingId(id);
    const timer = setTimeout(() => {
      toast.success(`已连接 ${name}`);
      storeConnect(id);
      setLoadingId(null);
      connectTimers.current = connectTimers.current.filter(t => t !== timer);
    }, 1500);
    connectTimers.current.push(timer);
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
        <>
        <OperationMenu
          anchor={buttonRef.current}
          gap={8}
          role="menu"
          aria-label="添加内容"
          className={`${menuClassName ?? "w-[192px]"} overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]`}
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
              .filter(item => !("action" in item) || onOpenConnectors)
              .map(item => (
                <Fragment key={item.label}>
                  {item.label === "连接器" && (
                    <div role="separator" className="mx-[8px] h-px bg-[#f2f2f2]" />
                  )}
                  <button
                    ref={"action" in item ? connectorRowRef : undefined}
                    type="button"
                    role="menuitem"
                    aria-haspopup={"action" in item ? "menu" : undefined}
                    aria-expanded={"action" in item ? connectorsOpen : undefined}
                    onMouseEnter={"action" in item ? openConnectors : undefined}
                    onMouseLeave={"action" in item ? deferCloseConnectors : undefined}
                    onFocus={"action" in item ? openConnectors : undefined}
                    onClick={() => {
                      if ("action" in item) { openConnectors(); return; }
                      setMenuOpen(false);
                      if ("source" in item) onSelectSource(item.source);
                      else toast.info(item.message);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left font-normal ${"action" in item && connectorsOpen ? "bg-[#f2f2f2]" : "hover:bg-[#f2f2f2] focus-visible:bg-[#f2f2f2]"}`}
                  >
                    <img src={`/assets/${item.icon}.svg`} alt="" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{item.label}</span>
                    {"arrow" in item && item.arrow && <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />}
                  </button>
                </Fragment>
              ))}
          </div>
        </OperationMenu>
        {connectorsOpen && connectorRowRef.current && (
          <OperationMenu
            submenu
            submenuAlign="bottom"
            anchor={connectorRowRef.current}
            role="menu"
            aria-label="连接器"
            onMouseEnter={openConnectors}
            onMouseLeave={deferCloseConnectors}
            className="w-[232px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
          >
            <div className="flex w-full flex-col py-[4px]">
              {connectorRows.map(item => {
                const connected = isConnected(connectorState, item.id);
                const enabled = isEnabled(connectorState, item.id);
                const loading = loadingId === item.id;
                return (
                  <div key={item.id} role="menuitem" className="flex h-[44px] w-full items-center gap-[8px] rounded-[8px] px-[8px] hover:bg-[#f7f7f7]">
                    <img src="/assets/connector-list-icon.svg" alt="" className="size-[16px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{item.name}</span>
                    {connected ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? "关闭" : "启用"}${item.name}`}
                        onClick={() => toggleConnectorEnabled(item.id)}
                        className="flex shrink-0 cursor-pointer items-center border-0 bg-transparent p-0"
                      >
                        <img src={enabled ? "/assets/connector-switch-on.svg" : "/assets/connector-switch-off.svg"} alt="" className="h-[12px] w-[24px]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => connectConnector(item.id, item.name)}
                        className="flex h-[24px] w-[40px] translate-x-[4px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-transparent px-[4px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.38)] hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6] disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        {loading
                          ? <span className="block size-[14px] animate-spin rounded-full border-2 border-[rgba(0,0,0,0.15)] border-t-[rgba(0,0,0,0.65)]" />
                          : "连接"}
                      </button>
                    )}
                  </div>
                );
              })}
              <div role="separator" className="mx-[8px] h-px bg-[#f2f2f2]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onOpenConnectors?.(); }}
                className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-normal hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
              >
                <img src="/assets/connector-manage-icon.svg" alt="" className="size-[16px] shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">管理连接器</span>
              </button>
            </div>
          </OperationMenu>
        )}
        </>
      )}
    </div>
  );
}
