import type { AutomationTask, RunRecordStatus } from "./types";

const AUTOMATION_TABS = ["已启用", "已暂停", "已结束"] as const;

const CYCLES = ["仅一次", "每天", "每周", "每月", "每年", "自定义"] as const;
type Cycle = (typeof CYCLES)[number];
// 需要在选项「后面」渲染 #F2F2F2 分隔线的周期项（左右缩进 8px）
const CYCLE_DIVIDERS: readonly string[] = ["仅一次", "每年"];

const CUSTOM_UNITS = ["分", "小时", "天", "周", "月"] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number];

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

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

// 列表初始为空：不预置示例任务，用户新建后才出现卡片（空态见 AutomationEmpty）。
export const INITIAL_TASKS: AutomationTask[] = [];

// 「更多」下拉菜单项（Figma 9625:49728 DropdownMenu #9709:63275）
export const TASK_OPERATIONS = [
  { label: "编辑", icon: "automation-menu-edit.svg" },
  { label: "立即执行", icon: "automation-menu-refresh.svg" },
  { label: "执行记录", icon: "automation-menu-time.svg" },
  { label: "删除", icon: "automation-menu-delete.svg" },
] as const;

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

const WHEEL_ROW_H = 48;
// 中间槽位上沿：8（内边距）+ 2 行 = 104
const WHEEL_CENTER_TOP = 104;

const DETAIL_TABS = ["详情", "运行记录"] as const;

export { AUTOMATION_TABS, CYCLES, CYCLE_DIVIDERS, CUSTOM_UNITS, WEEKDAYS, RUN_DOT_COLOR, RUN_LABEL_COLOR, END_MODES, TIMEZONES, HOUR_OPTIONS, MINUTE_OPTIONS, DAYS, WHEEL_ROW_H, WHEEL_CENTER_TOP, DETAIL_TABS };
