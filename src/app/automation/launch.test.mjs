import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAutomationLaunch } from "./launch.ts";

const describeSchedule = schedule => {
  if (schedule.cycle === "每天") return `每天 ${schedule.time}`;
  if (schedule.cycle === "每周") return `每${schedule.weekdays.join("、")} ${schedule.time}`;
  if (schedule.cycle === "每月") return `每月${schedule.monthDays.join("、")} ${schedule.time}`;
  if (schedule.cycle === "每年") return `每年${schedule.yearMonth}月${schedule.yearDay} ${schedule.time}`;
  return schedule.time;
};

const baseSchedule = {
  cycle: "每天",
  weekdays: ["周三"],
  monthDays: ["3号"],
  yearMonth: 11,
  yearDay: "26号",
  time: "09:00",
  customInterval: 1,
  customUnit: "天",
  customMonthDays: ["3号"],
};

test("keeps user-supplied goal and title in the seed", () => {
  const launch = buildAutomationLaunch({
    schedule: { ...baseSchedule },
    prompt: "汇总未读邮件",
    title: "邮件汇总",
    goal: "  汇总未读邮件  ",
    newSessionEachRun: false,
  }, describeSchedule);

  assert.equal(launch.goal, "汇总未读邮件");
  assert.equal(launch.title, "邮件汇总");
  assert.equal(launch.seed.title, "邮件汇总");
  assert.equal(launch.seed.goal, "汇总未读邮件");
  assert.equal(launch.seed.cycle, "每天");
  assert.equal(launch.seed.time, "09:00");
  assert.deepEqual(launch.seed.weekdays, []);
  assert.deepEqual(launch.seed.monthDays, []);
  assert.match(launch.instruction, /帮我创建一个自动化任务「邮件汇总」：每天 09:00 自动执行，内容是汇总未读邮件。/);
  assert.equal(launch.conversationTitle, "邮件汇总");
  assert.equal("attachments" in launch.meta, false);
});

test("does not invent a title when the user did not provide one", () => {
  const launch = buildAutomationLaunch({
    schedule: { ...baseSchedule },
    prompt: "每天汇总未读邮件",
    newSessionEachRun: true,
  }, describeSchedule);
  assert.equal(launch.title, "汇总未读邮件");
  assert.equal(launch.seed.title, "汇总未读邮件");
  assert.equal(launch.meta.newSessionEachRun, true);
});

test("keeps schedule fields only for the matching cycle", () => {
  const weekly = buildAutomationLaunch({
    schedule: { ...baseSchedule, cycle: "每周", time: "18:30" },
    prompt: "汇总周报",
    newSessionEachRun: false,
  }, describeSchedule);
  assert.deepEqual(weekly.seed.weekdays, ["周三"]);
  assert.deepEqual(weekly.seed.monthDays, []);

  const monthly = buildAutomationLaunch({
    schedule: { ...baseSchedule, cycle: "每月" },
    prompt: "汇总月报",
    newSessionEachRun: false,
  }, describeSchedule);
  assert.deepEqual(monthly.seed.weekdays, []);
  assert.deepEqual(monthly.seed.monthDays, ["3号"]);

  const yearly = buildAutomationLaunch({
    schedule: { ...baseSchedule, cycle: "每年" },
    prompt: "年度总结",
    newSessionEachRun: false,
  }, describeSchedule);
  assert.deepEqual(yearly.seed.monthDays, ["26号"]);
});

test("strips trailing punctuation only from the instruction, not from the stored goal", () => {
  const launch = buildAutomationLaunch({
    schedule: { ...baseSchedule },
    prompt: "汇总未读邮件。",
    newSessionEachRun: false,
  }, describeSchedule);
  assert.equal(launch.goal, "汇总未读邮件。");
  assert.equal(launch.seed.goal, "汇总未读邮件。");
  assert.ok(!launch.instruction.includes("。。"));
});

test("does not invent values when the user left fields empty", () => {
  const launch = buildAutomationLaunch({
    schedule: { ...baseSchedule },
    prompt: "",
    newSessionEachRun: false,
  }, describeSchedule);
  assert.equal(launch.goal, "");
  assert.equal(launch.title, "");
  assert.equal("title" in launch.seed, false);
  assert.equal(launch.seed.goal, "");
  assert.deepEqual(launch.seed.weekdays, []);
  assert.deepEqual(launch.seed.monthDays, []);
  assert.equal(launch.conversationTitle, "");
});

test("passes attachments through to meta without rewriting them", () => {
  const attachments = [{ id: "a1", name: "x.pdf", status: "ready" }];
  const launch = buildAutomationLaunch({
    schedule: { ...baseSchedule },
    prompt: "汇总附件",
    attachments,
    newSessionEachRun: false,
  }, describeSchedule);
  assert.equal(launch.meta.attachments, attachments);
});
