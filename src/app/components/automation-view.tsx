import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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

// 周期下拉（Figma 9773:69719 DropdownMenu 更新版）：
// 仅一次 → 分隔线 → 每天/每周/每月/每年 → 分隔线 → 自定义
const CYCLES = ["仅一次", "每天", "每周", "每月", "每年", "自定义"] as const;
type Cycle = (typeof CYCLES)[number];
// 需要在选项「后面」渲染 #F2F2F2 分隔线的周期项（左右缩进 8px）
const CYCLE_DIVIDERS: readonly string[] = ["仅一次", "每年"];

// 「自定义」周期的间隔单位下拉（Figma 9895:2849，宽 88px）：分/天/周/月
const CUSTOM_UNITS = ["分", "天", "周", "月"] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number];

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

// ---------------------------------------------------------------------------
// 排期条件（弹窗与右侧详情栏共用）
// state 化后：创建出来的任务能把用户填的周期条件原样带到列表与详情栏里。
// ---------------------------------------------------------------------------
export type ScheduleState = {
  cycle: Cycle;
  weekday: string;
  monthDay: string;
  yearMonth: number;
  yearDay: string;
  time: string;
  customInterval: number;
  customUnit: CustomUnit;
  customMonthDay: string;
};
const DEFAULT_SCHEDULE: ScheduleState = {
  cycle: "每天",
  weekday: "周六",
  monthDay: "15号",
  yearMonth: 11,
  yearDay: "5号",
  time: "18:00",
  customInterval: 1,
  customUnit: "天",
  customMonthDay: "1号",
};

// 把排期条件压成卡片副标题里的「周期 · 说明」两段文本
export function summarizeSchedule(schedule: ScheduleState): { cycle: string; description: string } {
  const { time } = schedule;
  switch (schedule.cycle) {
    case "仅一次":
      return { cycle: schedule.cycle, description: `${schedule.yearMonth}月${schedule.yearDay} ${time}` };
    case "每周":
      return { cycle: schedule.cycle, description: `${schedule.weekday} ${time}` };
    case "每月":
      return { cycle: schedule.cycle, description: `${schedule.monthDay} ${time}` };
    case "每年":
      return { cycle: schedule.cycle, description: `${schedule.yearMonth}月${schedule.yearDay} ${time}` };
    case "自定义": {
      const every = `隔 ${schedule.customInterval} ${schedule.customUnit}`;
      if (schedule.customUnit === "周") return { cycle: schedule.cycle, description: `${every} ${schedule.weekday} ${time}` };
      if (schedule.customUnit === "月") return { cycle: schedule.cycle, description: `${every} ${schedule.customMonthDay} ${time}` };
      return { cycle: schedule.cycle, description: `${every} ${time}` };
    }
    default:
      return { cycle: schedule.cycle, description: `${time} 自动执行` };
  }
}

// 把排期条件说成人话，用于新会话里 AI 的回复文案（「每天 18:00」「每周六 18:00」）
export function describeSchedule(schedule: ScheduleState): string {
  const { time } = schedule;
  switch (schedule.cycle) {
    case "每天":
      return `每天 ${time}`;
    case "每周":
      return `每${schedule.weekday} ${time}`;
    case "每月":
      return `每月${schedule.monthDay} ${time}`;
    case "每年":
      return `每年${schedule.yearMonth}月${schedule.yearDay} ${time}`;
    case "仅一次":
      return `${schedule.yearMonth}月${schedule.yearDay} ${time}`;
    case "自定义": {
      const every = `每隔 ${schedule.customInterval} ${schedule.customUnit}`;
      if (schedule.customUnit === "周") return `${every}的${schedule.weekday} ${time}`;
      if (schedule.customUnit === "月") return `${every}的${schedule.customMonthDay} ${time}`;
      return `${every} ${time}`;
    }
    default:
      return time;
  }
}

