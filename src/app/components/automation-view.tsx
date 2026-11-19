import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { Popover, PopoverAnchor } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { OperationMenu } from "./operation-menu";
import { ListPageHeader } from "./list-page-header";
import { AddContentMenu } from "./add-content-menu";
import { AttachmentPicker } from "./attachment-picker";
import type { AttachmentSource } from "./attachment-picker";
import { AttachmentTray } from "./attachment-tray";
import type { ChatAttachment } from "./attachment-tray";
import { useDraftAttachments } from "./use-draft-attachments";
import { useDetailPanelWidth } from "./use-detail-panel-width";

// ============================================================================
// 自动化任务页（Figma 9665:49113 列表页；9782/9783/9785 新建自动化任务弹窗各周期态）
// 列表页严格按设计稿：标题 + 搜索 + 新建按钮 + 已启用/已暂停/已结束 Tabs + 内容留白。
// 新建弹窗由「新建」按钮触发（720px Modal）：当/就结构，周期可切换并联动条件 chip。
// ============================================================================

const AUTOMATION_TABS = ["已启用", "已暂停", "已结束"] as const;
type AutomationTab = (typeof AUTOMATION_TABS)[number];

// 会话里自动化卡片的状态：任务三个状态 + 任务被删后卡片保留的「已删除」态（Figma 9908:45451）
export type AutomationCardStatus = AutomationTab | "已删除";

// 周期下拉（Figma 9773:69719 DropdownMenu 更新版）：
// 仅一次 → 分隔线 → 每天/每周/每月/每年 → 分隔线 → 自定义
const CYCLES = ["仅一次", "每天", "每周", "每月", "每年", "自定义"] as const;
type Cycle = (typeof CYCLES)[number];
// 需要在选项「后面」渲染 #F2F2F2 分隔线的周期项（左右缩进 8px）
const CYCLE_DIVIDERS: readonly string[] = ["仅一次", "每年"];

// 「自定义」周期的间隔单位下拉（Figma 9895:2849 / 10000:58940，宽 88px）：分/小时/天/周/月
const CUSTOM_UNITS = ["分", "小时", "天", "周", "月"] as const;
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
      const every = `每 ${schedule.customInterval} ${schedule.customUnit}`;
      // 分 / 小时只到单位为止（Figma 10000:58940），没有具体时刻
      if (schedule.customUnit === "分" || schedule.customUnit === "小时") return { cycle: schedule.cycle, description: every };
      if (schedule.customUnit === "周") return { cycle: schedule.cycle, description: `${every} ${schedule.weekday} ${time}` };
      if (schedule.customUnit === "月") return { cycle: schedule.cycle, description: `${every} ${schedule.customMonthDay} ${time}` };
      return { cycle: schedule.cycle, description: `${every} ${time}` };
    }
    default:
      return { cycle: schedule.cycle, description: `${time} 自动执行` };
  }
}

// 卡片副标题的「时间」那一段（会话卡片 9925:54915 / 任务列表 9872:63193 共用）。
// 设计稿的副标题是「时间 · 任务内容」两段（如「每天 · 每个工作日晚自动生成并推送日报」），
// 不能直接拿 cycle + description 拼 —— 那会拼出「每周 · 周日 09:00」这种同义重复。
// 这里只保留具体执行时间（周几 / 几号 + 时刻）；「每天」把前缀留下，读起来才完整。
export function cardTimeLabel(schedule: ScheduleState): string {
  const { description } = summarizeSchedule(schedule);
  if (schedule.cycle === "每天") return `每天 ${description.replace(" 自动执行", "")}`;
  return description;
}

