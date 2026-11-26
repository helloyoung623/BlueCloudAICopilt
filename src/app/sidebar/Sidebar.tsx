import { forwardRef, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../components/ui/dialog";
import { DotmCircular2 } from "../components/dotm-circular-2";
import { OperationMenu } from "../components/operation-menu";
import { SmallTip } from "../components/task-artifacts";
import { UserAvatar } from "../components/user-avatar";
import { useUserProfile } from "../user-profile";
import svgSidebar from "@/imports/历史对话操作项/svg-1dh84d0t2n";
import { CreateProjectDialog, ProjectActionsMenu, TaskProjectMoveMenu, showArchiveToast } from "../projects/ProjectViews";
import type { HistoryItem } from "../chat/types";
import type { ProjectItem } from "../projects/types";

const initialMemories = [
  {
    title: "关于你",
    editorInlineBoldId: "fge-143",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
  {
    title: "XXXX",
    editorInlineBoldId: "fge-153",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
  {
    title: "XXXX",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
];

function MemoryModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const [memories, setMemories] = useState(initialMemories);
  const [memoryInput, setMemoryInput] = useState("");
  const [pendingMemory, setPendingMemory] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "updating" | "success">("idle");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (updateStatus === "updating") {
      const timer = window.setTimeout(() => {
        setMemories(current => [...current, { title: "XXXX", content: pendingMemory }]);
        setPendingMemory("");
        setUpdateStatus("success");
      }, 3000);
      return () => window.clearTimeout(timer);
    }

    if (updateStatus === "success") {
      const timer = window.setTimeout(() => setUpdateStatus("idle"), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [pendingMemory, updateStatus]);

  const addMemory = (event: React.FormEvent) => {
    event.preventDefault();
    const value = memoryInput.trim();
    if (!value || updateStatus !== "idle") return;
    setPendingMemory(value);
    setMemoryInput("");
    setUpdateStatus("updating");
  };

  return (
    <div className="fixed inset-0 z-[300] overflow-hidden bg-[rgba(0,0,0,0.5)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        className="fixed bottom-0 flex h-[calc(100vh-72px)] max-h-[828px] w-[min(800px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-t-[16px] bg-white"
        style={{ left: "calc(50% + min(40px, 3vw))" }}
      >
        <header className="relative h-[76px] shrink-0">
          <h2
            id="memory-title"
            className="absolute left-[24px] top-[26px] font-['PingFang_SC:Medium'] text-[20px] font-semibold leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]"
          >
            记忆
          </h2>
          <button
            type="button"
            aria-label="关闭记忆管理"
            onClick={onClose}
            className="absolute right-[24px] top-[24px] flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
          >
            <img src="/assets/30367.svg" alt="" />
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-[12px] px-[24px]">
          <div className="min-w-0 flex-1">
            <p className="font-['PingFang_SC:Medium'] text-[16px] font-semibold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">允许记忆</p>
            <p className="mt-[4px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
              允许 AI从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。
            </p>
          </div>
          {enabled && (
            <>
              <button
                type="button"
                onClick={() => setMemories([])}
                className="shrink-0 cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[#fc5926]"
              >
                重置
              </button>
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[#1e63f5]"
              >
                导入
              </button>
            </>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="允许记忆"
            onClick={() => setEnabled(value => !value)}
            className="shrink-0 cursor-pointer rounded-full"
          >
            <img src={enabled ? "/assets/07533.svg" : "/assets/29026.svg"} alt="" />
          </button>
        </div>

        {enabled && (
          <>
            <div className="mt-[16px] min-h-0 flex-1 overflow-y-auto px-[24px] pb-[72px]">
              {memories.map((memory, index) => (
                <div key={`${memory.title}-${index}`} className="mb-[24px]">
                  <p className="font-['PingFang_SC:Medium'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                    {memory.editorInlineBoldId ? (
                      <span className="fg-inline-bold font-bold" data-fge-id={memory.editorInlineBoldId}>{memory.title}</span>
                    ) : memory.title}
                  </p>
                  <p className="mt-[12px] break-words font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                    {memory.content}
                  </p>
                </div>
              ))}
            </div>
            {updateStatus === "idle" && (
              <form onSubmit={addMemory} className="absolute bottom-0 left-0 flex w-full items-center bg-[rgba(255,255,255,0.01)] p-[16px]">
                <div className="flex h-[40px] flex-1 items-center overflow-hidden rounded-full border border-[#e6e6e6] bg-white pl-[15px] pr-[7px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
                  <input
                    value={memoryInput}
                    onChange={event => setMemoryInput(event.target.value)}
                    aria-label="添加或删除记忆"
                    placeholder="告诉我记住什么？忘记什么？"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <button
                    type="submit"
                    aria-label="提交记忆"
                    disabled={!memoryInput.trim()}
                    className={`flex size-[24px] shrink-0 items-center justify-center rounded-full ${
                      memoryInput.trim() ? "cursor-pointer bg-[#1e63f5]" : "cursor-default bg-[#f2f2f2]"
                    }`}
                  >
                    <img src={memoryInput.trim() ? "/assets/3b7df.svg" : "/assets/23b2e.svg"} alt="" />
                  </button>
                </div>
              </form>
            )}
            {updateStatus === "updating" && (
              <div
                role="status"
                className="absolute bottom-[32px] left-1/2 flex min-h-[44px] -translate-x-1/2 items-center gap-[8px] rounded-full bg-white py-[8px] pl-[8px] pr-[16px] shadow-[0_0_6px_rgba(0,0,0,0.08)]"
              >
                <img src="/assets/34657.svg" alt="" className="shrink-0 animate-spin" />
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                  正在更新记忆
                </span>
              </div>
            )}
          </>
        )}
      </section>
      {updateStatus === "success" && (
        <div
          role="status"
          className="fixed top-[24px] z-[310] flex min-h-[44px] -translate-x-1/2 items-center gap-[8px] rounded-full border border-[#38e38a] bg-white py-[8px] pl-[8px] pr-[16px] shadow-[0_0_6px_rgba(0,0,0,0.08)]"
          style={{ left: "calc(50% + min(40px, 3vw))" }}
        >
          <img src="/assets/00c34.svg" alt="" className="shrink-0" />
          <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            记忆更新成功
          </span>
        </div>
      )}
    </div>
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────────



const TaskOperationsMenu = forwardRef<HTMLDivElement, {
  anchor: HTMLElement | null;
  task: HistoryItem;
  projects: ProjectItem[];
  align?: "start" | "end";
  gap?: number;
  onTogglePin: () => void;
  onRename: (title: string) => void;
  onMove: (projectId: number | undefined) => void;
  onCreateProject: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}>(({ anchor, task, projects, align, gap, onTogglePin, onRename, onMove, onCreateProject, onArchive, onDelete, onClose }, ref) => {
  const itemClassName = "flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]";
  const labelClassName = "whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]";
  return (
    <OperationMenu
      anchor={anchor}
      ref={ref}
      align={align}
      gap={gap}
      role="menu"
      aria-label="任务操作"
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        onClose();
        anchor?.focus();
      }}
      className="w-[192px] overflow-visible rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex flex-col py-[4px]">
        <button type="button" role="menuitem" onClick={() => { onTogglePin(); onClose(); }} className={itemClassName}>
          <img src={task.pinned ? "/assets/67fe6.svg" : "/assets/4363a.svg"} alt="" className="shrink-0" />
          <span className={labelClassName}>{task.pinned ? "取消置顶" : "置顶此对话"}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const name = window.prompt("请输入新的任务名称", task.title)?.trim();
            if (name) onRename(name);
            onClose();
          }}
          className={itemClassName}
        >
          <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>重命名</span>
        </button>
        <TaskProjectMoveMenu
          key={task.id}
          projects={projects}
          projectId={task.projectId}
          onMove={projectId => { onMove(projectId); onClose(); }}
          onCreate={() => { onClose(); onCreateProject(); }}
        />
        <button type="button" role="menuitem" onClick={() => { onArchive(); onClose(); }} className={itemClassName}>
          <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>归档</span>
        </button>
        <button type="button" role="menuitem" onClick={() => { onDelete(); onClose(); }} className={itemClassName}>
          <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>删除</span>
        </button>
      </div>
    </OperationMenu>
  );
});
TaskOperationsMenu.displayName = "TaskOperationsMenu";


function LogoutDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex flex-col gap-[16px] px-[16px] pt-[24px]">
          <div className="flex items-center gap-[8px]">
            <img src="/assets/c6dca.svg" alt="" className="size-[24px] shrink-0" />
            <DialogTitle className="min-w-0 flex-1 truncate text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
              确认退出登录？
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭退出登录弹窗"
                className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
              >
                <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
              </button>
            </DialogClose>
          </div>
          <p className="pl-[32px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            退出登录不会丢失任何数据，你仍可以登录此账号。
          </p>
          <div className="flex items-center justify-end gap-[24px] pb-[16px] pt-[16px]">
            <DialogClose asChild>
              <button
                type="button"
                className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"
              >
                取消
              </button>
            </DialogClose>
            <DialogClose asChild>
              <button
                type="button"
                onClick={onConfirm}
                className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]"
              >
                确定
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 搜索弹窗 — Figma「AI Chat Component / - Search」(8844:40946)
 * 弹窗固定 560 高；搜索框激活仅放大镜 icon 变色；
 * 列表滚动到底部自动加载，每批 10 条，「没有更多了」仅在发生一次加载后出现
 * ------------------------------------------------------------------ */

function Sidebar({ history, setHistory, projects, setProjects, onClose, onNewChat, onOpenProjects, onOpenAutomation, onOpenArchive, onOpenLibrary, onOpenConnectors, onNewProjectTask, projectListOpen, automationOpen, libraryOpen, connectorOpen, activeId, activeProjectId, runningTaskIds, unreadTaskIds, onSelect, onSelectProject, onSearch, onRequestDeleteProject, onRequestDeleteTask, onRequestTransfer, mobile = false }: {
  onSearch: () => void;
  mobile?: boolean;
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  projects: ProjectItem[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  onRequestDeleteProject?: (id: number) => void;
  // 移交项目统一先弹确认（Figma 9244:31238），由 App 层持有弹窗
  onRequestTransfer: (projectId: number, member: string) => void;
  // 删除任务（会话）统一先弹确认（Figma 459:38570），由 App 层持有弹窗
  onRequestDeleteTask: (id: number) => void;
  onClose: () => void;
  onNewChat: () => void;
  onOpenProjects: () => void;
  onOpenAutomation: () => void;
  onOpenArchive: () => void;
  onOpenLibrary: () => void;
  onOpenConnectors: () => void;
  onNewProjectTask: (projectId: number) => void;
  projectListOpen: boolean;
  automationOpen: boolean;
  libraryOpen: boolean;
  // 连接器页不属于这些导航项：打开时所有导航都不选中
  connectorOpen: boolean;
  activeId: number | null;
  activeProjectId: number | null;
  // Figma 5053:14694 的任务状态图标：AI 执行中 / 已完成未查看
  runningTaskIds: Set<number>;
  unreadTaskIds: Set<number>;
  onSelect: (id: number) => void;
  onSelectProject: (id: number) => void;
}) {
  // 底部用户信息：现在来自本地随机档案，接入真实登录后自动换成账号里的名字
  const profile = useUserProfile();
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [hoverProjectId, setHoverProjectId] = useState<number | null>(null);
  const [projectMenuId, setProjectMenuId] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // 侧栏项目菜单「编辑项目信息」：与项目卡片/项目详情共用 CreateProjectDialog 编辑态
  const [sidebarEditProjectId, setSidebarEditProjectId] = useState<number | null>(null);
  const [profileHovered, setProfileHovered] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // 退出登录先弹确认，确定后才跳回登录页
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(() => new Set());
  // 项目下任务 >= 10 时默认只显示前 5 条，点「更多」后该项目显示完整任务列表
  const [expandedTaskProjectIds, setExpandedTaskProjectIds] = useState<Set<number>>(() => new Set());
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [pendingTaskMoveId, setPendingTaskMoveId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 12px 白色安全区：只要侧栏不是停在顶部（已经有内容滚到「新任务」下方）就常驻，
  // 不做「停止滚动后消失」的计时，回到顶部才收起，避免内容被切成半行贴在按钮下面。
  const [sidebarScrolled, setSidebarScrolled] = useState(false);
  const handleSidebarScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollTop > 1;
    setSidebarScrolled(current => (current === next ? current : next));
  };
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const memoryRowRef = useRef<HTMLButtonElement>(null);
  const memoryPanelRef = useRef<HTMLDivElement>(null);
  const memoryPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standaloneHistory = history.filter(item => item.projectId === undefined && !item.archived);
  // 归档项目从侧栏「项目」分组移除（归档页仍可查看/取消归档），与项目列表页口径一致
  const visibleSidebarProjects = projects.filter(project => !project.archived);
  // 「折叠所有项目」只在有项目处于展开态时出现；全部收起或「项目」分组自身收起时隐藏
  const hasExpandedProjects = projectsExpanded && visibleSidebarProjects.some(project => expandedProjectIds.has(project.id));
  const openMemoryPanel = () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
    setMemoryPanelOpen(true);
  };
  const deferCloseMemoryPanel = () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
    memoryPanelTimer.current = setTimeout(() => setMemoryPanelOpen(false), 140);
  };

  useEffect(() => () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) setMemoryPanelOpen(false);
  }, [profileMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
        setProjectMenuId(null);
      }
      if (
        profileMenuOpen &&
        !profileMenuRef.current?.contains(e.target as Node) &&
        !memoryPanelRef.current?.contains(e.target as Node) &&
        !profileTriggerRef.current?.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (activeId === null) return;
    const activeTask = history.find(item => item.id === activeId);
    if (activeTask?.projectId === undefined) return;
    setExpandedProjectIds(current => {
      if (current.has(activeTask.projectId!)) return current;
      return new Set(current).add(activeTask.projectId!);
    });
    // 只在切换任务时自动展开所属项目；history 变化（执行中不断写入）不再强制展开，
    // 否则运行中手动折叠的项目会被立刻撑开，项目行的 loading / 未读就没机会显示
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const menuTask = menuId === null ? null : history.find(item => item.id === menuId) ?? null;
  const menuProject = projectMenuId === null ? null : projects.find(item => item.id === projectMenuId) ?? null;
  // 状态图标常驻 24px 位置；hover / 菜单展开时「...」直接盖在同一位置上，行内布局不移动（Figma 5053:14694）
  const renderStatusIcon = (isRunning: boolean, isUnread: boolean) => {
    if (isRunning) {
      return (
        <span aria-label="AI 执行中" className="flex size-[24px] items-center justify-center">
          {/* dotSize 2.4：与对话内 RadarArcLoader 同尺寸（16px 框内实际点径 2.42px），
              此时 gap 正好是整数 1px（2.4×5 + 1×4 = 16），两点阵的疏密才对得上 */}
          <DotmCircular2 className="text-[rgba(0,0,0,0.88)]" size={16} dotSize={2.4} speed={1.8} opacityBase={0.12} opacityMid={0.42} opacityPeak={1} />
        </span>
      );
    }
    if (isUnread) {
      return <img src="/assets/task-unread.svg" alt="未查看" aria-label="未查看" className="size-[24px]" />;
    }
    return null;
  };
  const renderTaskStatus = (taskId: number) =>
    renderStatusIcon(runningTaskIds.has(taskId), unreadTaskIds.has(taskId));
  const renderTaskTrailing = (taskId: number, pinned: boolean, isHover: boolean, hasMenu: boolean) => (
    <span className="relative flex size-[24px] shrink-0 items-center justify-center bg-[inherit]">
      {renderTaskStatus(taskId) ?? (pinned ? (
        <svg width="12" height="13" viewBox="0 0 12 12.6667" fill="none">
          <path d={svgSidebar.p3170f400} fill="black" fillOpacity="0.26" />
          <path d="M0 0H12V1.33333H0V0Z" fill="black" fillOpacity="0.26" />
        </svg>
      ) : null)}
      {(isHover || hasMenu) && (
        <span className="absolute inset-0 flex items-center justify-center bg-[inherit]">
          <button
            type="button"
            aria-label="任务更多操作"
            onClick={event => {
              event.stopPropagation();
              if (hasMenu) {
                setMenuId(null);
                return;
              }
              setMenuAnchor(event.currentTarget);
              setProjectMenuId(null);
              setMenuId(taskId);
              setHoverId(taskId);
            }}
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
          >
            <svg width="3" height="12" viewBox="0 0 2.66667 12" fill="none">
              <path d={svgSidebar.p19c91c80} fill="black" fillOpacity="0.38" />
            </svg>
          </button>
        </span>
      )}
    </span>
  );
  const closeContextMenu = () => {
    setMenuId(null);
    setProjectMenuId(null);
  };

  return (
    <div className={`relative w-[240px] shrink-0 self-stretch border-r border-[#f2f2f2] bg-white p-0 flex flex-col items-center${mobile ? " h-full min-h-0" : ""}`}>
      {/* head —— 只有 logo / 搜索 / 新任务固定；新任务以下全部进入下方滚动区 */}
      <div className="relative h-[124px] w-full shrink-0 bg-white">
        <div className="absolute left-[calc(50%-15.8px)] top-[52px] h-[16px] w-[160.403px] -translate-x-1/2">
          <img alt="世纪互联办公智能体" className="absolute inset-0 block size-full max-w-none" src="/assets/9d907.svg" />
        </div>
        {/* sidebar toggle (close) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="收起侧边栏"
          className="absolute left-[20px] top-[12px] flex size-[24px] cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
        >
          <span className="relative h-full min-w-px flex-1">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src={mobile ? "/assets/a8ef3.svg" : "/assets/0c886.svg"} />
          </span>
        </button>
        {/* search button */}
        <button
          type="button"
          aria-label="搜索"
          onClick={onSearch}
          className="absolute left-[52px] top-[12px] flex size-[24px] cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
        >
          <span className="relative h-full min-w-px flex-1">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/ed737.svg" />
          </span>
        </button>
        {/* 新任务 */}
        <button
          type="button"
          onClick={onNewChat}
          className={`absolute left-[12px] top-[84px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
            !projectListOpen && !automationOpen && !libraryOpen && !connectorOpen && activeId === null && activeProjectId === null ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
          }`}
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/a4798.svg" />
          </span>
          <span
            className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${
              !projectListOpen && !automationOpen && !libraryOpen && !connectorOpen && activeId === null && activeProjectId === null
                ? "font-medium"
                : "font-normal"
            }`}
          >
            新任务
          </span>
        </button>
      </div>

      {/* 滚动后常驻的 12px 白色安全区：盖住「新任务」按钮下方被切半行的内容；只做遮罩、不参与布局 */}
      {sidebarScrolled && (
        <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-[124px] z-[15] h-[12px] bg-white" />
      )}

      {/* 滚动区域：新任务以下所有内容（导航 / 项目 / 任务）整体滚动；容器铺满 240px，滚动条贴侧栏最右侧 */}
      <div ref={scrollRef} onScroll={handleSidebarScroll} className="sidebar-scroll flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-[12px]">
        {/* 导航项相对滚动区顶部 0/40/80/120，与原 head 内 y=124/164/204/244 对齐 */}
        <div className="relative h-[172px] w-full shrink-0">
          {/* 项目 */}
          <button
            type="button"
            onClick={onOpenProjects}
            className={`absolute left-0 top-0 flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
              projectListOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
            }`}
          >
            <span className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/6bcaa.svg" />
            </span>
            <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${projectListOpen ? "font-medium" : "font-normal"}`}>
              项目
            </span>
          </button>
          {/* 自动化任务 —— Figma 9625:49728：选中态 #F7F7F7/r8，图标「时间范围-线」9625:49605 */}
          <button
            type="button"
            onClick={onOpenAutomation}
            className={`absolute left-0 top-[40px] flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
              automationOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
            }`}
          >
            <span className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/automation-nav-clock.svg" />
            </span>
            <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${automationOpen ? "font-medium" : "font-normal"}`}>
              自动化任务
            </span>
          </button>
          {/* 资料库 */}
          <button
            type="button"
            onClick={onOpenLibrary}
            className={`absolute left-0 top-[80px] flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${libraryOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"}`}
          >
            <span className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/f7258.svg" />
            </span>
            <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${libraryOpen ? "font-medium" : "font-normal"}`}>
              资料库
            </span>
          </button>
          {/* 会议助手 */}
          <button
            type="button"
            className="absolute left-0 top-[120px] flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors hover:bg-[#f2f2f2]"
          >
            <span className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/bacdf.svg" />
            </span>
            <span className="min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
              会议助手
            </span>
          </button>
        </div>

      {/* projects */}
      {visibleSidebarProjects.length > 0 && (
      <div className="shrink-0 w-full pb-[16px] flex flex-col items-start">
        {/* 分组标题吸顶：滚到「新任务」下方时固定，项目列表从标题底下滚过 */}
        <div className="group sticky top-0 z-20 m-0 flex w-full items-center bg-white p-0">
          <button
            type="button"
            aria-expanded={projectsExpanded}
            onClick={() => setProjectsExpanded(expanded => !expanded)}
            className="flex w-full cursor-pointer items-center gap-[4px] rounded-[4px] px-[12px] py-[var(--spacing)] pr-[36px] text-left hover:bg-[#f7f7f7]"
          >
            <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">项目</span>
            <svg
              aria-hidden
              className={`size-[16px] shrink-0 text-[rgba(0,0,0,0.38)] transition-opacity ${projectsExpanded ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d={projectsExpanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"} stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {(!projectsExpanded || visibleSidebarProjects.length > 0) && (
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="absolute left-[188px] top-[3px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[var(--Background-Gray-Hover,#E6E6E6)]"
            >
              <img src="/assets/project-add.svg" alt="" className="shrink-0" />
            </button>
          )}
          {/* Figma 101:1826：有项目展开时，x=156 处出现「折叠所有项目」入口；全部收起后自行消失 */}
          {hasExpandedProjects && (
            <SmallTip label="折叠所有项目" side="top">
              <button
                type="button"
                aria-label="折叠所有项目"
                onClick={() => setExpandedProjectIds(new Set())}
                className="absolute left-[156px] top-[3px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[var(--Background-Gray-Hover,#E6E6E6)]"
              >
                <img src="/assets/sidebar-collapse.svg" alt="" className="shrink-0" />
              </button>
            </SmallTip>
          )}
        </div>
        {projectsExpanded && visibleSidebarProjects.length === 0 && (
          <div className="flex w-full flex-col items-start p-[8px]">
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="flex cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/4fe43.svg" alt="" className="shrink-0" />
              <span className="whitespace-nowrap text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">新建项目</span>
            </button>
          </div>
        )}
        {projectsExpanded && visibleSidebarProjects.length > 0 && (
          <div className="flex w-full flex-col items-start">
            {visibleSidebarProjects.map(project => {
              const projectTasks = history.filter(item => item.projectId === project.id && !item.archived);
              // 10 条及以上先露 5 条；「更多 / 收起」只在展开的项目下出现
              const tasksCollapsed = projectTasks.length >= 10 && !expandedTaskProjectIds.has(project.id);
              const visibleProjectTasks = tasksCollapsed ? projectTasks.slice(0, 5) : projectTasks;
              const isActiveProjectContext = activeProjectId === project.id;
              const isActiveProjectHome = isActiveProjectContext && activeId === null;
              const isProjectExpanded = expandedProjectIds.has(project.id);
              const isProjectHover = hoverProjectId === project.id;
              const hasProjectMenu = projectMenuId === project.id;
              // 项目折叠时，子任务的 loading / 未读状态上浮到项目行；展开后状态回到各自任务行
              const projectHasRunningTask = projectTasks.some(task => runningTaskIds.has(task.id));
              const projectHasUnreadTask = projectTasks.some(task => unreadTaskIds.has(task.id));
              const showProjectStatus =
                !isProjectExpanded && !isProjectHover && !hasProjectMenu && (projectHasRunningTask || projectHasUnreadTask);
              return (
                <div key={project.id} className="w-full">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isProjectExpanded}
                    onMouseEnter={() => setHoverProjectId(project.id)}
                    onMouseLeave={() => { if (!hasProjectMenu) setHoverProjectId(null); }}
                    onClick={() => {
                      if (projectTasks.length === 0) {
                        onSelectProject(project.id);
                        return;
                      }
                      setExpandedProjectIds(current => {
                        const next = new Set(current);
                        if (next.has(project.id)) next.delete(project.id);
                        else next.add(project.id);
                        return next;
                      });
                    }}
                    onKeyDown={event => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (projectTasks.length === 0) onSelectProject(project.id);
                      else {
                        setExpandedProjectIds(current => {
                          const next = new Set(current);
                          if (next.has(project.id)) next.delete(project.id);
                          else next.add(project.id);
                          return next;
                        });
                      }
                    }}
                    className={`flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-hidden rounded-[8px] py-[8px] pl-[12px] pr-[4px] text-left transition-colors ${isActiveProjectHome ? "bg-[#f7f7f7]" : isProjectHover ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <img src={isProjectExpanded ? "/assets/bf868.svg" : "/assets/6bcaa.svg"} alt="" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                      {project.name}
                    </span>
                    {showProjectStatus && (
                      <span className="flex size-[24px] shrink-0 items-center justify-center bg-[inherit]">
                        {renderStatusIcon(projectHasRunningTask, projectHasUnreadTask)}
                      </span>
                    )}
                    {project.pinned && !showProjectStatus && !isProjectHover && !hasProjectMenu && (
                      <div className="flex size-[24px] shrink-0 items-center justify-center">
                        <svg width="12" height="13" viewBox="0 0 12 12.6667" fill="none">
                          <path d={svgSidebar.p3170f400} fill="black" fillOpacity="0.26" />
                          <path d="M0 0H12V1.33333H0V0Z" fill="black" fillOpacity="0.26" />
                        </svg>
                      </div>
                    )}
                    {(isProjectHover || hasProjectMenu) && (
                      <>
                        <button
                          type="button"
                          aria-label="项目更多操作"
                          onClick={event => {
                            event.stopPropagation();
                            if (hasProjectMenu) {
                              setProjectMenuId(null);
                              return;
                            }
                            setMenuAnchor(event.currentTarget);
                            setMenuId(null);
                            setProjectMenuId(project.id);
                            setHoverProjectId(project.id);
                          }}
                          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
                        >
                          <svg width="3" height="12" viewBox="0 0 2.66667 12" fill="none">
                            <path d={svgSidebar.p19c91c80} fill="black" fillOpacity="0.38" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`在${project.name}中新建任务`}
                          onClick={event => {
                            event.stopPropagation();
                            setProjectMenuId(null);
                            onNewProjectTask(project.id);
                          }}
                          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
                        >
                          <img src="/assets/49891.svg" alt="" />
                        </button>
                      </>
                    )}
                  </div>
                  {isProjectExpanded && visibleProjectTasks.map(task => {
                    const isTaskActive = activeId === task.id;
                    const isTaskHover = hoverId === task.id;
                    const hasTaskMenu = menuId === task.id;
                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => setHoverId(task.id)}
                        onMouseLeave={() => { if (!hasTaskMenu) setHoverId(null); }}
                        onClick={() => { onSelect(task.id); setMenuId(null); }}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelect(task.id);
                            setMenuId(null);
                          }
                        }}
                        className={`flex h-[40px] w-full cursor-pointer items-center gap-[4px] overflow-hidden rounded-[8px] py-[8px] pl-[36px] pr-[4px] text-left transition-colors ${isTaskActive ? "bg-[#f7f7f7]" : isTaskHover ? "bg-[#f2f2f2]" : ""}`}
                      >
                        <span className={`min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${isTaskActive ? "font-medium" : "font-normal"}`}>
                          {task.title}
                        </span>
                        {renderTaskTrailing(task.id, Boolean(task.pinned), isTaskHover, hasTaskMenu)}
                      </div>
                    );
                  })}
                  {isProjectExpanded && projectTasks.length >= 10 && (
                    <div className="flex w-full flex-col items-start px-[32px] pb-[8px] pt-[10px]">
                      <button
                        type="button"
                        aria-label={tasksCollapsed ? `展开${project.name}的全部任务` : `收起${project.name}的任务`}
                        onClick={() => setExpandedTaskProjectIds(current => {
                          const next = new Set(current);
                          if (next.has(project.id)) next.delete(project.id);
                          else next.add(project.id);
                          return next;
                        })}
                        className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)] hover:bg-[var(--Background-Gray-Hover,#E6E6E6)]"
                      >
                        {tasksCollapsed ? "更多" : "收起"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* tasks */}
      {standaloneHistory.length > 0 && (
      <div className="flex w-full flex-col items-start">
        {/* 分组标题吸顶：升到顶部时把「项目」标题顶走，任务列表从其下方滚过 */}
        <div className="group sticky top-0 z-20 flex w-full shrink-0 items-center bg-white p-0">
          <button
            type="button"
            aria-expanded={tasksExpanded}
            onClick={() => setTasksExpanded(expanded => !expanded)}
            className="flex w-full cursor-pointer items-center gap-[4px] rounded-[4px] px-[12px] py-[var(--spacing)] text-left hover:bg-[#f7f7f7]"
          >
            <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">任务</span>
            <svg
              aria-hidden
              className={`size-[16px] shrink-0 text-[rgba(0,0,0,0.38)] transition-opacity ${tasksExpanded ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d={tasksExpanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"} stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {tasksExpanded && <div className="flex w-full flex-col">
          {standaloneHistory.length === 0 ? (
            <p className="p-[12px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)]">暂无任务</p>
          ) : standaloneHistory.map(item => {
              const isActive = activeId === item.id;
              const isHover = hoverId === item.id;
              const hasMenu = menuId === item.id;
              return (
                <div key={item.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => setHoverId(item.id)}
                    onMouseLeave={() => { if (menuId !== item.id) setHoverId(null); }}
                    onClick={() => { onSelect(item.id); setMenuId(null); }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { onSelect(item.id); setMenuId(null); } }}
                    className={`w-full h-[40px] rounded-[8px] flex items-center pl-[12px] pr-[4px] py-[8px] text-left transition-colors cursor-pointer
                      ${isActive ? "bg-[#f7f7f7]" : isHover ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <p className={`flex-1 min-w-0 text-[14px] leading-[22px] tracking-[0.014px] truncate ${isActive ? "font-medium" : ""} text-[rgba(0,0,0,0.88)]`}>{item.title}</p>
                    {renderTaskTrailing(item.id, Boolean(item.pinned), isHover, hasMenu)}
                  </div>
                </div>
              );
            })}
        </div>}
      </div>
      )}
      </div>

      {/* context menu — fixed to escape overflow clip */}
      {/* 侧栏项目菜单与项目页卡片菜单共用 ProjectActionsMenu，操作项保持一致（编辑项目信息/移交项目/归档/删除） */}
      {menuProject && menuAnchor && (
        <ProjectActionsMenu
          project={menuProject}
          anchor={menuAnchor}
          innerRef={menuRef}
          onClose={closeContextMenu}
          onEdit={() => { setSidebarEditProjectId(menuProject.id); closeContextMenu(); }}
          onTransfer={member => onRequestTransfer(menuProject.id, member)}
          onArchive={() => {
            const projectId = menuProject.id;
            setProjects(items => items.map(item => item.id === projectId ? { ...item, archived: true } : item));
            setHistory(items => items.map(item => item.projectId === projectId ? { ...item, archived: true } : item));
            showArchiveToast(() => {
              setProjects(items => items.map(item => item.id === projectId ? { ...item, archived: false } : item));
              setHistory(items => items.map(item => item.projectId === projectId ? { ...item, archived: false } : item));
            });
            onOpenProjects();
          }}
          onDelete={() => {
            // 统一走确认弹窗：由 App 层弹「确定要删除此项目吗？」再执行删除
            if (onRequestDeleteProject) {
              onRequestDeleteProject(menuProject.id);
              return;
            }
            setProjects(items => items.filter(item => item.id !== menuProject.id));
            setHistory(items => items.filter(item => item.projectId !== menuProject.id));
          }}
        />
      )}

      {/* 侧栏「编辑项目信息」弹窗：编辑态预填当前项目，保存后 toast 反馈 */}
      <CreateProjectDialog
        open={sidebarEditProjectId !== null}
        onOpenChange={open => { if (!open) setSidebarEditProjectId(null); }}
        onCreate={() => {}}
        editProject={sidebarEditProjectId === null ? null : projects.find(item => item.id === sidebarEditProjectId) ?? null}
        onEdit={updates => {
          setProjects(items => items.map(item => item.id === sidebarEditProjectId ? { ...item, name: updates.name, description: updates.description } : item));
          toast.success("项目信息已更新");
        }}
      />

      {menuTask && (
        <TaskOperationsMenu
          ref={menuRef}
          anchor={menuAnchor}
          task={menuTask}
          projects={projects}
          onTogglePin={() => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, pinned: !item.pinned } : item))}
          onRename={title => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, title } : item))}
          onMove={projectId => {
            setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, projectId } : item));
            if (projectId !== undefined) setExpandedProjectIds(current => new Set(current).add(projectId));
          }}
          onCreateProject={() => {
            setPendingTaskMoveId(menuTask.id);
            setCreateProjectOpen(true);
          }}
          onArchive={() => {
            setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, archived: true } : item));
            showArchiveToast(() => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, archived: false } : item)));
          }}
          onDelete={() => onRequestDeleteTask(menuTask.id)}
          onClose={closeContextMenu}
        />
      )}

      {profileMenuOpen && (
        <OperationMenu anchor={profileTriggerRef.current}
          ref={profileMenuRef}
          role="menu"
          aria-label="用户菜单"
          className="w-[192px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => setProfileMenuOpen(false)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/d0cd0.svg" alt="" className="size-[16px] shrink-0" />
              <span className="flex min-w-0 flex-1 items-center gap-[4px]">
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">剩余用量</span>
                <span className="font-['TCloudNumber:Regular'] font-normal text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">90%</span>
              </span>
              <img src="/assets/c29c9.svg" alt="" className="size-[16px] shrink-0" />
            </button>
            <button
              ref={memoryRowRef}
              type="button"
              role="menuitem"
              aria-haspopup="dialog"
              aria-expanded={memoryPanelOpen}
              onMouseEnter={openMemoryPanel}
              onMouseLeave={deferCloseMemoryPanel}
              onFocus={openMemoryPanel}
              onClick={openMemoryPanel}
              className={`flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] ${memoryPanelOpen ? "bg-[#f2f2f2]" : "hover:bg-[#f2f2f2]"}`}
            >
              <img src="/assets/7ba18.svg" alt="" className="size-[16px] shrink-0" />
              <span className="min-w-0 flex-1 whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">记忆</span>
              <span className="flex shrink-0 items-center gap-[4px]">
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">{memoryEnabled ? "已开启" : "已关闭"}</span>
                <img src="/assets/c29c9.svg" alt="" className="size-[16px] shrink-0" />
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setProfileMenuOpen(false); onOpenArchive(); }}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden>
                {/* 图形本体的可视范围是 13.333×12（x 0~13.333，y 2~14），
                    平移必须让它落在 1.333~14.667 / 2~14 —— 与其它 16×16 图标同外框居中，
                    否则会整体偏下 2px、贴到框底，看起来就是歪的。 */}
                <path d="M13.333 13.333V4.667L12 2H1.333L0 4.669V13.333C0 13.702.298 14 .667 14H12.667C13.035 14 13.333 13.702 13.333 13.333ZM1.333 6H12V12.667H1.333V6ZM2.157 3.333H11.176L11.843 4.667H1.491L2.157 3.333ZM8.667 7.333H4.667V8.667H8.667V7.333Z" transform="translate(1.333 0)" fill="black" fillOpacity="0.26" />
              </svg>
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">归档数据</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setProfileMenuOpen(false); onOpenConnectors(); }}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/connector-plug.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">连接器</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setProfileMenuOpen(false)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/89936.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">问题反馈</span>
            </button>
            <div className="mx-[8px] h-px bg-[#f2f2f2]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setProfileMenuOpen(false); setLogoutConfirmOpen(true); }}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/9a53a.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">退出登录</span>
            </button>
          </div>
        </OperationMenu>
      )}
      {profileMenuOpen && memoryPanelOpen && (
        <OperationMenu
          ref={memoryPanelRef}
          submenu
          anchor={memoryRowRef.current}
          role="dialog"
          aria-label="记忆"
          onMouseEnter={openMemoryPanel}
          onMouseLeave={deferCloseMemoryPanel}
          className="w-[192px] rounded-[12px] bg-white p-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex h-[24px] items-center justify-between">
            <img src="/assets/7ba18.svg" alt="" className="size-[24px] shrink-0" />
            <button
              type="button"
              role="switch"
              aria-checked={memoryEnabled}
              aria-label="允许记忆"
              onClick={() => setMemoryEnabled(value => !value)}
              className="flex h-[20px] w-[40px] shrink-0 cursor-pointer items-center"
            >
              <img src={memoryEnabled ? "/assets/07533.svg" : "/assets/29026.svg"} alt="" className="h-[20px] w-[40px]" />
            </button>
          </div>
          <div className="mt-[12px] w-[160px]">
            <p className="font-['PingFang_SC:Medium'] text-[16px] font-semibold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">允许记忆</p>
            <p className="mt-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
              允许 AI从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。
            </p>
          </div>
        </OperationMenu>
      )}

      {/* bottom — user info */}
      <div className="shrink-0 flex w-full items-center px-[12px] py-[8px] bg-white">
        <button
          ref={profileTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
          onMouseEnter={() => setProfileHovered(true)}
          onMouseLeave={() => setProfileHovered(false)}
          onClick={() => {
            setMenuId(null);
            setProjectMenuId(null);
            setProfileMenuOpen(open => !open);
          }}
          className="flex h-[32px] flex-1 min-w-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[12px] py-[4px] text-left"
        >
          <UserAvatar name={profile.displayName} seed={profile.avatarSeed} size={24} className="shrink-0" />
          <span className="min-w-0 w-fit grow-0 basis-auto truncate whitespace-nowrap text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{profile.displayName}</span>
          {(profileHovered || profileMenuOpen) && (
            <img src="/assets/05ead.svg" alt="" className="shrink-0" />
          )}
        </button>
      </div>
      <LogoutDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          try {
            window.sessionStorage.removeItem("wb:login-success");
          } catch {
            // 无痕模式忽略
          }
          window.location.href = "/login.html";
        }}
      />
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={open => {
          setCreateProjectOpen(open);
          if (!open) setPendingTaskMoveId(null);
        }}
        onCreate={project => {
          const id = Date.now();
          setProjects(current => [...current, { ...project, id }]);
          setProjectsExpanded(true);
          if (pendingTaskMoveId !== null) {
            setHistory(items => items.map(item => item.id === pendingTaskMoveId ? { ...item, projectId: id } : item));
            setExpandedProjectIds(current => new Set(current).add(id));
            setPendingTaskMoveId(null);
          } else {
            onSelectProject(id);
          }
        }}
      />
      {memoryOpen && <MemoryModal onClose={() => setMemoryOpen(false)} />}
    </div>
  );
}

// ── chat input ────────────────────────────────────────────────────────────────


export { Sidebar, TaskOperationsMenu };
