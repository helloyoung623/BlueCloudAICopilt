import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SheetTrigger } from "../components/ui/sheet";
import { TaskArtifactsButton } from "../components/task-artifacts";
import type { LocatedTaskArtifact } from "../components/task-artifacts";
import { TaskOperationsMenu } from "../sidebar/Sidebar";
import { CreateProjectDialog, showArchiveToast } from "../projects/ProjectViews";
import type { HistoryItem } from "../chat/types";
import type { ProjectItem } from "../projects/types";

function ChatHeader({ title, projectBreadcrumb, projectOverview, actions, sidebarOpen, onSidebarToggle, onNewChat, mobile = false }: {
  mobile?: boolean;
  title?: string;
  projectBreadcrumb?: { projectName: string; taskName: string; onSelectProject: () => void };
  projectOverview?: { name: string; onOpenProjects: () => void };
  actions?: React.ReactNode;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  onNewChat?: () => void;
}) {
  return (
    <div className="relative z-30 flex h-[48px] min-h-[48px] w-full shrink-0 items-center gap-[8px] bg-transparent px-[16px] py-0">
      {mobile ? (
        <>
          <SheetTrigger asChild>
            <button type="button" aria-label="展开导航" className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] p-[4px] hover:bg-[#f7f7f7]">
              <img alt="" src="/assets/81b0c.svg" />
            </button>
          </SheetTrigger>
          <button type="button" onClick={onNewChat} aria-label="新建对话" className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] p-[4px] hover:bg-[#f7f7f7]">
            <img alt="" src="/assets/200cc.svg" />
          </button>
        </>
      ) : !sidebarOpen && (
        <>
          <button className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]" onClick={onSidebarToggle} aria-label="展开侧边栏">
            <span aria-hidden className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/0c886.svg" />
            </span>
          </button>
          <button className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]" onClick={onNewChat} aria-label="新建对话">
            <span aria-hidden className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/a4798.svg" />
            </span>
          </button>
        </>
      )}
      {projectOverview ? (
        <div className={`absolute top-1/2 right-[88px] flex -translate-y-1/2 items-center gap-[8px] overflow-hidden ${sidebarOpen ? "left-[16px]" : "left-[96px]"}`}>
          <button type="button" onClick={projectOverview.onOpenProjects} className="shrink-0 cursor-pointer bg-transparent p-0 text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]">项目</button>
          <span className="text-[12px] text-[rgba(0,0,0,0.26)]">/</span>
          <span className="truncate text-[14px] font-normal leading-[22px]">{projectOverview.name}</span>
        </div>
      ) : projectBreadcrumb ? (
        <div className={`absolute top-1/2 right-[88px] flex -translate-y-1/2 items-center gap-[8px] overflow-hidden ${sidebarOpen ? "left-[16px]" : "left-[96px]"}`}>
          <button type="button" onClick={projectBreadcrumb.onSelectProject} className="max-w-[240px] min-w-0 shrink cursor-pointer truncate rounded-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)] focus-visible:outline-2 focus-visible:outline-[#1e63f5]">
            {projectBreadcrumb.projectName}
          </button>
          <span className="shrink-0 font-['PingFang_SC:Regular'] text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.26)]">/</span>
          <span className="max-w-[320px] min-w-0 shrink truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            {projectBreadcrumb.taskName}
          </span>
        </div>
      ) : title ? (
        <p className="pointer-events-none absolute left-0 right-0 truncate px-[80px] text-center text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">{title}</p>
      ) : null}
      <div className="flex-1" />
      {actions}
    </div>
  );
}

function TaskHeaderActions({ task, projects, artifacts, setHistory, setProjects, onLocateArtifact, onRequestDeleteTask }: {
  task: HistoryItem;
  projects: ProjectItem[];
  artifacts: LocatedTaskArtifact[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  onLocateArtifact: (artifact: LocatedTaskArtifact) => void;
  // 删除任务先弹确认（Figma 459:38570），由 App 层执行真正的删除
  onRequestDeleteTask: (id: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-operation-menu]")) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const updateTask = (updates: Partial<HistoryItem>) => setHistory(items => items.map(item => item.id === task.id ? { ...item, ...updates } : item));

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-[8px]">
      <TaskArtifactsButton
        artifacts={artifacts}
        onLocate={onLocateArtifact}
        onDownload={artifact => toast.success(`本地示例：开始下载${artifact.name}`)}
      />
      <button
        ref={triggerRef}
        type="button"
        aria-label="任务操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
        className={`flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7] ${menuOpen ? "bg-[#f7f7f7]" : ""}`}
      >
        <span aria-hidden className="relative size-[16px] shrink-0">
          <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/bbe3b.svg" />
        </span>
      </button>
      {menuOpen && (
        <TaskOperationsMenu
          ref={menuRef}
          anchor={triggerRef.current}
          align="end"
          gap={4}
          task={task}
          projects={projects}
          onTogglePin={() => updateTask({ pinned: !task.pinned })}
          onRename={title => updateTask({ title })}
          onMove={projectId => updateTask({ projectId })}
          onCreateProject={() => setCreateProjectOpen(true)}
          onArchive={() => {
            updateTask({ archived: true });
            showArchiveToast(() => updateTask({ archived: false }));
          }}
          onDelete={() => onRequestDeleteTask(task.id)}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreate={project => {
          const id = Date.now();
          setProjects(current => [...current, { ...project, id }]);
          updateTask({ projectId: id });
        }}
      />
    </div>
  );
}

// ── views ─────────────────────────────────────────────────────────────────────


export { ChatHeader, TaskHeaderActions };
