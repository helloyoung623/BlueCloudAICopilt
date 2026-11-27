import { useState } from "react";
import { OperationMenu } from "../operation-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { KubaiIcon, kubaiNameFromUrl } from "../kubai-icon";
import type { AutomationTask, RunRecord } from "./types";
import { RUN_DOT_COLOR, RUN_LABEL_COLOR, TASK_OPERATIONS } from "./constants";
import { automationIconSrc, cardSubtitle } from "./utils";
import { useDismissOnOutside } from "./hooks";

// 任务卡片（Figma 9625:49728 #9706:63239 / #9706:63243）
// h≈48，圆角 8px，32px 文档图标 + 标题 Medium/T2 + 副标题 Regular/T2(0.6)。
// hover：行背景 #F2F2F2，右侧浮现两个 32×32 图标按钮（暂停 / 更多）。
// 点「更多」：弹出 192px DropdownMenu（编辑 / 立即执行 / 执行记录 / 删除）。
// 点卡片本身：展开右侧自动化详情栏（Figma 9787:71282）。
// ============================================================================
function AutomationTaskCard({ task, onOperate, onOpen, active }: {
  task: AutomationTask;
  onOperate: (label: string, task: AutomationTask) => void;
  onOpen: (task: AutomationTask) => void;
  active: boolean;
}) {
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(moreAnchor, setMoreAnchor);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={() => onOpen(task)}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(task);
      }}
      className="group flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] p-[8px] text-left transition-colors hover:bg-[#f2f2f2] data-[menu-open=true]:bg-[#f2f2f2] data-[active=true]:bg-[#f2f2f2]"
      data-menu-open={moreAnchor ? "true" : undefined}
      data-active={active ? "true" : undefined}
      data-kubai-trigger="true"
    >
      {/* 图标按任务语义匹配（icons.kubai.design 分词检索），不再固定用文档图标；
          hover 整行时播放图标自带动效（信封翻盖、信纸升起这类），静态版垫底兜底 */}
      <KubaiIcon
        name={kubaiNameFromUrl(task.iconUrl)}
        src={task.iconUrl}
        fallbackSrc={automationIconSrc(task.icon)}
        size={32}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <span className="truncate font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          {task.title}
        </span>
        <span className="truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
          {/* Figma 9872:63193 / 9872:63219：副标题是「时间 · 任务内容」，已暂停时前缀换成「已暂停 ·」；
              时间从 schedule 实时算，详情栏改完周期这里立刻跟着变 */}
          {cardSubtitle(task.schedule, task.prompt, task.status, task.title)}
        </span>
      </div>

      {/* 右侧操作项：默认隐藏，hover 行或菜单展开时显现 */}
      <div className="flex shrink-0 items-center gap-[8px] opacity-0 transition-opacity group-hover:opacity-100 group-data-[menu-open=true]:opacity-100">
        {/* Figma 9872:63221：已暂停时按钮变为 iconbase/start（启动），点击恢复启用 */}
        <button
          type="button"
          aria-label={task.status === "已暂停" ? `启用 ${task.title}` : `暂停 ${task.title}`}
          title={task.status === "已暂停" ? "启用" : "暂停"}
          onClick={event => {
            event.stopPropagation();
            onOperate(task.status === "已暂停" ? "启用" : "暂停", task);
          }}
          className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6]"
        >
          <img
            src={task.status === "已暂停" ? "/assets/automation-start.svg" : "/assets/automation-pause.svg"}
            alt=""
            className="size-[20px]"
          />
        </button>
        <button
          type="button"
          aria-label={`更多操作 ${task.title}`}
          title="更多"
          onClick={event => {
            event.stopPropagation();
            setMoreAnchor(current => current ? null : event.currentTarget);
          }}
          className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6]"
        >
          <img src="/assets/automation-more.svg" alt="" className="size-[20px]" />
        </button>
      </div>

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
                onClick={event => {
                  event.stopPropagation();
                  setMoreAnchor(null);
                  onOperate(operation.label, task);
                }}
                className="flex h-[40px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]"
              >
                <img src={`/assets/${operation.icon}`} alt="" className="size-[16px] shrink-0" />
                <span className="whitespace-nowrap">{operation.label}</span>
              </button>
            ))}
          </div>
        </OperationMenu>
      )}
    </div>
  );
}

