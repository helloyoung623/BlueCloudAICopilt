import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { OperationMenu } from "./operation-menu";
import { ListPageHeader } from "./list-page-header";

// ============================================================================
// 自动化任务页（Figma 9665:49113 列表页；9782/9783/9785 新建自动化任务弹窗各周期态）
// 列表页严格按设计稿：标题 + 搜索 + 新建按钮 + 已启用/已暂停/已结束 Tabs + 内容留白。
// 新建弹窗由「新建」按钮触发（720px Modal）：当/就结构，周期可切换并联动条件 chip。
// ============================================================================

const AUTOMATION_TABS = ["已启用", "已暂停", "已结束"] as const;
type AutomationTab = (typeof AUTOMATION_TABS)[number];

// 自动化任务数据（Figma 9625:49728 列表项 / 9872:63167 已暂停态）
type AutomationTask = {
  id: string;
  title: string;
  cycle: string;
  description: string;
  status: AutomationTab;
};
const INITIAL_TASKS: AutomationTask[] = [
  { id: "daily-report", title: "工作日报推送", cycle: "每天", description: "每个工作日晚自动生成并推送日报", status: "已启用" },
  { id: "brand-monitor", title: "品牌舆情监控", cycle: "每天", description: "每天理清品牌舆情并预警", status: "已启用" },
];

// 「更多」下拉菜单项（Figma 9625:49728 DropdownMenu #9709:63275）
const TASK_OPERATIONS = [
  { label: "编辑", icon: "automation-menu-edit.svg" },
  { label: "立即执行", icon: "automation-menu-refresh.svg" },
  { label: "执行记录", icon: "automation-menu-time.svg" },
  { label: "删除", icon: "automation-menu-delete.svg" },
] as const;

const CYCLES = ["每天", "每周", "每月", "每年", "仅一次"] as const;
type Cycle = (typeof CYCLES)[number];

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
const HOURS = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"] as const;
const DAYS = Array.from({ length: 31 }, (_, index) => `${index + 1}号`);

// Tag-2 组件 Size=L（与项目页/自动化页共用同一套 Figma 组件 9625:52202）
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

// Radix Dialog 打开时会用 react-remove-scroll 锁定页面滚动：它在 document 冒泡阶段
// 监听 wheel/touchmove，对不在「锁内」的 portal 面板会 preventDefault，导致下拉列表
// 即使设了 overflow-y:auto 也滚不动。这里在滚动容器自身上用「非 passive 的原生捕获监听」
// 完全接管 wheel：手动滚动 scrollTop + 截断传播，不依赖浏览器默认滚动，确保一定能滚。
function useUnlockScrollInDialog() {
  // 用 callback ref：下拉面板是条件渲染，元素出现时才绑定监听（useEffect([]) 时元素尚不存在）
  return useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    // 捕获阶段在事件到达 target 之前就接管，绝不会冒泡到 document 上的滚动锁监听器。
    const onWheel = (event: WheelEvent) => {
      // preventDefault 取消浏览器默认滚动（避免与手动滚动叠加成双倍速度），
      // stopPropagation 阻止事件冒泡到 document 上的 react-remove-scroll 滚动锁。
      event.preventDefault();
      event.stopPropagation();
      // deltaMode: 0=像素, 1=行, 2=页
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += event.deltaY * step;
    };
    // passive:false 必须： otherwise preventDefault 会被忽略
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
  }, []);
}

// 下拉面板展开后，点击面板与触发按钮以外的任何地方都自动收起。
// 用 capture 阶段监听 document 的 pointerdown，避开 OperationMenu 内部的 stopPropagation；
// 通过 data-operation-menu 属性识别面板内部点击（交给面板自身处理，不在这里收起）。
function useDismissOnOutside(anchor: HTMLElement | null, setAnchor: (value: null) => void) {
  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchor.contains(target)) return; // 点击触发按钮：交给按钮的 toggle 逻辑
      if (target instanceof Element && target.closest("[data-operation-menu]")) return; // 点击面板内部
      setAnchor(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, setAnchor]);
}

