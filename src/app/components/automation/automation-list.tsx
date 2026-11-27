import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ListPageHeader } from "../list-page-header";
import type { ChatAttachment } from "../attachment-tray";
import type { AutomationTab, AutomationTask, RunRecord, ScheduleState } from "./types";
import { AUTOMATION_TABS } from "./constants";
import { AutomationDetailPanel } from "./automation-detail-panel";
import { CreateAutomationDialog } from "./create-automation-dialog";
import { AutomationEmpty, AutomationTaskCard } from "./automation-task-card";
import { TagTabs } from "./automation-controls";
import { DeleteTaskDialog } from "./delete-task-dialog";

export function AutomationView({ tasks, onTasksChange, onLaunchChat, onRunTask, onLocateRun, navCollapsed = false, onSidebarToggle, onNewChat }: {
  // 任务数据由 App 持有：点「创建」会跳到会话页，本组件随即卸载，
  // 任务必须活在上一层，AI 创建完成后回到这里才看得到。
  tasks: AutomationTask[];
  onTasksChange: (updater: (current: AutomationTask[]) => AutomationTask[]) => void;
  onLaunchChat: (payload: { schedule: ScheduleState; prompt: string; attachments?: ChatAttachment[]; newSessionEachRun: boolean }) => void;
  // 运行记录图钉：跳到该次执行所在的会话消息（对话已删 → App 层 toast 提示）
  onLocateRun?: (task: AutomationTask, record: RunRecord) => void;
  // 「立即执行」的落点会话（创建会话 or 新开会话）只有 App 知道：会话列表、导航切换都活在那一层
  onRunTask: (task: AutomationTask) => void;
  // 本页桌面端没有全局顶栏（Figma 9937:57105），而收起导航后要用到的两个按钮
  // （「展开侧边栏」「新建对话」）原本只长在顶栏里，于是导航一收，两个入口一起消失。
  // 这里由 App 传入「导航已收起且顶栏确实不存在」的状态，在页面左上角补出与 ChatHeader
  // 收起态完全同款的一组按钮（同图标、同 24px 尺寸、同 hover、同 8px 间距、同 12px 顶偏移），
  // 与项目页 / 资料库页等其余 tab 的收起态交互保持一致。<800px 时顶栏仍在（自带这两个入口），故不重复渲染。
  navCollapsed?: boolean;
  onSidebarToggle?: () => void;
  onNewChat?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<AutomationTab>("已启用");
  const [createOpen, setCreateOpen] = useState(false);
  // 右侧详情栏（Figma 9787:71282）：点卡片展开，关闭或删除后自动收起
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTask = detailId ? tasks.find(item => item.id === detailId) ?? null : null;
  // 展开详情后列表列只剩一半宽：列宽不足 520 时表头改紧凑形态（图标搜索 + 图标新建），
  // 保证「标题 + 搜索 + 新建」永不溢出到右侧详情栏下面（溢出会被面板盖住 → 点不动）
  const mainRef = useRef<HTMLElement | null>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  // 列表列内边距与「项目/资料库」等列表页保持一致：列宽 <560（等于窗口 800px、去掉 240 导航）时用 16px，
  // 否则 24px。按列宽而非窗口宽判断，展开详情把列挤窄后同样会切到 16px。
  const [narrowPadding, setNarrowPadding] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // 用 border-box 宽（含 padding）判断，避免内边距切换自身影响阈值
      const width = el.getBoundingClientRect().width;
      setCompactHeader(width < 508);
      setNarrowPadding(width < 560);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 搜索 + Tab 过滤：命中则展示任务卡片列表，否则展示空态
  const visibleTasks = tasks.filter(task =>
    task.status === tab && task.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  // 删除自动化任务先弹风险确认（Figma 9877:63376），确认后才真正删除
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const deleteTask = deleteTaskId ? tasks.find(item => item.id === deleteTaskId) ?? null : null;
  const confirmDeleteTask = () => {
    if (deleteTaskId === null) return;
    const id = deleteTaskId;
    setDeleteTaskId(null);
    onTasksChange(current => current.filter(item => item.id !== id));
    if (detailId === id) setDetailId(null);
  };

  const handleOperate = (label: string, task: AutomationTask) => {
    if (label === "删除") {
      setDeleteTaskId(task.id);
      return;
    }
    if (label === "暂停") {
      onTasksChange(current => current.map(item => item.id === task.id ? { ...item, status: "已暂停" } : item));
      // 同一 id 覆盖前一条提示，避免连续切换时 toast 堆叠
      toast.success("任务已暂停", { id: "automation-task-status" });
      return;
    }
    if (label === "启用") {
      onTasksChange(current => current.map(item => item.id === task.id ? { ...item, status: "已启用" } : item));
      toast.success("任务已开启", { id: "automation-task-status" });
      return;
    }
    // 「立即执行」整体交给 App：除了插运行记录，还要把执行结果写进落点会话
    // （未勾选新会话 → 创建本任务的会话；勾选了 / 会话已被删 → 新开一个对话）
    if (label === "立即执行") {
      onRunTask(task);
      return;
    }
    // 「编辑」在右侧详情栏里改；「执行记录」直接切到详情栏的运行记录 Tab
    if (label === "编辑" || label === "执行记录") setDetailId(task.id);
  };

  // 点「创建」：不是直接往列表塞一条，而是发起一个新会话（任务），
  // 由 AI 承接并完成创建 —— 排期、「就」的内容与执行方式一起带进会话。
  const handleCreate = (schedule: ScheduleState, prompt: string, attachments: ChatAttachment[], newSessionEachRun: boolean) => {
    onLaunchChat({ schedule, prompt, attachments, newSessionEachRun });
  };

  return (
    <>
      <div className="relative flex min-h-0 flex-1">
        {/* 导航收起态：本页没有全局顶栏，顶栏收起态自带的两个入口只能由页面自己补。
            与 ChatHeader 收起态逐一对齐：同图标、同 24px 尺寸、同 p-[4px] 内边距、
            同 hover #f7f7f7、同 8px 间距、同 top-[12px]；左偏移跟随本列内边距（16 / 24）。
            放在滚动容器外层，滚列表时不会跟着滚走。 */}
        {navCollapsed && (
          <div className={`absolute top-[12px] z-30 flex items-center gap-[8px] ${narrowPadding ? "left-[16px]" : "left-[24px]"}`}>
            <button
              type="button"
              onClick={onSidebarToggle}
              aria-label="展开侧边栏"
              className="relative flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
            >
              <span aria-hidden className="relative size-[16px] shrink-0">
                <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/0c886.svg" />
              </span>
            </button>
            <button
              type="button"
              onClick={onNewChat}
              aria-label="新建对话"
              className="relative flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
            >
              <span aria-hidden className="relative size-[16px] shrink-0">
                <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/a4798.svg" />
              </span>
            </button>
          </div>
        )}
        {/* 详情并排时列表占剩余宽度。并排条件由 use-detail-panel-width 按「内容区实际宽度」判断：
            够 640（320 列表 + 320 详情）就并排，不够就让详情铺满内容区当整页详情（不浮起来）。
            窗口变窄时先由 App 收起左侧导航腾出 240，而不是把两栏都压到 320 以下。 */}
        <main ref={mainRef} className={`relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-white px-[16px] ${narrowPadding ? "" : "min-[800px]:px-[24px]"}`}>
          {/* 桌面（Figma 9937:57105）无全局顶栏：列表列自身留顶部间距；<800px 保留 ChatHeader，只留常规 16px，避免双倍空白 */}
          {/* 顶部 48px 取自 Figma 9872:63167「内容区」padding-top 48（列顶 → 标题行顶）。
              导航收起时按钮占 12~36px，仍在 48px 之上，不会压住标题。 */}
          <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col min-[800px]:pt-[48px]">
            <ListPageHeader
              title="自动化任务"
              query={query}
              onQueryChange={setQuery}
              searchPlaceholder="搜索自动化任务名称"
              searchAriaLabel="搜索自动化任务"
              compactSearch={compactHeader}
            >
              {/* 常规：Figma 9625:49728 Filled Primary Button / r4 / #1E63F5 / 左加号 +「新建」
                  （Right Icon=false：设计稿此处没有下拉箭头）；列变窄时收紧成 32x32 图标按钮 */}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className={`shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] hover:bg-[#1554d1] ${compactHeader ? "hidden" : "hidden min-[560px]:flex"}`}
              >
                <img src="/assets/automation-create-add.svg" alt="" className="size-[16px] shrink-0" />
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)]">新建</span>
              </button>
              {/* 列变窄 / <560px：收起为 32x32 图标按钮，与项目页「新建项目」收起态完全同款
                  （透明底 + 20px 蓝色 add-circle-fill 圆形图标，hover #EBF4FF / active #99C3FF），
                  不再是蓝底白加号的方块。 */}
              <button
                type="button"
                aria-label="新建"
                onClick={() => setCreateOpen(true)}
                className={`size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#ebf4ff] active:bg-[#99c3ff] ${compactHeader ? "flex" : "hidden max-[559px]:flex"}`}
              >
                <img src="/assets/project-add-circle.svg" alt="" className="size-[20px]" />
              </button>
            </ListPageHeader>

            <TagTabs items={AUTOMATION_TABS} active={tab} onChange={setTab} />

            {/* 内容区：有数据显示任务卡片列表（含 hover 操作项），无数据显示空态 */}
            {/* 卡片间距 4px：Figma 9872:63167 卡片一 y=148、高 64，卡片二 y=216 → 216-(148+64)=4 */}
            {visibleTasks.length > 0 ? (
              <div className="flex w-full flex-col gap-[4px] pb-[24px]">
                {visibleTasks.map(task => (
                  <AutomationTaskCard
                    key={task.id}
                    task={task}
                    onOperate={handleOperate}
                    onOpen={item => setDetailId(current => current === item.id ? null : item.id)}
                    active={detailId === task.id}
                  />
                ))}
              </div>
            ) : (
              <AutomationEmpty />
            )}
          </div>
        </main>

        {detailTask && (
          <AutomationDetailPanel
            task={detailTask}
            onClose={() => setDetailId(null)}
            onOperate={handleOperate}
            onLocateRun={record => onLocateRun?.(detailTask, record)}
            contentAware
            onChange={patch => onTasksChange(current => current.map(item => item.id === detailTask.id ? { ...item, ...patch } : item))}
          />
        )}
      </div>
      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <DeleteTaskDialog open={deleteTask !== null} taskTitle={deleteTask?.title ?? ""} onOpenChange={next => { if (!next) setDeleteTaskId(null); }} onConfirm={confirmDeleteTask} />
    </>
  );
}