// 空态（Figma 9872:62843 #9872:63160）
// 直接用设计稿 empty 组件的完整导出图（640×640）：插图为设计稿的灰白态
// （非蓝色原图），且「暂无自动化任务」文字已按 gap -80px 叠在插图下部留白区，
// 整图渲染保证颜色/位置与设计稿零误差。显示为 320×320。
function AutomationEmpty() {
  return (
    <div className="flex w-full flex-col items-center justify-center pt-[40px]">
      <img src="/assets/automation-empty-design.png" alt="暂无自动化任务" className="size-[320px] max-w-full" />
    </div>
  );
}

// ============================================================================
// 运行记录列表（Figma 9908:45451 右侧侧边栏「运行记录」Tab）
// 每行：8px 时间轴列（圆点 + 连到下一颗圆点的 1px 竖线，竖线只在相邻两行之间画）+ 内容卡
// 内容卡 4px 8px / r4，hover 变 #F2F2F2 / r8 并在耗时行右侧露出图钉（设计稿里图钉默认 opacity 0）
// ============================================================================
function RunRecordList({ records, onLocate }: { records: RunRecord[]; onLocate?: (record: RunRecord) => void }) {
  return (
    <div className="flex flex-col gap-[16px] px-[12px]">
      {records.map((record, index) => (
        <div key={record.id} className="relative flex gap-[4px]">
          {/* 时间轴：圆点距行顶 10px（与首行文字基线对齐），8px 圆点中心落在容器左 16px 处 */}
          <span aria-hidden className="relative flex w-[8px] shrink-0 justify-center pt-[10px]">
            <span className="size-[8px] shrink-0 rounded-full" style={{ backgroundColor: RUN_DOT_COLOR[record.status] }} />
            {/* 竖线：从本行圆点下沿一直到下一条圆点上沿（跨过 16px 行间距） */}
            {index < records.length - 1 && (
              <span className="absolute left-[3.5px] top-[18px] bottom-[-26px] w-px bg-[#e6e6e6]" />
            )}
          </span>
          <div className="group flex min-w-0 flex-1 flex-col gap-[4px] rounded-[4px] px-[8px] py-[4px] hover:rounded-[8px] hover:bg-[#f2f2f2]">
            <span className="font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
              {record.time} · <span style={{ color: RUN_LABEL_COLOR[record.status] }}>{record.status}</span>
            </span>
            {/* 正文最多显示 5 行，超出省略 */}
            <span className="line-clamp-5 font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
              {record.text}
            </span>
            {record.duration && (
              <div className="flex items-center gap-[4px]">
                <span className="min-w-0 flex-1 truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                  耗时：{record.duration}
                </span>
                {/* 图钉：hover 显形 + 浅灰底；tips「定位到消息位置」 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="定位到消息位置"
                      onClick={event => { event.stopPropagation(); onLocate?.(record); }}
                      className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[rgba(0,0,0,0.08)]"
                    >
                      <img src="/assets/automation-record-pin.svg" alt="" className="size-[16px]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={4}
                    className="rounded-[4px] bg-[rgba(0,0,0,0.75)] px-[8px] py-[3px] font-['PingFang_SC:Regular'] text-[12px] font-normal leading-[20px] text-white"
                  >
                    定位到消息位置
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 右侧自动化详情栏（Figma 9787:71282）
// 宽 320，左侧 1px #F2F2F2 描边；header 48px（标题 + 暂停 + 更多 + 关闭）。
// 内容：详情/运行记录 Tabs → 自动化任务名称 → 当（条件 chip 组）→ 就（Chat Input）→ 高级设置
// ============================================================================

export { AutomationTaskCard, AutomationEmpty, RunRecordList };
