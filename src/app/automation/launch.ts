import type { ChatAttachment } from "../components/attachment-tray";
import type { ScheduleState } from "../components/automation-view";
import { condenseAutomationTitle } from "../automation-title.ts";

// 「新建自动化任务」弹窗点创建时生成的请求参数。纯函数：不碰 UI 状态，也不发请求。
// 用户填的 goal / title / 排期字段原样进入 seed；这里只做已有的收敛规则，不补默认值。
export type AutomationLaunchInput = {
  schedule: ScheduleState;
  prompt: string;
  attachments?: ChatAttachment[];
  newSessionEachRun: boolean;
  title?: string;
  goal?: string;
};

export type AutomationLaunch = {
  instruction: string;
  conversationTitle: string;
  goal: string;
  title: string;
  seed: { title?: string; goal: string; cycle?: string; time: string; weekdays: string[]; monthDays: string[] };
  meta: { title: string; goal: string; schedule: ScheduleState; newSessionEachRun: boolean; attachments?: ChatAttachment[] };
};

export function buildAutomationLaunch(
  input: AutomationLaunchInput,
  describeSchedule: (schedule: ScheduleState) => string,
): AutomationLaunch {
  const { schedule, prompt, attachments, newSessionEachRun } = input;
  const goal = input.goal?.trim() || prompt;
  const title = input.title?.trim()
    ? condenseAutomationTitle(input.title, goal)
    : condenseAutomationTitle(goal);
  const when = describeSchedule(schedule);
  const goalForMessage = goal.replace(/[。！？；，,.\s]+$/, "");
  const instruction = title
    ? `帮我创建一个自动化任务「${title}」：${when} 自动执行，内容是${goalForMessage}。`
    : `帮我创建一个自动化任务：${when} 自动执行，内容是${goalForMessage}。`;

  return {
    instruction,
    conversationTitle: title || goal.slice(0, 20),
    goal,
    title,
    seed: {
      ...(title ? { title } : {}),
      goal,
      cycle: schedule.cycle,
      time: schedule.time,
      weekdays: schedule.cycle === "每周" ? schedule.weekdays : [],
      monthDays: schedule.cycle === "每月" ? schedule.monthDays : schedule.cycle === "每年" ? [schedule.yearDay] : [],
    },
    meta: { title, goal, schedule, newSessionEachRun, ...(attachments?.length ? { attachments } : {}) },
  };
}
