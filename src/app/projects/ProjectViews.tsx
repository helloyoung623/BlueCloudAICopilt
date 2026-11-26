import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../components/ui/dialog";
import { OperationMenu } from "../components/operation-menu";
import { ListPageHeader } from "../components/list-page-header";
import { FileFilterButton, EMPTY_UPLOADER_FILTER, SELF_OWNER } from "../components/file-filter";
import type { FileFormat, FileStatus, TimeFilter, UploaderFilter } from "../components/file-filter";
import { ProjectFilesPanel, DEMO_PROJECT_FILES, pickSourceFiles } from "../components/project-files";
import type { ProjectFiles } from "../components/project-files";
import { SelectFileDialog } from "../components/select-file-dialog";
import type { CloudSourceTab } from "../components/select-file-dialog";
import { ProjectInstructionDialog, ProjectMembersDialog, ProjectMemberTag } from "../components/project-settings-dialogs";
import type { ProjectMember } from "../components/project-settings-dialogs";
import { getAvatarInitial } from "../components/avatar-initial";
import { ChatInput } from "../chat/ChatInput";
import type { HistoryItem } from "../chat/types";
import type { ProjectItem } from "./types";

function TaskProjectMoveMenu({ projects, projectId, onMove, onCreate }: {
  projects: ProjectItem[];
  projectId?: number;
  onMove: (projectId: number | undefined) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targets = projects.filter(project => project.id !== projectId);
  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const deferClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={deferClose}>
      <button ref={triggerRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} onClick={openMenu} onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMenu();
        }
      }} className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] ${open ? "bg-[#f2f2f2]" : "hover:bg-[#f7f7f7]"}`}>
        <img src="/assets/1d8f2.svg" alt="" className="shrink-0" />
        <span className="min-w-0 flex-1">移动到项目</span>
        <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
      </button>
      {open && (
        <OperationMenu submenu anchor={triggerRef.current} role="menu" aria-label="移动到项目" onMouseEnter={openMenu} onMouseLeave={deferClose} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
          if (event.key === "Escape" || event.key === "ArrowLeft") {
            event.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
          }
        }} className="w-[232px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
          <div className="flex max-h-[480px] flex-col overflow-y-auto py-[4px]">
            {targets.length === 0 ? (
              <div className="px-[8px] py-[11px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">暂无项目</div>
            ) : targets.map(project => (
              <button key={project.id} type="button" role="menuitem" onClick={() => onMove(project.id)} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
                <img src="/assets/d95df.svg" alt="" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </button>
            ))}
            <div className="relative h-px w-full"><img src="/assets/4b9c6.svg" alt="" className="absolute left-0 top-0" /></div>
            <button type="button" role="menuitem" onClick={onCreate} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
              <img src="/assets/eede2.svg" alt="" className="shrink-0" />新建项目
            </button>
            {projectId !== undefined && (
              <button type="button" role="menuitem" onClick={() => onMove(undefined)} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
                <img src="/assets/6ec2b.svg" alt="" className="shrink-0" />从项目中移出
              </button>
            )}
          </div>
        </OperationMenu>
      )}
    </div>
  );
}


function CreateProjectDialog({ open, onOpenChange, onCreate, editProject, onEdit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: Omit<ProjectItem, "id">) => void;
  editProject?: ProjectItem | null;
  onEdit?: (updates: { name: string; description: string }) => void;
}) {
  const editing = Boolean(editProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // 打开时按编辑模式预填现有项目信息
  useEffect(() => {
    if (open) {
      setName(editProject?.name ?? "");
      setDescription(editProject?.description ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setDescription("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (editing && onEdit) onEdit({ name: trimmedName, description: description.trim() });
    else onCreate({ name: trimmedName, description: description.trim(), instruction: "" });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[720px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex w-full flex-col gap-[4px] px-[24px] py-[16px]">
            <div className="relative h-[24px] w-full">
              <DialogTitle className="font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
                {editing ? "编辑项目信息" : "新建项目"}
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label={editing ? "关闭编辑项目信息弹窗" : "关闭新建项目弹窗"}
                  className="absolute right-0 top-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
                >
                  <img src="/assets/f802d.svg" alt="" />
                </button>
              </DialogClose>
            </div>
          </div>

          <div className="flex w-full flex-col items-start px-[12px] pt-[16px]">
            <label className="flex w-full flex-col gap-[8px] pb-[24px]">
              <span className="pl-[12px] font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
                项目名称
              </span>
              <div className="px-[12px]">
                <div className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] px-[12px] focus-within:border-[#1e63f5]">
                  <input
                    autoFocus
                    required
                    maxLength={30}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="请输入项目名称"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <span className="shrink-0 font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    {name.length}/30
                  </span>
                </div>
              </div>
            </label>

            <label className="flex w-full flex-col gap-[8px] pb-[24px]">
              <span className="pl-[12px] font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
                简介
              </span>
              <div className="px-[12px]">
                <div className="relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] focus-within:border-[#1e63f5]">
                  <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    maxLength={100}
                    placeholder="请描述项目简介"
                    className="block h-[78px] w-full resize-none bg-white p-[12px] pb-[24px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <img src="/assets/166cb.svg" alt="" className="pointer-events-none absolute bottom-[4px] right-[4px]" />
                </div>
              </div>
            </label>
          </div>

          <div className="flex h-[80px] w-full items-center justify-end gap-[24px] px-[24px]">
            <DialogClose asChild>
              <button
                type="button"
                className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
              >
                取消
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={!name.trim()}
              className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99C3FF] disabled:hover:bg-[#99C3FF]"
            >
              确定
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 删除项目确认弹窗 — Figma 9244:31443
 * 480 宽 / 8 圆角；标题行（24 删除图标 + 20/28 中黑 + 右上关闭）、
 * 说明文案左缩进 32（与标题文字对齐）、底部右对齐「取消 / 确定」。
 * 确定后由上层真正删除项目并 toast「删除成功」。
 * ------------------------------------------------------------------ */

const TRANSFER_MEMBERS = ["李文博", "王磊", "张晓彤", "刘洋", "陈思远", "赵敏"];

function TransferConfirmDialog({ member, onCancel, onConfirm }: {
  member: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[480px] [&>button]:hidden"
      >
        <div className="flex w-full flex-col gap-[16px] px-[16px] pt-[24px]">
          {/* 标题：警告图标 + 标题 + 关闭 */}
          <div className="flex w-full items-center gap-[8px]">
            <img src="/assets/transfer-warning.svg" alt="" className="size-[24px] shrink-0" />
            <DialogTitle className="min-w-0 flex-1 font-['PingFang_SC:Medium'] text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
              确定移交要移交此项目吗？
            </DialogTitle>
            <DialogClose asChild>
              <button type="button" aria-label="关闭移交确认弹窗" className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
                <img src="/assets/f802d.svg" alt="" />
              </button>
            </DialogClose>
          </div>
          {/* 正文：与标题文字左对齐（16 + 24 + 8 = 48） */}
          <p className="pl-[32px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定要将此项目及其关联资源移交给 {member} 吗？移交后您将失去管理权限
          </p>
          {/* 按钮：取消 / 确定 */}
          <div className="flex w-full items-center justify-end gap-[24px] py-[16px]">
            <DialogClose asChild>
              <button type="button" className="cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]">
                取消
              </button>
            </DialogClose>
            <button type="button" onClick={onConfirm} className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]">
              确定
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 项目操作菜单：项目页卡片与侧栏「···」共用同一份操作项（编辑项目信息 / 移交项目 / 归档 / 删除），
// 保证两处的字段、图标、移交子菜单与确认弹窗完全一致
function ProjectActionsMenu({ project, anchor, gap = 0, onClose, onEdit, onArchive, onDelete, onTransfer, innerRef }: {
  project: ProjectItem;
  anchor: HTMLElement | null;
  // 卡片内锚定用 0，仅菜单按钮（menuOnly）场景留 8px 视觉间隙
  gap?: number;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onTransfer?: (member: string) => void;
  // 侧栏外点关闭依赖此 ref 判断「点击是否在菜单内」，卡片场景由自身 cardRef 兜底、可不传
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchFocused, setMemberSearchFocused] = useState(false);
  const closeTransferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferTriggerRef = useRef<HTMLButtonElement>(null);
  const members = TRANSFER_MEMBERS.filter(member => member.includes(memberSearch.trim()));

  useEffect(() => () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
  }, []);

  const openTransfer = () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
    setTransferOpen(true);
  };
  const deferCloseTransfer = () => {
    closeTransferTimer.current = setTimeout(() => setTransferOpen(false), 140);
  };
  const closeMenus = () => {
    onClose();
    setTransferOpen(false);
  };

  return (
    <OperationMenu anchor={anchor}
      ref={innerRef}
      role="menu"
      aria-label="项目操作"
      gap={gap}
      onKeyDown={event => {
        if (event.key === "Escape") { closeMenus(); anchor?.focus(); }
      }}
      className="w-[192px] overflow-visible rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex w-full flex-col py-[4px]">
        <button
          type="button"
          role="menuitem"
          onClick={() => { onEdit(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">编辑项目信息</span>
        </button>
        <div className="relative" onMouseEnter={openTransfer} onMouseLeave={deferCloseTransfer}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={transferOpen}
            ref={transferTriggerRef}
            onClick={openTransfer}
            className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left ${transferOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f7f7f7]"}`}
          >
            <img src="/assets/65325.svg" alt="" className="shrink-0" />
            <span className="min-w-0 flex-1 font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">移交项目</span>
            <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
          </button>
          {transferOpen && (
            <OperationMenu submenu anchor={transferTriggerRef.current}
              role="menu"
              onMouseEnter={openTransfer}
              onMouseLeave={deferCloseTransfer}
              className="w-[208px] overflow-hidden rounded-[8px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
            >
              <div className="bg-white px-[16px] py-[4px]">
                <label className="flex h-[32px] items-center gap-[8px] border-b border-[#1e63f5]">
                  <img src={memberSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
                  <input
                    autoFocus
                    value={memberSearch}
                    onChange={event => setMemberSearch(event.target.value)}
                    onFocus={() => setMemberSearchFocused(true)}
                    onBlur={() => setMemberSearchFocused(false)}
                    placeholder="搜索"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  {memberSearch && (
                    <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setMemberSearch("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                      <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                    </button>
                  )}
                </label>
              </div>
              <div className="max-h-[480px] overflow-y-auto px-[8px]">
                {members.map((member, index) => (
                  <button
                    key={`${member}-${index}`}
                    type="button"
                    role="menuitem"
                    onClick={() => { onTransfer?.(member); closeMenus(); }}
                    className="flex w-[192px] cursor-pointer items-center rounded-[8px] px-[8px] py-[10px] hover:bg-[#f7f7f7]"
                  >
                    <span className="flex h-[24px] max-w-[144px] items-center gap-[4px] rounded-[16px] bg-[#f7f7f7] pl-[2px] pr-[8px]">
                      <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-[#1e63f5] font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(255,255,255,0.98)]">
                        {getAvatarInitial(member)}
                      </span>
                      <span className="truncate font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">
                        {member}
                      </span>
                    </span>
                  </button>
                ))}
                {members.length === 0 && <p className="px-[8px] py-[10px] text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的成员</p>}
              </div>
            </OperationMenu>
          )}
        </div>
        <button
          type="button"
          role="menuitem"
          onClick={() => { onArchive(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">归档</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => { onDelete(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
        </button>
      </div>
    </OperationMenu>
  );
}

function ProjectCard({ project, onOpen, onRename, onArchive, onDelete, onTransfer, menuOnly = false }: {
  project: ProjectItem;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onTransfer?: (member: string) => void;
  menuOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <div ref={cardRef} className="relative min-w-0">
      {menuOnly ? (
        <button type="button" aria-label="项目操作" aria-haspopup="menu" aria-expanded={menuOpen} onClick={event => {
          setMenuAnchor(event.currentTarget);
          setMenuOpen(open => !open);
        }} className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/f8bb9.svg" alt="" />
        </button>
      ) : <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`flex h-[74px] w-full cursor-pointer items-center gap-[12px] overflow-hidden rounded-[12px] border border-[#e6e6e6] p-[12px] text-left transition-colors ${
          hovered || menuOpen ? "bg-[#e6e6e6]" : "bg-white"
        }`}
      >
        <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
          <img src="/assets/0fc4d.svg" alt="" className="shrink-0" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center font-['PingFang_SC:Regular']">
          <p className="w-full truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            {project.name}
          </p>
          <p className="w-full truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">
            {project.description || "暂无描述"}
          </p>
        </div>
        {(hovered || menuOpen) && (
          <button
            type="button"
            aria-label={`${project.name}更多操作`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={event => {
              event.stopPropagation();
              setMenuAnchor(event.currentTarget);
              setMenuOpen(open => !open);
            }}
            className="flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[rgba(0,0,0,0.06)]"
          >
            <img src="/assets/bbe3b.svg" alt="" className="shrink-0" />
          </button>
        )}
      </div>}

      {menuOpen && (
        <ProjectActionsMenu
          project={project}
          anchor={menuAnchor}
          gap={menuOnly ? 8 : 0}
          onClose={() => setMenuOpen(false)}
          onEdit={onRename}
          onArchive={onArchive}
          onDelete={onDelete}
          onTransfer={onTransfer}
        />
      )}
    </div>
  );
}

function ProjectHeaderActions({ project, onEdit, onTransfer, onArchive, onDelete, panelOpen, showPanelToggle, onTogglePanel }: {
  project: ProjectItem;
  onEdit: (updates: { name: string; description: string }) => void;
  onTransfer: (member: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  panelOpen: boolean;
  showPanelToggle: boolean;
  onTogglePanel: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="relative flex shrink-0 items-center gap-[8px]">
      <ProjectCard project={project} menuOnly onOpen={() => {}} onRename={() => setEditOpen(true)} onTransfer={onTransfer} onArchive={onArchive} onDelete={onDelete} />
      {showPanelToggle && <button type="button" aria-label={panelOpen ? "收起右侧边栏" : "展开右侧边栏"} aria-expanded={panelOpen} aria-controls="project-configuration" onClick={onTogglePanel} className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
        <img src="/assets/a8ef3.svg" alt="" />
      </button>}
      <CreateProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onCreate={() => {}}
        editProject={project}
        onEdit={updates => { onEdit(updates); toast.success("项目信息已更新"); }}
      />
    </div>
  );
}

// ============================================================================
// 列表页共享组件（项目页 / 自动化任务页复用同一套 Figma 组件、响应式规则与交互）
// Figma 9187:44647 / 9532:10168 / 9598:39360「Search Input」「Icon Button」
// Figma 9446:46779 / 9625:52202「Tag-2」Size=L
// ============================================================================

// Tag-2 组件 Size=L：Selected → #F7F7F7/r8 + 文字 0.88；Default → 透明/r4 + 文字 0.6；Hover → #F2F2F2/r8
// Figma 9625:52202 文字填充变量：选中 11548:25 (opacity 0.88)、默认 11548:26 (opacity 0.6)，
// 与项目详情页「任务/来源/产物」Tag-2 一致（历史已按设计稿校准）
// 项目页「全部/我创建的/我参与的」与自动化任务页「已启用/已暂停/已结束」共用
function TagTabs<T extends string>({ items, active, onChange }: {
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-[16px] pb-[16px]">
      {items.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          aria-pressed={active === item}
          className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${active === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[4px] bg-transparent text-[rgba(0,0,0,0.6)] hover:rounded-[8px] hover:bg-[#f2f2f2]"}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

const PROJECT_TABS = ["全部", "我创建的", "我参与的"] as const;

function ProjectListView({ projects, onCreateProject, onSelectProject, onEditProject, onArchiveProject, onDeleteProject, onTransferProject }: {
  projects: ProjectItem[];
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
  onSelectProject: (id: number) => void;
  onEditProject: (id: number, updates: { name: string; description: string }) => void;
  onArchiveProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onTransferProject: (id: number, member: string) => void;
}) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [projectTab, setProjectTab] = useState<(typeof PROJECT_TABS)[number]>("全部");
  const [projectQuery, setProjectQuery] = useState("");

  const keyword = projectQuery.trim().toLowerCase();
  const visibleProjects = projects.filter(project => {
    if (project.archived) return false;
    if (keyword && !`${project.name} ${project.description ?? ""}`.toLowerCase().includes(keyword)) return false;
    if (projectTab === "我创建的") return !project.owner || project.owner === "我";
    if (projectTab === "我参与的") return (project.members?.length ?? 0) > 0;
    return true;
  });

  return (
    <>
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white px-[16px] min-[800px]:px-[24px]">
        <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col">
          <ListPageHeader
            title="项目"
            query={projectQuery}
            onQueryChange={setProjectQuery}
            searchPlaceholder="搜索项目"
            searchAriaLabel="搜索项目"
          >
            <button
              type="button"
              onClick={() => setCreateProjectOpen(true)}
              className="hidden shrink-0 cursor-pointer items-center justify-center gap-[8px] overflow-hidden rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] hover:bg-[#1554d1] min-[560px]:flex"
            >
              <img src="/assets/c136c.svg" alt="" className="shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)]">
                新建项目
              </span>
            </button>
            {/* <560px：Filled Primary Button 收起为 32x32 蓝色 add-circle-fill 图标按钮 */}
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="hidden size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#ebf4ff] active:bg-[#99c3ff] max-[559px]:flex"
            >
              <img src="/assets/project-add-circle.svg" alt="" className="size-[20px]" />
            </button>
          </ListPageHeader>

          <TagTabs items={PROJECT_TABS} active={projectTab} onChange={setProjectTab} />

          {visibleProjects.length === 0 ? (
            <div className="flex flex-1 items-center justify-center pb-[260px]">
              <div className="flex w-[320px] flex-col items-center justify-end">
                <div className="mb-[-80px] size-[320px] shrink-0 overflow-hidden">
                  <img src="/assets/projects-empty-design.png" alt="暂无项目" className="size-[320px] max-w-none object-cover" />
                </div>
                <div className="flex w-full flex-col items-center justify-center gap-[4px] pb-[32px]">
                  <p className="whitespace-nowrap font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    暂无项目
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-[16px] overflow-visible pb-[24px] [grid-template-columns:repeat(auto-fill,minmax(min(288px,100%),1fr))]">
              {/* 卡片最小宽度 288（设计规则）：列数由可用宽度自动决定，不再按窗口断点写死 3/2/1 列。
                  960 内容宽 → 3 列（309），880 → 2 列（432），不足 2×288+16 时落 1 列；
                  极窄（内容 < 288+内边距）时用 min() 兜底，避免横向溢出。 */}
              {visibleProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => onSelectProject(project.id)}
                  onRename={() => setEditingProject(project)}
                  onArchive={() => onArchiveProject(project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                  onTransfer={member => onTransferProject(project.id, member)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <CreateProjectDialog
        open={createProjectOpen || editingProject !== null}
        onOpenChange={open => { setCreateProjectOpen(open); if (!open) setEditingProject(null); }}
        onCreate={onCreateProject}
        editProject={editingProject}
        onEdit={updates => { if (editingProject) onEditProject(editingProject.id, updates); setEditingProject(null); }}
      />
    </>
  );
}

// Figma 9446:47192（项目 tab 有数据）/ 9423:124200（任务 tab）/ 9638:46195（空态）：
// 归档数据页 —— 标题 20px/28 Medium + Tag-2 胶囊 tab + 项目卡片网格 309x72 r12 / 任务分组列表 + 320px 空态插图
const formatArchiveTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Figma 9244:31284「Action toast」：白底胶囊、描边 #38E38A、绿色对勾 +「已归档」+ 蓝色「撤销」
function showArchiveToast(onUndo: () => void) {
  const id = toast.custom(() => (
    <div className="flex h-[44px] items-center gap-[8px] rounded-full border border-[#38e38a] bg-white pl-[8px] pr-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#38e38a" />
        <path d="M7.6 12.3l2.9 2.9 5.9-6.4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="min-w-0 flex-1 whitespace-nowrap text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">已归档</span>
      <button
        type="button"
        onClick={() => { toast.dismiss(id); onUndo(); }}
        className="shrink-0 cursor-pointer bg-transparent text-[14px] font-normal leading-[22px] text-[#1e63f5]"
      >撤销</button>
    </div>
  ), { duration: 5000 });
}

function ArchiveView({ projects, tasks, onUnarchiveProject, onEditProject, onTransferProject, onDeleteProject, onSelectTask, onUnarchiveTask, onDeleteTask }: {
  projects: ProjectItem[];
  tasks: HistoryItem[];
  onUnarchiveProject: (id: number) => void;
  onEditProject: (id: number, updates: { name: string; description: string }) => void;
  onTransferProject: (id: number, member: string) => void;
  onDeleteProject: (id: number) => void;
  onSelectTask: (id: number) => void;
  onUnarchiveTask: (id: number) => void;
  onDeleteTask: (id: number) => void;
}) {
  const [tab, setTab] = useState<"任务" | "项目">("任务");
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [cardMenu, setCardMenu] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [taskMenu, setTaskMenu] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchFocused, setMemberSearchFocused] = useState(false);
  const [transferSubmenuOpen, setTransferSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const transferTriggerRef = useRef<HTMLButtonElement>(null);
  const closeTransferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archivedProjects = projects.filter(project => project.archived);
  const archivedTasks = tasks.filter(task => task.archived);
  const members = TRANSFER_MEMBERS.filter(member => member.includes(memberSearch.trim()));
  const menuProject = archivedProjects.find(project => project.id === cardMenu?.id);
  const menuTask = archivedTasks.find(task => task.id === taskMenu?.id);

  useEffect(() => () => { if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current); }, []);

  useEffect(() => {
    if (!cardMenu && !taskMenu) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardMenu?.anchor.contains(event.target) && !taskMenu?.anchor.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setCardMenu(null);
        setTaskMenu(null);
        setMemberSearch("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [cardMenu, taskMenu]);

  const closeMenus = () => {
    setCardMenu(null);
    setTaskMenu(null);
    setMemberSearch("");
  };
  const openTransfer = () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
    setCardMenu(menu => menu ? { ...menu } : menu);
    setTransferSubmenuOpen(true);
  };
  const deferCloseTransfer = () => {
    closeTransferTimer.current = setTimeout(() => setTransferSubmenuOpen(false), 140);
  };

  const emptyState = (text: string) => (
    <div className="flex flex-col items-center pt-[32px]">
      <img src="/assets/archive-empty.png" alt="" className="h-[260px] max-w-full object-contain" />
      <p className="pb-[24px] text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.38)]">{text}</p>
    </div>
  );

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto bg-transparent px-[16px] min-[800px]:px-[24px]">
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col pb-[40px]">
        <h1 className="flex h-[44px] items-end pb-[16px] pt-[20px] text-[20px] font-medium leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]">归档数据</h1>
        <div role="tablist" aria-label="归档数据" className="flex shrink-0 items-center gap-[16px]">
          {(["任务", "项目"] as const).map(item => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); closeMenus(); }} className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[8px] bg-transparent text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"}`}>{item}</button>
          ))}
        </div>
        {tab === "项目" ? (
          archivedProjects.length > 0 ? (
            <div className="mt-[16px] grid gap-[16px] [grid-template-columns:repeat(auto-fill,minmax(min(288px,100%),1fr))]">
              {/* 与项目列表同一套最小宽度规则：卡片不低于 288，列数由可用宽度自动决定 */}
              {archivedProjects.map(project => (
                <div
                  key={project.id}
                  onMouseEnter={() => setHoveredCard(project.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`relative flex h-[72px] min-w-0 cursor-pointer items-center rounded-[12px] border border-[#e6e6e6] px-[12px] ${hoveredCard === project.id || cardMenu?.id === project.id ? "bg-[#e6e6e6]" : "bg-white"}`}
                >
                  <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
                    <img src="/assets/e5ea3.svg" alt="" />
                  </div>
                  <div className="ml-[12px] min-w-0 flex-1">
                    <p className="truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{project.name}</p>
                    <p className="truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">{project.description || "暂无描述"}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${project.name}归档操作`}
                    aria-haspopup="menu"
                    aria-expanded={cardMenu?.id === project.id}
                    onClick={event => { event.stopPropagation(); const target = event.currentTarget; setCardMenu(menu => menu?.id === project.id ? null : { id: project.id, anchor: target }); setTransferSubmenuOpen(false); }}
                    className={`flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)] ${hoveredCard === project.id || cardMenu?.id === project.id ? "opacity-100" : "opacity-0 focus:opacity-100"}`}
                  >
                    <img src="/assets/bbe3b.svg" alt="" />
                  </button>
                </div>
              ))}
            </div>
          ) : emptyState("暂无归档项目")
        ) : archivedTasks.length > 0 ? (
          <div className="mt-[16px] flex flex-col">
            {archivedTasks.map(task => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTask(task.id)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectTask(task.id); } }}
                className="group relative flex h-[40px] cursor-pointer items-center gap-[16px] rounded-[8px] px-[8px] hover:bg-[#f2f2f2]"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">{task.title}</span>
                <span className="shrink-0 text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.26)] transition-opacity group-hover:opacity-0">{formatArchiveTime(task.createdAt)}</span>
                <button
                  type="button"
                  aria-label={`${task.title}归档操作`}
                  aria-haspopup="menu"
                  aria-expanded={taskMenu?.id === task.id}
                  onClick={event => { event.stopPropagation(); const target = event.currentTarget; setTaskMenu(menu => menu?.id === task.id ? null : { id: task.id, anchor: target }); }}
                  className={`absolute right-[8px] top-1/2 flex size-[24px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] transition-opacity hover:bg-[rgba(0,0,0,0.06)] focus:opacity-100 ${taskMenu?.id === task.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <img src="/assets/bbe3b.svg" alt="" />
                </button>
              </div>
            ))}
          </div>
        ) : emptyState("暂无归档任务")}
      </div>
      {cardMenu && menuProject && (
        <OperationMenu
          ref={menuRef}
          role="menu"
          aria-label="归档项目操作"
          anchor={cardMenu.anchor}
          align="end"
          onKeyDown={event => { if (event.key === "Escape") { closeMenus(); cardMenu.anchor.focus(); } }}
          className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button type="button" role="menuitem" onClick={() => { onUnarchiveProject(menuProject.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">取消归档</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setEditingProject(menuProject); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">编辑项目信息</span>
            </button>
            <div className="relative" onMouseEnter={openTransfer} onMouseLeave={deferCloseTransfer}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={transferSubmenuOpen}
                ref={transferTriggerRef}
                onClick={openTransfer}
                className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left ${transferSubmenuOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f7f7f7]"}`}
              >
                <img src="/assets/65325.svg" alt="" className="shrink-0" />
                <span className="min-w-0 flex-1 font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">移交项目</span>
                <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
              </button>
              {transferSubmenuOpen && (
                <OperationMenu submenu anchor={transferTriggerRef.current}
                  role="menu"
                  onMouseEnter={openTransfer}
                  onMouseLeave={deferCloseTransfer}
                  className="w-[208px] overflow-hidden rounded-[8px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
                >
                  <div className="bg-white px-[16px] py-[4px]">
                    <label className="flex h-[32px] items-center gap-[8px] border-b border-[#1e63f5]">
                      <img src={memberSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
                      <input
                        autoFocus
                        value={memberSearch}
                        onChange={event => setMemberSearch(event.target.value)}
                        onFocus={() => setMemberSearchFocused(true)}
                        onBlur={() => setMemberSearchFocused(false)}
                        placeholder="搜索"
                        className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                      />
                      {memberSearch && (
                        <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setMemberSearch("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                          <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                        </button>
                      )}
                    </label>
                  </div>
                  <div className="max-h-[480px] overflow-y-auto px-[8px]">
                    {members.map((member, index) => (
                      <button
                        key={`${member}-${index}`}
                        type="button"
                        role="menuitem"
                        onClick={() => { onTransferProject(menuProject.id, member); closeMenus(); }}
                        className="flex w-[192px] cursor-pointer items-center rounded-[8px] px-[8px] py-[10px] hover:bg-[#f7f7f7]"
                      >
                        <span className="flex h-[24px] max-w-[144px] items-center gap-[4px] rounded-[16px] bg-[#f7f7f7] pl-[2px] pr-[8px]">
                          <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-[#1e63f5] font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(255,255,255,0.98)]">
                            {getAvatarInitial(member)}
                          </span>
                          <span className="truncate font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">
                            {member}
                          </span>
                        </span>
                      </button>
                    ))}
                    {members.length === 0 && <p className="px-[8px] py-[10px] text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的成员</p>}
                  </div>
                </OperationMenu>
              )}
            </div>
            <button type="button" role="menuitem" onClick={() => { onDeleteProject(menuProject.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
            </button>
          </div>
        </OperationMenu>
      )}
      {taskMenu && menuTask && (
        <OperationMenu
          ref={menuRef}
          role="menu"
          aria-label="归档任务操作"
          anchor={taskMenu.anchor}
          align="end"
          onKeyDown={event => { if (event.key === "Escape") { closeMenus(); taskMenu.anchor.focus(); } }}
          className="w-[160px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button type="button" role="menuitem" onClick={() => { onUnarchiveTask(menuTask.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">取消归档</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { onDeleteTask(menuTask.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
            </button>
          </div>
        </OperationMenu>
      )}
      <CreateProjectDialog
        open={editingProject !== null}
        onOpenChange={open => { if (!open) setEditingProject(null); }}
        onCreate={() => {}}
        editProject={editingProject}
        onEdit={updates => { if (editingProject) onEditProject(editingProject.id, updates); setEditingProject(null); }}
      />
    </main>
  );
}

// 项目配置（指令 / 成员）：宽屏右侧边栏与窄屏「配置」页签共用同一份内容
function ProjectConfigurationSections({ project, onEditInstruction, onAddMember }: {
  project: ProjectItem;
  onEditInstruction: () => void;
  onAddMember: () => void;
}) {
  return (
    <>
      <div className="relative flex flex-col gap-[8px] border-b border-[#e6e6e6] p-[16px]">
        <p className="text-[14px] font-bold leading-[24px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">指令</p>
        <button type="button" aria-label="编辑指令" onClick={onEditInstruction} className="absolute right-[16px] top-[16px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/49891.svg" alt="" />
        </button>
        <p className={`break-words whitespace-pre-wrap text-[12px] font-normal leading-[20px] tracking-[0.012px] ${project.instruction ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)]"}`}>
          {project.instruction || "设定项目背景与规范，让 AI 与你高效协作"}
        </p>
      </div>
      <div className="relative flex flex-col gap-[8px] p-[16px]">
        <p className="text-[14px] font-bold leading-[24px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">成员</p>
        <button type="button" aria-label="添加成员" onClick={onAddMember} className="absolute right-[16px] top-[16px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/49891.svg" alt="" />
        </button>
        {project.members?.length ? (
          <div className="flex items-center py-[4px]">
            {project.members.slice(0, 8).map(member => (
              <span key={member.id} title={member.name} className="-mr-[8px] flex size-[24px] shrink-0 items-center justify-center rounded-full border border-white text-[12px] font-normal text-white" style={{ backgroundColor: member.color }}>{getAvatarInitial(member.name)}</span>
            ))}
            {project.members.length > 8 && <span className="ml-[8px] rounded-full border border-[#ebf4ff] px-[4px] text-[12px] text-[#1e63f5]">+{project.members.length - 8}</span>}
          </div>
        ) : <p className="font-['PingFang_SC:Regular'] text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">协作者</p>}
      </div>
    </>
  );
}

// 「上传文件」下拉（Figma 9484:51165）：本地文件 + 各云来源；云来源进入「选择文件」弹窗
const UPLOAD_MENU_ITEMS: { label: string; icon: string; tab?: CloudSourceTab }[] = [
  { label: "上传本地文件", icon: "/assets/upload-menu-attachment.svg" },
  { label: "从 OneDrive 中添加", icon: "/assets/upload-menu-onedrive.svg", tab: "OneDrive" },
  { label: "从 Outlook 中添加", icon: "/assets/upload-menu-outlook.svg", tab: "Outlook" },
  { label: "从 SharePoint 中添加", icon: "/assets/upload-menu-sharepoint.svg", tab: "SharePoint" },
  { label: "从产物中添加", icon: "/assets/upload-menu-artifact.svg", tab: "产物" },
];

function ProjectHomeView({ project, projects, tasks, onSelectTask, onUpdateTask, onDeleteTask, onCreateProject, inputProps, onUpdateProject, onStartImport, configurationOpen, compact }: {
  project: ProjectItem;
  configurationOpen: boolean;
  // 详情页宽度 < 800px：右侧配置边栏收起，指令 / 成员并入「配置」页签
  compact: boolean;
  projects: ProjectItem[];
  tasks: HistoryItem[];
  onSelectTask: (id: number) => void;
  onUpdateTask: (id: number, updates: Partial<Pick<HistoryItem, "title" | "pinned" | "projectId">>) => void;
  onDeleteTask: (id: number) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => number;
  inputProps: React.ComponentProps<typeof ChatInput>;
  onUpdateProject: (updates: Pick<ProjectItem, "instruction"> | Pick<ProjectItem, "members"> | Pick<ProjectItem, "files">) => void;
  // 文件导入会话挂在全局（App 根），浮窗不随项目页卸载而消失
  onStartImport: (files: { name: string; size: number }[], source: CloudSourceTab, projectId: number) => void;
}) {
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [tab, setTab] = useState<"任务" | "来源" | "产物" | "配置">("任务");
  const [filesQuery, setFilesQuery] = useState("");
  const [filesSearchFocused, setFilesSearchFocused] = useState(false);
  // 来源 / 产物 页签的搜索框响应式：搜索框左边缘距左侧 tab 群的间距 < 32px 时收起为图标按钮
  // （以「来源」布局为基准：tab + 16 + 搜索 256 + 16 + 筛选 32 + 16 + 上传按钮 + 最小间距 32）
  const [filesSearchCollapsed, setFilesSearchCollapsed] = useState(false);
  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  // 来源 / 产物两页签各自独立的筛选条件，字段与交互和资料库一致（格式 + 更新时间）；
  // 来源另加「状态」（已启用 / 停用，Figma 10045:64279）与「上传人」（我 / 其他人）
  const [sourceStatuses, setSourceStatuses] = useState<FileStatus[]>([]);
  const [sourceFormats, setSourceFormats] = useState<FileFormat[]>([]);
  const [sourceTimeFilter, setSourceTimeFilter] = useState<TimeFilter>(null);
  const [sourceUploader, setSourceUploader] = useState<UploaderFilter>(EMPTY_UPLOADER_FILTER);
  const [artifactFormats, setArtifactFormats] = useState<FileFormat[]>([]);
  const [artifactTimeFilter, setArtifactTimeFilter] = useState<TimeFilter>(null);
  // 「其他人」里可选的成员：当前来源列表里真实出现过的上传人（排除「我」），
  // 保证筛选出来的结果不会一片空白
  const sourceOwners = Array.from(new Set((project.files ?? DEMO_PROJECT_FILES).sources.map(file => file.owner)))
    .filter(owner => owner && owner !== SELF_OWNER);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const filesToolbarRef = useRef<HTMLDivElement>(null);
  const filesTabsRef = useRef<HTMLDivElement>(null);
  const filesUploadRef = useRef<HTMLButtonElement>(null);
  const collapsedSearchInputRef = useRef<HTMLInputElement>(null);
  const [taskMenu, setTaskMenu] = useState<{ id: number; anchor: HTMLButtonElement } | null>(null);
  // 「上传文件」下拉与「选择文件」弹窗
  const [uploadMenuAnchor, setUploadMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [selectFileTab, setSelectFileTab] = useState<CloudSourceTab | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: number; title: string } | null>(null);
  const [pendingTaskMoveId, setPendingTaskMoveId] = useState<number | null>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const menuTask = tasks.find(task => task.id === taskMenu?.id);
  const orderedTasks = [...tasks].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.createdAt ?? b.id) - (a.createdAt ?? a.id));

  useEffect(() => {
    if (!taskMenu) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !taskMenu.anchor.contains(event.target) && !taskMenuRef.current?.contains(event.target)) setTaskMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [taskMenu]);

  useEffect(() => {
    if (!uploadMenuAnchor) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !uploadMenuAnchor.contains(event.target) && !uploadMenuRef.current?.contains(event.target)) setUploadMenuAnchor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      uploadMenuAnchor.focus();
      setUploadMenuAnchor(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [uploadMenuAnchor]);

  // 测量工具栏可用宽度，判断搜索框是否需要收起：
  // 基准取「来源」页签（含上传按钮，最挤的情况），保证两个页签的搜索收起时机一致。
  useLayoutEffect(() => {
    const measure = () => {
      const toolbar = filesToolbarRef.current;
      if (!toolbar) return;
      const tabsWidth = filesTabsRef.current?.offsetWidth ?? 0;
      // 产物页签没有上传按钮时按来源的上传按钮宽度（实测值，兜底 141）计入
      const uploadWidth = filesUploadRef.current?.offsetWidth ?? 141;
      const needed = tabsWidth + 256 + 16 + 32 + 16 + uploadWidth + 32;
      setFilesSearchCollapsed(toolbar.clientWidth < needed);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (filesToolbarRef.current) observer.observe(filesToolbarRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tab]);

  // 切页签时收起已展开的搜索，回到图标态
  useEffect(() => {
    setFilesSearchOpen(false);
  }, [tab]);

  // 展开态下内容被清空且输入框已失焦 → 自动收起（与列表页搜索一致）；
  // 空间变宽、搜索框恢复常驻时同步复位展开态
  useEffect(() => {
    if (!filesSearchCollapsed) {
      setFilesSearchOpen(false);
      return;
    }
    if (!filesSearchOpen) return;
    if (!filesQuery && document.activeElement !== collapsedSearchInputRef.current) setFilesSearchOpen(false);
  }, [filesSearchCollapsed, filesSearchOpen, filesQuery]);

  // 变宽脱离紧凑布局后「配置」页签不再存在，自动回到「任务」
  useEffect(() => {
    if (!compact && tab === "配置") setTab("任务");
  }, [compact, tab]);

  return (
    <div className="flex min-h-0 flex-1 items-start gap-[16px] bg-white px-[16px]">
      <div className="flex h-full min-w-0 flex-1 flex-col items-center">
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          <div className="flex h-[48px] shrink-0 items-center gap-[12px]">
            <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
              <img src="/assets/e5ea3.svg" alt="" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-bold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">{project.name}</p>
              <p className="truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">{project.description || "暂无简介"}</p>
            </div>
          </div>
          {/* Figma 9234:27120 / 9393:81788：Tag-2 胶囊 Tab（65x36 选中 r8 文字 0.88 / 默认 r4 文字 0.6，
              hover 参照 Tag 变体 r8 #F2F2F2），右侧同行放 Search Input 256x32 + 筛选 32x32 +（来源）上传 141x32 */}
          <div ref={filesToolbarRef} className="mt-[16px] flex h-[36px] shrink-0 items-center justify-between gap-[16px]">
            <div ref={filesTabsRef} role="tablist" aria-label="项目内容" className="flex shrink-0 items-center gap-[16px]">
              {(compact ? (["任务", "来源", "产物", "配置"] as const) : (["任务", "来源", "产物"] as const)).map(item => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setTaskMenu(null); setUploadMenuAnchor(null); }} className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[8px] bg-transparent text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"}`}>{item}</button>
              ))}
            </div>
            {(tab === "来源" || tab === "产物") && (
              <div className={`flex min-w-0 items-center gap-[16px] ${filesSearchCollapsed && filesSearchOpen ? "flex-1" : "shrink-0"}`}>
                {filesSearchCollapsed && !filesSearchOpen ? (
                  // 收起态：32x32 搜索图标按钮，点击展开输入框（与列表页搜索交互一致）
                  <button type="button" aria-label="搜索文件名称" aria-expanded={false} onClick={() => setFilesSearchOpen(true)} className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2] active:bg-[#dcdcdc]">
                    <img src="/assets/project-search-btn.svg" alt="" className="size-[20px]" />
                  </button>
                ) : (
                  <label className={`flex h-[32px] min-w-0 items-center gap-[8px] rounded-[4px] bg-[#f7f7f7] pl-[8px] pr-[8px] ${filesSearchCollapsed ? "flex-1" : "w-[256px] shrink-0"} ${filesSearchFocused ? "" : "pr-[16px]"}`}>
                    <img
                      src={filesSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"}
                      alt=""
                      className="size-[16px] shrink-0"
                    />
                    <input
                      ref={filesSearchCollapsed ? collapsedSearchInputRef : undefined}
                      autoFocus={filesSearchCollapsed}
                      aria-label="搜索文件名称"
                      placeholder="搜索文件名称"
                      value={filesQuery}
                      onChange={event => setFilesQuery(event.target.value)}
                      onFocus={() => setFilesSearchFocused(true)}
                      onBlur={() => {
                        setFilesSearchFocused(false);
                        if (filesSearchCollapsed && !filesQuery) setFilesSearchOpen(false);
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                    />
                    {filesQuery && (
                      <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setFilesQuery("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                        <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                      </button>
                    )}
                  </label>
                )}
                <FileFilterButton
                  key={tab}
                  ariaLabel="筛选"
                  statuses={tab === "来源" ? sourceStatuses : undefined}
                  onStatusesChange={tab === "来源" ? setSourceStatuses : undefined}
                  selectedFormats={tab === "来源" ? sourceFormats : artifactFormats}
                  onFormatsChange={tab === "来源" ? setSourceFormats : setArtifactFormats}
                  timeFilter={tab === "来源" ? sourceTimeFilter : artifactTimeFilter}
                  onTimeFilterChange={tab === "来源" ? setSourceTimeFilter : setArtifactTimeFilter}
                  uploader={tab === "来源" ? sourceUploader : undefined}
                  onUploaderChange={tab === "来源" ? setSourceUploader : undefined}
                  uploaderOptions={sourceOwners}
                />
                {tab === "来源" && (
                  <button ref={filesUploadRef} type="button" aria-haspopup="menu" aria-expanded={Boolean(uploadMenuAnchor)} onClick={event => setUploadMenuAnchor(current => current ? null : event.currentTarget)} className="flex h-[32px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[4px] border border-[#1e63f5] px-[16px] text-[14px] font-normal leading-[22px] text-[#1e63f5] hover:bg-[#ebf4ff]">
                    <img src="/assets/project-add-blue.svg" alt="" className="size-[16px] shrink-0" />
                    上传文件
                    <img src="/assets/project-direction-down-blue.svg" alt="" className="size-[16px] shrink-0" />
                  </button>
                )}
              </div>
            )}
          </div>
          <input ref={uploadInputRef} aria-label="上传项目来源文件" type="file" multiple hidden onChange={event => {
            const { additions, errors } = pickSourceFiles(event.target.files ?? new FileList());
            errors.forEach(error => toast.error(error));
            if (additions.length) {
              const base = project.files ?? DEMO_PROJECT_FILES;
              onUpdateProject({ files: { ...base, sources: [...base.sources, ...additions] } });
            }
            event.target.value = "";
          }} />
          {/* Figma 9484:51165：240 宽下拉，右上角对按钮右下角，逐项 44 高 */}
          {uploadMenuAnchor && (
            <OperationMenu ref={uploadMenuRef} anchor={uploadMenuAnchor} gap={8} align="end" role="menu" aria-label="上传文件方式" className="w-[240px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
              <div className="flex flex-col py-[4px]">
                {UPLOAD_MENU_ITEMS.map(item => (
                  <button key={item.label} type="button" role="menuitem" onClick={() => {
                    setUploadMenuAnchor(null);
                    if (item.tab) setSelectFileTab(item.tab);
                    else uploadInputRef.current?.click();
                  }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f7f7f7]">
                    <img src={item.icon} alt="" className="size-[16px] shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            </OperationMenu>
          )}
          {selectFileTab && (
            <SelectFileDialog
              initialTab={selectFileTab}
              onClose={() => setSelectFileTab(null)}
              onConfirm={(files, source) => onStartImport(files, source, project.id)}
            />
          )}
          {/* Figma 9234:27120：Tag-2 底边 y=100（y64 + 高36），Item List 顶边 y=116 → 页签行与列表间距 16px。
              「任务」页签另有自己的 12px，「配置」页签内层已带 16px，都不能再叠这一层，否则间距翻倍。 */}
          <div role="tabpanel" aria-label={tab} className={`min-h-0 flex-1 ${tab === "任务" ? "-mx-[8px] overflow-y-auto pt-[12px]" : tab === "配置" ? "flex flex-col" : "flex flex-col pt-[16px]"}`}>
            {tab === "配置" ? (
              // Figma 8819:63414：窄屏把指令 / 成员收进「配置」页签，卡片满宽、圆角 12、边框 #E6E6E6
              <div className="min-h-0 flex-1 overflow-y-auto pt-[16px]">
                <div id="project-configuration" className="overflow-hidden rounded-[12px] border border-[#e6e6e6]">
                  <ProjectConfigurationSections project={project} onEditInstruction={() => setInstructionOpen(true)} onAddMember={() => setMembersOpen(true)} />
                </div>
              </div>
            ) : tab !== "任务" ? (
              <ProjectFilesPanel key={tab} kind={tab === "来源" ? "sources" : "artifacts"} files={project.files ?? DEMO_PROJECT_FILES} query={filesQuery} formats={tab === "来源" ? sourceFormats : artifactFormats} timeFilter={tab === "来源" ? sourceTimeFilter : artifactTimeFilter} statuses={tab === "来源" ? sourceStatuses : undefined} uploader={tab === "来源" ? sourceUploader : undefined} onChange={files => onUpdateProject({ files })} onUploadToProject={file => onStartImport([{ name: file.name, size: file.blob ? file.blob.size : file.size }], "产物", project.id)} />
            ) : orderedTasks.length > 0 ? (
              <div className="flex flex-col gap-[8px]">
                {orderedTasks.map(task => (
                  <div key={task.id} data-project-task={task.id} className={`group flex min-h-[40px] shrink-0 items-center gap-[12px] rounded-[8px] px-[8px] py-[8px] hover:bg-[#f2f2f2] focus-within:bg-[#f2f2f2] ${taskMenu?.id === task.id ? "bg-[#f2f2f2]" : ""}`}>
                    <button type="button" onClick={() => onSelectTask(task.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-[12px] bg-transparent p-0 text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                      <span className="truncate">{task.title}</span>
                      {task.pinned && <img src="/assets/896b2.svg" alt="已置顶" className="shrink-0" />}
                    </button>
                    <div className="relative flex h-[24px] min-w-[24px] shrink-0 items-center justify-end">
                      <time className={`text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.26)] group-hover:invisible group-focus-within:invisible max-sm:hidden ${taskMenu?.id === task.id ? "invisible" : ""}`}>
                        {task.createdAt ? new Date(task.createdAt).toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </time>
                      <button type="button" aria-label={`任务操作 ${task.title}`} aria-haspopup="menu" aria-expanded={taskMenu?.id === task.id} onClick={event => setTaskMenu(taskMenu?.id === task.id ? null : { id: task.id, anchor: event.currentTarget })} className={`absolute right-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6] group-hover:visible group-focus-within:visible [@media(hover:none)]:visible ${taskMenu?.id === task.id ? "visible" : "invisible"}`}>
                        <img src="/assets/bfc6f.svg" alt="" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center py-[24px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">
                <img src="/assets/b7105.png" alt="" className="size-[180px] object-cover" />
                <p className="font-medium">暂无项目任务</p>
                <p>快去输入问题发起新的咨询</p>
              </div>
            )}
          </div>
          {tab === "任务" && <div className="mx-auto w-full max-w-[800px] shrink-0 px-[16px] pt-[16px] max-sm:px-0">
            <ChatInput {...inputProps} placeholder={`在“${project.name}”中开始对话`} />
          </div>}
        </div>
        <div className="h-[20px] shrink-0 p-[4px] opacity-0">
          <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
        </div>
      </div>

      {/* 宽屏：右侧常驻配置边栏（< 800px 时改为「配置」页签，见上方 tabpanel） */}
      {configurationOpen && !compact && <div id="project-configuration" className="w-[320px] shrink-0 overflow-hidden rounded-[12px] border border-[#e6e6e6]">
        <ProjectConfigurationSections project={project} onEditInstruction={() => setInstructionOpen(true)} onAddMember={() => setMembersOpen(true)} />
      </div>}
        {menuTask && taskMenu && (
          <OperationMenu ref={taskMenuRef} anchor={taskMenu.anchor} gap={4} role="menu" aria-label="项目任务操作" onKeyDown={event => {
            if (event.key === "Escape") { taskMenu.anchor.focus(); setTaskMenu(null); }
          }} className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col py-[4px]">
            {[
              { label: menuTask.pinned ? "取消置顶" : "置顶此对话", icon: menuTask.pinned ? "67fe6" : "4363a", action: () => onUpdateTask(menuTask.id, { pinned: !menuTask.pinned }) },
              { label: "重命名", icon: "e2b81", action: () => setRenamingTask({ id: menuTask.id, title: menuTask.title }) },
            ].map(item => (
              <button key={item.label} type="button" role="menuitem" onClick={() => { item.action(); setTaskMenu(null); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] hover:bg-[#f7f7f7]">
                <img src={`/assets/${item.icon}.svg`} alt="" className="shrink-0" />{item.label}
              </button>
            ))}
            <TaskProjectMoveMenu
              key={menuTask.id}
              projects={projects}
              projectId={menuTask.projectId}
              onMove={projectId => {
                onUpdateTask(menuTask.id, { projectId });
                setTaskMenu(null);
              }}
              onCreate={() => {
                setPendingTaskMoveId(menuTask.id);
                setTaskMenu(null);
              }}
            />
            <button type="button" role="menuitem" onClick={() => { onDeleteTask(menuTask.id); setTaskMenu(null); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />删除
            </button>
            </div>
          </OperationMenu>
        )}
        <CreateProjectDialog
          open={pendingTaskMoveId !== null}
          onOpenChange={open => { if (!open) setPendingTaskMoveId(null); }}
          onCreate={newProject => {
            const projectId = onCreateProject(newProject);
            if (pendingTaskMoveId !== null) onUpdateTask(pendingTaskMoveId, { projectId });
            setPendingTaskMoveId(null);
          }}
        />
        <Dialog open={renamingTask !== null} onOpenChange={open => { if (!open) setRenamingTask(null); }}>
          <DialogContent aria-describedby={undefined} className="w-[400px] max-w-[calc(100vw-32px)] rounded-[16px] p-[24px]">
            <DialogTitle>重命名任务</DialogTitle>
            <form onSubmit={event => {
              event.preventDefault();
              if (!renamingTask?.title.trim()) return;
              onUpdateTask(renamingTask.id, { title: renamingTask.title.trim() });
              setRenamingTask(null);
            }} className="flex flex-col gap-[16px]">
              <label className="flex flex-col gap-[8px] text-[14px] font-normal">
                任务名称
                <input autoFocus value={renamingTask?.title ?? ""} onChange={event => setRenamingTask(current => current ? { ...current, title: event.target.value } : null)} className="h-[40px] rounded-[8px] border border-[#e6e6e6] px-[12px] outline-none focus:border-[#1e63f5]" />
              </label>
              <div className="flex justify-end gap-[8px]">
                <button type="button" onClick={() => setRenamingTask(null)} className="cursor-pointer rounded-[8px] border border-[#e6e6e6] px-[16px] py-[8px] text-[14px] font-normal">取消</button>
                <button type="submit" disabled={!renamingTask?.title.trim()} className="cursor-pointer rounded-[8px] bg-[#1e63f5] px-[16px] py-[8px] text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-40">确定</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {instructionOpen && <ProjectInstructionDialog instruction={project.instruction} onClose={() => setInstructionOpen(false)} onSave={instruction => { onUpdateProject({ instruction }); setInstructionOpen(false); }} />}
        {membersOpen && <ProjectMembersDialog members={project.members ?? []} onClose={() => setMembersOpen(false)} onSave={members => { onUpdateProject({ members }); setMembersOpen(false); }} />}
    </div>
  );
}

export { TaskProjectMoveMenu, CreateProjectDialog, TransferConfirmDialog, ProjectActionsMenu, ProjectHeaderActions, ProjectListView, ArchiveView, ProjectHomeView, showArchiveToast };
