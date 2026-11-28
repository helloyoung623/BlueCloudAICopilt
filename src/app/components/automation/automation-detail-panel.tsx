import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AddContentMenu } from "../add-content-menu";
import { AttachmentPicker } from "../attachment-picker";
import type { AttachmentSource } from "../attachment-picker";
import { AttachmentTray } from "../attachment-tray";
import { OperationMenu } from "../operation-menu";
import { Popover, PopoverAnchor } from "../ui/popover";
import { useDraftAttachments } from "../use-draft-attachments";
import { useDetailPanelWidth } from "../use-detail-panel-width";
import type { AutomationTask, DetailDraft, DetailTab, RunRecord, ScheduleState } from "./types";
import { DETAIL_TABS, TASK_OPERATIONS } from "./constants";
import { cardSubtitle, describeSchedule } from "./utils";
import { useDismissOnOutside } from "./hooks";
import { AdvancedSettings, ScheduleEditor } from "./automation-controls";
import { RunRecordList } from "./automation-task-card";

export function AutomationDetailPanel({ task, onClose, onOperate, onChange, onLocateRun, contentAware = false }: {
  task: AutomationTask;
  onClose: () => void;
  onOperate: (label: string, task: AutomationTask) => void;
  onChange: (patch: Partial<AutomationTask>) => void;
  // 运行记录右侧图钉：定位到该次执行所在的对话消息（对话已被删则由 App 层 toast 提示）
  onLocateRun?: (record: RunRecord) => void;
  // 自动化任务页传 true：并排条件按内容区实际宽度（640）判断，
  // 窗口窄时先由 App 收起左侧导航，而不是把两栏压到 320 以下；会话页保持窗口断点。
  contentAware?: boolean;
}) {
  // 统一宽度规则：会话页 / 自动化任务页同一个默认宽度、同一套拖拽范围与铺满断点
  const panelRef = useRef<HTMLElement | null>(null);
  const { overlay, page, pageStyle, dragging, hovering, style: panelStyle, handleProps } = useDetailPanelWidth(panelRef, { contentAware });
  // 与侧栏同款：hover 热区或正在拖动时显示渐变指示线（Figma 10209:42379）

  const [tab, setTab] = useState<DetailTab>("详情");
  const [advOpen, setAdvOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(moreAnchor, setMoreAnchor);
  // 详情栏是「草稿态」编辑：所有改动先落在本地 draft 上，点底部「保存」才写回任务；
  // 不保存直接关掉面板 → 改动丢弃（提示语与设计稿「要有保存按钮」的语义一致）。
  const draftFrom = (item: AutomationTask): DetailDraft => ({
    title: item.title,
    prompt: item.prompt,
    schedule: item.schedule,
    attachments: item.attachments ?? [],
    newSessionEachRun: item.newSessionEachRun ?? false,
  });
  const saveSignature = (item: DetailDraft) => JSON.stringify({
    title: item.title,
    prompt: item.prompt,
    schedule: item.schedule,
    attachments: (item.attachments ?? []).map(attachment => attachment.id),
    newSessionEachRun: item.newSessionEachRun ?? false,
  });
  const [draft, setDraft] = useState<DetailDraft>(() => draftFrom(task));
  const [savedSignature, setSavedSignature] = useState(() => saveSignature(draftFrom(task)));
  // 切换任务时草稿与基线一起换成新任务的内容，免得上一个任务的改动把按钮点亮
  useEffect(() => {
    const next = draftFrom(task);
    setDraft(next);
    setSavedSignature(saveSignature(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);
  const patchDraft = (patch: Partial<DetailDraft>) => setDraft(current => ({ ...current, ...patch }));
  const signature = saveSignature(draft);
  const dirty = signature !== savedSignature;
  const handleSave = () => {
    // 一次性把整份草稿写回任务（App 层合并到任务列表，列表卡片标题等同步更新）
    onChange({
      title: draft.title,
      prompt: draft.prompt,
      schedule: draft.schedule,
      attachments: draft.attachments,
      newSessionEachRun: draft.newSessionEachRun,
    });
    setSavedSignature(signature);
    toast.success("保存成功", { id: "automation-task-save" });
    // 保存后收起详情栏（任务页收起右侧详情、会话页收起固定侧栏），
    // toast 是全局的，收起面板不影响提示
    onClose();
  };

  // 「就」里的 + 与输入框 / 新建弹窗同一套：菜单 → 文件选择或云盘面板 → 附件卡片，
  // 附件先挂在草稿上，保存后才落到任务（task.attachments）。
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource | null>(null);
  const { attachments, addFiles, removeAttachment, resetAttachments } = useDraftAttachments({
    initial: task.attachments,
    onChange: next => setDraft(current => ({ ...current, attachments: next })),
  });
  useEffect(() => {
    setAttachmentSource(null);
    resetAttachments(task.attachments ?? []);
  }, [task.id, resetAttachments]);

  const label = "font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]";

  // 会话页与自动化任务页共用一套尺寸规则（见 use-detail-panel-width）：
  // 默认 = 内容区 50%（夹 320~720），可拖左边缘手动改宽；
  // 内容区不足 640 时不再浮在内容上，而是铺满内容区当整页详情（Figma 10038:61162），
  // 顶部左箭头返回上一级。
  return (
    <aside
      ref={panelRef}
      aria-label="自动化任务详情"
      data-resizing={dragging ? "true" : undefined}
      style={page ? pageStyle : panelStyle}
      className={`flex shrink-0 flex-col gap-[12px] bg-white data-[resizing=true]:select-none ${page
        ? "z-40"
        : overlay
          ? "absolute inset-y-0 right-0 z-20 w-[320px] border-l border-[#f2f2f2] shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"
          : "relative border-l border-[#f2f2f2]"}`}
    >
      {/* 拖拽手柄：hover / 拖动时显示渐变指示线，贴左边缘；与侧栏右边缘那条完全同款
          （Figma 10209:42379。铺满/浮层态没有可拖空间，不渲染手柄） */}
      {!overlay && !page && (
        <div
          {...handleProps}
          className="absolute inset-y-0 left-[-3px] z-30 w-[6px] cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-[#1e63f5]"
        >
          {/* 手柄左边缘在面板外侧 3px，left-[3px] 才落在面板那条 1px 边框上：
              蓝线压住边框，避免「2px 蓝 + 1px 灰」并排看着像 3px（与侧栏同款处理） */}
          <span
            aria-hidden
            className="resize-indicator left-[3px]"
            style={{ opacity: dragging || hovering ? 1 : 0 }}
          />
        </div>
      )}
      {/* header：标题 + 暂停/运行中 + 更多 + 关闭（Figma 9897:2990）
          < 640 铺满态换成「左箭头返回 + 标题 + 暂停 + 更多」（Figma 10038:61163），
          返回箭头等价于关闭：回到任务列表 */}
      <header className="flex h-[48px] shrink-0 items-center gap-[10px] border-b border-[#f2f2f2] px-[16px] py-[8px]">
        {page && (
          <button
            type="button"
            aria-label="返回任务列表"
            title="返回"
            onClick={onClose}
            className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
          >
            <img src="/assets/automation-back-left.svg" alt="" className="size-[16px]" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          自动化任务
        </span>
        <button
          type="button"
          aria-label={task.status === "已暂停" ? "启用任务" : "暂停任务"}
          title={task.status === "已暂停" ? "启用" : "暂停"}
          onClick={() => onOperate(task.status === "已暂停" ? "启用" : "暂停", task)}
          className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
        >
          <img
            src={task.status === "已暂停" ? "/assets/automation-start.svg" : "/assets/automation-pause.svg"}
            alt=""
            className="size-[20px]"
          />
        </button>
        <button
          type="button"
          aria-label="更多操作"
          title="更多"
          onClick={event => setMoreAnchor(current => current ? null : event.currentTarget)}
          className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
        >
          <img src="/assets/automation-more.svg" alt="" className="size-[20px]" />
        </button>
        {!page && (
          <button
            type="button"
            aria-label="关闭详情"
            title="关闭"
            onClick={onClose}
            className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
          >
            {/* 关闭图标用 0.88 的深色版：与左侧「暂停 / 更多」两个 20px 0.88 图标同色，
                公共的 f802d.svg 是 0.6，只适合弹窗标题栏 */}
            <img src="/assets/automation-close.svg" alt="" className="size-[16px]" />
          </button>
        )}

        {moreAnchor && (
          <OperationMenu
            anchor={moreAnchor}
            gap={8}
            align="end"
            className="flex w-[192px] flex-col rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
          >
            <div className="flex flex-col gap-[2px] py-[4px]">
              {TASK_OPERATIONS.map(operation => (
                <button
                  key={operation.label}
                  type="button"
                  onClick={() => { setMoreAnchor(null); onOperate(operation.label, task); }}
                  className="flex h-[40px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]"
                >
                  <img src={`/assets/${operation.icon}`} alt="" className="size-[16px] shrink-0" />
                  <span className="whitespace-nowrap">{operation.label}</span>
                </button>
              ))}
            </div>
          </OperationMenu>
        )}
      </header>

      {/* 内容区（Figma 9908:45459）：左右 4px，Tab 与下方内容间距 12（= 侧栏 gap 12）；
          详情 Tab 内部的各区块之间仍保持 24，由内层容器控制。
          铺满态按 640 稿（Figma 10038:61168）把 Tab 与下方内容的间距放大到 24 */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-[4px] pb-[24px] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(0,0,0,0.2)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-[8px] ${page ? "gap-[24px]" : "gap-[12px]"}`}>
        {/* 详情 / 运行记录（Figma 9904:43410 Tag-2 Size=M） */}
        <div className="flex shrink-0 items-center gap-[16px] px-[12px]">
          {DETAIL_TABS.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={`flex h-[32px] shrink-0 cursor-pointer items-center gap-[10px] rounded-[4px] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] ${tab === item ? "bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "bg-transparent text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"}`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "运行记录" ? (
          task.records?.length ? (
            <RunRecordList records={task.records} onLocate={onLocateRun} />
          ) : (
            <div className="flex flex-1 flex-col items-center pt-[64px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.38)]">
              暂无运行记录
            </div>
          )
        ) : (
          <div className="flex flex-col gap-[24px]">
            {/* 自动化任务名称（Figma 9899:37780 FormCell）：32 高描边框 + 右下字数 2/30 */}
            <div className="flex flex-col gap-[8px]">
              <div className="flex items-center gap-[8px] pl-[12px]">
                <span className="font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                  自动化任务名称
                </span>
              </div>
              <div className="px-[12px]">
                <div className="flex h-[32px] items-center gap-[8px] rounded-[4px] border border-[#e6e6e6] px-[8px] focus-within:border-[#1e63f5]">
                  <input
                    value={draft.title}
                    maxLength={30}
                    onChange={event => patchDraft({ title: event.target.value })}
                    placeholder="名称"
                    aria-label="自动化任务名称"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.38)]"
                  />
                  <span className="shrink-0 font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    {draft.title.length}/30
                  </span>
                </div>
              </div>
            </div>

            {/* 当：条件 chip 组（窄栏里自然折行，与设计稿两行一致） */}
            <div className="flex flex-col gap-[12px] px-[12px]">
              <span className={label}>当</span>
              <div className="flex flex-wrap items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[12px] py-[8px]">
                <img src="/assets/automation-time-range.svg" alt="" className="size-[16px] shrink-0" />
                <ScheduleEditor
                  schedule={draft.schedule}
                  onChange={patch => patchDraft({ schedule: { ...draft.schedule, ...patch } })}
                />
              </div>
            </div>

            {/* 就：Chat Input（Figma 9897:37323） */}
            <div className="flex flex-col gap-[12px] px-[12px]">
              <span className={label}>就</span>
              <Popover open={attachmentSource !== null} onOpenChange={next => { if (!next) setAttachmentSource(null); }}>
                <PopoverAnchor asChild>
                  <div className="flex w-full flex-col overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
                    <div className="flex max-h-[132px] min-h-0 flex-col gap-[8px] overflow-y-auto px-[12px] pb-[12px] pt-[12px]">
                      <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
                      <textarea
                        rows={1}
                        value={draft.prompt}
                        onChange={event => patchDraft({ prompt: event.target.value })}
                        placeholder="希望我干什么？"
                        className="block min-h-[22px] w-full shrink-0 resize-none bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
                      />
                    </div>
                    <div className="flex items-center gap-[8px] p-[8px]">
                      <AddContentMenu
                        hasProject={false}
                        onAddFiles={addFiles}
                        onSelectSource={setAttachmentSource}
                        iconSrc="/assets/automation-add-dark.svg"
                        iconClassName="size-[16px]"
                        onOpenChange={next => { if (next) setAttachmentSource(null); }}
                      />
                    </div>
                  </div>
                </PopoverAnchor>
                {attachmentSource && (
                  <AttachmentPicker
                    source={attachmentSource}
                    hasProject={false}
                    onSourceChange={setAttachmentSource}
                    attachments={attachments}
                    onAddFiles={addFiles}
                    onRemove={removeAttachment}
                    onClose={() => setAttachmentSource(null)}
                  />
                )}
              </Popover>
            </div>

            {/* 高级设置（折叠）。与弹窗同一套几何：AdvancedSettings 内部各区块自带 px-[12px]，
                所以本容器不再加左右内边距，否则会与上面的「当/就」标签和标题文字错开；
                标题按钮用 ml-[8px] + px-[4px] 让文字落在 12px 处，与下方「结束时间/执行方式/时区」同一左线。 */}
            <div className="flex flex-col gap-[10px]">
              <button
                type="button"
                aria-expanded={advOpen}
                onClick={() => setAdvOpen(current => !current)}
                className="ml-[8px] flex w-fit cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
              >
                <span>高级设置</span>
                <img
                  src={advOpen ? "/assets/automation-up-small.svg" : "/assets/automation-down-small.svg"}
                  alt=""
                  className="size-[16px] shrink-0"
                />
              </button>
              {/* 执行方式回写任务：勾选状态存在 task.newSessionEachRun 上 */}
              {advOpen && (
                <AdvancedSettings
                  newSession={draft.newSessionEachRun ?? false}
                  onNewSessionChange={value => patchDraft({ newSessionEachRun: value })}
                  executionTime={draft.schedule.time}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮条（Figma 9925:54837）：内边距 16、右对齐、gap 24；
          保存按钮 32 高 r4，无改动时禁用 #99C3FF + 55% 白字，改过变 #1E63F5 可点；
          点保存才把草稿写回任务，成功后 toast「保存成功」 */}
      <div className="flex shrink-0 items-center justify-end gap-[24px] p-[16px]">
        <button
          type="button"
          disabled={!dirty}
          onClick={handleSave}
          className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] transition-colors hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99c3ff] disabled:text-[rgba(255,255,255,0.55)] disabled:hover:bg-[#99c3ff]"
        >
          保存
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// 自动化任务列表页（Figma 9665:49113）
// ============================================================================