// 卡片副标题 = 时间 · 任务内容（已暂停时前缀换成「已暂停」，Figma 9872:63219）。
// 例：周日 09:00 · 帮我创建一个自动化任务，每天早上汇总未读邮件
// title：任务名与内容完全一样时（新建弹窗里没单独填名字，名字回退成内容）只留时间，不再重复一遍
export function cardSubtitle(schedule: ScheduleState, prompt: string, status?: AutomationTab, title?: string): string {
  // 「就」里那段话可能是多行的，压成一行交给 CSS 截断，避免卡片被撑高
  const content = prompt.trim().replace(/\s+/g, " ");
  const name = (title ?? "").trim().replace(/\s+/g, " ");
  const detail = content && content !== name ? content : "";
  if (status === "已暂停") return detail ? `已暂停 · ${detail}` : "已暂停";
  const when = cardTimeLabel(schedule);
  return detail ? `${when} · ${detail}` : when;
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
      const every = `每 ${schedule.customInterval} ${schedule.customUnit}`;
      if (schedule.customUnit === "分" || schedule.customUnit === "小时") return every;
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

// ---------------------------------------------------------------------------
// 运行记录（Figma 9908:45451 右侧侧边栏「运行记录」Tab）
// 一条记录 = 左侧时间轴节点 + 右侧内容卡：头部「18:01 · 成功」、正文、耗时行（可带图钉）
// 结果三态：成功（#38E38A）/ 失败（#FC5926）/ 未执行（#5E5E5E，头部结果词仍是 38% 黑）
// ---------------------------------------------------------------------------
export type RunRecordStatus = "成功" | "失败" | "未执行";
export type RunRecord = {
  id: string;
  // 设计稿只显示时刻（18:01），不显示日期
  time: string;
  status: RunRecordStatus;
  text: string;
  // 未执行不产生耗时，所以是可选的
  duration?: string;
  // 这次执行落在哪个对话、第几条消息：点耗时行右侧的图钉要能跳回去（对话被删则提示该任务已删除）
  conversationId?: number;
  messageIndex?: number;
};

const RUN_DOT_COLOR: Record<RunRecordStatus, string> = {
  成功: "#38E38A",
  失败: "#FC5926",
  未执行: "#5E5E5E",
};
const RUN_LABEL_COLOR: Record<RunRecordStatus, string> = {
  成功: "#38E38A",
  失败: "#FC5926",
  未执行: "rgba(0,0,0,0.38)",
};

// 排期时刻（18:00）→ 首次执行时刻（18:01），与设计稿一致
function runStamp(time: string): string {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(time);
  return matched ? `${matched[1].padStart(2, "0")}:01` : "18:01";
}

// 新建任务时铺一组示例记录：成功 / 未执行 / 失败 / 成功，正文带上一句任务目标，比纯占位更像真跑过
// conversationId：这组记录归属的会话（创建任务的那个对话），图钉定位要用
export function buildRunRecords(prompt: string, time: string, conversationId?: number): RunRecord[] {
  const stamp = runStamp(time);
  const goal = prompt.trim().replace(/\s+/g, " ");
  const summary = goal ? `${goal.slice(0, 56)}${goal.length > 56 ? "…" : ""}` : "按计划执行本任务";
  return [
    { id: "run-1", time: stamp, status: "成功", text: `对齐本次任务目标：${summary}`, duration: "4m59s", conversationId },
    { id: "run-2", time: stamp, status: "未执行", text: "本轮未触发（上一轮任务尚未结束，不计入扣费）", conversationId },
    { id: "run-3", time: stamp, status: "失败", text: "执行失败；你的套餐用量已用完，请升级套餐或等待用量重置", duration: "4m59s", conversationId },
    { id: "run-4", time: stamp, status: "成功", text: "复核输出要点：字段口径、空值与缺省策略、示例一致性，确认无前后理解偏差。", duration: "4m59s", conversationId },
  ];
}

// 「立即执行」补一条成功记录，插到最前面（最新在上）
// conversationId / messageIndex：这次执行落在哪个对话的第几条消息（发送出去的那条），供图钉定位
export function makeRunRecord(prompt: string, conversationId?: number, messageIndex?: number): RunRecord {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const goal = prompt.trim().replace(/\s+/g, " ");
  return {
    id: `run-${now.getTime()}`,
    time,
    status: "成功",
    text: goal ? `按任务要求执行：${goal.slice(0, 56)}${goal.length > 56 ? "…" : ""}` : "按任务要求执行，输出已生成。",
    duration: "4m59s",
    conversationId,
    messageIndex,
  };
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
  // 「就」里挂的附件（与输入框同一套：菜单 → 选择面板 → 附件卡片），随任务保存
  attachments?: ChatAttachment[];
  // 语义匹配出来的图标（icons.kubai.design），随任务一起存下来保证稳定
  icon: AutomationIcon;
  // 运行记录（Figma 9908:45451 右侧「运行记录」Tab），新建时铺一组示例，立即执行会插新的一条
  records?: RunRecord[];
  // 执行方式「每次执行都开启新会话」勾选状态：
  //   勾选 → 每次执行都新开一个对话；不勾 → 执行写回创建本任务的会话（该会话已删除则当次也开新会话）
  newSessionEachRun?: boolean;
  // 创建本任务的会话 id（新建流程里由 AI 承接创建的那个对话），执行结果默认写回这里
  sourceConversationId?: number;
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
] as const;
// 时间选择器两列滚轮（Figma 9988:58658 Time picker）：时 00-23、分 00-59
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
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

// 时间选择器（Figma 9988:58658 Time picker，实例见 9783:70644）：
// 128×256 白底 r8、投影 0 0 8 rgba(0,0,0,.08)；内容左右各 16px，时/分两列各占 48；
// 行高 48、可见 5 行，选中值固定在中间槽位（上下各 1px rgba(0,0,0,.1) 细线），
// 未选中 rgba(0,0,0,.38) Regular，选中 rgba(0,0,0,.88) Medium；左列左对齐、右列右对齐。
const WHEEL_ROW_H = 48;
// 中间槽位上沿：8（内边距）+ 2 行 = 104
const WHEEL_CENTER_TOP = 104;

function TimeWheelColumn({ options, value, onChange, align }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<number | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value;

  // 展开时把当前值滚到中间槽位
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, options.indexOf(valueRef.current)) * WHEEL_ROW_H;
    return () => window.clearTimeout(snapTimer.current);
  }, [options]);

  // Radix Dialog 打开时会在 document 上锁滚动，portal 面板里即使有 overflow 也滚不动。
  // 在列自身上接管 wheel（只绑定一次、卸载时移除），手动滚 scrollTop。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += event.deltaY * step;
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, true);
  }, []);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const index = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ROW_H)));
    if (options[index] !== valueRef.current) onChange(options[index]);
    // 滚动静止后对齐到整行。不用 CSS scroll-snap：滚轮是手动改 scrollTop 的，
    // 强制吸附会把小幅滚动立刻弹回原处，滚轮就转不动了。
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => {
      const node = listRef.current;
      if (!node) return;
      const target = Math.round(node.scrollTop / WHEEL_ROW_H) * WHEEL_ROW_H;
      if (Math.abs(node.scrollTop - target) > 0.5) node.scrollTo({ top: target, behavior: "smooth" });
    }, 160);
  };

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="wheel-scroll h-[256px] min-w-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="h-[104px] shrink-0" aria-hidden />
      {options.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => {
            onChange(option);
            listRef.current?.scrollTo({ top: options.indexOf(option) * WHEEL_ROW_H, behavior: "smooth" });
          }}
          className={`flex h-[48px] w-full shrink-0 cursor-pointer items-center font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] ${align === "right" ? "justify-end" : "justify-start"} ${option === value ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.6)]"}`}
          style={{ fontWeight: option === value ? 500 : 400 }}
        >
          {option}
        </button>
      ))}
      <div className="h-[104px] shrink-0" aria-hidden />
    </div>
  );
}

