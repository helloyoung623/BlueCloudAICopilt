// 可控 mock 浏览器回归。运行：pnpm test:browser
// 复用本机 Chrome + puppeteer-core；默认自行生产构建并起本地静态服务，
// 同时由同一服务提供 /api/chat 的可控 SSE（res.write 分批下发），
// 全程离线、不访问真实模型、不改产品代码。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import puppeteer from "puppeteer-core";
import {
  chatText,
  clickAria,
  clickSidebarTask,
  clickText,
  hasVisibleActions,
  hasVisibleButton,
  makeFixtureFiles,
  resolveChrome,
  sendMessage,
  sleep,
  startApp,
  typeVisible,
  waitForIdle,
  waitForPause,
  waitForText,
  waitForActions,
  waitForCalls,
  withPage,
} from "./harness.mjs";

const TITLE = "汇总未读邮件";
const OTHER_TITLE = "另一个会话B";
const STREAM_PROMPT = "慢速生成测试A";
const CHUNK_1 = "第一段：已读取 3 封未读邮件";
const CHUNK_2 = "第二段：正在汇总要点";
const RUNNING_TEXT = "读取邮箱里的未读邮件";
// 执行过程结束（含暂停）后，界面会把「正在…」改写成「已…」，断言用不受前缀影响的片段。
const RUNNING_SUMMARY = `正在${RUNNING_TEXT}`;
const LATE_CHUNK = "暂停后不应出现的追加内容";
// 自动化创建这一轮收到的一段正文
const AUTOMATION_BODY = "已收到，正在创建自动化任务";
// 旧轮次迟到送来的正文：不该出现在会话里
const LATE_OLD_TEXT = "旧轮次迟到的正文";

let app;
let browser;

before(async () => {
  app = await startApp({ probe: true });
  browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: "new",
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
  await app?.close();
});

async function createAutomation(page, mock, options = {}) {
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  assert.ok(await clickText(page, "新建"), "应能打开新建自动化任务弹窗");
  await page.waitForSelector('textarea[placeholder="希望我干什么？"]', { timeout: 8000 });
  await page.type('textarea[placeholder="希望我干什么？"]', `每天早上${TITLE}`);
  if (options.newSession) {
    assert.ok(await clickText(page, "高级设置"), "应能展开高级设置");
    await page.waitForSelector('button[role="checkbox"]', { timeout: 8000 });
    assert.ok(await page.evaluate(() => {
      const box = [...document.querySelectorAll('button[role="checkbox"]')].find(
        item => (item.textContent || "").includes("每次执行都开启新会话"),
      );
      if (!box) return false;
      box.click();
      return true;
    }), "应能勾选每次执行都开启新会话");
  }
  assert.ok(await clickText(page, "创建"), "应能提交创建");
  await page.waitForFunction(() => !!document.querySelector("[data-automation-card]"), { timeout: 15000 });
  await sleep(500);
  assert.ok(mock.calls.length >= 1, "创建走真实会话请求，且被 mock 接管");
  assert.ok(mock.calls[0].automationSeed, "弹窗条件应以 seed 传给会话");
}

async function openAutomationCardPage(page) {
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  await waitForText(page, "已暂停", 8000);
}

// 只在点击期间截获指定延迟的 setTimeout：让 80ms / 0ms 的延迟发送可以按用例控制触发时机，
// 从而稳定复现「定时器还没触发时用户已切换/删除会话」的竞态。
async function armTimerCapture(page, delay) {
  await page.evaluate((ms) => {
    const original = window.setTimeout.bind(window);
    window.__capturedTimers = [];
    window.__captureDelay = ms;
    window.setTimeout = (callback, nextDelay, ...rest) => {
      if (window.__captureDelay === ms && nextDelay === ms) {
        window.__capturedTimers.push(callback);
        return -1;
      }
      return original(callback, nextDelay, ...rest);
    };
  }, delay);
}

async function disarmTimerCapture(page, expected = 1) {
  const count = await page.evaluate(() => {
    window.__captureDelay = null;
    return (window.__capturedTimers ?? []).length;
  });
  assert.equal(count, expected, `应捕获 ${expected} 次目标定时器，实际 ${count}`);
}

async function fireCapturedTimers(page) {
  return page.evaluate(() => {
    const timers = window.__capturedTimers ?? [];
    timers.forEach(callback => callback());
    return timers.length;
  });
}

// 在点击的同一个 JS 任务里立刻触发指定延迟的定时器：用来稳定复现「React 还没提交
// 新建会话/切换状态，延迟发送就到了」的场景，而不是靠真实等待 80ms 碰运气。
async function clickMenuItemWithImmediateTimer(page, label, delay) {
  return page.evaluate(({ needle, ms }) => {
    const original = window.setTimeout.bind(window);
    let armed = false;
    let fired = 0;
    window.setTimeout = (callback, nextDelay, ...rest) => {
      if (armed && nextDelay === ms) {
        fired += 1;
        callback();
        return -1;
      }
      return original(callback, nextDelay, ...rest);
    };
    const button = [...document.querySelectorAll("button,[role=button]")].find(
      item => (item.textContent || "").trim() === needle,
    );
    if (!button) {
      window.setTimeout = original;
      return -1;
    }
    armed = true;
    try { button.click(); } finally { armed = false; window.setTimeout = original; }
    return fired;
  }, { needle: label, ms: delay });
}

async function openAutomationMore(page, title) {
  return page.evaluate((needle) => {
    const button = [...document.querySelectorAll("button")].find((item) => {
      const aria = item.getAttribute("aria-label") || "";
      return aria.includes("更多操作") && aria.includes(needle);
    });
    if (!button) return false;
    button.click();
    return true;
  }, title);
}