// ---------------------------------------------------------------------------
// 任务图标：不是固定一个文档图标，而是按任务语义去图标库（icons.kubai.design）
// 里分词检索匹配 —— 这里把可用的图标名与其中文/英文近义词做成词表，
// 创建任务时用标题 + 「就」的内容做分词打分，命中词最多的图标胜出。
// 图标文件已离线放在 public/assets/kubai/{name}.svg（统一 8B5CF6 紫色）。
// ---------------------------------------------------------------------------
export const AUTOMATION_ICONS = {
  newspaper: ["早报", "晚报", "资讯", "新闻", "快报", "情报", "研报", "news", "daily", "digest"],
  "file-text": ["文档", "报告", "总结", "周报", "日报", "纪要", "文案", "撰写", "写作", "doc", "report", "summary", "write"],
  "file-spreadsheet": ["表格", "台账", "清单", "明细", "excel", "sheet", "csv", "表格整理"],
  "chart-bar": ["统计", "数据", "报表", "排行", "对比", "报表分析", "chart", "stats", "metric"],
  "chart-line": ["趋势", "分析", "增长", "走势", "复盘", "经营", "trend", "analytics", "growth"],
  radar: ["监控", "监测", "舆情", "预警", "盯", "追踪", "风控", "monitor", "alert", "watch", "radar"],
  eye: ["关注", "观察", "关注度", "曝光", "口碑", "review", "observe"],
  mail: ["邮件", "邮箱", "收件箱", "发信", "推送邮件", "email", "mail", "inbox"],
  calendar: ["日程", "会议", "排期", "日历", "预约", "calendar", "meeting", "schedule"],
  clock: ["定时", "提醒", "周期", "打卡", "催办", "reminder", "cron", "timer"],
  bell: ["通知", "提醒", "告警", "铃", "notification", "notice", "bell"],
  search: ["搜索", "调研", "竞品", "检索", "查找", "扒", "search", "research", "competitor"],
  globe: ["网站", "全球", "海外", "国际化", "域名", "web", "global", "site"],
  database: ["数据库", "知识库", "资料库", "归档", "沉淀", "database", "knowledge", "archive"],
  monitor: ["看板", "仪表盘", "大屏", "dashboard", "panel", "screen"],
  "chart-pie": ["占比", "份额", "结构", "分布", "share", "ratio"],
} as const;

export type AutomationIcon = keyof typeof AUTOMATION_ICONS;

// 分词匹配：中文按词表最长命中，英文按单词边界命中；同分时取词表里更靠前的图标
export function resolveAutomationIcon(text: string): AutomationIcon {
  const source = text.toLowerCase();
  let bestIcon: AutomationIcon = "file-text";
  let bestScore = 0;
  (Object.keys(AUTOMATION_ICONS) as AutomationIcon[]).forEach(icon => {
    let score = 0;
    for (const keyword of AUTOMATION_ICONS[icon]) {
      const word = keyword.toLowerCase();
      if (!word) continue;
      if (/^[a-z0-9 -]+$/.test(word)) {
        // 英文关键词按单词匹配，避免 daily 命中 day
        if (new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(source)) score += word.length * 2;
      } else if (source.includes(word)) {
        score += word.length; // 中文按命中词长度加权，长词更具体
      }
    }
    if (score > bestScore) { bestScore = score; bestIcon = icon; }
  });
  return bestIcon;
}

export function automationIconSrc(icon: AutomationIcon | string): string {
  return `/assets/kubai/${icon}.svg`;
}

// 自动化任务数据（Figma 9625:49728 列表项 / 9872:63167 已暂停态 / 9787:71282 右侧详情）
export type AutomationTask = {
  id: string;
  title: string;
  cycle: string;
  description: string;
  status: AutomationTab;
  // 详情栏（9787:71282）展示的完整条件，新建弹窗里填什么就存什么
  schedule: ScheduleState;
  prompt: string;
  // 语义匹配出来的图标（icons.kubai.design），随任务一起存下来保证稳定
  icon: AutomationIcon;
};
// 列表初始为空：不预置示例任务，用户新建后才出现卡片（空态见 AutomationEmpty）。
export const INITIAL_TASKS: AutomationTask[] = [];

// 「更多」下拉菜单项（Figma 9625:49728 DropdownMenu #9709:63275）
const TASK_OPERATIONS = [
  { label: "编辑", icon: "automation-menu-edit.svg" },
  { label: "立即执行", icon: "automation-menu-refresh.svg" },
  { label: "执行记录", icon: "automation-menu-time.svg" },
  { label: "删除", icon: "automation-menu-delete.svg" },
] as const;