// 时间 chip：点开双列滚轮（时 / 分），滚动或点选实时回写 HH:mm
// variant="field"：高级设置「指定时间」用的带描边方框（Figma 9904:38056 / 10031:61074），
// 白底 + #E6E6E6 描边 + r4，尺寸随内容（h32 / px8），与左侧日期框同一行同一高度。
function TimeChip({ value, onChange, variant = "chip" }: { value: string; onChange: (value: string) => void; variant?: "chip" | "field" }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const [hour, minute] = value.split(":");
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className={`flex h-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${variant === "field" ? "border border-[#e6e6e6] bg-white hover:border-[#1e63f5]" : "bg-[#f7f7f7] hover:bg-[#e6e6e6]"}`}
      >
        <span className="whitespace-nowrap">{value}</span>
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        className="relative overflow-hidden rounded-[8px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.08)]"
        style={{ width: 128 }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex h-[256px] w-full items-stretch px-[16px]">
          <TimeWheelColumn options={HOUR_OPTIONS} value={hour ?? "00"} onChange={next => onChange(`${next}:${minute ?? "00"}`)} />
          <TimeWheelColumn options={MINUTE_OPTIONS} value={minute ?? "00"} onChange={next => onChange(`${hour ?? "00"}:${next}`)} align="right" />
        </div>
        <div className="pointer-events-none absolute left-[16px] right-[16px] top-[104px] h-px bg-[rgba(0,0,0,0.1)]" />
        <div className="pointer-events-none absolute left-[16px] right-[16px] top-[152px] h-px bg-[rgba(0,0,0,0.1)]" />
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
//   分/小时 → 自定义 每 1 小时（10000:58940，到单位 chip 为止）
//   天    → 自定义 每 1 天 于 18:00（9891:71448）
//   周    → 自定义 每 1 周 于 [周六] 的 18:00（9891:72000）
//   月    → 自定义 每 1 月 于 [1号]  的 18:00（9891:72961）
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
        <span className={muted}>每</span>
        <NumberStepper value={schedule.customInterval} onChange={customInterval => onChange({ customInterval })} />
        <SelectChip
          options={CUSTOM_UNITS}
          value={schedule.customUnit}
          onChange={value => onChange({ customUnit: value as CustomUnit })}
          width={88}
          arrow
        />
        {/* 分 / 小时：Figma 10000:58940 到单位 chip 就结束，不落到具体时刻；
            天 / 周 / 月才继续「于 [星期/日期] 的 18:00」 */}
        {schedule.customUnit !== "分" && schedule.customUnit !== "小时" && <>
          <span className={muted}>于</span>
          {/* 周：追加星期 chip；月：追加日期 chip（31 天列表固定下方、最高 320 可滚动） */}
          {schedule.customUnit === "周" && <SelectChip options={WEEKDAYS} value={schedule.weekday} onChange={weekday => onChange({ weekday })} width={120} />}
          {schedule.customUnit === "月" && <SelectChip options={DAYS} value={schedule.customMonthDay} onChange={customMonthDay => onChange({ customMonthDay })} width={120} forceBelow maxHeight={320} />}
          {tail(schedule.customUnit === "周" || schedule.customUnit === "月")}
        </>}
      </>}
    </>
  );
}

