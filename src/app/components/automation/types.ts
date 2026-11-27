import type { ChatAttachment } from "../attachment-tray";
import { AUTOMATION_ICONS, AUTOMATION_TABS, CYCLES, CUSTOM_UNITS, DETAIL_TABS, END_MODES } from "./constants";

type AutomationTab = (typeof AUTOMATION_TABS)[number];

export type AutomationCardStatus = AutomationTab | "已删除";

type Cycle = (typeof CYCLES)[number];

type CustomUnit = (typeof CUSTOM_UNITS)[number];

// 周几 / 日期都是多选：chip 里选一个或多个，卡片副标题与会话文案按「、」拼起来。
// 每周与「自定义·周」共用 weekdays；每月用 monthDays；「自定义·月」单独一份 customMonthDays。
export type ScheduleState = {
  cycle: Cycle;
  weekdays: string[];
  monthDays: string[];
  yearMonth: number;
  yearDay: string;
  time: string;
  customInterval: number;
  customUnit: CustomUnit;
  customMonthDays: string[];
};

export type AutomationIcon = keyof typeof AUTOMATION_ICONS;

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
  // 真实检索到的图标（AI 给关键词 → 服务端到 icons.kubai.design 搜到的那个），
  // 有就用它；没有（站点不可达 / 没搜到）才退回 icon 对应的本地图标
  iconUrl?: string;
  // 运行记录（Figma 9908:45451 右侧「运行记录」Tab），新建时铺一组示例，立即执行会插新的一条
  records?: RunRecord[];
  // 执行方式「每次执行都开启新会话」勾选状态：
  //   勾选 → 每次执行都新开一个对话；不勾 → 执行写回创建本任务的会话（该会话已删除则当次也开新会话）
  newSessionEachRun?: boolean;
  // 创建本任务的会话 id（新建流程里由 AI 承接创建的那个对话），执行结果默认写回这里
  sourceConversationId?: number;
};

type EndMode = (typeof END_MODES)[number];

export type CalendarDate = { year: number; month: number; day: number };

type DetailTab = (typeof DETAIL_TABS)[number];

// 详情栏可编辑的字段（草稿）：点「保存」才整体写回任务
type DetailDraft = Pick<AutomationTask, "title" | "prompt" | "schedule" | "attachments" | "newSessionEachRun">;

export type { AutomationTab, Cycle, CustomUnit, EndMode, DetailTab, DetailDraft };