// 高级设置（Figma 9783:70644 / 9904:38056 / 9904:38242）
// 结束时间：三个竖排单选（永不 / 指定时间 / 重复），后两项选中时行内追加日期框、步进器
const END_MODES = ["永不", "指定时间", "重复"] as const;
type EndMode = (typeof END_MODES)[number];
// 时区下拉（宽 256）
const TIMEZONES = [
  "UTC+08:00•中国标准时间（系统）",
  "UTC+09:00•日本标准时间",
  "UTC+00:00•协调世界时",
  "UTC-08:00•太平洋时间",
] as const;const HOURS = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"] as const;
const DAYS = Array.from({ length: 31 }, (_, index) => `${index + 1}号`);

// Tag-2 组件 Size=L（与项目页/自动化页共用同一套 Figma 组件 9625:52202）
function TagTabs<T extends string>({ items, active, onChange, pbClass = "pb-[16px]" }: {
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
  // tabs 与下方内容的间距：自动化任务页按 Figma 9937:57105 需要更小间距
  pbClass?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center gap-[16px] ${pbClass}`}>
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
function SelectChip({ options, value, onChange, width = 120, forceBelow = false, maxHeight, dividerAfter, arrow = true }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
  forceBelow?: boolean;
  maxHeight?: number;
  // 在这些选项后面渲染分隔线（如周期菜单：仅一次、每年之后）
  dividerAfter?: readonly string[];
  // chip 右侧显示 down-small 箭头（Figma 9698:62714：所有周期 chip 均带箭头）
  arrow?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{value}</span>
        {arrow && <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />}
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
              <button
                type="button"
                onClick={() => { onChange(option); setAnchor(null); }}
                className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] hover:bg-[#f2f2f2] ${option === value ? "bg-white text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.88)]"}`}
                style={{ fontWeight: option === value ? 500 : 400 }}
              >
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {option === value && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
              </button>
              {/* Figma 9773:69719：指定选项后的 #F2F2F2 分隔线（左右缩进 8px） */}
              {dividerAfter?.includes(option) && <div className="mx-[8px] my-[4px] h-px shrink-0 bg-[#f2f2f2]" />}
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
        className="flex h-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
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

// 数字步进器（Figma 9891:71449 「常规」组件 9528:43362）：
// 宽 80、高 32、#F7F7F7 底 r4；左侧输入区与右侧 24px 步进按钮之间 1px #E6E6E6
// 竖直分割线（像素采样 x482-484），上下按钮间的横分割线已 baked 在图标里。
function NumberStepper({ value, onChange, min = 1, max = 999, width = 80, suffix }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  width?: number;
  // Figma 9904:38428：「重复 N 次后」——输入区右侧的后缀文案（Black 0.6）
  suffix?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="flex h-[32px] shrink-0 items-stretch overflow-hidden rounded-[4px] bg-[#f7f7f7]" style={{ width }}>
      <div className="flex min-w-0 flex-1 items-center gap-[4px] border-r border-[#e6e6e6] px-[8px]">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={event => {
            const parsed = parseInt(event.target.value, 10);
            onChange(Number.isNaN(parsed) ? min : clamp(parsed));
          }}
          className="min-w-0 flex-1 bg-transparent text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none"
        />
        {suffix && (
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[20px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
            {suffix}
          </span>
        )}
      </div>
      <div className="flex w-[24px] shrink-0 flex-col">
        <button
          type="button"
          aria-label="增加"
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-[16px] cursor-pointer items-center justify-center hover:bg-[#e6e6e6]"
        >
          <img src="/assets/automation-step-up.svg" alt="" className="h-[16px] w-[24px]" />
        </button>
        <button
          type="button"
          aria-label="减少"
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-[16px] cursor-pointer items-center justify-center hover:bg-[#e6e6e6]"
        >
          <img src="/assets/automation-step-down.svg" alt="" className="h-[16px] w-[24px]" />
        </button>
      </div>
    </div>
  );
}

// 时区下拉（Figma 9783:70668）：256×32、#E6E6E6 描边、r4、右侧 down-small
function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] w-auto min-w-[256px] shrink-0 cursor-pointer items-center justify-between gap-[8px] self-start rounded-[8px] border border-[#e6e6e6] px-[8px] py-[5px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:border-[#1e63f5]"
      >
        <span className="min-w-0 flex-1 whitespace-nowrap text-left">{value}</span>
        <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        style={{ width: 256 }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex flex-col gap-[2px] py-[4px]">
          {TIMEZONES.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => { onChange(option); setAnchor(null); }}
              className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]`}
              style={{ fontWeight: option === value ? 500 : 400 }}
            >
              <span className="min-w-0 flex-1 truncate">{option}</span>
              {option === value && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
            </button>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// ============================================================================
// 排期条件 chip 组（弹窗 9665:49114 与右侧详情栏 9787:71282 共用）
//   分/天 → 自定义 隔 1 天 于 18:00（9891:71448）
//   周    → 自定义 隔 1 周 于 [周六] 的 18:00（9891:72000）
//   月    → 自定义 隔 1 月 于 [1号]  的 18:00（9891:72961）
// ============================================================================
function ScheduleEditor({ schedule, onChange }: {
  schedule: ScheduleState;
  onChange: (patch: Partial<ScheduleState>) => void;
}) {
  const muted = "shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]";
  const cycle = schedule.cycle;
  const timeChip = <TimeChip value={schedule.time} onChange={time => onChange({ time })} />;
  // 「的 + 时间」不可拆成两组：320 宽的详情栏折行时不会把「的」单独留在上一行
  const tail = (withDe: boolean) => (
    <span className="flex shrink-0 items-center gap-[8px]">
      {withDe && <span className={muted}>的</span>}
      {timeChip}
    </span>
  );
  return (
    <>
      {/* 周期 chip 统一带 down-small 箭头（Figma 9665:49114 / 9698:62714） */}
      <SelectChip
        options={CYCLES}
        value={cycle}
        onChange={value => onChange({ cycle: value as Cycle })}
        width={120}
        dividerAfter={CYCLE_DIVIDERS}
        arrow
      />
      {/* 「自定义」的「于」跟在单位 chip 之后，其余周期「于」紧跟周期 chip */}
      {cycle !== "自定义" && <span className={muted}>于</span>}

      {cycle === "每天" && timeChip}

      {cycle === "每周" && <>
        <SelectChip options={WEEKDAYS} value={schedule.weekday} onChange={weekday => onChange({ weekday })} width={120} />
        {tail(true)}
      </>}

      {cycle === "每月" && <>
        {/* 31 天单列长列表：固定在下方、最高 320px 可滚动 */}
        <SelectChip options={DAYS} value={schedule.monthDay} onChange={monthDay => onChange({ monthDay })} width={120} forceBelow maxHeight={320} />
        {tail(true)}
      </>}

      {(cycle === "每年" || cycle === "仅一次") && <>
        <YearDateChip
          month={schedule.yearMonth}
          day={schedule.yearDay}
          onMonthChange={yearMonth => onChange({ yearMonth })}
          onDayChange={yearDay => onChange({ yearDay })}
        />
        {tail(true)}
      </>}

      {cycle === "自定义" && <>
        <span className={muted}>隔</span>
        <NumberStepper value={schedule.customInterval} onChange={customInterval => onChange({ customInterval })} />
        <SelectChip
          options={CUSTOM_UNITS}
          value={schedule.customUnit}
          onChange={value => onChange({ customUnit: value as CustomUnit })}
          width={88}
          arrow
        />
        <span className={muted}>于</span>
        {/* 周：追加星期 chip；月：追加日期 chip（31 天列表固定下方、最高 320 可滚动） */}
        {schedule.customUnit === "周" && <SelectChip options={WEEKDAYS} value={schedule.weekday} onChange={weekday => onChange({ weekday })} width={120} />}
        {schedule.customUnit === "月" && <SelectChip options={DAYS} value={schedule.customMonthDay} onChange={customMonthDay => onChange({ customMonthDay })} width={120} forceBelow maxHeight={320} />}
        {tail(schedule.customUnit === "周" || schedule.customUnit === "月")}
      </>}
    </>
  );
}

// ============================================================================
// 高级设置（Figma 9783:70644 / 9904:38056 / 9904:38242）
// 结束时间（三选一）+ 执行方式（复选框）+ 时区下拉；弹窗与详情栏共用
// ============================================================================
function AdvancedSettings() {
  const [endMode, setEndMode] = useState<EndMode>("永不");
  const [endDate, setEndDate] = useState<CalendarDate>({ year: 2025, month: 7, day: 8 });
  const [endDateAnchor, setEndDateAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(endDateAnchor, setEndDateAnchor);
  const [repeatTimes, setRepeatTimes] = useState<number>(10);
  const [newSession, setNewSession] = useState(false);
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0]);
  return (
    <div className="flex w-full flex-col gap-[24px]">
      {/* 结束时间：竖排单选（Figma 9904:38083 Radio-Group：Style=Vertical，行高 22、gap 8）。
          日期框 / 步进器在设计稿里都是「绝对定位」的子节点（x=89，y=25 / y=55，尺寸 136/120 × 32），
          不参与排版，所以切换选项时三行位置完全不动（无抖动），两者左边线严格同一条 x 轴。 */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">结束时间</span>
        <div className="relative flex w-fit flex-col gap-[8px] self-start">
          {END_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={endMode === mode}
              onClick={() => setEndMode(mode)}
              className="flex h-[22px] cursor-pointer items-center gap-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]"
            >
              <img
                src={endMode === mode ? "/assets/automation-radio-on.svg" : "/assets/automation-radio-off.svg"}
                alt=""
                className="size-[16px] shrink-0"
              />
              <span className="whitespace-nowrap">{mode}</span>
            </button>
          ))}

          {/* Figma 9904:38096：指定时间 → DatePicker 136×32（#E6E6E6 描边，r4），绝对值 x=89 / y=25。
              点击弹出与「每年」月日 chip 同一个「选择日」面板（9849:42119），不再是浏览器原生日期控件。 */}
          {endMode === "指定时间" && (
            <Fragment>
              <button
                type="button"
                aria-label="选择结束日期"
                onClick={event => setEndDateAnchor(current => current ? null : event.currentTarget)}
                className="absolute left-[89px] top-[25px] flex h-[32px] w-[136px] cursor-pointer items-center gap-[8px] rounded-[4px] border border-[#e6e6e6] bg-white px-[8px] text-left hover:border-[#1e63f5]"
              >
                <img src="/assets/automation-date-range.svg" alt="" className="size-[16px] shrink-0" />
                <span className="min-w-0 flex-1 truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                  {`${endDate.year}/${String(endDate.month).padStart(2, "0")}/${String(endDate.day).padStart(2, "0")}`}
                </span>
              </button>
              {endDateAnchor && <CalendarMenu
                anchor={endDateAnchor}
                onClose={() => setEndDateAnchor(null)}
                selected={endDate}
                onSelect={setEndDate}
              />}
            </Fragment>
          )}

          {/* Figma 9904:38428：重复 → 120 宽步进器 + 「次后」后缀，绝对值 x=89 / y=55 */}
          {endMode === "重复" && (
            <div className="absolute left-[89px] top-[55px]">
              <NumberStepper value={repeatTimes} onChange={setRepeatTimes} width={120} suffix="次后" min={1} max={99} />
            </div>
          )}
        </div>
      </div>

      {/* 执行方式：复选框「每次执行都开启新会话」 */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">执行方式</span>
        <button
          type="button"
          role="checkbox"
          aria-checked={newSession}
          onClick={() => setNewSession(current => !current)}
          className="flex w-fit cursor-pointer items-center gap-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]"
        >
          {newSession ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="3" fill="#1E63F5" />
              <path d="M5 8.2L7.1 10.3L11 6.4" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <img src="/assets/automation-checkbox-off.svg" alt="" className="size-[16px] shrink-0" />
          )}
          <span className="whitespace-nowrap">每次执行都开启新会话</span>
        </button>
      </div>

      {/* 时区：256×32 下拉（#E6E6E6 描边） */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">时区</span>
        <TimezoneSelect value={timezone} onChange={setTimezone} />
      </div>
    </div>
  );
}

// ============================================================================
// 新建自动化任务弹窗（Figma 9665 / 9782 / 9783 / 9785 Modal 720px）
// ============================================================================
function CreateAutomationDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 点「创建」发起一个新会话，由 AI 创建这条任务（Figma 9625:49728）
  onCreate: (schedule: ScheduleState, prompt: string) => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleState>(DEFAULT_SCHEDULE);
  const [prompt, setPrompt] = useState("");
  // 高级设置（Figma 9783:70644）：默认收起
  const [advOpen, setAdvOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setAdvOpen(false);
    }
  }, [open]);

  const patchSchedule = (patch: Partial<ScheduleState>) => setSchedule(current => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 弹窗距视口上下各至少 32px：max-h = 100vh - 64px；内容超出时只有中间「内容区」滚动，
          标题栏与底部操作区固定不动（grid: auto / minmax(0,1fr) / auto） */}
      <DialogContent
        aria-describedby={undefined}
        className="grid max-h-[calc(100vh-64px)] w-[720px] max-w-[calc(100%-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[720px] [&>button]:hidden"
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

        {/* 内容区：padding 16px 12px, gap 24px。高度受限时自身滚动（标题/操作区固定） */}
        <div className="flex min-h-0 w-full flex-col gap-[24px] overflow-y-auto px-[12px] py-[16px] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(0,0,0,0.2)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-[8px]">
          {/* 当 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">当</span>
            <div className="flex min-h-[40px] w-full flex-wrap items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[12px] py-[8px]">
              <img src="/assets/automation-time-range.svg" alt="" className="size-[16px] shrink-0" />
              <ScheduleEditor schedule={schedule} onChange={patchSchedule} />
            </div>
          </div>

          {/* 就 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">就</span>
            <div className="relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
              <div className="flex flex-col gap-[8px] px-[12px] pb-[48px] pt-[12px]">
                <textarea
                  rows={1}
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  placeholder="希望我干什么？"
                  className="block max-h-[132px] min-h-[22px] w-full resize-none overflow-y-auto bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
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

          {/* 高级设置：Figma 9783:70663（容器 padding 0 8px），展开后箭头翻转为 up-small */}
          <div className="flex w-full flex-col gap-[10px] px-[8px]">
            <button
              type="button"
              aria-expanded={advOpen}
              onClick={() => setAdvOpen(current => !current)}
              className="flex w-fit cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
            >
              <span>高级设置</span>
              <img
                src={advOpen ? "/assets/automation-up-small.svg" : "/assets/automation-down-small.svg"}
                alt=""
                className="size-[16px] shrink-0"
              />
            </button>
          </div>

          {advOpen && <AdvancedSettings />}
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
            onClick={() => { onCreate(schedule, prompt.trim()); onOpenChange(false); }}
            className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99c3ff] disabled:text-[rgba(255,255,255,0.55)] disabled:hover:bg-[#99c3ff]"
          >
            创建
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 「选择日」日历面板（Figma 组件 9849:42119 / 实例 9867:62728，见节点 9783:70498）
// 排期「每年」的月日 chip 与高级设置「指定时间」的 DatePicker 共用这一个组件。
// 面板：288 宽 / padding 16 / 区块间距 16 / r8 / 无描边 / shadow 0 0 12 rgba(0,0,0,.08)
// 头部 ‹ YYYY年MM月 ›：左右各一枚 16×16 单箭头（left-small / right-small，black .38），
//   年月文案 Medium/T3（16/24，black .88）居中占满剩余宽度，逐月翻页并跨年进位
// 分隔线 1px #F2F2F2
// 星期表头 日 一 二 三 四 五 六（周日为一周首日）：12/18 black .26，7 等分列、列间距 4
// 日期网格：每行 7 格等分、行间距 16，数字固定在 28×28 内居中（Regular/T2，14/22，black .88）
// 今天（9421:108344）：数字变 #1E63F5；选中（9421:108343）：28px 胶囊 #1E63F5 / r32 / 文字 rgba(255,255,255,.9)
// 设计稿里日期是 1~31 顺序占位，这里按真实年月排布，月初偏移与月末补位留空以保持网格对齐。
// ============================================================================
export type CalendarDate = { year: number; month: number; day: number };

function CalendarMenu({ anchor, onClose, selected, onSelect }: {
  anchor: HTMLElement;
  onClose: () => void;
  selected: CalendarDate;
  onSelect: (value: CalendarDate) => void;
}) {
  const unlockScroll = useUnlockScrollInDialog();
  // 打开时定位到已选年月；翻页只改面板视图，点中日期才回写并关闭
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  const today = new Date();
  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const shiftMonth = (delta: number) => {
    const next = new Date(view.year, view.month - 1 + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  const inSelectedMonth = view.year === selected.year && view.month === selected.month;
  return (
    <OperationMenu anchor={anchor} gap={8} forceBelow className="rounded-[8px] bg-white p-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]" style={{ width: 288 }} onPointerDown={event => event.stopPropagation()}>
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center gap-[16px]">
          <button type="button" aria-label="上一月" onClick={() => shiftMonth(-1)} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
            <img src="/assets/cal-left.svg" alt="" className="size-[16px]" />
          </button>
          <span className="flex-1 text-center font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
            {view.year}年{view.month}月
          </span>
          <button type="button" aria-label="下一月" onClick={() => shiftMonth(1)} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
            <img src="/assets/cal-right.svg" alt="" className="size-[16px]" />
          </button>
        </div>
        <div className="h-[1px] w-full bg-[#f2f2f2]" />
        <div ref={unlockScroll} className="flex flex-col gap-[16px]">
          <div className="flex gap-[4px]">
            {["日", "一", "二", "三", "四", "五", "六"].map(label => (
              <span key={label} className="flex-1 text-center font-['PingFang_SC:Regular'] text-[12px] leading-[18px] tracking-[0.012px] text-[rgba(0,0,0,0.26)]">
                {label}
              </span>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              {row.map((item, index) => {
                if (item === null) return <span key={`pad-${index}`} className="h-[28px] flex-1" />;
                const isSelected = inSelectedMonth && item === selected.day;
                const isToday = view.year === today.getFullYear() && view.month === today.getMonth() + 1 && item === today.getDate();
                return (
                  <button
                    key={item}
                    type="button"
                    aria-label={`${view.year}年${view.month}月${item}日`}
                    onClick={() => { onSelect({ year: view.year, month: view.month, day: item }); onClose(); }}
                    className="flex flex-1 cursor-pointer justify-center"
                  >
                    <span className={`flex h-[28px] w-[28px] items-center justify-center rounded-[32px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] ${isSelected ? "bg-[#1e63f5] text-[rgba(255,255,255,0.9)]" : `${isToday ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"} hover:bg-[#f2f2f2]`}`}>
                      {item}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </OperationMenu>
  );
}

// 月日 chip：Figma 9783:70498「每年」弹窗里的「11月5号」，点击弹出上面共用的「选择日」面板。
// 排期只有月日、没有年份，年份取今年作为面板定位与翻页起点，选中后只回写月与日。
function YearDateChip({ month, day, onMonthChange, onDayChange }: {
  month: number;
  day: string;
  onMonthChange: (month: number) => void;
  onDayChange: (day: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{month}月{day}</span>
        {/* Figma 9785:71155：月日 chip 同样带 down-small 箭头（16×16） */}
        <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />
      </button>
      {anchor && <CalendarMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        selected={{ year: new Date().getFullYear(), month, day: parseInt(day) || 1 }}
        onSelect={({ month: nextMonth, day: nextDay }) => {
          if (nextMonth !== month) onMonthChange(nextMonth);
          onDayChange(`${nextDay}号`);
        }}
      />}
    </Fragment>
  );
}

// ============================================================================
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
    >
      {/* 图标按任务语义匹配（icons.kubai.design 分词检索），不再固定用文档图标 */}
      <img src={automationIconSrc(task.icon)} alt="" className="size-[32px] shrink-0" />
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
// 右侧自动化详情栏（Figma 9787:71282）
// 宽 320，左侧 1px #F2F2F2 描边；header 48px（标题 + 暂停 + 更多 + 关闭）。
// 内容：详情/运行记录 Tabs → 自动化任务名称 → 当（条件 chip 组）→ 就（Chat Input）→ 高级设置
// ============================================================================
const DETAIL_TABS = ["详情", "运行记录"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

export function AutomationDetailPanel({ task, onClose, onOperate, onChange, split = false }: {
  task: AutomationTask;
  onClose: () => void;
  onOperate: (label: string, task: AutomationTask) => void;
  onChange: (patch: Partial<AutomationTask>) => void;
  // 自动化任务页：与左侧列表各占内容区 50%，右侧 max720 / min320；
  // 会话页沿用 Figma 9787:71282 的固定 320 侧栏。
  split?: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("详情");
  const [advOpen, setAdvOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(moreAnchor, setMoreAnchor);

  const label = "font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]";

  // 浮层断点分场景（类名必须写成完整字面量，Tailwind 才能扫描生成）：
  // 任务页要同时容纳「列表 320 + 详情 320」，内容区不足 640（窗口 <880 = 240 导航 + 640）时
  // 详情转右侧浮层，避免并排把列表挤到 320 以下；
  // 会话页的详情是固定 320 侧栏，沿用原来的 <800 转浮层，行为不变。
  return (
    <aside
      aria-label="自动化任务详情"
      className={split
        ? "flex flex-col gap-[8px] border-l border-[#f2f2f2] bg-white max-[879px]:absolute max-[879px]:inset-y-0 max-[879px]:right-0 max-[879px]:z-20 max-[879px]:w-[320px] max-[879px]:shadow-[-8px_0_24px_rgba(0,0,0,0.08)] min-[880px]:[flex:1_1_50%] min-[880px]:min-w-[320px] min-[880px]:max-w-[720px]"
        : "flex w-[320px] shrink-0 flex-col gap-[8px] border-l border-[#f2f2f2] bg-white max-[799px]:absolute max-[799px]:inset-y-0 max-[799px]:right-0 max-[799px]:z-20 max-[799px]:w-[320px] max-[799px]:shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"}
    >
      {/* header：标题 + 暂停/运行中 + 更多 + 关闭（Figma 9897:2990） */}
      <header className="flex h-[48px] shrink-0 items-center gap-[10px] border-b border-[#f2f2f2] px-[16px] py-[8px]">
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
        <button
          type="button"
          aria-label="关闭详情"
          title="关闭"
          onClick={onClose}
          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
        >
          <img src="/assets/f802d.svg" alt="" className="size-[16px]" />
        </button>

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

      <div className="flex min-h-0 flex-1 flex-col gap-[24px] overflow-y-auto px-[4px] pb-[24px] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(0,0,0,0.2)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-[8px]">
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
          <div className="flex flex-1 flex-col items-center pt-[64px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.38)]">
            暂无运行记录
          </div>
        ) : (
          <>
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
                    value={task.title}
                    maxLength={30}
                    onChange={event => onChange({ title: event.target.value })}
                    placeholder="名称"
                    aria-label="自动化任务名称"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.38)]"
                  />
                  <span className="shrink-0 font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    {task.title.length}/30
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
                  schedule={task.schedule}
                  onChange={patch => onChange({ schedule: { ...task.schedule, ...patch } })}
                />
              </div>
            </div>

            {/* 就：Chat Input（Figma 9897:37323） */}
            <div className="flex flex-col gap-[12px] px-[12px]">
              <span className={label}>就</span>
              <div className="flex flex-col overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
                <div className="flex flex-col gap-[8px] px-[12px] pb-[48px] pt-[12px]">
                  <textarea
                    rows={1}
                    value={task.prompt}
                    onChange={event => onChange({ prompt: event.target.value })}
                    placeholder="希望我干什么？"
                    className="block max-h-[132px] min-h-[22px] w-full resize-none overflow-y-auto bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
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
              {advOpen && <AdvancedSettings />}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ============================================================================
// 自动化任务列表页（Figma 9665:49113）
// ============================================================================
export function AutomationView({ tasks, onTasksChange, onLaunchChat, navCollapsed = false, onSidebarToggle, onNewChat }: {
  // 任务数据由 App 持有：点「创建」会跳到会话页，本组件随即卸载，
  // 任务必须活在上一层，AI 创建完成后回到这里才看得到。
  tasks: AutomationTask[];
  onTasksChange: (updater: (current: AutomationTask[]) => AutomationTask[]) => void;
  onLaunchChat: (payload: { schedule: ScheduleState; prompt: string }) => void;
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

  const handleOperate = (label: string, task: AutomationTask) => {
    if (label === "删除") {
      onTasksChange(current => current.filter(item => item.id !== task.id));
      if (detailId === task.id) setDetailId(null);
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
    // 「编辑」在右侧详情栏里改；「立即执行 / 执行记录」为交互占位
    if (label === "编辑" || label === "执行记录") setDetailId(task.id);
  };

  // 点「创建」：不是直接往列表塞一条，而是发起一个新会话（任务），
  // 由 AI 承接并完成创建 —— 排期与「就」的内容一起带进会话。
  const handleCreate = (schedule: ScheduleState, prompt: string) => {
    onLaunchChat({ schedule, prompt });
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
        {/* 详情并排时列表占 50%，断点与 AutomationDetailPanel 的 split 保持一致（≥880 才并排）：
            880 = 240 导航 + 320 列表 + 320 详情，保证中间列表不会被挤到 320 以下；
            再窄则详情转浮层，列表独占内容区（内容区本身 min-w-[320px]）。 */}
        <main ref={mainRef} className={`relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-white px-[16px] ${narrowPadding ? "" : "min-[800px]:px-[24px]"} ${detailTask ? "min-[880px]:[flex:1_1_50%] min-[880px]:min-w-[320px]" : ""}`}>
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
            split
            task={detailTask}
            onClose={() => setDetailId(null)}
            onOperate={handleOperate}
            onChange={patch => onTasksChange(current => current.map(item => item.id === detailTask.id ? { ...item, ...patch } : item))}
          />
        )}
      </div>
      <CreateAutomationDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
    </>
  );
}
