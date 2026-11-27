import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { HistoryItem } from "../chat/types";
import {
  ArchiveView,
  ProjectHeaderActions,
  ProjectHomeView,
  ProjectListView,
  showArchiveToast,
} from "./ProjectViews";
import type { ProjectItem } from "./types";

// 项目页在 App 里只剩「页面切换 + 少量回调胶水」。这里按页面职责收拢这些胶水，
// 不改任何文案、状态写入路径或页面顺序。
type Setter<T> = Dispatch<SetStateAction<T>>;

export function ProjectArchivePage({
  projects,
  tasks,
  setProjects,
  setHistory,
  onSelectTask,
  onRequestDeleteProject,
  onRequestDeleteTask,
  onRequestTransfer,
}: {
  projects: ProjectItem[];
  tasks: HistoryItem[];
  setProjects: Setter<ProjectItem[]>;
  setHistory: Setter<HistoryItem[]>;
  onSelectTask: (id: number) => void;
  onRequestDeleteProject: (id: number) => void;
  onRequestDeleteTask: (id: number) => void;
  onRequestTransfer: (projectId: number, member: string) => void;
}) {
  return (
    <ArchiveView
      projects={projects}
      tasks={tasks}
      onUnarchiveProject={id => {
        setProjects(current => current.map(project => project.id === id ? { ...project, archived: false } : project));
        setHistory(current => current.map(task => task.projectId === id ? { ...task, archived: false } : task));
        toast.success("项目已取消归档");
      }}
      onEditProject={(id, updates) => {
        setProjects(current => current.map(project => project.id === id ? { ...project, name: updates.name, description: updates.description } : project));
        toast.success("项目信息已更新");
      }}
      onTransferProject={onRequestTransfer}
      onDeleteProject={onRequestDeleteProject}
      onSelectTask={onSelectTask}
      onUnarchiveTask={id => {
        setHistory(current => current.map(task => task.id === id ? { ...task, archived: false } : task));
        toast.success("任务已取消归档");
      }}
      onDeleteTask={onRequestDeleteTask}
    />
  );
}

export function ProjectListPage({
  projects,
  setProjects,
  setHistory,
  onSelectProject,
  onRequestDeleteProject,
  onRequestTransfer,
}: {
  projects: ProjectItem[];
  setProjects: Setter<ProjectItem[]>;
  setHistory: Setter<HistoryItem[]>;
  onSelectProject: (id: number) => void;
  onRequestDeleteProject: (id: number) => void;
  onRequestTransfer: (projectId: number, member: string) => void;
}) {
  return (
    <ProjectListView
      projects={projects}
      onSelectProject={onSelectProject}
      onCreateProject={project => {
        const id = Date.now();
        setProjects(current => [...current, { ...project, id }]);
        onSelectProject(id);
      }}
      onEditProject={(id, updates) => {
        setProjects(current => current.map(project => project.id === id ? { ...project, name: updates.name, description: updates.description } : project));
      }}
      onArchiveProject={id => {
        setProjects(current => current.map(project => project.id === id ? { ...project, archived: true } : project));
        setHistory(current => current.map(item => item.projectId === id ? { ...item, archived: true } : item));
        showArchiveToast(() => {
          setProjects(current => current.map(project => project.id === id ? { ...project, archived: false } : project));
          setHistory(current => current.map(item => item.projectId === id ? { ...item, archived: false } : item));
        });
      }}
      onDeleteProject={onRequestDeleteProject}
      onTransferProject={onRequestTransfer}
    />
  );
}

export function ProjectHomePage({
  project,
  projects,
  tasks,
  configurationOpen,
  compact,
  setProjects,
  setHistory,
  onSelectTask,
  onRequestDeleteTask,
  onSelectProject,
  onStartImport,
  inputProps,
}: {
  project: ProjectItem;
  projects: ProjectItem[];
  tasks: HistoryItem[];
  configurationOpen: boolean;
  compact: boolean;
  setProjects: Setter<ProjectItem[]>;
  setHistory: Setter<HistoryItem[]>;
  onSelectTask: (id: number) => void;
  onRequestDeleteTask: (id: number) => void;
  onSelectProject: (id: number) => void;
  onStartImport: ComponentProps<typeof ProjectHomeView>["onStartImport"];
  inputProps: ComponentProps<typeof ProjectHomeView>["inputProps"];
}) {
  return (
    <ProjectHomeView
      key={project.id}
      project={project}
      onStartImport={onStartImport}
      configurationOpen={configurationOpen}
      compact={compact}
      projects={projects}
      onCreateProject={creation => {
        const id = Date.now();
        setProjects(current => [...current, { ...creation, id }]);
        return id;
      }}
      tasks={tasks}
      onSelectTask={onSelectTask}
      onUpdateTask={(id, updates) => setHistory(current => current.map(task => task.id === id ? { ...task, ...updates } : task))}
      onDeleteTask={onRequestDeleteTask}
      onUpdateProject={updates => setProjects(current => current.map(item => item.id === project.id ? { ...item, ...updates } : item))}
      inputProps={inputProps}
    />
  );
}

// 项目详情页顶栏的操作区（编辑 / 移交 / 归档 / 删除 / 右侧配置开关）也从 App 挪到这里。
export function ProjectHeaderActionsHost({
  project,
  setProjects,
  setHistory,
  panelOpen,
  showPanelToggle,
  onTogglePanel,
  onOpenProjects,
  onRequestDeleteProject,
  onRequestTransfer,
}: {
  project: ProjectItem;
  setProjects: Setter<ProjectItem[]>;
  setHistory: Setter<HistoryItem[]>;
  panelOpen: boolean;
  showPanelToggle: boolean;
  onTogglePanel: () => void;
  onOpenProjects: () => void;
  onRequestDeleteProject: (id: number) => void;
  onRequestTransfer: (projectId: number, member: string) => void;
}) {
  return (
    <ProjectHeaderActions
      key={project.id}
      project={project}
      panelOpen={panelOpen}
      showPanelToggle={showPanelToggle}
      onTogglePanel={onTogglePanel}
      onEdit={updates => setProjects(current => current.map(item => item.id === project.id ? { ...item, name: updates.name, description: updates.description } : item))}
      onTransfer={owner => onRequestTransfer(project.id, owner)}
      onArchive={() => {
        const projectId = project.id;
        setProjects(current => current.map(item => item.id === projectId ? { ...item, archived: true } : item));
        setHistory(current => current.map(task => task.projectId === projectId ? { ...task, archived: true } : task));
        showArchiveToast(() => {
          setProjects(current => current.map(item => item.id === projectId ? { ...item, archived: false } : item));
          setHistory(current => current.map(task => task.projectId === projectId ? { ...task, archived: false } : task));
        });
        onOpenProjects();
      }}
      onDelete={() => onRequestDeleteProject(project.id)}
    />
  );
}