function clickMenuItem(page, label) {
  return page.evaluate((needle) => {
    const button = [...document.querySelectorAll("button,[role=button]")].find(
      (item) => (item.textContent || "").trim() === needle,
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
}

function clickRetryButton(page) {
  return page.evaluate(() => {
    const button = document.querySelector('button[aria-label="发送失败，点击重试"]');
    if (!button) return false;
    button.click();
    return true;
  });
}

test("生成中切换会话再返回：流式内容落在原会话，新会话不串台也不重复请求", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold();
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();

    // 执行过程阶段：侧栏「AI 执行中」与暂停入口同时存在
    await waitForPause(page);
    assert.ok(
      await page.evaluate(() => !!document.querySelector('span[aria-label="AI 执行中"]')),
      "原会话侧栏应显示执行中",
    );

    // 切换前：第一段正文必须真的渲染出来，而不是只在连接里
    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);
    // 正文还在流，这一轮就属于生成中：暂停入口必须还在，不能变回发送。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文流式输出阶段仍应能暂停");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "正文还在生成，不应出现发送按钮");

    assert.ok(await clickText(page, "新任务"), "生成中应能切到新任务");
    await waitForText(page, "试试这些", 8000);
    const home = await chatText(page);
    assert.ok(!home.includes(CHUNK_1), "新任务不应出现原会话的流式正文");
    assert.ok(!home.includes(STREAM_PROMPT), "新任务不应混入原会话消息");
    // 状态按会话隔离：后台会话还在生成，也不能把它的暂停按钮带到当前会话。
    assert.ok(!(await hasVisibleButton(page, "暂停生成")), "后台会话的暂停按钮不应带到当前会话");
    assert.ok(await hasVisibleButton(page, "发送消息"), "当前会话应照常能发送新消息");

    // 切走期间由测试显式下发第二段：连接仍在，内容只能回到原会话。
    assert.equal(session.delta(CHUNK_2), true, "切走后连接应仍可继续下发");
    await sleep(600);
    const stillHome = await chatText(page);
    assert.ok(!stillHome.includes(CHUNK_2), "第二段不应串到当前正在看的新任务");

    assert.ok(await clickSidebarTask(page, STREAM_PROMPT), "应能从侧栏切回原会话");
    await waitForText(page, CHUNK_2, 10000);
    const chat = await chatText(page);
    assert.ok(
      chat.includes(CHUNK_1) && chat.includes(CHUNK_2),
      `两段内容都应落在原会话，实际=${JSON.stringify(chat.slice(0, 240))}`,
    );
    assert.ok(!chat.includes("已收到："), "原会话不应混入其他请求的回答");
    assert.equal(mock.calls.length, 1, "切换会话不应重复发起请求");
    // 切回来后那一轮仍在生成中：暂停入口跟着会话回来。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "切回原会话后仍应能暂停那一轮");

    assert.equal(session.finish(), true, "应能正常收尾这次回答");
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"), "正文结束后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("后台会话完成后侧栏显示未读，打开该会话即清除", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold();
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.ok(await clickText(page, "新任务"), "生成中切到新任务");
    await waitForText(page, "试试这些", 8000);

    // 切走期间让原会话正常完成：正文落到后台会话，侧栏应从未读图标提示。
    assert.equal(session.beginAnswer(CHUNK_1), true);
    assert.equal(session.finish(), true);
    await page.waitForFunction(
      () => [...document.querySelectorAll('img[aria-label="未查看"]')].length > 0,
      { timeout: 10000 },
    );

    assert.ok(await clickSidebarTask(page, STREAM_PROMPT), "从侧栏打开后台会话");
    await waitForText(page, CHUNK_1, 8000);
    await page.waitForFunction(
      () => [...document.querySelectorAll('img[aria-label="未查看"]')].length === 0,
      { timeout: 10000 },
    );
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 产品现状：暂停入口（以及侧栏「AI 执行中」）覆盖「请求开始 → 正文结束」整段，
// 思考、工具执行、正文流式输出三个阶段都能停。
// 思考阶段停：执行摘要已显示 → 连接关闭 → 后续 chunk 写不进、旧内容不被追加 → 新消息可发送。
test("暂停生成（思考阶段）：连接关闭且显示已停止生成，随后可继续发送", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "先暂停这条"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 暂停前：确认页面上已经出现这一段执行输出，而不是空转。
    await waitForText(page, RUNNING_SUMMARY, 10000);

    assert.ok(await clickAria(page, "暂停生成"), "执行过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.open, false, "连接关闭后会话不应还可写");

    // 连接已关闭：后续 chunk 必须写不进去，而不是悄悄丢给浏览器。
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await sleep(600);
    const chat = await chatText(page);
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加到这段输出");
    assert.ok(chat.includes("已停止生成"), "被中断的执行过程应显示「已停止生成」");
    assert.ok(!chat.includes("任务已完成"), "被中断的执行过程不能显示「任务已完成」");
    assert.ok(!chat.includes("（模型未返回内容）"), "暂停不应伪造一条空回答");
    assert.ok(await hasVisibleButton(page, "发送消息"), "暂停后发送按钮应恢复");

    // 收尾后执行过程收进「已停止生成 〉」；展开确认暂停前显示的内容没有被清掉。
    assert.ok(await clickText(page, "已停止生成"), "应能展开已停止的执行过程");
    await waitForText(page, RUNNING_TEXT, 8000);
    assert.ok(!(await chatText(page)).includes(LATE_CHUNK), "展开后也不应出现暂停后的追加内容");
    assert.equal(mock.calls.length, 1, "暂停本身不应触发重试请求");

    mock.normal();
    const before = mock.calls.length;
    assert.ok(await sendMessage(page, "暂停后继续发送"));
    await waitForText(page, "已收到：暂停后继续发送", 10000);
    assert.equal(mock.calls.length, before + 1, "继续发送应新增一次请求");
    assert.equal(mock.calls.at(-1).userText, "暂停后继续发送", "请求内容应为新消息");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 正文阶段停：已经收到第一段正文才按暂停 → 连接关闭 → 正文保留、后续不再追加 → 可继续发送。
test("暂停生成（正文阶段）：已收到的正文保留、后续不再追加、可以继续发送", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "正文里停一下"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);
    // 正文还在流，这一轮就属于生成中：暂停入口必须还在。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文流式输出阶段仍应能暂停");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "正文还在生成，不应出现发送按钮");

    assert.ok(await clickAria(page, "暂停生成"), "正文阶段应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.open, false, "连接关闭后会话不应还可写");
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await sleep(600);
    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_1), "暂停前已收到的正文要保留");
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加");
    assert.ok(chat.includes("已停止生成"), "被中断的这一轮应显示「已停止生成」");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");
    assert.ok(!chat.includes("（模型未返回内容）"), "暂停不应伪造一条空回答");

    // 暂停后可以继续发新消息，上一轮的内容不会被冲掉。
    mock.normal();
    const before = mock.calls.length;
    assert.ok(await sendMessage(page, "暂停后继续发送"));
    await waitForText(page, "已收到：暂停后继续发送", 10000);
    assert.equal(mock.calls.length, before + 1, "继续发送应新增一次请求");
    const after = await chatText(page);
    assert.ok(after.includes(CHUNK_1), "新一轮不应冲掉上一轮已收到的正文");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 正文正常结束：answer.end 一到就恢复发送按钮，不因为推荐追问还在生成就一直是暂停。
test("正文正常结束：answer.end 后恢复发送按钮，不显示已停止生成", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "正常跑完"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文阶段仍在生成中");

    assert.equal(session.finish(), true, "应能正常收尾这次回答");
    await waitForIdle(page);
    await sleep(400);
    assert.ok(await hasVisibleButton(page, "发送消息"), "正文结束后应恢复发送按钮");
    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_1), "完整正文应保留");
    assert.ok(!chat.includes("已停止生成"), "正常结束不应显示已停止生成");
    assert.ok(chat.includes("任务已完成"), "正常结束的执行过程应显示任务已完成");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 请求真的失败：走既有的失败提示，不与主动停止混淆。
test("请求失败：按失败处理并保留失败提示，不与主动停止混淆", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "这条会失败"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 服务端直接掐断连接：客户端应当按「请求失败」处理。
    assert.equal(session.cancel(), true, "应能掐断这次请求");
    await waitForIdle(page);
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label="发送失败，点击重试"]'),
      { timeout: 8000 },
    );
    const chat = await chatText(page);
    assert.ok(!chat.includes("已停止生成"), "请求失败不是主动停止，不应显示已停止生成");
    assert.ok(await hasVisibleButton(page, "发送消息"), "失败后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 从「新建自动化任务」弹窗发起一轮真实会话：
// 条件以 seed 传给服务端，自动化卡片要等 run.end 兜底生成（正文先到、卡片后到）。
// 这一轮里回答会挂上 automationPending，卡片不到就一直等。
async function startAutomationCreation(page, mock) {
  mock.hold();
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  assert.ok(await clickText(page, "新建"), "应能打开新建自动化任务弹窗");
  await page.waitForSelector('textarea[placeholder="希望我干什么？"]', { timeout: 8000 });
  await page.type('textarea[placeholder="希望我干什么？"]', `每天早上${TITLE}`);
  assert.ok(await clickText(page, "创建"), "应能提交创建");
  const session = await mock.waitForSession();
  assert.ok(session.body.automationSeed, "弹窗条件应以 seed 传给会话");
  await waitForPause(page);
  return session;
}

// 停止自动化创建：这一轮的卡片不会再兑现，等待标记必须清掉，
// 否则回答永远停在「等卡片」状态，操作项也一直不出现。
// 已经建出来的任务要保留，没建出来的不能伪造成功。
test("停止自动化创建：清掉不会兑现的卡片等待，正文保留、操作项恢复", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const session = await startAutomationCreation(page, mock);

    // 创建过程中先收到一部分正文
    assert.equal(session.beginAnswer(AUTOMATION_BODY), true, "应能显式开始正文");
    await waitForText(page, AUTOMATION_BODY, 10000);
    // 卡片还没到：回答此刻在等卡片，操作项先不出现
    assert.ok(!(await hasVisibleActions(page)), "卡片还没到时操作项应先压住");

    // 用户在这一轮里点了暂停
    assert.ok(await clickAria(page, "暂停生成"), "创建过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await waitForActions(page);
    const chat = await chatText(page);
    assert.ok(chat.includes(AUTOMATION_BODY), "暂停前已收到的正文要保留");
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");
    // 没建出来的任务不能伪造成功：这一轮只收到了正文，没有工具创建任务。
    assert.equal(
      await page.$$eval("[data-automation-card]", (cards) => cards.length),
      0,
      "没建出来的自动化任务不应出现卡片",
    );
    // 操作项恢复：不能永远停在「等卡片」状态。
    assert.ok(await hasVisibleActions(page), "回答下方的操作项应恢复");
    assert.ok(await hasVisibleButton(page, "发送消息"), "暂停后发送按钮应恢复");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 任务已经真的建出来、正文还没开始（answer.start 没到）时停止：
// 这一轮没有正文消息，卡片只在等待缓存里。清缓存时不能把卡片一起丢掉 ——
// 已创建的任务和会话里的卡片都要保留；没有正文就不编造正文。
test("停止自动化创建（任务已建出、正文还没开始）：任务与卡片都保留", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold();
    assert.ok(await sendMessage(page, "建一个整理本周竞品动态的任务"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 模型真的调了 create_automation 并建出任务，但正文还没开始
    assert.equal(session.createAutomationTask(), true, "应能模拟工具创建成功");
    await waitForText(page, "创建自动化任务", 10000);
    await sleep(400);

    assert.ok(await clickAria(page, "暂停生成"), "创建过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    await waitForIdle(page);

    // 会话卡片要保留：任务是真的建出来了
    await page.waitForFunction(() => !!document.querySelector("[data-automation-card]"), { timeout: 8000 });
    const card = await page.$eval("[data-automation-card]", (el) => ({
      status: el.dataset.automationStatus,
      title: el.querySelector(".ac-title")?.textContent?.trim() ?? "",
    }));
    assert.ok(
      card.title.includes("整理本周竞品动态"),
      `会话卡片标题应来自建出来的任务，实际=${card.title}`,
    );
    assert.equal(card.status, "已启用", "建出来的任务仍是启用状态");
    // 没有正文就不该出现占位回答：不伪造正文，也不伪造任务成功。
    const chat = await chatText(page);
    assert.ok(!chat.includes("（模型未返回内容）"), "没有正文就不该出现占位回答");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");

    // 任务列表里也保留
    assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
    await waitForText(page, "整理本周竞品动态", 8000);
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 连接先断了（EOF），但这一轮只写了一半正文：不能当成功，按既有失败处理。
test("非完整 SSE 结束：正文没写完就断开，按失败处理不当成成功", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "半截就断"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);

    // 服务端没发 answer.end 就把连接关了
    assert.equal(session.endStream(), true, "应能直接结束连接");
    await waitForIdle(page);
    await waitForText(page, "模型调用失败", 8000);
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label="发送失败，点击重试"]'),
      { timeout: 8000 },
    );
    const chat = await chatText(page);
    assert.ok(!chat.includes("已停止生成"), "异常结束不是用户主动停止，不应显示已停止生成");
    assert.ok(!chat.includes("任务已完成"), "没写完的回答不能显示任务已完成");
    assert.ok(await hasVisibleButton(page, "发送消息"), "异常结束后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 连接先断了（EOF），但正文已经写完（answer.end 已到）：正文是真的，
// 收尾即可，不当失败，也不能让生成状态停在「生成中」。
// 这一轮用「从弹窗发起创建」来跑：回答本来在等卡片，连接断了就必须收尾，
// 不能永远停在「等卡片」状态。
test("非完整 SSE 结束：正文写完但追问没来，正文保留、不按失败处理", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const session = await startAutomationCreation(page, mock);

    assert.equal(session.beginAnswer(AUTOMATION_BODY), true, "应能显式开始正文");
    await waitForText(page, AUTOMATION_BODY, 10000);

    // answer.end 到了，推荐追问没来，连接直接关掉
    assert.equal(session.endAfterAnswer(), true, "应能在正文结束后直接关掉连接");
    await waitForIdle(page);
    await waitForActions(page);
    const chat = await chatText(page);
    assert.ok(chat.includes(AUTOMATION_BODY), "已经写完的正文要保留");
    assert.ok(!(await hasVisibleButton(page, "发送失败，点击重试")), "正文完成了就不该按失败处理");
    assert.ok(await hasVisibleActions(page), "回答下方的操作项应恢复，不能一直等卡片");
    assert.equal(
      await page.$$eval("[data-automation-card]", (cards) => cards.length),
      0,
      "没建出来的自动化任务不应出现卡片",
    );
    assert.ok(await hasVisibleButton(page, "发送消息"), "发送按钮应恢复");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// answer.end 单独到达（run.end 还没来）：发送按钮立刻恢复。
// 此时再次发送，旧轮次迟到的 run.end 不能改到新一轮。
test("answer.end 单独到达：发送按钮立即恢复，旧轮次迟到事件不影响新一轮", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "第一轮只发正文"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);

    // 只发 answer.end，连接保持打开（推荐追问还在服务端生成）
    assert.equal(session.answerEnd(), true, "应能只发 answer.end");
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"), "answer.end 后应立即恢复发送按钮");
    assert.ok(!(await hasVisibleButton(page, "暂停生成")), "run.end 还没到，不该继续显示暂停");
    assert.equal(session.open, true, "answer.end 之后连接应保持打开");

    // 此时再次发送：新一轮开始，旧连接还开着
    assert.ok(await sendMessage(page, "第二轮"));
    const second = await waitForCalls(mock, 2);
    assert.notEqual(second.index, session.index, "第二轮应是另一个请求");
    // 上一轮正文已经说完了（answer.end 到了，只是 run.end 没到）：
    // 新的请求必须带上这段 assistant 正文，模型才看得见自己上一轮说了什么。
    const secondCall = mock.calls[1];
    assert.deepEqual(
      secondCall.body.messages.map((m) => m.role),
      ["user", "assistant", "user"],
      "第二轮请求应带上上一轮已完成的 assistant 正文",
    );
    const assistantTurn = secondCall.body.messages.find((m) => m.role === "assistant");
    assert.ok(
      assistantTurn && assistantTurn.content.includes(CHUNK_1),
      `请求里的 assistant 正文应是上一轮的回答，实际=${JSON.stringify(assistantTurn?.content ?? "")}`,
    );
    await waitForPause(page);
    assert.ok(await hasVisibleButton(page, "暂停生成"), "新一轮应在生成中");

    // 旧轮次迟到的事件：服务端这时才把 run.end 送来
    assert.equal(session.open, true, "旧连接此时仍应是打开的");
    assert.equal(session.runEnd({ text: LATE_OLD_TEXT }), true, "旧轮次的迟到 run.end 应能送达");
    await sleep(800);

    const chat = await chatText(page);
    assert.ok(!chat.includes(LATE_OLD_TEXT), "旧轮次迟到的结束事件不能改到新一轮");
    assert.ok(chat.includes(CHUNK_1), "上一轮已收到的正文仍在");
    assert.ok(await hasVisibleButton(page, "暂停生成"), "新一轮仍在生成中，不该被旧轮次的事件带偏");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "新一轮生成中不该出现发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("answer.end 后开新一轮：旧连接仍可追踪，暂停时两条连接一起关闭", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "第一轮只发正文"));
    const first = await mock.waitForSession();
    await waitForPause(page);
    assert.equal(first.beginAnswer(CHUNK_1), true);
    await waitForText(page, CHUNK_1, 10000);
    assert.equal(first.answerEnd(), true, "第一轮正文结束但连接仍开着");
    await waitForIdle(page);

    assert.ok(await sendMessage(page, "第二轮"));
    await waitForCalls(mock, 2);
    const second = mock.sessions[1];
    assert.ok(second, "第二轮应另开一条请求");
    await waitForPause(page);
    assert.equal(first.open, true, "暂停前旧连接还没自己结束");

    assert.ok(await clickAria(page, "暂停生成"), "新一轮应能暂停");
    assert.equal(await first.waitForClientClose(10000), true, "暂停应一并关闭 answer.end 后仍开着的旧连接");
    assert.equal(await second.waitForClientClose(10000), true, "暂停应关闭当前连接");
    assert.equal(first.open, false);
    assert.equal(second.open, false);

    assert.equal(first.delta(LATE_OLD_TEXT), false, "旧连接关闭后不能再写入内容");
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"), "停止后发送按钮恢复");
    assert.ok(!(await chatText(page)).includes(LATE_OLD_TEXT), "旧连接的迟到内容不应落地");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("删除正在生成的会话：连接被中断，迟到的正文不会重建会话", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();
    await waitForPause(page);
    assert.equal(session.beginAnswer(CHUNK_1), true);
    await waitForText(page, CHUNK_1, 10000);

    // 「…」只在任务行 hover 时渲染，先把鼠标移到这条任务上。
    const row = await page.evaluateHandle(needle => {
      const leaf = [...document.querySelectorAll("*")].find(
        node => node.children.length === 0 && (node.textContent || "").trim() === needle,
      );
      return (leaf?.closest('[role="button"]') || leaf) ?? null;
    }, STREAM_PROMPT);
    assert.ok(row.asElement(), "应能找到侧栏里的这条任务");
    await row.asElement().hover();
    await sleep(200);
    assert.ok(await clickAria(page, "任务更多操作"), "应能打开当前任务的操作菜单");
    assert.ok(await clickText(page, "删除"), "应能点删除任务");
    await waitForText(page, "确定删除此任务？", 8000);
    assert.ok(await clickText(page, "确定"), "应能确认删除");
    assert.equal(await session.waitForClientClose(10000), true, "删除后服务端应看到连接关闭");
    assert.equal(session.open, false);
    assert.equal(session.write(`data: ${JSON.stringify({ type: "message.delta", data: { text: LATE_CHUNK } })}\n\n`), false);

    await waitForText(page, "试试这些", 8000);
    const home = await chatText(page);
    assert.ok(!home.includes(CHUNK_1), "删除后不应还看得到原会话内容");
    assert.ok(!home.includes(LATE_CHUNK), "删除后的迟到事件不应重建会话");
    assert.ok(!(await hasVisibleButton(page, "暂停生成")), "删除后不应残留生成中状态");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 删除带未读的会话：只回收它自己的未读，其他会话的未读/任务行必须原样保留。
// 内存里的 unread/thinking/推荐 key 是否被清掉，DOM 观察不到，由
// conversation-state.test.mjs 的「删除会话」系列断言；这里守的是删除接线本身：
// 删完还要能删对其他会话，且不能把别人的未读一起清掉。
test("删除带未读的会话：只移除这一条，其他会话的未读保留", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const unreadCount = () => page.evaluate(() => document.querySelectorAll('img[aria-label="未查看"]').length);
    const hoverTaskRow = async (title) => {
      const row = await page.evaluateHandle(needle => {
        const leaf = [...document.querySelectorAll("*")].find(
          node => node.children.length === 0 && (node.textContent || "").trim() === needle,
        );
        return (leaf?.closest('[role="button"]') || leaf) ?? null;
      }, title);
      assert.ok(row.asElement(), `应能找到侧栏里的任务「${title}」`);
      await row.asElement().hover();
      await sleep(200);
    };

    // 会话 A：切走后在后台完成 → 未读
    mock.hold();
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const sessionA = await mock.waitForSession();
    await waitForPause(page);
    assert.ok(await clickText(page, "新任务"), "生成中切到新任务");
    await waitForText(page, "试试这些", 8000);
    assert.equal(sessionA.beginAnswer(CHUNK_1), true);
    assert.equal(sessionA.finish(), true);
    await page.waitForFunction(() => document.querySelectorAll('img[aria-label="未查看"]').length === 1, { timeout: 10000 });

    // 会话 B：同样在后台完成 → 两条都是未读
    assert.ok(await sendMessage(page, OTHER_TITLE));
    const sessionB = await mock.waitForSession();
    await waitForPause(page);
    assert.ok(await clickText(page, "新任务"), "再次切到新任务");
    await waitForText(page, "试试这些", 8000);
    assert.equal(sessionB.beginAnswer(CHUNK_2), true);
    assert.equal(sessionB.finish(), true);
    await page.waitForFunction(() => document.querySelectorAll('img[aria-label="未查看"]').length === 2, { timeout: 10000 });

    // 删掉 A
    await hoverTaskRow(STREAM_PROMPT);
    assert.ok(await clickAria(page, "任务更多操作"), "应能打开任务操作菜单");
    assert.ok(await clickText(page, "删除"), "应能点删除任务");
    await waitForText(page, "确定删除此任务？", 8000);
    assert.ok(await clickText(page, "确定"), "应能确认删除");

    await page.waitForFunction(() => document.querySelectorAll('img[aria-label="未查看"]').length === 1, { timeout: 10000 });
    const sidebarText = await page.$eval("body", el => el.textContent || "");
    assert.ok(!sidebarText.includes(STREAM_PROMPT), "被删除的会话应从侧栏消失");
    assert.ok(sidebarText.includes(OTHER_TITLE), "另一个会话必须还在");
    assert.equal(await unreadCount(), 1, "只清掉被删会话的未读，另一条未读保留");
    assert.ok(await hasVisibleButton(page, "发送消息"), "删除后仍可继续发送");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 删除项目会连带删除项目内的会话：这些会话如果在后台还在生成，连接必须被中断、
// 缓存必须清掉 —— 只从列表里移除的话，请求会继续往一个已经不存在的会话里写。
test("删除项目：项目内正在生成的会话请求被中断，迟到正文不落地", { timeout: 90000 }, async () => {
  const PROJECT = "生成中被删项目";
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const hoverByText = async (text) => {
      const row = await page.evaluateHandle(needle => {
        const leaf = [...document.querySelectorAll("*")].find(
          node => node.children.length === 0 && (node.textContent || "").trim() === needle,
        );
        return (leaf?.closest('[role="button"]') || leaf) ?? null;
      }, text);
      assert.ok(row.asElement(), `应能在侧栏定位「${text}」`);
      await row.asElement().hover();
      await sleep(200);
    };

    // 建项目
    assert.ok(await clickText(page, "项目"), "应能进入项目页");
    assert.ok(await clickText(page, "新建项目"), "应能打开新建项目弹窗");
    await page.waitForSelector('input[placeholder="请输入项目名称"]', { timeout: 8000 });
    await page.type('input[placeholder="请输入项目名称"]', PROJECT);
    assert.ok(await clickText(page, "确定"), "应能创建项目");
    await waitForText(page, PROJECT, 8000);

    // 从侧栏项目行的「+」在该项目里新建任务
    await hoverByText(PROJECT);
    assert.ok(await clickAria(page, `在${PROJECT}中新建任务`), "应能在项目内新建任务");

    // 这个会话开始生成并保持连接
    mock.hold();
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();
    await waitForPause(page);
    assert.equal(session.beginAnswer(CHUNK_1), true);
    await waitForText(page, CHUNK_1, 10000);

    // 生成中删除整个项目
    await hoverByText(PROJECT);
    assert.ok(await clickAria(page, "项目更多操作"), "应能打开项目操作菜单");
    assert.ok(await clickText(page, "删除"), "应能点删除项目");
    await waitForText(page, "确定要删除此项目吗？", 8000);
    assert.ok(await clickText(page, "确定"), "应能确认删除项目");

    assert.equal(await session.waitForClientClose(10000), true, "删除项目后，项目内会话的生成请求应被中断");
    assert.equal(session.open, false);
    assert.equal(
      session.write(`data: ${JSON.stringify({ type: "message.delta", data: { text: LATE_CHUNK } })}\n\n`),
      false,
      "连接已关闭，迟到的正文写不进来",
    );

    await sleep(500);
    const body = await page.$eval("body", el => el.textContent || "");
    assert.ok(!body.includes(LATE_CHUNK), "迟到的正文不应出现在页面上");
    assert.ok(!body.includes(CHUNK_1), "项目删除后，项目内会话的内容不应还留在页面上");
    assert.ok(!body.includes(PROJECT), "被删除的项目应从侧栏和项目页消失");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("正文结束后收到后续 run.end：追问落地，正文不被重判为失败", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();
    await waitForPause(page);
    assert.equal(session.beginAnswer(CHUNK_1), true);
    await waitForText(page, CHUNK_1, 10000);

    // 正文已经说完，发送按钮应立刻恢复；此时推荐追问还在服务端生成。
    assert.equal(session.answerEnd(), true);
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"));

    assert.equal(session.runEnd({ text: session.sentText, followUps: ["继续帮我汇总"] }), true);
    await waitForText(page, "继续帮我汇总", 10000);
    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_1), "已收到的正文仍在");
    assert.ok(!(await hasVisibleButton(page, "发送失败，点击重试")), "后续内容到达不应把正文判失败");
    assert.ok(await hasVisibleButton(page, "发送消息"), "整轮结束后仍可继续发送");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化卡片状态同步：卡片暂停后列表同步为已暂停", { timeout: 90000 }, async () => {  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    const card = await page.$eval("[data-automation-card]", (el) => ({
      status: el.dataset.automationStatus,
      title: el.querySelector(".ac-title")?.textContent?.trim() ?? "",
    }));
    assert.equal(card.status, "已启用", "创建后卡片应为已启用");
    assert.ok(card.title.includes(TITLE), "卡片标题应来自弹窗内容");

    const pausedFromCard = await page.evaluate(() => {
      const button = [...document.querySelectorAll("[data-automation-card] button")].find((b) =>
        (b.getAttribute("aria-label") || "").startsWith("暂停"),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    assert.ok(pausedFromCard, "会话内卡片应提供暂停操作");
    await page.waitForFunction(
      () => document.querySelector("[data-automation-card]")?.dataset.automationStatus === "已暂停",
      { timeout: 8000 },
    );
    assert.match(await page.$eval("[data-automation-card] .ac-sub", (el) => el.textContent || ""), /已暂停/);

    await openAutomationCardPage(page);
    assert.ok(await clickText(page, "已暂停"), "应能切到已暂停 Tab");
    await waitForText(page, TITLE, 8000);
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化删除状态同步：列表删除后会话卡片变为已删除", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    await openAutomationCardPage(page);

    const openedMore = await page.evaluate((title) => {
      const button = [...document.querySelectorAll("button")].find((b) => {
        const aria = b.getAttribute("aria-label") || "";
        return aria.includes("更多操作") && aria.includes(title);
      });
      if (!button) return false;
      button.click();
      return true;
    }, TITLE);
    assert.ok(openedMore, "列表卡片应提供「更多操作」菜单");
    assert.ok(await clickText(page, "删除"), "菜单中应有删除项");
    await waitForText(page, "确定删除？", 8000);
    assert.ok(await clickText(page, "确定"), "应能确认删除");
    // 侧栏会话行仍保留标题，所以只断言自动化列表里的任务卡片消失。
    await page.waitForFunction(
      (title) =>
        ![...document.querySelectorAll('div[role="button"][aria-pressed]')].some((card) =>
          (card.textContent || "").includes(title),
        ),
      { timeout: 8000 },
      TITLE,
    );

    assert.ok(await clickSidebarTask(page, TITLE), "删除后应能回到创建任务的会话");
    await page.waitForFunction(
      () => document.querySelector("[data-automation-card]")?.dataset.automationStatus === "已删除",
      { timeout: 8000 },
    );
    const deleted = await page.$eval("[data-automation-card]", (el) => ({
      disabled: el.getAttribute("aria-disabled"),
      subtitle: el.querySelector(".ac-sub")?.textContent ?? "",
      buttons: el.querySelectorAll("button").length,
    }));
    assert.equal(deleted.disabled, "true", "已删除卡片不可点击");
    assert.match(deleted.subtitle, /已删除/, "副标题应说明已删除");
    assert.equal(deleted.buttons, 0, "已删除卡片不应再给操作按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化立即执行：请求带 automationRun 且写回创建会话", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    await clickText(page, "自动化任务");
    await waitForText(page, TITLE, 8000);
    assert.ok(await openAutomationMore(page, TITLE), "应能打开任务更多菜单");
    await waitForText(page, "立即执行", 8000);

    mock.hold();
    assert.ok(await clickMenuItem(page, "立即执行"), "应能触发立即执行");
    const session = await mock.waitForSession();
    assert.equal(mock.calls.length, 2, "立即执行应新增一次真实请求");
    assert.equal(session.body.automationRun, true, "立即执行应带 automationRun");
    const userTurns = session.body.messages.filter((message) => message.role === "user");
    assert.ok(userTurns.some((turn) => turn.content.includes(`每天早上${TITLE}`)), "请求应带上任务内容");
    assert.ok(await clickSidebarTask(page, TITLE), "执行时应落在创建任务的会话");
    assert.ok((await chatText(page)).includes(`每天早上${TITLE}`), "任务内容应出现在落点会话");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化立即执行：新建会话尚未提交就触发，仍写回新会话且不串台", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock, { newSession: true });
    // 另一个已完成会话，用来确认请求上下文不会误用「当前正在看」的会话
    assert.ok(await clickText(page, "新任务"), "应能回到新任务");
    mock.normal();
    assert.ok(await sendMessage(page, OTHER_TITLE));
    await waitForText(page, `已收到：${OTHER_TITLE}`, 10000);

    await clickText(page, "自动化任务");
    await waitForText(page, TITLE, 8000);
    assert.ok(await openAutomationMore(page, TITLE), "应能打开任务更多菜单");
    await waitForText(page, "立即执行", 8000);
    mock.hold();
    const fired = await clickMenuItemWithImmediateTimer(page, "立即执行", 80);
    assert.equal(fired, 1, "应捕获并立即触发这次延迟发送");

    await waitForCalls(mock, 3);
    const session = mock.sessions[2];
    assert.equal(session.body.automationRun, true);
    const userTurns = session.body.messages.filter(message => message.role === "user").map(turn => turn.content);
    assert.ok(userTurns.some(text => text.includes(`每天早上${TITLE}`)), "任务内容应写回新建会话");
    assert.ok(!userTurns.some(text => text.includes(OTHER_TITLE)), "请求上下文不应混入别的会话");
    assert.equal(userTurns.length, 1, "新建会话没有历史消息，请求里只应有任务本身");
    assert.ok((await chatText(page)).includes(`每天早上${TITLE}`), "执行时应切到新建的落点会话");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化立即执行：80ms 内切换会话仍写回原定会话", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    // 另开一个会话，用于在这 80ms 窗口里切走
    assert.ok(await clickText(page, "新任务"), "应能回到新任务");
    mock.normal();
    assert.ok(await sendMessage(page, OTHER_TITLE));
    await waitForText(page, `已收到：${OTHER_TITLE}`, 10000);

    await clickText(page, "自动化任务");
    await waitForText(page, TITLE, 8000);
    assert.ok(await openAutomationMore(page, TITLE));
    await waitForText(page, "立即执行", 8000);
    mock.hold();
    await armTimerCapture(page, 80);
    assert.ok(await clickMenuItem(page, "立即执行"), "应能触发立即执行");
    await disarmTimerCapture(page);
    // 定时器还没触发就切到另一个会话
    assert.ok(await clickSidebarTask(page, OTHER_TITLE), "应能切到另一个会话");
    await fireCapturedTimers(page);

    await waitForCalls(mock, 3);
    const session = mock.sessions[2];
    assert.equal(session.body.automationRun, true);
    const userTurns = session.body.messages.filter((message) => message.role === "user").map((turn) => turn.content);
    assert.ok(userTurns.some((text) => text.includes(`每天早上${TITLE}`)), "任务内容应写回创建会话");
    assert.ok(!userTurns.some((text) => text.includes(OTHER_TITLE)), "任务内容不应串到当前会话");
    assert.ok(!(await chatText(page)).includes(`每天早上${TITLE}`), "用户切换到别的会话后不应被强行带回");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化立即执行：原定会话在 80ms 内被删除则不补发", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    await clickText(page, "自动化任务");
    await waitForText(page, TITLE, 8000);
    assert.ok(await openAutomationMore(page, TITLE));
    await waitForText(page, "立即执行", 8000);
    mock.hold();
    await armTimerCapture(page, 80);
    assert.ok(await clickMenuItem(page, "立即执行"));
    await disarmTimerCapture(page);

    // 定时器触发前删掉落点会话：与「删除正在生成的会话」一致，延迟发送直接作废
    const row = await page.evaluateHandle((needle) => {
      const leaf = [...document.querySelectorAll("*")].find(
        (node) => node.children.length === 0 && (node.textContent || "").trim() === needle,
      );
      return (leaf?.closest('[role="button"]') || leaf) ?? null;
    }, TITLE);
    assert.ok(row.asElement(), "应能找到落点会话");
    await row.asElement().hover();
    await sleep(200);
    assert.ok(await clickAria(page, "任务更多操作"));
    assert.ok(await clickText(page, "删除"));
    await waitForText(page, "确定删除此任务？", 8000);
    assert.ok(await clickText(page, "确定"));

    await fireCapturedTimers(page);
    await waitForText(page, "目标会话已删除，任务未执行", 8000);
    await sleep(400);
    assert.equal(mock.calls.length, 1, "目标已删除时不应发出新请求，也不该新建会话兜底");
    assert.ok(!(await chatText(page)).includes(`每天早上${TITLE}`), "已删除会话不应被任务内容复活");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

async function makeFailedMessage(page, mock, text) {
  mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
  assert.ok(await sendMessage(page, text));
  const session = await mock.waitForSession();
  await waitForPause(page);
  assert.equal(session.cancel(), true, "应能掐断请求制造失败消息");
  await waitForIdle(page);
  await page.waitForSelector('button[aria-label="发送失败，点击重试"]', { timeout: 8000 });
  return session;
}

test("消息重试：失败后重试仍在同一会话发送且清除失败标记", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await makeFailedMessage(page, mock, STREAM_PROMPT);
    mock.hold();
    assert.ok(await clickRetryButton(page), "应能点击失败重试");
    const retrySession = await mock.waitForSession();
    assert.equal(mock.calls.length, 2, "重试应新增一次请求");
    assert.equal(retrySession.body.messages.at(-1)?.content, STREAM_PROMPT, "重试应带上原提问");
    await waitForPause(page);
    assert.equal(
      await page.$$eval('button[aria-label="发送失败，点击重试"]', nodes => nodes.length),
      0,
      "重试后旧的失败标记应清除",
    );
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("消息重试：0ms 内切换会话，写入与请求都留在原会话", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await makeFailedMessage(page, mock, STREAM_PROMPT);
    assert.ok(await clickText(page, "新任务"), "应能回到新任务");
    mock.normal();
    assert.ok(await sendMessage(page, OTHER_TITLE));
    await waitForText(page, `已收到：${OTHER_TITLE}`, 10000);
    assert.ok(await clickSidebarTask(page, STREAM_PROMPT), "应能回到失败的会话");
    await page.waitForSelector('button[aria-label="发送失败，点击重试"]', { timeout: 8000 });

    mock.hold();
    await armTimerCapture(page, 0);
    assert.ok(await clickRetryButton(page), "应能点击失败重试");
    await disarmTimerCapture(page);
    assert.ok(await clickSidebarTask(page, OTHER_TITLE), "定时器触发前切到另一个会话");
    await fireCapturedTimers(page);

    await waitForCalls(mock, 3);
    const retrySession = mock.sessions[2];
    assert.equal(retrySession.body.messages.at(-1)?.content, STREAM_PROMPT, "重试请求应仍发给原会话");
    assert.ok(!retrySession.body.messages.some((message) => message.content === OTHER_TITLE), "请求不应混入当前会话内容");
    assert.ok(await clickSidebarTask(page, STREAM_PROMPT), "应能回到原会话核对失败标记");
    assert.equal(
      await page.$$eval('button[aria-label="发送失败，点击重试"]', nodes => nodes.length),
      0,
      "失败标记应在原会话清除，而不是被写到当前会话",
    );
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("消息重试：0ms 内删除原会话则不补发也不复活", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    await makeFailedMessage(page, mock, STREAM_PROMPT);
    await armTimerCapture(page, 0);
    assert.ok(await clickRetryButton(page), "应能点击失败重试");
    await disarmTimerCapture(page);

    const row = await page.evaluateHandle((needle) => {
      const leaf = [...document.querySelectorAll("*")].find(
        (node) => node.children.length === 0 && (node.textContent || "").trim() === needle,
      );
      return (leaf?.closest('[role="button"]') || leaf) ?? null;
    }, STREAM_PROMPT);
    assert.ok(row.asElement(), "应能找到原会话");
    await row.asElement().hover();
    await sleep(200);
    assert.ok(await clickAria(page, "任务更多操作"));
    assert.ok(await clickText(page, "删除"));
    await waitForText(page, "确定删除此任务？", 8000);
    assert.ok(await clickText(page, "确定"));

    await fireCapturedTimers(page);
    await waitForText(page, "会话已删除，重试已取消", 8000);
    await sleep(400);
    assert.equal(mock.calls.length, 1, "原会话已删除时不应发出重试请求");
    assert.ok(!(await chatText(page)).includes(STREAM_PROMPT), "已删除会话不应被重试内容复活");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("重新生成：旧轮次迟到的 run.end 不污染新一轮，旧回答被替换", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const first = await mock.waitForSession();
    await waitForPause(page);
    assert.equal(first.beginAnswer(CHUNK_1), true);
    await waitForText(page, CHUNK_1, 10000);
    assert.equal(first.finish(), true);
    await waitForIdle(page);
    await waitForActions(page);

    // 点「重新生成」：走 handleRegenerateMessage（与普通 sendMessage 不同的入口）。
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await page.evaluate(() => {
      const button = [...document.querySelectorAll('button[aria-label="重新生成"]')]
        .filter(b => b.offsetParent).at(-1);
      if (!button) return false;
      button.click();
      return true;
    }), "应能从操作项点重新生成");
    const regen = await waitForCalls(mock, 2);
    assert.equal(regen.body.messages.at(-1)?.content, STREAM_PROMPT, "重新生成应带上原提问");
    await waitForPause(page);

    // 旧轮次迟到的收尾事件不应改到新一轮。
    assert.equal(first.write(`data: ${JSON.stringify({ type: "run.end", data: { text: LATE_OLD_TEXT, followUps: [] } })}\n\n`), false,
      "新一轮开始后旧连接应已被中止");
    assert.equal(regen.beginAnswer(CHUNK_2), true);
    await waitForText(page, CHUNK_2, 10000);
    assert.equal(regen.finish(), true);
    await waitForIdle(page);

    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_2), "重新生成的新正文应落地");
    assert.ok(!chat.includes(LATE_OLD_TEXT), "旧轮次迟到内容不应污染新一轮");
    assert.ok(!chat.includes(CHUNK_1), "重新生成后旧回答应被替换");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("测试守卫：出现外部请求会被判为失败，不会静默放过", { timeout: 60000 }, async () => {
  // 反向自检：这段用例故意让页面访问外网，断言 withPage 必须因此报错。
  // 它保证「mock / 拦截异常导致测试失败」不是一句口号，而是真的会红。
  await assert.rejects(
    withPage(browser, app, async ({ page }) => {
      await page.evaluate(() => fetch("https://example.com/offline-guard").catch(() => "blocked"));
      await sleep(500);
    }),
    /外部网络请求/,
  );
});

test("项目文件筛选：格式筛选只留匹配行，重置后恢复", { timeout: 90000 }, async () => {
  const fixture = makeFixtureFiles(["report.pdf", "metrics.xlsx", "notes.txt"]);
  try {
    await withPage(browser, app, async ({ page, errors }) => {
      assert.ok(await clickText(page, "项目"), "应能进入项目页");
      assert.ok(await clickText(page, "新建项目"), "应能打开新建项目弹窗");
      await page.waitForSelector('input[placeholder="请输入项目名称"]', { timeout: 8000 });
      await page.type('input[placeholder="请输入项目名称"]', "筛选回归项目");
      assert.ok(await clickText(page, "确定"), "应能创建项目");
      await waitForText(page, "筛选回归项目", 8000);

      const opened = await page.evaluate((title) => {
        const card = [...document.querySelectorAll('[role="button"]')].find((n) =>
          (n.textContent || "").includes(title),
        );
        if (!card) return false;
        card.click();
        return true;
      }, "筛选回归项目");
      assert.ok(opened, "应能进入项目详情");
      await page.waitForSelector('[role="tablist"][aria-label="项目内容"]', { timeout: 8000 });
      assert.ok(await clickText(page, "来源"), "应能切到来源 Tab");

      const upload = await page.$('input[aria-label="上传项目来源文件"]');
      assert.ok(upload, "来源页应有上传入口");
      await upload.uploadFile(...fixture.paths);
      // 项目自带演示文件，不能按总数断言；只确认刚上传的三个文件真的进了列表。
      await page.waitForFunction(
        () => ["report.pdf", "metrics.xlsx", "notes.txt"].every((name) => document.body.innerText.includes(name)),
        { timeout: 10000 },
      );
      const baselineRows = await page.$$eval("tr[data-project-file]", (rows) => rows.length);
      assert.ok(baselineRows >= 3, `上传后应至少有三行，实际=${baselineRows}`);

      // 先用名称搜索把演示文件收窄到「项目」相关，再叠加格式筛选，
      // 这样「表格」是否真的筛掉文档可以从行数与文件名上验证，而不是只看控件存在。
      assert.ok(await typeVisible(page, 'input[aria-label="搜索文件名称"]', "项目"), "应能搜索文件名称");
      await page.waitForFunction(() => {
        const rows = [...document.querySelectorAll("tr[data-project-file]")];
        return rows.length > 0 && rows.length < 30 && rows.every((r) => r.innerText.includes("项目"));
      }, { timeout: 8000 });
      const beforeFormat = await page.$$eval("tr[data-project-file]", (rows) => rows.length);

      assert.ok(await clickAria(page, "筛选"), "应能打开筛选面板");
      await page.waitForSelector('[role="dialog"][aria-label="筛选"]', { timeout: 8000 });
      const checked = await page.evaluate(() => {
        const option = [...document.querySelectorAll('[role="dialog"][aria-label="筛选"] button[role="checkbox"]')]
          .find((b) => (b.textContent || "").trim() === "表格");
        if (!option) return false;
        option.click();
        return true;
      });
      assert.ok(checked, "筛选面板应有「表格」选项");

      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length < expected,
        { timeout: 8000 },
        beforeFormat,
      );
      const visible = await page.$$eval("tr[data-project-file]", (rows) => rows.map((r) => r.innerText));
      assert.ok(visible.length > 0, "项目相关文件里应有表格文件");
      assert.ok(
        visible.every((text) => /\.(xlsx|xls|csv)/i.test(text)),
        `表格筛选后只剩表格文件，实际=${JSON.stringify(visible)}`,
      );
      assert.ok(
        await page.evaluate(() => !!document.querySelector(".library-filter-active")),
        "生效的筛选项应在触发按钮上留痕",
      );

      assert.ok(await clickText(page, "重置筛选项"), "应能重置筛选");
      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length === expected,
        { timeout: 8000 },
        beforeFormat,
      );
      assert.ok(await clickAria(page, "清空搜索"), "应能清空名称搜索");
      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length === expected,
        { timeout: 8000 },
        baselineRows,
      );
      assert.deepEqual(errors, [], "页面不应有 JS 错误");
    });
  } finally {
    rmSync(dirname(fixture.paths[0]), { recursive: true, force: true });
  }
});

// ── 会话 store ↔ React 桥接：真实挂载（React 开发版 StrictMode）──────────────
// 这些用例跑的是 App 用的同一份 useConversationStore，断言「已提交的 DOM」与
// 「store 的同步状态」一致，不看 reducer 重放，也不给 store 换 API。
const probeReady = (page) =>
  page.waitForFunction(() => window.__probe?.ready === true, { timeout: 20000 });
const probeSnapshot = (page) => page.evaluate(() => window.__probe.snapshot());
const probeSettle = (page) => page.evaluate(() => window.__probe.settle());

async function openProbe(browser, fn) {
  return withPage(browser, app, async ({ page, errors }) => {
    await fn({ page, errors });
    assert.deepEqual(errors, [], "探针页不应有 JS 错误");
  }, { path: "probe/", ready: probeReady });
}

const ids = (snapshot) => snapshot.conversations.map((item) => item.id);
const texts = (snapshot) => snapshot.conversations.flatMap((item) => item.messages);

test("store→React：首帧提交后 UI 与 store 完全一致，StrictMode 重放 effect 不写重复数据", async () => {
  await openProbe(browser, async ({ page }) => {
    const first = await probeSnapshot(page);
    assert.deepEqual(first.rendered, first.stored, "首帧 DOM 必须等于 store 的同步状态");
    assert.deepEqual(ids(first.stored), [100], "挂载期 effect 只写入一条（StrictMode 会跑两遍 effect）");
    assert.ok(first.mountEffectRuns >= 2, `StrictMode 应重放挂载 effect，实际 ${first.mountEffectRuns} 次`);
    assert.ok(first.renders > first.commits, "StrictMode 下渲染调用次数应多于提交次数");
  });
});

test("store→React：同一任务内的多次 dispatch 合成一次提交，且不丢更新", async () => {
  await openProbe(browser, async ({ page }) => {
    const before = await probeSnapshot(page);
    await page.evaluate(() => window.__probe.batchAdd(5));
    await probeSettle(page);
    const after = await probeSnapshot(page);

    assert.deepEqual(after.rendered, after.stored, "批处理提交后 DOM 必须等于 store");
    assert.equal(after.stored.conversations.filter((item) => item.id >= 200 && item.id < 300).length, 5, "5 次写入都要落地");
    assert.equal(after.commits - before.commits, 1, `5 次同步 dispatch 应只提交 1 次，实际 ${after.commits - before.commits} 次`);
  });
});

test("store→React：低优先级更新后紧跟同步更新，旧快照不能盖回去", async () => {
  await openProbe(browser, async ({ page }) => {
    await page.evaluate(() => window.__probe.transitionThenSync(301, 302));
    await page.waitForFunction(
      () => {
        const raw = document.getElementById("view")?.dataset.json ?? "";
        return raw.includes('"id":301') && raw.includes('"id":302');
      },
      { timeout: 8000 },
    );
    await probeSettle(page);
    const after = await probeSnapshot(page);
    assert.deepEqual(after.rendered, after.stored, "过渡更新与同步更新交错后，DOM 仍应等于 store");
    assert.ok(ids(after.stored).includes(301) && ids(after.stored).includes(302), "两次更新都要保留");
  });
});

test("store→React：删除会话后迟到的写入被丢弃，不会把会话写回来", async () => {
  await openProbe(browser, async ({ page }) => {
    await page.evaluate(() => {
      window.__probe.addConversation(400, "待删除");
      window.__probe.select(400);
      window.__probe.appendMessage(400, "删除前的消息");
    });
    await probeSettle(page);

    await page.evaluate(() => {
      window.__probe.deleteConversation(400);
      window.__probe.appendMessage(400, "删除后迟到的消息");
    });
    await probeSettle(page);
    const after = await probeSnapshot(page);

    assert.deepEqual(after.rendered, after.stored, "删除 + 迟到写入后 DOM 仍应等于 store");
    assert.equal(ids(after.stored).includes(400), false, "会话应已被删除");
    assert.equal(texts(after.stored).includes("删除后迟到的消息"), false, "迟到写入不能重建会话");
    assert.equal(JSON.stringify(after.rendered).includes("删除后迟到的消息"), false, "DOM 里也不能出现迟到内容");
  });
});

test("store→React：新建/选中/写入/删除/再写入交错在同一批里也不分叉", async () => {
  await openProbe(browser, async ({ page }) => {
    await page.evaluate(() => {
      window.__probe.addConversation(500, "交错");
      window.__probe.select(500);
      window.__probe.appendMessage(500, "A");
      window.__probe.deleteConversation(500);
      window.__probe.appendMessage(500, "B");
    });
    await probeSettle(page);
    const after = await probeSnapshot(page);

    assert.deepEqual(after.rendered, after.stored, "交错更新后 DOM 应等于 store");
    assert.equal(ids(after.stored).includes(500), false);
    assert.equal(texts(after.stored).includes("B"), false);
  });
});

test("store→React：30 个宏任务逐条写入（模拟流式）后仍无丢失、无撕裂", async () => {
  await openProbe(browser, async ({ page }) => {
    const before = await probeSnapshot(page);
    await page.evaluate(async () => {
      window.__probe.addConversation(600, "流式");
      window.__probe.select(600);
      for (let i = 0; i < 30; i += 1) {
        window.__probe.appendMessage(600, `chunk-${i}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    await probeSettle(page);
    const after = await probeSnapshot(page);

    assert.deepEqual(after.rendered, after.stored, "逐条提交后 DOM 应等于 store");
    const messages = after.stored.conversations.find((item) => item.id === 600)?.messages ?? [];
    assert.equal(messages.length, 30, `30 次写入应全部落地，实际 ${messages.length} 条`);
    assert.equal(messages.at(-1), "chunk-29", "最后一条必须是最新写入");
    assert.ok(after.commits - before.commits >= 30, "每条宏任务更新都应产生一次提交（说明不是靠攒批）");
  });
});
