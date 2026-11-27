import type { AutomationTab, AutomationIcon, ScheduleState, RunRecord, CalendarDate } from "./types";
import { AUTOMATION_ICONS, WEEKDAYS } from "./constants";

const pad2 = (value: number) => String(value).padStart(2, "0");

// 排期默认值一律拉系统当前时间：时刻 = 当前 HH:MM，周几 = 今天，几号 = 今天，
// 每年 = 当前月/日。每次打开新建弹窗都重新取，保证预填的是「此刻」而不是写死值。
export function buildDefaultSchedule(now = new Date()): ScheduleState {
  const monthDay = `${now.getDate()}号`;
  return {
    cycle: "每天",
    // JS getDay(): 0=周日…6=周六；WEEKDAYS 以周一开头，故 (day+6)%7
    weekdays: [WEEKDAYS[(now.getDay() + 6) % 7]],
    monthDays: [monthDay],
    yearMonth: now.getMonth() + 1,
    yearDay: monthDay,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    customInterval: 1,
    customUnit: "天",
    customMonthDays: [monthDay],
  };
}

// 结束时间「指定时间」的预填日期 = 今天 + 1 个月（必须落在未来，否则任务一建即过期）。
// 用 Date(year, month+1, day) 让月末自动归一（如 1/31 → 3/3），再取回合法日期。
function buildDefaultEndDate(now = new Date()): CalendarDate {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() };
}

const joinChoices = (values: string[]) => values.join("、");

// 把排期条件压成卡片副标题里的「周期 · 说明」两段文本
export function summarizeSchedule(schedule: ScheduleState): { cycle: string; description: string } {
  const { time } = schedule;
  switch (schedule.cycle) {
    case "仅一次":
      return { cycle: schedule.cycle, description: `${schedule.yearMonth}月${schedule.yearDay} ${time}` };
    case "每周":
      return { cycle: schedule.cycle, description: `${joinChoices(schedule.weekdays)} ${time}` };
    case "每月":
      return { cycle: schedule.cycle, description: `${joinChoices(schedule.monthDays)} ${time}` };
    case "每年":
      return { cycle: schedule.cycle, description: `${schedule.yearMonth}月${schedule.yearDay} ${time}` };
    case "自定义": {
      const every = `每 ${schedule.customInterval} ${schedule.customUnit}`;
      // 分 / 小时只到单位为止（Figma 10000:58940），没有具体时刻
      if (schedule.customUnit === "分" || schedule.customUnit === "小时") return { cycle: schedule.cycle, description: every };
      if (schedule.customUnit === "周") return { cycle: schedule.cycle, description: `${every} ${joinChoices(schedule.weekdays)} ${time}` };
      if (schedule.customUnit === "月") return { cycle: schedule.cycle, description: `${every} ${joinChoices(schedule.customMonthDays)} ${time}` };
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
// 指令始终显示：即便任务名与内容相同（新建弹窗里名字回退成内容）也要带上指令，
// 否则副标题只剩「周二 13:30」、看起来像漏了内容（用户反馈过）。title 参数保留兼容调用方。
export function cardSubtitle(schedule: ScheduleState, prompt: string, status?: AutomationTab, _title?: string): string {
  // 「就」里那段话可能是多行的，压成一行交给 CSS 截断，避免卡片被撑高
  const detail = prompt.trim().replace(/\s+/g, " ");
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
      return `每${joinChoices(schedule.weekdays)} ${time}`;
    case "每月":
      return `每月${joinChoices(schedule.monthDays)} ${time}`;
    case "每年":
      return `每年${schedule.yearMonth}月${schedule.yearDay} ${time}`;
    case "仅一次":
      return `${schedule.yearMonth}月${schedule.yearDay} ${time}`;
    case "自定义": {
      const every = `每 ${schedule.customInterval} ${schedule.customUnit}`;
      if (schedule.customUnit === "分" || schedule.customUnit === "小时") return every;
      if (schedule.customUnit === "周") return `${every}的${joinChoices(schedule.weekdays)} ${time}`;
      if (schedule.customUnit === "月") return `${every}的${joinChoices(schedule.customMonthDays)} ${time}`;
      return `${every} ${time}`;
    }
    default:
      return time;
  }
}

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

// 任务/卡片的图标地址：优先用真实检索到的那个（/api/icon?name=xxx），
// 拿不到时按任务语义退回本地图标，保证任何情况下都有图。
export function taskIconSrc(task: { icon: AutomationIcon | string; iconUrl?: string }): string {
  return task.iconUrl || automationIconSrc(task.icon);
}

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

export { pad2, buildDefaultEndDate, joinChoices, runStamp };