// ============================================================================
// 高级设置（Figma 9783:70644 / 9904:38056 / 9904:38242）
// 结束时间（三选一）+ 执行方式（复选框）+ 时区下拉；弹窗与详情栏共用
// ============================================================================
function AdvancedSettings({ newSession, onNewSessionChange }: {
  // 「每次执行都开启新会话」由外部（弹窗 / 详情栏）持有：弹窗创建时要带上，详情栏编辑时要回写任务
  newSession: boolean;
  onNewSessionChange: (value: boolean) => void;
}) {
  const [endMode, setEndMode] = useState<EndMode>("永不");
  const [endDate, setEndDate] = useState<CalendarDate>({ year: 2025, month: 7, day: 8 });
  const [endDateAnchor, setEndDateAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(endDateAnchor, setEndDateAnchor);
  // 指定时间的时刻（Figma 9904:38056 右侧 18:00 框）：与「当」用同一个时间滚轮
  const [endTime, setEndTime] = useState("18:00");
  const [repeatTimes, setRepeatTimes] = useState<number>(10);
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
              {/* 时刻框：Figma 9904:38056，绝对 x=233（89 + 日期框 136 + 8），同高 32，
                  点开就是「当」那套 24h 双列滚轮 */}
              <div className="absolute left-[233px] top-[25px]">
                <TimeChip value={endTime} onChange={setEndTime} variant="field" />
              </div>
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
          onClick={() => onNewSessionChange(!newSession)}
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
  // newSessionEachRun：高级设置里「每次执行都开启新会话」的勾选结果，随任务保存
  onCreate: (schedule: ScheduleState, prompt: string, attachments: ChatAttachment[], newSessionEachRun: boolean) => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleState>(DEFAULT_SCHEDULE);
  const [prompt, setPrompt] = useState("");
  // 「就」里的 + 与输入框同一套面板：菜单 → 文件选择/云盘面板 → 附件卡片
  const { attachments, addFiles, removeAttachment, clearAttachments } = useDraftAttachments();
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource | null>(null);
  // 高级设置（Figma 9783:70644）：默认收起；勾选项放外层，创建时一并带出
  const [advOpen, setAdvOpen] = useState(false);
  const [newSessionEachRun, setNewSessionEachRun] = useState(false);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setAdvOpen(false);
      setNewSessionEachRun(false);
      setAttachmentSource(null);
      clearAttachments();
    }
  }, [open, clearAttachments]);

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
            <Popover open={attachmentSource !== null} onOpenChange={next => { if (!next) setAttachmentSource(null); }}>
              <PopoverAnchor asChild>
                <div className="relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
                  <div className="flex flex-col gap-[8px] px-[12px] pb-[48px] pt-[12px]">
                    <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
                    <textarea
                      rows={1}
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      placeholder="希望我干什么？"
                      className="block max-h-[132px] min-h-[22px] w-full resize-none overflow-y-auto bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
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

          {advOpen && <AdvancedSettings newSession={newSessionEachRun} onNewSessionChange={setNewSessionEachRun} />}
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
            onClick={() => {
              onCreate(schedule, prompt.trim(), attachments, newSessionEachRun);
              // 附件已带进新会话，预览地址还要继续用，不能回收
              clearAttachments(false);
              onOpenChange(false);
            }}
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
const DETAIL_TABS = ["详情", "运行记录"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

// 详情栏可编辑的字段（草稿）：点「保存」才整体写回任务
type DetailDraft = Pick<AutomationTask, "title" | "prompt" | "schedule" | "attachments" | "newSessionEachRun">;

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
  const { overlay, page, pageStyle, dragging, style: panelStyle, handleProps } = useDetailPanelWidth(panelRef, { contentAware });

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
      {/* 拖拽手柄：3px 宽热区贴着左侧 1px 描边，hover / 拖动时显示一条蓝色指示线（铺满/浮层态没有可拖空间） */}
      {!overlay && !page && (
        <div
          {...handleProps}
          className="group absolute inset-y-0 left-[-3px] z-30 w-[6px] cursor-col-resize touch-none outline-none"
        >
          <span
            aria-hidden
            className={`absolute inset-y-0 left-[2px] w-[2px] rounded-full transition-colors ${dragging ? "bg-[#1e63f5]" : "bg-transparent group-hover:bg-[#99c3ff] group-focus-visible:bg-[#99c3ff]"}`}
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
                    <div className="flex flex-col gap-[8px] px-[12px] pb-[48px] pt-[12px]">
                      <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
                      <textarea
                        rows={1}
                        value={draft.prompt}
                        onChange={event => patchDraft({ prompt: event.target.value })}
                        placeholder="希望我干什么？"
                        className="block max-h-[132px] min-h-[22px] w-full resize-none overflow-y-auto bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
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

// ============================================================================
// 删除自动化任务确认弹窗（Figma 9877:63376）：风险提示
// 480 宽 / 8 圆角；标题行（24 删除图标 + 20/28 Medium「确定删除？」+ 右上关闭）、
// 风险文案左缩进 48 与标题文字对齐、底部右对齐「取消 / 确定」。
// 确认后由上层真正删除任务。
// ============================================================================
export function DeleteTaskDialog({ open, taskTitle, onOpenChange, onConfirm }: {
  open: boolean;
  taskTitle: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex items-center gap-[8px] px-[16px] pt-[24px]">
          <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
          <DialogTitle className="min-w-0 flex-1 truncate text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定删除？
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="关闭删除任务弹窗"
              className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
            >
              <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
            </button>
          </DialogClose>
        </div>
        <p className="px-[16px] pb-0 pl-[48px] pt-[16px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          确定要删除「{taskTitle}」吗？此操作无法撤销。删除后不再自动执行。
        </p>
        <div className="flex items-center justify-end gap-[24px] px-[16px] pb-[16px] pt-[16px]">
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
      </DialogContent>
    </Dialog>
  );
}