// 通用下拉 chip：点击弹出 OperationMenu，选中项带蓝色对勾
function SelectChip({ options, value, onChange, width = 120, forceBelow = false, maxHeight }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
  forceBelow?: boolean;
  maxHeight?: number;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[#f7f7f7] px-[8px] py-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{value}</span>
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        forceBelow={forceBelow}
        className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        style={{ width }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        {/* 长列表（如每月 31 天）在内层容器滚动：确定性的 max-height + overflow-y，
            与 OperationMenu 根节点解耦，避免 ResizeObserver 反馈循环导致滚动失效 */}
        <div
          ref={unlockScroll}
          className={`flex flex-col gap-[2px] py-[4px] ${maxHeight != null ? "-mr-[8px] pr-[8px]" : ""}`}
          style={maxHeight != null ? { maxHeight, overflowY: "auto" } : undefined}
        >
          {options.map(option => (
            <Fragment key={option}>
              {/* Figma 9773:69719：「每年」与「仅一次」之间有一条 #F2F2F2、左右缩进 8px 的分隔线 */}
              {option === "仅一次" && <div className="mx-[8px] my-[4px] h-px shrink-0 bg-[#f2f2f2]" />}
              <button
                type="button"
                onClick={() => { onChange(option); setAnchor(null); }}
                className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] hover:bg-[#f2f2f2] ${option === value ? "bg-white text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.88)]"}`}
                style={{ fontWeight: option === value ? 500 : 400 }}
              >
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {option === value && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
              </button>
            </Fragment>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// 时间选择器 chip：弹出小时列表（Figma 18:00）
function TimeChip({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[#f7f7f7] px-[8px] py-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{value}</span>
      </button>
      {anchor && <OperationMenu anchor={anchor} gap={8} className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]" style={{ width: 100 }} onPointerDown={event => event.stopPropagation()}>
        <div ref={unlockScroll} className="-mr-[8px] flex max-h-[320px] flex-col gap-[2px] overflow-y-auto py-[4px] pr-[8px]">
          {HOURS.map(hour => (
            <button key={hour} type="button" onClick={() => { onChange(hour); setAnchor(null); }}
              className={`flex h-[36px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[14px] hover:bg-[#f2f2f2] ${hour === value ? "bg-white font-medium text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.88)]"}`}>
              {hour}
            </button>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// ============================================================================
// 新建自动化任务弹窗（Figma 9665 / 9782 / 9783 / 9785 Modal 720px）
// ============================================================================
function CreateAutomationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [cycle, setCycle] = useState<Cycle>("每天");
  const [weekday, setWeekday] = useState<string>("周六");
  const [monthDay, setMonthDay] = useState<string>("15号");
  const [yearMonth, setYearMonth] = useState<number>(11);
  const [yearDay, setYearDay] = useState<string>("5号");
  const [time, setTime] = useState<string>("18:00");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (open) {
      setPrompt("");
    }
  }, [open]);

  // 根据周期渲染「于」之后的条件 chip 组合，严格对应 5 个 Figma 节点
  const renderCondition = () => {
    switch (cycle) {
      case "每天":
        return <TimeChip value={time} onChange={setTime} />;
      case "每周":
        return <>
          <SelectChip options={WEEKDAYS} value={weekday} onChange={setWeekday} width={120} />
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">的</span>
          <TimeChip value={time} onChange={setTime} />
        </>;
      case "每月":
        return <>
          {/* 31 天单列长列表：固定在下方、最高 320px 可滚动（用户要求） */}
          <SelectChip options={DAYS} value={monthDay} onChange={setMonthDay} width={120} forceBelow maxHeight={320} />
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">的</span>
          <TimeChip value={time} onChange={setTime} />
        </>;
      case "每年":
        return <>
          <YearDateChip month={yearMonth} day={yearDay} onMonthChange={setYearMonth} onDayChange={setYearDay} />
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">的</span>
          <TimeChip value={time} onChange={setTime} />
        </>;
      case "仅一次":
        return <>
          <YearDateChip month={yearMonth} day={yearDay} onMonthChange={setYearMonth} onDayChange={setYearDay} />
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">的</span>
          <TimeChip value={time} onChange={setTime} />
        </>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[720px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[720px] [&>button]:hidden"
      >
        {/* 标题栏：padding 16px 24px */}
        <div className="flex w-full flex-col gap-[4px] px-[24px] py-[16px]">
          <div className="relative h-[24px] w-full">
            <DialogTitle className="font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
              新建自动化任务
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭新建自动化任务弹窗"
                className="absolute right-0 top-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
              >
                <img src="/assets/f802d.svg" alt="" />
              </button>
            </DialogClose>
          </div>
        </div>

        {/* 内容区：padding 16px 12px, gap 24px */}
        <div className="flex w-full flex-col gap-[24px] px-[12px] py-[16px]">
          {/* 当 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">当</span>
            <div className="flex min-h-[40px] w-full flex-wrap items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[12px] py-[8px]">
              <img src="/assets/automation-time-range.svg" alt="" className="size-[16px] shrink-0" />
              <SelectChip options={CYCLES} value={cycle} onChange={value => setCycle(value as Cycle)} width={120} />
              <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">于</span>
              {renderCondition()}
            </div>
          </div>

          {/* 就 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">就</span>
            <div className="relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
              <div className="flex flex-col gap-[8px] px-[12px] pb-[48px] pt-[12px]">
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder="希望我干什么？"
                  className="block min-h-[22px] w-full resize-none bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                />
              </div>
              <div className="flex items-center gap-[8px] p-[8px]">
                <button
                  type="button"
                  aria-label="添加内容"
                  className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-[#f2f2f2]"
                >
                  <img src="/assets/automation-add-dark.svg" alt="" className="size-[16px]" />
                </button>
              </div>
            </div>
          </div>

          {/* 高级设置 */}
          <div className="flex w-full flex-col gap-[10px] px-[12px]">
            <button
              type="button"
              className="flex w-fit cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
            >
              <span>高级设置</span>
              <img src="/assets/automation-down.svg" alt="" className="size-[12px]" />
            </button>
          </div>
        </div>

        {/* 操作区：padding 24px, flex-end, gap 24px, 上边框 */}
        <div className="flex h-[80px] w-full items-center justify-end gap-[24px] border-t border-[#f2f2f2] px-[24px]">
          <DialogClose asChild>
            <button
              type="button"
              className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
            >
              取消
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={!prompt.trim()}
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99c3ff] disabled:text-[rgba(255,255,255,0.55)] disabled:hover:bg-[#99c3ff]"
          >
            创建
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 月日 chip：Figma 每年/仅一次的「11月5号」，点击弹月/日两级选择
function YearDateChip({ month, day, onMonthChange, onDayChange }: {
  month: number;
  day: string;
  onMonthChange: (month: number) => void;
  onDayChange: (day: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[#f7f7f7] px-[8px] py-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{month}月{day}</span>
      </button>
      {anchor && <OperationMenu anchor={anchor} gap={8} className="flex flex-col gap-[8px] rounded-[12px] border border-[#f2f2f2] bg-white p-[12px] shadow-[0_0_12px_rgba(0,0,0,0.08)]" style={{ width: 240 }} onPointerDown={event => event.stopPropagation()}>
        <div className="font-['PingFang_SC:Regular'] text-[12px] text-[rgba(0,0,0,0.38)]">月份</div>
        <div className="grid grid-cols-6 gap-[4px]">
          {months.map(item => (
            <button key={item} type="button" onClick={() => onMonthChange(item)}
              className={`flex h-[28px] cursor-pointer items-center justify-center rounded-[4px] text-[12px] hover:bg-[#f2f2f2] ${item === month ? "bg-[#ebf4ff] text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"}`}>
              {item}
            </button>
          ))}
        </div>
        <div className="font-['PingFang_SC:Regular'] text-[12px] text-[rgba(0,0,0,0.38)]">日期</div>
        <div ref={unlockScroll} className="grid max-h-[160px] grid-cols-6 gap-[4px] overflow-y-auto">
          {DAYS.map(item => (
            <button key={item} type="button" onClick={() => onDayChange(item)}
              className={`flex h-[28px] cursor-pointer items-center justify-center rounded-[4px] text-[12px] hover:bg-[#f2f2f2] ${item === day ? "bg-[#ebf4ff] text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"}`}>
              {parseInt(item)}
            </button>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// ============================================================================
// 任务卡片（Figma 9625:49728 #9706:63239 / #9706:63243）
// h≈48，圆角 8px，32px 文档图标 + 标题 Medium/T2 + 副标题 Regular/T2(0.6)。
// hover：行背景 #F2F2F2，右侧浮现两个 32×32 图标按钮（暂停 / 更多）。
// 点「更多」：弹出 192px DropdownMenu（编辑 / 立即执行 / 执行记录 / 删除）。
// ============================================================================
function AutomationTaskCard({ task, onOperate }: {
  task: AutomationTask;
  onOperate: (label: string, task: AutomationTask) => void;
}) {
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(moreAnchor, setMoreAnchor);

  return (
    <div
      className="group flex w-full items-center gap-[8px] rounded-[8px] p-[8px] transition-colors hover:bg-[#f2f2f2] data-[menu-open=true]:bg-[#f2f2f2]"
      data-menu-open={moreAnchor ? "true" : undefined}
    >
      <img src="/assets/automation-card-icon.svg" alt="" className="size-[32px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <span className="truncate font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          {task.title}
        </span>
        <span className="truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
          {/* Figma 9872:63219：已暂停时副标题前缀由周期变为「已暂停 ·」 */}
          {task.status === "已暂停" ? `已暂停 · ${task.description}` : `${task.cycle} · ${task.description}`}
        </span>
      </div>

      {/* 右侧操作项：默认隐藏，hover 行或菜单展开时显现 */}
      <div className="flex shrink-0 items-center gap-[8px] opacity-0 transition-opacity group-hover:opacity-100 group-data-[menu-open=true]:opacity-100">
        {/* Figma 9872:63221：已暂停时按钮变为 iconbase/start（启动），点击恢复启用 */}
        <button
          type="button"
          aria-label={task.status === "已暂停" ? `启用 ${task.title}` : `暂停 ${task.title}`}
          title={task.status === "已暂停" ? "启用" : "暂停"}
          onClick={() => onOperate(task.status === "已暂停" ? "启用" : "暂停", task)}
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
          onClick={event => setMoreAnchor(current => current ? null : event.currentTarget)}
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
// 自动化任务列表页（Figma 9665:49113）
// ============================================================================
export function AutomationView() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<AutomationTab>("已启用");
  const [createOpen, setCreateOpen] = useState(false);
  const [tasks, setTasks] = useState<AutomationTask[]>(INITIAL_TASKS);

  // 搜索 + Tab 过滤：命中则展示任务卡片列表，否则展示空态
  const visibleTasks = tasks.filter(task =>
    task.status === tab && task.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handleOperate = (label: string, task: AutomationTask) => {
    if (label === "删除") {
      setTasks(current => current.filter(item => item.id !== task.id));
      return;
    }
    if (label === "暂停") {
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: "已暂停" } : item));
      // 同一 id 覆盖前一条提示，避免连续切换时 toast 堆叠
      toast.success("任务已暂停", { id: "automation-task-status" });
      return;
    }
    if (label === "启用") {
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: "已启用" } : item));
      toast.success("任务已开启", { id: "automation-task-status" });
      return;
    }
    // 「编辑 / 立即执行 / 执行记录」为交互占位，保持列表稳定
  };

  return (
    <>
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white px-[16px] min-[800px]:px-[24px]">
        <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col">
          <ListPageHeader
            title="自动化任务"
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="搜索自动化任务名称"
            searchAriaLabel="搜索自动化任务"
          >
            {/* ≥560px：Figma 9625:52211 Filled Primary Button / r4 / #1E63F5 / 左加号 +「新建」（Right Icon=false，无下拉箭头） */}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="hidden shrink-0 cursor-pointer items-center justify-center gap-[8px] overflow-hidden rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] hover:bg-[#1554d1] min-[560px]:flex"
            >
              <img src="/assets/automation-create-add.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)]">新建</span>
            </button>
            {/* <560px：收起为 32x32 蓝色图标按钮 */}
            <button
              type="button"
              aria-label="新建"
              onClick={() => setCreateOpen(true)}
              className="hidden size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[#1e63f5] hover:bg-[#1554d1] max-[559px]:flex"
            >
              <img src="/assets/automation-create-add.svg" alt="" className="size-[16px]" />
            </button>
          </ListPageHeader>

          <TagTabs items={AUTOMATION_TABS} active={tab} onChange={setTab} />

          {/* 内容区：有数据显示任务卡片列表（含 hover 操作项），无数据显示空态 */}
          {visibleTasks.length > 0 ? (
            <div className="flex w-full flex-col gap-[8px] pb-[24px]">
              {visibleTasks.map(task => (
                <AutomationTaskCard key={task.id} task={task} onOperate={handleOperate} />
              ))}
            </div>
          ) : (
            <AutomationEmpty />
          )}
        </div>
      </main>
      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
